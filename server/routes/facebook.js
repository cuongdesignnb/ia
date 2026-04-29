import { Router } from 'express';
import { getPageInfo } from '../services/facebookService.js';

const router = Router();

// GET /api/facebook/status
router.get('/status', async (req, res) => {
  try {
    const info = await getPageInfo();
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
