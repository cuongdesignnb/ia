import { Router } from 'express';
import { generateCaption, generateImage, getAvailableProviders, getModelLists } from '../services/aiService.js';
import { Style } from '../models/index.js';

const router = Router();

// GET /api/ai/providers — available models based on configured keys
router.get('/providers', async (req, res) => {
  try {
    const providers = await getAvailableProviders();
    const models = getModelLists(providers);
    res.json({ success: true, data: { providers, models } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ai/caption - generate caption
router.post('/caption', async (req, res) => {
  try {
    const { product, style_id, custom_prompt, prefer_model } = req.body;
    if (!product) return res.status(400).json({ success: false, error: 'Vui lòng nhập tên sản phẩm' });

    let style = null;
    if (style_id) {
      style = await Style.findByPk(style_id);
    }
    if (!style) {
      style = { prompt_template: 'Viết caption Facebook hấp dẫn cho sản phẩm: {{product}}. Kèm hashtag. Viết bằng tiếng Việt.', tone: 'professional' };
    }

    const result = await generateCaption({ product, style, customPrompt: custom_prompt, preferModel: prefer_model });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ai/image - generate image
router.post('/image', async (req, res) => {
  try {
    const { product, style_id, custom_prompt, prefer_model } = req.body;
    if (!product) return res.status(400).json({ success: false, error: 'Vui lòng nhập tên sản phẩm' });

    let style = null;
    if (style_id) style = await Style.findByPk(style_id);

    const result = await generateImage({ product, style, customPrompt: custom_prompt, preferModel: prefer_model });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
