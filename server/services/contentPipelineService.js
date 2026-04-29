/**
 * Content Pipeline Service
 * Orchestrator điều phối toàn bộ pipeline: discover → search images → write → compose → draft
 */
import { discoverStory } from './storyDiscoveryService.js';
import { searchAndDownloadImages, generateAIImageForStory } from './imageSearchService.js';
import { writeArticle } from './articleWriterService.js';
import { composeImage } from './imageComposerService.js';
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

    // Step 2: Search images (with AI fallback)
    await updateJobStatus(job, 'searching_images', 2);
    console.log(`[Pipeline] Job #${job.id} — Step 2: Searching images...`);
    const searchKeywords = extractSearchKeywords(story);
    const mediaFiles = await searchAndDownloadImages(story, searchKeywords, 5);
    console.log(`[Pipeline] Found ${mediaFiles.length} real photos`);

    if (mediaFiles.length === 0) {
      console.log(`[Pipeline] No real photos found — falling back to AI image generation`);
      const aiImage = await generateAIImageForStory(story);
      if (aiImage) mediaFiles.push(aiImage);
    }

    // Step 3: Write article
    await updateJobStatus(job, 'writing', 3);
    console.log(`[Pipeline] Job #${job.id} — Step 3: Writing article...`);
    const article = await writeArticle(story);
    console.log(`[Pipeline] Article written. Headline: "${article.image_headline}"`);

    // Step 4: Compose image
    await updateJobStatus(job, 'composing', 4);
    console.log(`[Pipeline] Job #${job.id} — Step 4: Composing image...`);

    let finalImage = null;
    let sourceMedia = null;

    if (mediaFiles.length > 0) {
      // Pick the best image (largest resolution)
      sourceMedia = mediaFiles.reduce((best, f) =>
        (f.width && f.height && (f.width * f.height) > ((best.width || 0) * (best.height || 0))) ? f : best,
        mediaFiles[0]
      );

      finalImage = await composeImage({
        sourceImagePath: sourceMedia.path,
        headline: article.image_headline,
        subheadline: article.image_subheadline,
        storyId: story.id,
        folderId: sourceMedia.folder_id,
      });
      console.log(`[Pipeline] Image composed: ${finalImage.path}`);
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
    console.error(`[Pipeline] ❌ Job #${job.id} failed:`, err.message);
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
  await job.update({ status, current_step: step });
}

export default { runPipeline };
