/**
 * Story Viral Service
 * Luồng: brief → angles → caption → image plan → quality check.
 *
 * Tận dụng client OpenAI/Gemini đã có trong aiService.js
 * (KHÔNG viết lại client để tránh phá phần đang chạy).
 */
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSetting } from './settingsService.js';
import {
  systemPrompt,
  briefPrompt,
  anglesPrompt,
  captionPrompt,
  imagePlanPrompt,
  qualityCheckPrompt,
  buildFinalImagePrompt,
} from '../prompts/storyViralPrompts.js';

const OPENAI_FALLBACKS = ['gpt-5.5', 'gpt-5.4-mini', 'gpt-4o-mini'];
const isGPT5 = (m) => m && m.startsWith('gpt-5');

async function getOpenAI() {
  const key = await getSetting('openai_api_key', 'OPENAI_API_KEY');
  return key ? new OpenAI({ apiKey: key, timeout: 90000 }) : null;
}

async function getGemini() {
  const key = await getSetting('google_ai_api_key', 'GOOGLE_AI_API_KEY');
  return key ? new GoogleGenerativeAI(key) : null;
}

/**
 * Gọi AI và trả về string. OpenAI ưu tiên, fallback Gemini.
 * Có retry qua list models để không vỡ pipeline khi 1 model lỗi.
 */
async function callAI({ user, system = systemPrompt(), expectJSON = true }) {
  const openai = await getOpenAI();
  if (openai) {
    for (const model of OPENAI_FALLBACKS) {
      try {
        const tokenParam = isGPT5(model)
          ? { max_completion_tokens: 3000 }
          : { max_tokens: 3000 };
        const isReasoning = model === 'gpt-5.5' || model === 'gpt-5.4';
        const completion = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          ...tokenParam,
          ...(isReasoning ? {} : { temperature: 0.7 }),
          ...(expectJSON && !isReasoning ? { response_format: { type: 'json_object' } } : {}),
        });
        const text = completion.choices?.[0]?.message?.content || '';
        if (text) {
          console.log(`[StoryViral] ✅ OpenAI ${model} OK`);
          return text;
        }
      } catch (err) {
        console.error(`[StoryViral] ❌ ${model}: ${err.message}`);
      }
    }
  }

  const gemini = await getGemini();
  if (gemini) {
    try {
      const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(`${system}\n\n${user}`);
      const text = result.response.text();
      console.log('[StoryViral] ✅ Gemini fallback OK');
      return text;
    } catch (err) {
      console.error(`[StoryViral] ❌ Gemini: ${err.message}`);
    }
  }

  throw new Error('Chưa cấu hình AI key nào (OpenAI / Gemini)');
}

function parseJSON(text, fallback = null) {
  if (!text) return fallback;
  const cleaned = String(text).replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // Cho phép cả object lẫn array
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  const candidate =
    arrMatch && (!objMatch || arrMatch.index < objMatch.index) ? arrMatch[0] : objMatch?.[0];
  if (!candidate) return fallback;
  try {
    return JSON.parse(candidate);
  } catch {
    return fallback;
  }
}

/* ============================================================
 * 1. generateStoryBrief
 * ============================================================ */
export async function generateStoryBrief(input) {
  const raw = await callAI({ user: briefPrompt(input), expectJSON: true });
  const brief = parseJSON(raw, {});
  // Safety: nếu không có nguồn → tự thêm warning
  const notes = Array.isArray(brief.safety_notes) ? brief.safety_notes : [];
  if (!input?.source_url && !input?.source_text && !notes.includes('needs_source_review')) {
    notes.push('needs_source_review');
  }
  return {
    summary: brief.summary || '',
    verified_facts: Array.isArray(brief.verified_facts) ? brief.verified_facts : [],
    unknown_parts: Array.isArray(brief.unknown_parts) ? brief.unknown_parts : [],
    emotional_core: brief.emotional_core || '',
    curiosity_gap: brief.curiosity_gap || '',
    viral_potential: brief.viral_potential || 'medium',
    safety_notes: notes,
  };
}

/* ============================================================
 * 2. generateViralAngles
 * ============================================================ */
export async function generateViralAngles(brief) {
  const raw = await callAI({ user: anglesPrompt(brief), expectJSON: true });
  const parsed = parseJSON(raw, []);
  const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.angles) ? parsed.angles : [];
  return arr
    .filter((a) => a && a.hook)
    .slice(0, 5)
    .map((a) => ({
      title: a.title || '',
      hook: a.hook || '',
      style: a.style || '',
      curiosity_gap: a.curiosity_gap || '',
      emotional_trigger: a.emotional_trigger || '',
      risk_level: ['low', 'medium', 'high'].includes(a.risk_level) ? a.risk_level : 'medium',
      reason_why_it_works: a.reason_why_it_works || '',
    }));
}

/* ============================================================
 * 3. generateFacebookCaption
 * ============================================================ */
