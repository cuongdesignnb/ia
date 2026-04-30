import { Router } from 'express';
import { TrueStory, ContentJob, GeneratedPost, GeneratedImage, MediaFile, FbPage, Post } from '../models/index.js';
import { runPipeline } from '../services/contentPipelineService.js';
import { composeImage } from '../services/imageComposerService.js';
import { publishToPage } from '../services/facebookService.js';
import { Op } from 'sequelize';

const router = Router();

// ============================
// Content Jobs
// ============================

// Create a new job (manual topic)
router.post('/jobs', async (req, res) => {
  try {
    const { topic, category, fb_page_id } = req.body;

    // Run pipeline in background (don't block response)
    const job = await ContentJob.create({
      topic: topic || 'AI tự chọn',
      job_type: topic ? 'manual' : 'auto_scheduled',
      status: 'pending',
      started_at: new Date(),
    });

    // Start pipeline async
    runPipeline(topic || null, category || null, fb_page_id || null)
      .catch(err => console.error(`[Job #${job.id}] Pipeline error:`, err.message));

    res.json({ success: true, job_id: job.id, status: 'pending' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List all jobs
router.get('/jobs', async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const where = {};
    if (status) where.status = status;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await ContentJob.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
      include: [
        { model: TrueStory, as: 'story', attributes: ['id', 'title', 'title_vi', 'category'] },
      ],
    });

    res.json({ success: true, jobs: rows, total: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get job detail
router.get('/jobs/:id', async (req, res) => {
  try {
    const job = await ContentJob.findByPk(req.params.id, {
      include: [
        { model: TrueStory, as: 'story' },
        { model: GeneratedPost, as: 'generatedPost' },
      ],
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Retry failed job
router.post('/jobs/:id/retry', async (req, res) => {
  try {
    const job = await ContentJob.findByPk(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    await job.update({ status: 'pending', error_message: null, started_at: new Date(), finished_at: null });

    runPipeline(job.topic !== 'AI tự chọn' ? job.topic : null)
      .catch(err => console.error(`[Job #${job.id}] Retry error:`, err.message));

    res.json({ success: true, job_id: job.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel a running/pending job — pipeline check status giữa các step và dừng
router.post('/jobs/:id/cancel', async (req, res) => {
  try {
    const job = await ContentJob.findByPk(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      return res.status(400).json({ error: `Job đã ${job.status}, không thể huỷ` });
    }
    await job.update({
      status: 'cancelled',
      error_message: 'Cancelled by user',
      finished_at: new Date(),
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete job record entirely
router.delete('/jobs/:id', async (req, res) => {
  try {
    const job = await ContentJob.findByPk(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    await job.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// True Stories
// ============================

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, category } = req.query;
    const where = {};
    if (status) where.status = status;
    if (category) where.category = category;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await TrueStory.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    res.json({ success: true, stories: rows, total: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const story = await TrueStory.findByPk(req.params.id, {
      include: [
        { model: MediaFile, as: 'mediaFiles' },
      ],
    });
    if (!story) return res.status(404).json({ error: 'Story not found' });
    res.json(story);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
