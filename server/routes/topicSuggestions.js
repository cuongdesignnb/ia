import { Router } from 'express';
import { Op } from 'sequelize';
import { TopicSuggestion, TrueStory } from '../models/index.js';
import { generateBatch } from '../services/topicSuggestionService.js';
import { runPipeline } from '../services/contentPipelineService.js';

const router = Router();

// List suggestions, default = pending only, grouped client-side by batch_id
router.get('/', async (req, res) => {
  try {
    const { status = 'pending', limit = 100 } = req.query;
    const where = {};
    if (status === 'all') {
      // no filter
    } else if (status.includes(',')) {
      where.status = { [Op.in]: status.split(',') };
    } else {
      where.status = status;
    }

    const rows = await TopicSuggestion.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
    });
    res.json({ success: true, suggestions: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Generate a new manual batch
router.post('/generate', async (req, res) => {
  try {
    const count = req.body?.count ? parseInt(req.body.count) : undefined;
    const result = await generateBatch({ source: 'manual', count });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[TopicSuggestion] generate error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Pick a suggestion → kick off pipeline
router.post('/:id/pick', async (req, res) => {
  try {
    const sug = await TopicSuggestion.findByPk(req.params.id);
    if (!sug) return res.status(404).json({ error: 'Suggestion not found' });
    if (sug.status === 'picked') {
      return res.status(400).json({ error: 'Suggestion đã được dùng' });
    }
    if (sug.status === 'dismissed') {
      return res.status(400).json({ error: 'Suggestion đã bị bỏ qua' });
    }

    const fbPageId = req.body?.fb_page_id || null;
    const topic = sug.title_vi || sug.title;

    // Mark picked synchronously so UI reflects immediately
    await sug.update({ status: 'picked', picked_at: new Date() });

    // Kick pipeline async (giống cách trueStories làm)
    runPipeline(topic, sug.category || null, fbPageId)
      .then(async (post) => {
        if (post?.story_id) {
          await sug.update({ story_id: post.story_id }).catch(() => {});
        }
      })
      .catch(err => console.error(`[TopicSuggestion #${sug.id}] Pipeline error:`, err.message));

    res.json({ success: true, suggestion: sug, message: 'Đã bắt đầu tạo bài' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dismiss a suggestion
router.post('/:id/dismiss', async (req, res) => {
  try {
    const sug = await TopicSuggestion.findByPk(req.params.id);
    if (!sug) return res.status(404).json({ error: 'Suggestion not found' });
    await sug.update({ status: 'dismissed' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Hard delete (cleanup)
router.delete('/:id', async (req, res) => {
  try {
    const sug = await TopicSuggestion.findByPk(req.params.id);
    if (!sug) return res.status(404).json({ error: 'Suggestion not found' });
    await sug.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
