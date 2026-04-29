import { Router } from 'express';
import { Style } from '../models/index.js';

const router = Router();

// GET /api/styles
router.get('/', async (req, res) => {
  try {
    const styles = await Style.findAll({
      where: { is_active: true },
      order: [['sort_order', 'ASC']],
    });
    res.json({ success: true, data: styles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/styles/:id
router.get('/:id', async (req, res) => {
  try {
    const style = await Style.findByPk(req.params.id);
    if (!style) return res.status(404).json({ success: false, error: 'Style not found' });
    res.json({ success: true, data: style });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/styles
router.post('/', async (req, res) => {
  try {
    const style = await Style.create(req.body);
    res.status(201).json({ success: true, data: style });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/styles/:id
router.put('/:id', async (req, res) => {
  try {
    const style = await Style.findByPk(req.params.id);
    if (!style) return res.status(404).json({ success: false, error: 'Style not found' });
    await style.update(req.body);
    res.json({ success: true, data: style });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
