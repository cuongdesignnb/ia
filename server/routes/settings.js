import { Router } from 'express';
import { requireAuth } from '../services/authService.js';
import { getSetting, setSetting, getSettingsByGroup, invalidateCache } from '../services/settingsService.js';
import { restartStoryScheduler, restartTopicSuggestionScheduler } from './../services/scheduler.js';

const router = Router();

// All settings routes require authentication
router.use(requireAuth);

// Sensitive keys — mask these when returning to frontend
const SENSITIVE_KEYS = ['admin_password'];

// Auto Story keys (non-sensitive — value returned as-is for editing)
const AUTO_STORY_KEYS = [
  'auto_story_enabled',
  'auto_story_cron',
  'auto_stories_per_day',
  'auto_story_categories',
  'auto_story_ai_model',
  'image_label_text',
  'image_label_color',
  'image_logo_position',
  'image_logo_size',
  'image_logo_media_id',
  'unsplash_api_key',
  'topic_suggestion_enabled',
  'topic_suggestion_cron',
  'topic_suggestion_batch_size',
];

/**
 * Mask a secret key for display (show first 4 and last 4 chars)
 */
function maskValue(key, value) {
  if (!value) return '';
  if (SENSITIVE_KEYS.includes(key)) return '********';
  if (value.length <= 10) return '***' + value.slice(-3);
  return value.slice(0, 4) + '••••••••' + value.slice(-4);
}

// GET /api/settings — get all settings (masked)
router.get('/', async (req, res) => {
  try {
    const settings = await getSettingsByGroup();

    // Build structured response with masked values
    const groups = {
      ai: {
        openai_api_key: { value: settings.openai_api_key || '', masked: maskValue('openai_api_key', settings.openai_api_key), configured: !!settings.openai_api_key },
        google_ai_api_key: { value: '', masked: maskValue('google_ai_api_key', settings.google_ai_api_key), configured: !!settings.google_ai_api_key },
      },
      facebook: {
        fb_page_id: { value: settings.fb_page_id || '', masked: maskValue('fb_page_id', settings.fb_page_id), configured: !!settings.fb_page_id },
        fb_access_token: { value: '', masked: maskValue('fb_access_token', settings.fb_access_token), configured: !!settings.fb_access_token },
        fb_app_id: { value: '', masked: maskValue('fb_app_id', settings.fb_app_id), configured: !!settings.fb_app_id },
        fb_app_secret: { value: '', masked: maskValue('fb_app_secret', settings.fb_app_secret), configured: !!settings.fb_app_secret },
      },
      auto_story: {},
    };

    // Auto Story group — return raw values (not sensitive enough to mask, frontend cần để edit)
    for (const k of AUTO_STORY_KEYS) {
      const v = settings[k];
      groups.auto_story[k] = { value: v ?? '', configured: !!v };
    }

    // Check .env fallbacks
    const envFallbacks = {
      openai_api_key: 'OPENAI_API_KEY',
      google_ai_api_key: 'GOOGLE_AI_API_KEY',
      fb_page_id: 'FB_PAGE_ID',
      fb_access_token: 'FB_ACCESS_TOKEN',
      fb_app_id: 'FB_APP_ID',
      fb_app_secret: 'FB_APP_SECRET',
    };

    for (const [settingKey, envKey] of Object.entries(envFallbacks)) {
      const group = settingKey.startsWith('fb_') ? 'facebook' : 'ai';
      if (!groups[group][settingKey].configured) {
        const envVal = process.env[envKey];
        if (envVal && !envVal.startsWith('your_')) {
          groups[group][settingKey].configured = true;
          groups[group][settingKey].masked = maskValue(settingKey, envVal) + ' (.env)';
          groups[group][settingKey].source = 'env';
        }
      } else {
        groups[group][settingKey].source = 'db';
      }
    }

    res.json({ success: true, data: groups });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/settings — update settings
router.put('/', async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: 'Dữ liệu không hợp lệ' });
    }

    const allowedKeys = {
      openai_api_key: 'ai',
      google_ai_api_key: 'ai',
      fb_page_id: 'facebook',
      fb_access_token: 'facebook',
      fb_app_id: 'facebook',
      fb_app_secret: 'facebook',
    };
    // Auto Story keys — group 'auto_story'
    for (const k of AUTO_STORY_KEYS) allowedKeys[k] = 'auto_story';

    let updated = 0;
    const changedKeys = new Set();
    for (const [key, value] of Object.entries(settings)) {
      if (!allowedKeys[key]) continue;
      if (value === undefined || value === null) continue;
      const strValue = typeof value === 'string' ? value.trim() : String(value);
      await setSetting(key, strValue, allowedKeys[key]);
      changedKeys.add(key);
      updated++;
    }

    invalidateCache();

    // Nếu fb_app_id/secret được set, cập nhật process.env luôn
    // để exchangeToken có thể dùng ngay mà không cần restart
    if (settings.fb_app_id) process.env.FB_APP_ID = settings.fb_app_id.trim();
    if (settings.fb_app_secret) process.env.FB_APP_SECRET = settings.fb_app_secret.trim();

    // Hot-reload schedulers nếu cron-related settings thay đổi
    const storyKeys = ['auto_story_enabled', 'auto_story_cron'];
    const topicKeys = ['topic_suggestion_enabled', 'topic_suggestion_cron'];
    if (storyKeys.some(k => changedKeys.has(k))) {
      restartStoryScheduler().catch(err => console.error('Restart story scheduler:', err.message));
    }
    if (topicKeys.some(k => changedKeys.has(k))) {
      restartTopicSuggestionScheduler().catch(err => console.error('Restart topic scheduler:', err.message));
    }

    res.json({ success: true, message: `Đã cập nhật ${updated} cài đặt`, updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/settings/test-ai — test AI connection
router.post('/test-ai', async (req, res) => {
  try {
    const openaiKey = await getSetting('openai_api_key', 'OPENAI_API_KEY');
    const geminiKey = await getSetting('google_ai_api_key', 'GOOGLE_AI_API_KEY');

    const results = { openai: null, gemini: null };

    if (geminiKey) {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        await model.generateContent('Trả lời "OK" nếu bạn nhận được tin nhắn này.');
        results.gemini = { ok: true, model: 'gemini-2.0-flash' };
      } catch (err) {
        results.gemini = { ok: false, error: err.message };
      }
    }

    if (openaiKey) {
      try {
        const OpenAI = (await import('openai')).default;
        const client = new OpenAI({ apiKey: openaiKey });
        // Try gpt-5.4-mini first (newer), fallback to gpt-4o-mini (legacy stable)
        let testModel = 'gpt-5.4-mini';
        try {
          await client.chat.completions.create({
            model: testModel,
            messages: [{ role: 'user', content: 'Trả lời "OK".' }],
            max_tokens: 5,
          });
        } catch {
          testModel = 'gpt-4o-mini';
          await client.chat.completions.create({
            model: testModel,
            messages: [{ role: 'user', content: 'Trả lời "OK".' }],
            max_tokens: 5,
          });
        }
        results.openai = { ok: true, model: testModel };
      } catch (err) {
        results.openai = { ok: false, error: err.message };
      }
    }

    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