export async function generateFacebookCaption({ brief, selected_angle, creativity_level, target_audience }) {
  if (!brief) throw new Error('brief là bắt buộc');
  if (!selected_angle) throw new Error('selected_angle là bắt buộc');
  const raw = await callAI({
    user: captionPrompt({ brief, selected_angle, creativity_level, target_audience }),
    expectJSON: true,
  });
  const obj = parseJSON(raw, {});
  return {
    title: obj.title || selected_angle.title || '',
    caption: obj.caption || '',
    thumbnail_text: obj.thumbnail_text || '',
    hashtags: Array.isArray(obj.hashtags) ? obj.hashtags : [],
    fact_check_notes: Array.isArray(obj.fact_check_notes) ? obj.fact_check_notes : [],
  };
}

/* ============================================================
 * 4. generateImagePlan
 * ============================================================ */
export async function generateImagePlan({ brief, selected_angle, caption_meta }) {
  const raw = await callAI({
    user: imagePlanPrompt({ brief, selected_angle, caption_meta }),
    expectJSON: true,
  });
  const obj = parseJSON(raw, {});
  const mode =
    obj.image_mode_recommendation === 'upload_real_image' ? 'upload_real_image' : 'generate_ai_image';
  // Nếu AI không cho image_prompt đủ chuẩn → tự build từ template
  const finalImagePrompt =
    obj.image_prompt && obj.image_prompt.length > 80
      ? obj.image_prompt
      : buildFinalImagePrompt({
          topic: brief?.summary?.slice(0, 80),
          main_scene: obj.main_scene,
          location: brief?.location,
          time_context: brief?.time_context,
          thumbnail_text: obj.thumbnail_text || caption_meta?.thumbnail_text,
          negative_notes: obj.negative_prompt_notes,
        });
  return {
    image_mode_recommendation: mode,
    reason: obj.reason || '',
    main_scene: obj.main_scene || '',
    image_prompt: finalImagePrompt,
    thumbnail_text: obj.thumbnail_text || caption_meta?.thumbnail_text || '',
    negative_prompt_notes: Array.isArray(obj.negative_prompt_notes) ? obj.negative_prompt_notes : [],
    authenticity_notes: Array.isArray(obj.authenticity_notes) ? obj.authenticity_notes : [],
  };
}

/* ============================================================
 * 5. qualityCheckStoryPost
 * ============================================================ */
export async function qualityCheckStoryPost({ brief, caption, thumbnail_text, image_prompt }) {
  const raw = await callAI({
    user: qualityCheckPrompt({ brief, caption, thumbnail_text, image_prompt }),
    expectJSON: true,
  });
  const obj = parseJSON(raw, {});
  const warnings = Array.isArray(obj.warnings) ? obj.warnings : [];
  // Bổ sung warning tự động nếu thiếu nguồn
  if (Array.isArray(brief?.safety_notes) && brief.safety_notes.includes('needs_source_review')) {
    if (!warnings.find((w) => /nguồn/i.test(w))) {
      warnings.push('Bài chưa có nguồn rõ ràng — vui lòng kiểm tra lại trước khi đăng.');
    }
  }
  return {
    passed: warnings.length === 0 && obj.passed !== false,
    warnings,
    suggestions: Array.isArray(obj.suggestions) ? obj.suggestions : [],
    score: {
      authenticity: Number(obj.score?.authenticity ?? 0),
      curiosity: Number(obj.score?.curiosity ?? 0),
      clarity: Number(obj.score?.clarity ?? 0),
      facebook_readability: Number(obj.score?.facebook_readability ?? 0),
      image_relevance: Number(obj.score?.image_relevance ?? 0),
    },
  };
}

/* ============================================================
 * Full pipeline — chạy trọn luồng
 * ============================================================ */
export async function generateFullViralStory(input) {
  const brief = await generateStoryBrief(input);
  const angles = await generateViralAngles(brief);
  if (!angles.length) throw new Error('AI không trả về angle hợp lệ');

  // Chọn angle "tốt nhất": low risk trước, sau đó medium.
  const selected_angle =
    angles.find((a) => a.risk_level === 'low') ||
    angles.find((a) => a.risk_level === 'medium') ||
    angles[0];

  const caption = await generateFacebookCaption({
    brief,
    selected_angle,
    creativity_level: input?.creativity_level,
    target_audience: input?.target_audience,
  });

  const image_plan = await generateImagePlan({
    brief,
    selected_angle,
    caption_meta: { thumbnail_text: caption.thumbnail_text, title: caption.title },
  });

  const quality_check = await qualityCheckStoryPost({
    brief,
    caption: caption.caption,
    thumbnail_text: caption.thumbnail_text,
    image_prompt: image_plan.image_prompt,
  });

  return { brief, angles, selected_angle, caption, image_plan, quality_check };
}

export default {
  generateStoryBrief,
  generateViralAngles,
  generateFacebookCaption,
  generateImagePlan,
  qualityCheckStoryPost,
  generateFullViralStory,
};
