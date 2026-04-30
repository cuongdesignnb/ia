/**
 * Content Pipeline Service
 * Orchestrator điều phối toàn bộ pipeline: discover → search images → write → compose → draft
 */
import { discoverStory } from './storyDiscoveryService.js';
import { searchAndDownloadImages, searchImagesViaDDG } from './imageSearchService.js';
import { writeArticle } from './articleWriterService.js';
import { designAndSaveImage } from './aiImageDesignerService.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..', '..');
import { ContentJob, GeneratedPost, GeneratedImage, MediaFile, FbPage } from '../models/index.js';
import { getSetting } from './settingsService.js';

/**
 * Run the full content pipeline
 * @param {string|null} topic - Specific topic or null for AI to choose
 * @param {string|null} category - Category filter
 * @param {number|null} fbPageId - Target FB page ID
 * @returns {GeneratedPost} the draft post
 */
export async function runPipeline(topic = null, category = null, fbPageId = null) {
  // Create job
  const job = await ContentJob.create({
    topic: topic || 'AI tự chọn',
    job_type: topic ? 'manual' : 'auto_scheduled',
    status: 'pending',
    started_at: new Date(),
  });

  try {
    // Step 1: Discover story
    await updateJobStatus(job, 'discovering', 1);
    console.log(`[Pipeline] Job #${job.id} — Step 1: Discovering story...`);
    const story = await discoverStory(topic, category);
    await job.update({ story_id: story.id });
    console.log(`[Pipeline] Story found: "${story.title_vi || story.title}"`);

    // Step 2: Tìm ảnh tham chiếu (free) — DDG scrape, fallback Wikimedia/Unsplash.
    // Nếu không tìm được, Step 4 vẫn chạy AI design from scratch (không reference).
    await updateJobStatus(job, 'searching_images', 2);
    console.log(`[Pipeline] Job #${job.id} — Step 2: Searching reference images...`);
    const searchKeywords = extractSearchKeywords(story);
    let mediaFiles = [];

    try {
      mediaFiles = await searchImagesViaDDG(story, 3);
    } catch (err) {
      console.error(`[Pipeline] DDG search failed:`, err.message);
    }

    if (mediaFiles.length === 0) {
      console.log(`[Pipeline] DDG empty — falling back to Wikimedia/Unsplash`);
      mediaFiles = await searchAndDownloadImages(story, searchKeywords, 5);
    }
    console.log(`[Pipeline] Reference photos collected: ${mediaFiles.length}`);

    // Step 3: Write article
    await updateJobStatus(job, 'writing', 3);
    console.log(`[Pipeline] Job #${job.id} — Step 3: Writing article...`);
    const article = await writeArticle(story);
    console.log(`[Pipeline] Article written. Headline: "${article.image_headline}"`);

    // Step 4: AI design — gpt-image-2 dùng reference photo (nếu có) làm visual base
    //         và tự design typography + branding trong ảnh.
    await updateJobStatus(job, 'composing', 4);
    console.log(`[Pipeline] Job #${job.id} — Step 4: AI designing image...`);

    let finalImage = null;
    let sourceMedia = null;

    if (mediaFiles.length > 0) {
      // Pick the best reference (largest resolution)
      sourceMedia = mediaFiles.reduce((best, f) =>
        (f.width && f.height && (f.width * f.height) > ((best.width || 0) * (best.height || 0))) ? f : best,
        mediaFiles[0]
      );
    }

    try {
      finalImage = await designAndSaveImage({
        sourceImagePath: sourceMedia ? path.join(PROJECT_ROOT, sourceMedia.path) : null,
        story,
        headline: article.image_headline,
        subheadline: article.image_subheadline,
        storyId: story.id,
        folderId: sourceMedia?.folder_id || null,
      });
      console.log(`[Pipeline] Image designed: ${finalImage.path}`);
    } catch (err) {
      console.error(`[Pipeline] AI design failed:`, err.message);
      // Không kill cả pipeline — vẫn tạo draft, user có thể redesign sau
    }

    // Step 5: Create draft
    await updateJobStatus(job, 'completed', 5);
    console.log(`[Pipeline] Job #${job.id} — Step 5: Creating draft...`);

    // Select target FB page
    let targetPageId = fbPageId;
    if (!targetPageId) {
      const defaultPage = await FbPage.findOne({ where: { is_active: true }, order: [['id', 'ASC']] });
      if (defaultPage) targetPageId = defaultPage.id;
    }

    // Add hashtags to post body
    const hashtagsStr = (article.hashtags || []).join(' ');
    const fullBody = article.post_body + (hashtagsStr ? `\n\n${hashtagsStr}` : '');

    const generatedPost = await GeneratedPost.create({
      story_id: story.id,
      content_job_id: job.id,
      fb_page_id: targetPageId,
      post_body: fullBody,
      hook: article.hook,
      image_headline: article.image_headline,
      image_subheadline: article.image_subheadline,
      hashtags: article.hashtags,
      final_image_id: finalImage?.id || null,
      status: 'draft',
      ai_model_used: article.ai_model_used,
    });

    // Create GeneratedImage record
    if (finalImage && sourceMedia) {
      await GeneratedImage.create({
        story_id: story.id,
        generated_post_id: generatedPost.id,
        mode: 'real_photo_overlay',
        source_media_id: sourceMedia.id,
        output_media_id: finalImage.id,
        text_overlay: {
          label: await getSetting('image_label_text') || 'CÂU CHUYỆN CÓ THẬT',
          headline: article.image_headline,
          subheadline: article.image_subheadline,
        },
        status: 'draft',
      });
    }

    // Update story used_count
    await story.increment('used_count');

    await job.update({ generated_post_id: generatedPost.id, finished_at: new Date() });
    console.log(`[Pipeline] ✅ Job #${job.id} completed! Draft post #${generatedPost.id}`);

    return generatedPost;
  } catch (err) {
    console.error(`[Pipeline] ❌ Job #${job.id} ${err.message === 'CANCELLED' ? 'cancelled' : 'failed'}:`, err.message);
    // Reload để check nếu user đã cancel — không ghi đè status='cancelled' bằng 'failed'
    await job.reload();
    if (job.status === 'cancelled' || err.message === 'CANCELLED') {
      // Đã được set bởi cancel endpoint hoặc chính pipeline phát hiện → giữ nguyên
      if (job.status !== 'cancelled') {
        await job.update({ status: 'cancelled', finished_at: new Date(), error_message: 'Cancelled by user' });
      }
      return null;
    }
    await job.update({
      status: 'failed',
      error_message: err.message,
      finished_at: new Date(),
    });
    throw err;
  }
}

function extractSearchKeywords(story) {
  // Use title (English) for better image search results
  return story.title || story.title_vi || '';
}

async function updateJobStatus(job, status, step) {
  // Cooperative cancellation: trước mỗi transition, check user đã huỷ chưa
  await job.reload();
  if (job.status === 'cancelled') {
    throw new Error('CANCELLED');
  }
  await job.update({ status, current_step: step });
}

export default { runPipeline };
