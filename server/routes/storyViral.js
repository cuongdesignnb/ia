/**
 * Story Viral routes — luồng tạo bài kể chuyện có thật / bí ẩn / điều tra.
 * KHÔNG đụng vào /api/ai/caption và /api/ai/image cũ.
 */
import { Router } from 'express';
import {
  generateStoryBrief,
  generateViralAngles,
  generateFacebookCaption,
  generateImagePlan,
  qualityCheckStoryPost,
  generateFullViralStory,
} from '../services/storyViralService.js';

const router = Router();

const wrap = (handler) => async (req, res) => {
  try {
    const data = await handler(req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    console.error('[StoryViral route] ❌', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/ai/story-viral/brief
router.post('/brief', wrap(generateStoryBrief));

// POST /api/ai/story-viral/angles
// body: { brief }
router.post('/angles', wrap((body) => generateViralAngles(body.brief)));

// POST /api/ai/story-viral/caption
// body: { brief, selected_angle, creativity_level, target_audience }
router.post('/caption', wrap(generateFacebookCaption));

// POST /api/ai/story-viral/image-plan
// body: { brief, selected_angle, caption_meta }
router.post('/image-plan', wrap(generateImagePlan));

// POST /api/ai/story-viral/quality-check
// body: { brief, caption, thumbnail_text, image_prompt }
router.post('/quality-check', wrap(qualityCheckStoryPost));

// POST /api/ai/story-viral/full-generate
router.post('/full-generate', wrap(generateFullViralStory));

export default router;
