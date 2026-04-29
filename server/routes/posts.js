import { Router } from 'express';
import { Post, Style, FbPage } from '../models/index.js';
import sequelize from '../config/database.js';
import { generateCaption, generateImage } from '../services/aiService.js';
import { publishToPage } from '../services/facebookService.js';
import { Op } from 'sequelize';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Multer setup for image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/posts - list posts with filters (scoped by fb_page_id)
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search, fb_page_id } = req.query;
    const where = {};
    if (status) where.status = status;
    if (search) where.title = { [Op.like]: `%${search}%` };
    if (fb_page_id) where.fb_page_id = fb_page_id;

    const offset = (page - 1) * limit;
    const { rows, count } = await Post.findAndCountAll({
      where,
      include: [
        { model: Style, as: 'style', attributes: ['id', 'name', 'slug', 'color'] },
        { model: FbPage, as: 'fbPage', attributes: ['id', 'name', 'color', 'avatar_url'] },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      success: true,
      data: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/posts/stats (scoped by fb_page_id)
router.get('/stats', async (req, res) => {
  try {
    const { fb_page_id } = req.query;
    const where = {};
    if (fb_page_id) where.fb_page_id = fb_page_id;

    const [total, draft, scheduled, published, failed] = await Promise.all([
      Post.count({ where }),
      Post.count({ where: { ...where, status: 'draft' } }),
      Post.count({ where: { ...where, status: 'scheduled' } }),
      Post.count({ where: { ...where, status: 'published' } }),
      Post.count({ where: { ...where, status: 'failed' } }),
    ]);
    res.json({ success: true, data: { total, draft, scheduled, published, failed } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/posts/:id
router.get('/:id', async (req, res) => {
  try {
    const post = await Post.findByPk(req.params.id, {
      include: [
        { model: Style, as: 'style' },
        { model: FbPage, as: 'fbPage', attributes: ['id', 'name', 'color', 'avatar_url', 'page_id'] },
      ],
    });
    if (!post) return res.status(404).json({ success: false, error: 'Không tìm thấy bài viết' });
    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/posts - create a post (with fb_page_id)
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.file) {
      data.image_url = `/uploads/${req.file.filename}`;
      data.image_source = 'uploaded';
    }
    if (data.metadata && typeof data.metadata === 'string') {
      data.metadata = JSON.parse(data.metadata);
    }
    const post = await Post.create(data);
    const fullPost = await Post.findByPk(post.id, {
      include: [
        { model: Style, as: 'style' },
        { model: FbPage, as: 'fbPage', attributes: ['id', 'name', 'color', 'avatar_url'] },
      ],
    });
    res.status(201).json({ success: true, data: fullPost });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/posts/:id
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) return res.status(404).json({ success: false, error: 'Không tìm thấy bài viết' });

    const data = { ...req.body };
    if (req.file) {
      data.image_url = `/uploads/${req.file.filename}`;
      data.image_source = 'uploaded';
    }
    if (data.metadata && typeof data.metadata === 'string') {
      data.metadata = JSON.parse(data.metadata);
    }
    await post.update(data);
    const updated = await Post.findByPk(post.id, {
      include: [
        { model: Style, as: 'style' },
        { model: FbPage, as: 'fbPage', attributes: ['id', 'name', 'color', 'avatar_url'] },
      ],
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/posts/:id
router.delete('/:id', async (req, res) => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) return res.status(404).json({ success: false, error: 'Không tìm thấy bài viết' });
    await post.destroy();
    res.json({ success: true, message: 'Đã xoá bài viết' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================
// Helper: validate post + page trước khi publish
// ============================
async function getPostForPublish(postId) {
  const post = await Post.findByPk(postId, {
    include: [{ model: FbPage, as: 'fbPage' }],
  });
  if (!post) throw { status: 404, message: 'Không tìm thấy bài viết' };
  if (!post.fbPage) throw { status: 400, message: 'Bài viết chưa được gán cho page nào' };
  if (!post.fbPage.is_active) throw { status: 400, message: 'Page này đã bị tắt' };
  if (!post.fbPage.access_token) throw { status: 400, message: 'Page chưa có Access Token' };
  return post;
}

// POST /api/posts/:id/publish — Đăng ngay lên Facebook
router.post('/:id/publish', async (req, res) => {
  try {
    const post = await getPostForPublish(req.params.id);
    await post.update({ status: 'publishing', error_message: null });

    const result = await publishToPage({
      caption: post.caption,
      imageUrl: post.image_url,
      pageId: post.fbPage.page_id,
      accessToken: post.fbPage.access_token,
      options: { published: true },
    });

    await post.update({
      status: 'published',
      publish_type: 'direct',
      published_at: new Date(),
      fb_post_id: result.fb_post_id,
      error_message: null,
    });
    res.json({ success: true, data: post, fb_result: result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    await Post.update(
      { status: 'failed', error_message: err.message, retry_count: sequelize.literal('retry_count + 1') },
      { where: { id: req.params.id } }
    );
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/posts/:id/publish-draft — Đăng nháp lên Facebook (unpublished)
router.post('/:id/publish-draft', async (req, res) => {
  try {
    const post = await getPostForPublish(req.params.id);
    await post.update({ status: 'publishing', error_message: null });

    const result = await publishToPage({
      caption: post.caption,
      imageUrl: post.image_url,
      pageId: post.fbPage.page_id,
      accessToken: post.fbPage.access_token,
      options: {
        published: false,
        unpublishedContentType: 'DRAFT',
      },
    });

    await post.update({
      status: 'published',
      publish_type: 'fb_draft',
      fb_post_id: result.fb_post_id,
      error_message: null,
      metadata: { ...post.metadata, fb_draft: true },
    });
    res.json({ success: true, data: post, fb_result: result, message: 'Đã đăng nháp lên Facebook' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    await Post.update(
      { status: 'failed', error_message: err.message, retry_count: sequelize.literal('retry_count + 1') },
      { where: { id: req.params.id } }
    );
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/posts/:id/publish-scheduled — Hẹn giờ đăng trên Facebook
router.post('/:id/publish-scheduled', async (req, res) => {
  try {
    const { scheduled_time } = req.body;
    if (!scheduled_time) {
      return res.status(400).json({ success: false, error: 'Vui lòng chọn thời gian hẹn giờ' });
    }

    const scheduledDate = new Date(scheduled_time);
    const now = new Date();
    const minTime = new Date(now.getTime() + 10 * 60 * 1000); // +10 phút
    const maxTime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 ngày

    if (scheduledDate < minTime) {
      return res.status(400).json({ success: false, error: 'Thời gian hẹn giờ phải sau ít nhất 10 phút' });
    }
    if (scheduledDate > maxTime) {
      return res.status(400).json({ success: false, error: 'Thời gian hẹn giờ không quá 30 ngày' });
    }

    const post = await getPostForPublish(req.params.id);
    await post.update({ status: 'publishing', error_message: null });

    const unixTimestamp = Math.floor(scheduledDate.getTime() / 1000);

    const result = await publishToPage({
      caption: post.caption,
      imageUrl: post.image_url,
      pageId: post.fbPage.page_id,
      accessToken: post.fbPage.access_token,
      options: {
        published: false,
        unpublishedContentType: 'SCHEDULED',
        scheduledPublishTime: unixTimestamp,
      },
    });

    await post.update({
      status: 'scheduled',
      publish_type: 'fb_scheduled',
      scheduled_at: scheduledDate,
      fb_post_id: result.fb_post_id,
      error_message: null,
      metadata: { ...post.metadata, fb_scheduled: true, fb_scheduled_time: unixTimestamp },
    });
    res.json({ success: true, data: post, fb_result: result, message: `Đã hẹn giờ đăng lúc ${scheduledDate.toLocaleString('vi-VN')}` });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    await Post.update(
      { status: 'failed', error_message: err.message, retry_count: sequelize.literal('retry_count + 1') },
      { where: { id: req.params.id } }
    );
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/posts/:id/retry — Thử lại bài bị lỗi
router.post('/:id/retry', async (req, res) => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) return res.status(404).json({ success: false, error: 'Không tìm thấy bài viết' });
    if (post.status !== 'failed') {
      return res.status(400).json({ success: false, error: 'Chỉ có thể retry bài viết bị lỗi' });
    }
    if (post.retry_count >= 5) {
      return res.status(400).json({ success: false, error: 'Đã retry quá 5 lần. Vui lòng kiểm tra lại token và nội dung.' });
    }

    // Reset status để publish lại
    await post.update({ status: 'draft', error_message: null });
    res.json({ success: true, message: 'Đã reset về draft. Bạn có thể đăng lại.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/posts/:id/cancel — Hủy bài đã lên lịch
router.post('/:id/cancel', async (req, res) => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) return res.status(404).json({ success: false, error: 'Không tìm thấy bài viết' });
    if (!['scheduled', 'draft'].includes(post.status)) {
      return res.status(400).json({ success: false, error: 'Chỉ có thể hủy bài nháp hoặc đã lên lịch' });
    }
    await post.update({ status: 'cancelled' });
    res.json({ success: true, message: 'Đã hủy bài viết' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

