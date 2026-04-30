import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { GeneratedPost, GeneratedImage, TrueStory, ContentJob, MediaFile, FbPage, Post } from '../models/index.js';
import { composeImage } from '../services/imageComposerService.js';
import { writeArticle } from '../services/articleWriterService.js';
import { publishToPage } from '../services/facebookService.js';
import { designAndSaveImage } from '../services/aiImageDesignerService.js';
// composeImage = Sharp + SVG (giữ nguyên ảnh thật, đè text overlay)
// designAndSaveImage = AI gen (gpt-image-2 from scratch)

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = Router();

// Multer cho upload reference image khi redesign
const UPLOAD_BASE = path.join(__dirname, '..', '..', 'uploads', 'media');
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const now = new Date();
      const dir = path.join(UPLOAD_BASE, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `ref_${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(jpe?g|png|webp|gif)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh (jpg/png/webp/gif)'));
  },
});

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
        { model: ContentJob, as: 'contentJob', attributes: ['id', 'topic'] },
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

// Redesign — 2 mode:
//   - Có reference (upload mới / media_id / use_current) → Sharp+SVG
//     overlay (giữ NGUYÊN 100% ảnh tham chiếu, đè text)
//   - Không reference → AI generate from scratch (gpt-image-2)
// Body có thể có ?force_ai=true để ép dùng AI gen ngay cả khi có
// reference (cho user muốn redesign artistic).
router.post('/:id/redesign', upload.single('image'), async (req, res) => {
  try {
    const genPost = await GeneratedPost.findByPk(req.params.id, {
      include: [{ model: TrueStory, as: 'story' }, { model: MediaFile, as: 'finalImage' }],
    });
    if (!genPost) return res.status(404).json({ error: 'Post not found' });
    if (!genPost.story) return res.status(400).json({ error: 'Post chưa có story' });

    const basePath = path.join(__dirname, '..', '..');
    let referenceRelativePath = null; // relative path cho composeImage
    let referenceAbsolutePath = null; // absolute cho designAndSaveImage
    let referenceFolderId = null;
    let referenceMediaId = null;

    if (req.file) {
      // Upload mới — lưu MediaFile cho reference này
      const filePath = req.file.path;
      let width = null, height = null;
      try {
        const meta = await sharp(filePath).metadata();
        width = meta.width;
        height = meta.height;
      } catch { /* ignore */ }

      const relativePath = '/' + path.relative(basePath, filePath).replace(/\\/g, '/');
      const refMedia = await MediaFile.create({
        folder_id: null,
        story_id: genPost.story_id,
        filename: req.file.filename,
        original_name: req.file.originalname,
        mime_type: req.file.mimetype || 'image/jpeg',
        path: relativePath,
        size: req.file.size,
        width,
        height,
        license_type: 'User Upload',
        author: 'User',
        attribution_text: 'Uploaded by user as redesign reference',
        uploaded_by: 'user',
        tags: ['user-upload', 'reference'],
      });

      referenceRelativePath = relativePath;
      referenceAbsolutePath = filePath;
      referenceFolderId = refMedia.folder_id;
      referenceMediaId = refMedia.id;
    } else if (req.body?.media_id) {
      const refMedia = await MediaFile.findByPk(parseInt(req.body.media_id));
      if (!refMedia) return res.status(404).json({ error: 'Reference media not found' });
      referenceRelativePath = refMedia.path;
      referenceAbsolutePath = path.join(basePath, refMedia.path);
      referenceFolderId = refMedia.folder_id;
      referenceMediaId = refMedia.id;
    } else if (req.body?.use_current === 'true' || req.body?.use_current === true) {
      if (genPost.finalImage) {
        referenceRelativePath = genPost.finalImage.path;
        referenceAbsolutePath = path.join(basePath, genPost.finalImage.path);
        referenceFolderId = genPost.finalImage.folder_id;
        referenceMediaId = genPost.finalImage.id;
      }
    }

    const forceAI = req.body?.force_ai === 'true' || req.body?.force_ai === true;
    let finalImage;

    if (referenceRelativePath && !forceAI) {
      // Sharp + SVG — giữ nguyên ảnh tham chiếu, đè text/badge lên
      finalImage = await composeImage({
        sourceImagePath: referenceRelativePath,
        headline: genPost.image_headline,
        subheadline: genPost.image_subheadline,
        storyId: genPost.story_id,
        folderId: referenceFolderId,
      });
    } else {
      // AI generate from scratch (hoặc force_ai)
      finalImage = await designAndSaveImage({
        sourceImagePath: forceAI ? referenceAbsolutePath : null,
        story: genPost.story,
        headline: genPost.image_headline,
        subheadline: genPost.image_subheadline,
        storyId: genPost.story_id,
        folderId: referenceFolderId,
      });
    }

    await genPost.update({ final_image_id: finalImage.id });

    if (referenceMediaId) {
      await GeneratedImage.create({
        story_id: genPost.story_id,
        generated_post_id: genPost.id,
        mode: 'ai_redesign',
        source_media_id: referenceMediaId,
        output_media_id: finalImage.id,
        text_overlay: { headline: genPost.image_headline, subheadline: genPost.image_subheadline },
        status: 'draft',
      });
    }

    const updated = await GeneratedPost.findByPk(genPost.id, {
      include: [{ model: MediaFile, as: 'finalImage' }],
    });

    res.json({ success: true, post: updated, image: finalImage });
  } catch (err) {
    console.error('[Redesign]', err);
    res.status(500).json({ success: false, error: err.message });
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
