/**
 * True Story Research Routes — mount tại /api/true-stories (TRƯỚC trueStoryRoutes).
 * Express sẽ thử router này trước; nếu không match (ví dụ /jobs, /:id) thì fall-through
 * sang trueStoryRoutes hiện tại.
 *
 * Endpoints:
 *   GET  /providers
 *   POST /search
 *   POST /ideas
 *   POST /brief
 *   POST /caption
 *   POST /image-plan
 *   POST /full-generate
 */
import { Router } from 'express';
import {
  getResearchProviders,
  searchTrueStories,
} from '../services/researchService.js';
import {
  findTrueStoryIdeas,
  generateTrueStoryBrief,
  generateFacebookCaptionFromTrueStory,
  generateTrueStoryImagePlan,
  fullGenerateTrueStory,
} from '../services/trueStoryService.js';

const router = Router();

const wrap = (handler) => async (req, res) => {
  try {
    const data = await handler(req.body || {}, req);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[TrueStoryResearch] ❌', err.message);
    const status = /Chưa cấu hình Search API/i.test(err.message) ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
};

// Provider availability — KHÔNG mock, KHÔNG fallback.
router.get('/providers', async (req, res) => {
  try {
    const providers = await getResearchProviders();
    res.json({ success: true, data: { providers } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/search', wrap(async (body) => {
  const result = await searchTrueStories(body);
  return result;
}));

router.post('/ideas', wrap(findTrueStoryIdeas));

router.post('/brief', wrap(generateTrueStoryBrief));

router.post('/caption', wrap(generateFacebookCaptionFromTrueStory));

router.post('/image-plan', wrap(generateTrueStoryImagePlan));

router.post('/full-generate', wrap(fullGenerateTrueStory));

export default router;
