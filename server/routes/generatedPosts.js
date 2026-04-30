import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GeneratedPost, GeneratedImage, TrueStory, ContentJob, MediaFile, FbPage, Post } from '../models/index.js';
import { composeImage } from '../services/imageComposerService.js';
import { writeArticle } from '../services/articleWriterService.js';
import { publishToPage } from '../services/facebookService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = Router();

// List all generated posts (drafts)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const where = {};
    if (status) where.status = status;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await GeneratedPost.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
      include: [
        { model: TrueStory, as: 'story', attributes: ['id', 'title', 'title_vi', 'category', 'verified_facts', 'source_urls'] },
        { model: FbPage, as: 'fbPage', attributes: ['id', 'name', 'page_id', 'avatar_url'] },
        { model: MediaFile, as: 'finalImage', attributes: ['id', 'path', 'thumbnail_path', 'width', 'height'] },
      ],
    });

    res.json({ success: true, posts: rows, total: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single generated post
router.get('/:id', async (req, res) => {
  try {
    const post = await GeneratedPost.findByPk(req.params.id, {
      include: [
        { model: TrueStory, as: 'story' },
        { model: FbPage, as: 'fbPage' },
        { model: MediaFile, as: 'finalImage' },
        { model: GeneratedImage, as: 'generatedImages', include: [
          { model: MediaFile, as: 'sourceMedia' },
          { model: MediaFile, as: 'outputMedia' },
        ]},
        { model: ContentJob, as: 'contentJob' },
      ],
    });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update generated post (edit text, change image, etc.)
router.put('/:id', async (req, res) => {
  try {
    const post = await GeneratedPost.findByPk(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const { post_body, hook, image_headline, image_subheadline, hashtags, fb_page_id, final_image_id } = req.body;

    await post.update({
      ...(post_body !== undefined && { post_body }),
      ...(hook !== undefined && { hook }),
      ...(image_headline !== undefined && { image_headline }),
      ...(image_subheadline !== undefined && { image_subheadline }),
      ...(hashtags !== undefined && { hashtags }),
      ...(fb_page_id !== undefined && { fb_page_id }),
      ...(final_image_id !== undefined && { final_image_id }),
    });

    const updated = await GeneratedPost.findByPk(post.id, {
      include: [
        { model: TrueStory, as: 'story' },
        { model: FbPage, as: 'fbPage' },
        { model: MediaFile, as: 'finalImage' },
      ],
    });

    res.json({ success: true, post: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve post
router.post('/:id/approve', async (req, res) => {
  try {
    const post = await GeneratedPost.findByPk(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    await post.update({ status: 'approved' });
    res.json({ success: true, status: 'approved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reject post
router.post('/:id/reject', async (req, res) => {
  try {
    const post = await GeneratedPost.findByPk(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    await post.update({ status: 'rejected' });
    res.json({ success: true, status: 'rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Publish to Facebook
router.post('/:id/publish', async (req, res) => {
  try {
    const genPost = await GeneratedPost.findByPk(req.params.id, {
      include: [
        { model: FbPage, as: 'fbPage' },
        { model: MediaFile, as: 'finalImage' },
        { model: TrueStory, as: 'story' },
      ],
    });
    if (!genPost) return res.status(404).json({ error: 'Post not found' });
    if (!genPost.fbPage) return res.status(400).json({ error: 'Chưa chọn Facebook Page' });

    // Determine image path
    let imagePath = null;
    if (genPost.finalImage) {
      const basePath = path.join(__dirname, '..', '..');
      imagePath = path.join(basePath, genPost.finalImage.path);
    }

    // Publish
    const result = await publishToPage({
      caption: genPost.post_body,
      imagePath,
      pageId: genPost.fbPage.page_id,
      accessToken: genPost.fbPage.access_token,
    });

    // Create Post record for tracking
    const post = await Post.create({
      title: genPost.story?.title_vi || genPost.hook || 'Auto Story',
      caption: genPost.post_body,
      image_url: genPost.finalImage?.path || null,
      image_source: 'ai_generated',
      fb_page_id: genPost.fb_page_id,
      status: 'published',
      publish_type: 'direct',
      published_at: new Date(),
      fb_post_id: result.fb_post_id,
      ai_model_used: genPost.ai_model_used,
      metadata: { source: 'true_story', story_id: genPost.story_id },
    });

    await genPost.update({
      status: 'published',
      published_post_id: post.id,
    });

    res.json({ success: true, fb_post_id: result.fb_post_id, post_id: post.id });
  } catch (err) {
    console.error('[Publish]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Regenerate article (keep story, re-write)
router.post('/:id/regenerate', async (req, res) => {
  try {
    const genPost = await GeneratedPost.findByPk(req.params.id, {
      include: [{ model: TrueStory, as: 'story' }],
    });
    if (!genPost || !genPost.story) return res.status(404).json({ error: 'Post or story not found' });

    const article = await writeArticle(genPost.story);
    const hashtagsStr = (article.hashtags || []).join(' ');
    const fullBody = article.post_body + (hashtagsStr ? `\n\n${hashtagsStr}` : '');

    await genPost.update({
      post_body: fullBody,
      hook: article.hook,
      image_headline: article.image_headline,
      image_subheadline: article.image_subheadline,
      hashtags: article.hashtags,
      ai_model_used: article.ai_model_used,
      status: 'draft',
    });

    res.json({ success: true, post: genPost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recompose image (use different source image)
router.post('/:id/recompose', async (req, res) => {
  try {
    const genPost = await GeneratedPost.findByPk(req.params.id, {
      include: [{ model: TrueStory, as: 'story' }],
    });
    if (!genPost) return res.status(404).json({ error: 'Post not found' });

    const { media_id } = req.body;
    const sourceMedia = await MediaFile.findByPk(media_id);
    if (!sourceMedia) return res.status(404).json({ error: 'Media file not found' });

    const finalImage = await composeImage({
      sourceImagePath: sourceMedia.path,
      headline: genPost.image_headline,
      subheadline: genPost.image_subheadline,
      storyId: genPost.story_id,
      folderId: sourceMedia.folder_id,
    });

    await genPost.update({ final_image_id: finalImage.id });

    // Update/create GeneratedImage record
    await GeneratedImage.create({
      story_id: genPost.story_id,
      generated_post_id: genPost.id,
      mode: 'real_photo_overlay',
      source_media_id: sourceMedia.id,
      output_media_id: finalImage.id,
      text_overlay: {
        headline: genPost.image_headline,
        subheadline: genPost.image_subheadline,
      },
      status: 'draft',
    });

    res.json({ success: true, image: finalImage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete generated post (draft). Cleanup GeneratedImage records nhưng giữ
// MediaFile để không phá thư viện (user có thể đang dùng ảnh ở chỗ khác).
router.delete('/:id', async (req, res) => {
  try {
    const post = await GeneratedPost.findByPk(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    await GeneratedImage.destroy({ where: { generated_post_id: post.id } });
    await post.destroy();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
