/**
 * True Story Service
 *
 * Luồng: search internet → fetch & extract → verify by source count → AI chọn ideas
 *       → user chọn 1 → brief → caption → image plan.
 *
 * RÀNG BUỘC CỐT LÕI:
 *   - Không có Search API → throw lỗi (KHÔNG fallback sang "AI tự bịa").
 *   - AI chỉ được dùng dữ kiện từ nguồn fetch về.
 *   - Verification phải dựa trên SỐ NGUỒN ĐỘC LẬP, không phải AI tự nói.
 */
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSetting } from './settingsService.js';
import {
  searchTrueStories,
  fetchAndExtractArticle,
  verifyStorySources,
} from './researchService.js';
import {
  systemPrompt,
  ideaScoringPrompt,
  briefPrompt,
  captionPrompt,
  imagePlanPrompt,
  buildFinalImagePrompt,
} from '../prompts/trueStoryPrompts.js';

const OPENAI_FALLBACKS = ['gpt-5.5', 'gpt-5.4-mini', 'gpt-4o-mini'];

/**
 * Pool chủ đề cho chế độ AUTO — user không cần nhập gì.
 * Mỗi entry là 1 chủ đề tiếng Việt + content_type tương ứng.
 */
const AUTO_TOPIC_POOL = [
  { topic: 'vụ mất tích bí ẩn có thật', content_type: 'missing' },
  { topic: 'người mất tích không lời giải', content_type: 'missing' },
  { topic: 'kỳ án chưa có lời giải', content_type: 'cold_case' },
  { topic: 'vụ án bí ẩn nhất thế kỷ', content_type: 'cold_case' },
  { topic: 'sự kiện lịch sử kỳ lạ ít người biết', content_type: 'strange_history' },
  { topic: 'chương lịch sử bị lãng quên', content_type: 'strange_history' },
  { topic: 'khám phá khoa học gây sốc', content_type: 'discovery' },
  { topic: 'hiện tượng tự nhiên chưa giải thích', content_type: 'discovery' },
  { topic: 'phát hiện khảo cổ kỳ lạ', content_type: 'discovery' },
  { topic: 'nhân vật có số phận đặc biệt', content_type: 'character' },
  { topic: 'người sống sót kỳ diệu', content_type: 'character' },
  { topic: 'câu chuyện cảm động có thật', content_type: 'emotional' },
  { topic: 'tin lạ thế giới có thật', content_type: 'weird_world' },
  { topic: 'sự trùng hợp kỳ lạ trong lịch sử', content_type: 'weird_world' },
];

/**
 * Random pick 1 chủ đề. Có thể giới hạn theo content_type.
 */
export function pickAutoTopic(preferredContentType) {
  const pool = preferredContentType
    ? AUTO_TOPIC_POOL.filter((p) => p.content_type === preferredContentType)
    : AUTO_TOPIC_POOL;
  const candidates = pool.length ? pool : AUTO_TOPIC_POOL;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
const isGPT5 = (m) => m && m.startsWith('gpt-5');

async function getOpenAI() {
  const key = await getSetting('openai_api_key', 'OPENAI_API_KEY');
  return key ? new OpenAI({ apiKey: key, timeout: 90000 }) : null;
}
async function getGemini() {
  const key = await getSetting('google_ai_api_key', 'GOOGLE_AI_API_KEY');
  return key ? new GoogleGenerativeAI(key) : null;
}

async function callAI({ user, system = systemPrompt(), expectJSON = true }) {
  const openai = await getOpenAI();
  if (openai) {
    for (const model of OPENAI_FALLBACKS) {
      try {
        const isReasoning = model === 'gpt-5.5' || model === 'gpt-5.4';
        const tokenParam = isGPT5(model) ? { max_completion_tokens: 3500 } : { max_tokens: 3500 };
        const completion = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          ...tokenParam,
          ...(isReasoning ? {} : { temperature: 0.5 }),
          ...(expectJSON && !isReasoning ? { response_format: { type: 'json_object' } } : {}),
        });
        const text = completion.choices?.[0]?.message?.content || '';
        if (text) {
          console.log(`[TrueStory] ✅ OpenAI ${model}`);
          return text;
        }
      } catch (err) {
        console.error(`[TrueStory] ❌ ${model}: ${err.message}`);
      }
    }
  }
  const gemini = await getGemini();
  if (gemini) {
    try {
      const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const r = await model.generateContent(`${system}\n\n${user}`);
      console.log('[TrueStory] ✅ Gemini fallback');
      return r.response.text();
    } catch (err) {
      console.error(`[TrueStory] ❌ Gemini: ${err.message}`);
    }
  }
  throw new Error('Chưa cấu hình AI key (OpenAI / Gemini)');
}

function parseJSON(text, fb = null) {
  if (!text) return fb;
  const cleaned = String(text).replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const obj = cleaned.match(/\{[\s\S]*\}/);
  const arr = cleaned.match(/\[[\s\S]*\]/);
  const cand = arr && (!obj || arr.index < obj.index) ? arr[0] : obj?.[0];
  if (!cand) return fb;
  try { return JSON.parse(cand); } catch { return fb; }
}

/* ============================================================
 * 1. findTrueStoryIdeas
 * ============================================================ */
export async function findTrueStoryIdeas(payload) {
  const { topic, country, content_type, count = 5, language = 'auto' } = payload || {};
  if (!topic) throw new Error('Thiếu chủ đề');

  // 1) Search
  const search = await searchTrueStories({ topic, country, language, content_type, count: Math.max(count * 2, 10) });
  if (!search.results.length) {
    return { ideas: [], search_notes: search.query_used, warnings: ['Không tìm thấy kết quả nào từ Search API'] };
  }

  // 2) Verify mechanically (group by similar title, count distinct hosts)
  const { verified_candidates } = verifyStorySources(search.results);
  const topCandidates = verified_candidates.slice(0, 20);

  // 3) AI scoring/picking — chỉ chọn TỪ danh sách, không tạo thêm
  const raw = await callAI({
    user: ideaScoringPrompt({ topic, content_type, country, verified_candidates: topCandidates, count }),
    expectJSON: true,
  });
  const parsed = parseJSON(raw, { ideas: [] });
  const aiIdeas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];

  // 4) Map AI ideas back to verified_candidates để giữ nguyên sources + verification
  const ideas = aiIdeas
    .map((idea) => {
      const cand = topCandidates.find((c) => c.story_id === idea.story_id);
      if (!cand) return null;
      return {
        id: cand.story_id,
        title: idea.title || cand.main_title,
        short_summary: idea.short_summary || cand.summary,
        why_it_is_interesting: idea.why_it_is_interesting || '',
        mystery_point: idea.mystery_point || '',
        emotional_angle: idea.emotional_angle || '',
        suggested_hook: idea.suggested_hook || '',
        sources: cand.sources,
        verification_status: cand.verification_status,
        confidence_score: cand.confidence_score,
        risk_level: ['low', 'medium', 'high'].includes(idea.risk_level) ? idea.risk_level : 'medium',
        warning_notes: cand.warning_notes || [],
      };
    })
    .filter(Boolean)
    .slice(0, count);

  const warnings = [];
  if (!ideas.length) warnings.push('AI không chọn được idea hợp lệ từ kết quả search');
  if (ideas.every((i) => i.verification_status === 'weak')) {
    warnings.push('Tất cả idea đều chỉ có 1 nguồn — cần kiểm tra thêm trước khi đăng');
  }

  return {
    ideas,
    search_notes: search.query_used,
    warnings,
  };
}

/* ============================================================
 * 2. generateTrueStoryBrief
 *
 * Fetch sâu các nguồn của idea → gửi AI tổng hợp brief.
 * ============================================================ */
export async function generateTrueStoryBrief(payload) {
  const { selected_idea, sources, article_texts: providedTexts } = payload || {};
  if (!selected_idea) throw new Error('Thiếu selected_idea');
  const sourceList = sources || selected_idea.sources || [];
  if (!sourceList.length) throw new Error('Idea không có nguồn nào');

  // Fetch & extract nếu chưa được cung cấp sẵn
  let article_texts = providedTexts;
  if (!Array.isArray(article_texts) || !article_texts.length) {
    const fetched = await Promise.all(
      sourceList.slice(0, 5).map((s) => fetchAndExtractArticle(s.url).catch(() => null))
    );
    article_texts = fetched.filter((x) => x && x.fetch_status === 'ok' && x.content_text);
  }

  // Nếu vẫn không có nguồn nào fetch được — fallback dùng snippet từ search
  if (!article_texts.length) {
    article_texts = sourceList.map((s) => ({
      url: s.url,
      source_name: s.source_name,
      content_text: '',
      excerpt: s.title || '',
    }));
  }

  const raw = await callAI({
    user: briefPrompt({ selected_idea, sources: sourceList, article_texts }),
    expectJSON: true,
  });
  const b = parseJSON(raw, {});

  // Bổ sung source_notes nếu thiếu
  const source_notes = Array.isArray(b.source_notes) ? b.source_notes : [];
  const fetchFailed = sourceList.length - article_texts.filter((a) => a.content_text).length;
  if (fetchFailed > 0) source_notes.push(`${fetchFailed} nguồn không fetch được nội dung — chỉ dùng snippet`);

  return {
    story_title: b.story_title || selected_idea.title || '',
    summary: b.summary || '',
    timeline: Array.isArray(b.timeline) ? b.timeline : [],
    people: Array.isArray(b.people) ? b.people : [],
    places: Array.isArray(b.places) ? b.places : [],
    verified_facts: Array.isArray(b.verified_facts) ? b.verified_facts : [],
    unknown_parts: Array.isArray(b.unknown_parts) ? b.unknown_parts : [],
    disputed_points: Array.isArray(b.disputed_points) ? b.disputed_points : [],
    emotional_core: b.emotional_core || '',
    curiosity_gap: b.curiosity_gap || '',
    source_notes,
    _article_images: article_texts.flatMap((a) => a.images || []).slice(0, 8),
  };
}

/* ============================================================
 * 3. generateFacebookCaptionFromTrueStory
 * ============================================================ */
export async function generateFacebookCaptionFromTrueStory(payload) {
  const { brief, selected_angle, tone, target_audience, regen_hint } = payload || {};
  if (!brief) throw new Error('Thiếu brief');
  const raw = await callAI({
    user: captionPrompt({ brief, selected_angle, tone, target_audience, regen_hint }),
    expectJSON: true,
  });
  const c = parseJSON(raw, {});
  return {
    title: c.title || brief.story_title || '',
    hook: c.hook || '',
    caption: c.caption || '',
    thumbnail_text: c.thumbnail_text || '',
    hashtags: Array.isArray(c.hashtags) ? c.hashtags : [],
    source_disclaimer: c.source_disclaimer || '',
    fact_check_notes: Array.isArray(c.fact_check_notes) ? c.fact_check_notes : [],
  };
}

/* ============================================================
 * 4. generateTrueStoryImagePlan
 * ============================================================ */
export async function generateTrueStoryImagePlan(payload) {
  const { brief, caption_meta, source_images } = payload || {};
  const imgs = source_images || brief?._article_images || [];
  const raw = await callAI({
    user: imagePlanPrompt({ brief, caption_meta, source_images: imgs }),
    expectJSON: true,
  });
  const p = parseJSON(raw, {});
  const recommended_mode =
    p.recommended_mode === 'upload_real_image' ? 'upload_real_image' : 'ai_illustration';
  const ai_prompt = p.ai_image_prompt && p.ai_image_prompt.length > 60
    ? p.ai_image_prompt
    : buildFinalImagePrompt({
        topic: brief?.story_title,
        scene_description: brief?.summary,
        thumbnail_text: p.thumbnail_text || caption_meta?.thumbnail_text,
      });

  return {
    recommended_mode,
    reason: p.reason || '',
    real_image_suggestions: Array.isArray(p.real_image_suggestions) ? p.real_image_suggestions : imgs.slice(0, 4),
    ai_image_prompt: ai_prompt,
    thumbnail_text: p.thumbnail_text || caption_meta?.thumbnail_text || '',
    warnings: Array.isArray(p.warnings) ? p.warnings : [],
  };
}

/* ============================================================
 * Full pipeline
 * ============================================================ */
export async function fullGenerateTrueStory(payload) {
  const ideasResult = await findTrueStoryIdeas(payload);
  if (!ideasResult.ideas.length) {
    throw new Error('Không tìm thấy câu chuyện thật phù hợp với chủ đề');
  }
  // Chọn idea tốt nhất: strong > medium > weak; cùng status thì confidence cao hơn
  const order = { strong: 0, medium: 1, weak: 2 };
  const selected_idea = [...ideasResult.ideas].sort((a, b) => {
    if (order[a.verification_status] !== order[b.verification_status]) {
      return order[a.verification_status] - order[b.verification_status];
    }
    return b.confidence_score - a.confidence_score;
  })[0];

  const brief = await generateTrueStoryBrief({ selected_idea, sources: selected_idea.sources });
  const caption = await generateFacebookCaptionFromTrueStory({
    brief,
    selected_angle: {
      title: selected_idea.title,
      hook: selected_idea.suggested_hook,
      emotional_trigger: selected_idea.emotional_angle,
    },
    target_audience: payload?.target_audience,
  });
  const image_plan = await generateTrueStoryImagePlan({
    brief,
    caption_meta: { thumbnail_text: caption.thumbnail_text, title: caption.title },
  });

  const warnings = [...(ideasResult.warnings || [])];
  if (selected_idea.verification_status === 'weak') {
    warnings.push('Câu chuyện chỉ có 1 nguồn — cần kiểm tra thêm trước khi đăng');
  }

  return {
    ideas: ideasResult.ideas,
    selected_idea,
    brief,
    caption,
    image_plan,
    sources: selected_idea.sources,
    verification_status: selected_idea.verification_status,
    warnings,
  };
}

/* ============================================================
 * AUTO MODE — không cần input, hệ thống tự bốc chủ đề và chạy hết
 * ============================================================ */
export async function autoGenerateTrueStory(opts = {}) {
  const { content_type, country, language = 'auto', target_audience, max_attempts = 3 } = opts;

  let lastError;
  for (let attempt = 1; attempt <= max_attempts; attempt++) {
    const picked = pickAutoTopic(content_type);
    console.log(`[TrueStory.auto] attempt ${attempt}/${max_attempts} — topic: "${picked.topic}"`);
    try {
      const result = await fullGenerateTrueStory({
        topic: picked.topic,
        content_type: content_type || picked.content_type,
        country: country || 'worldwide',
        language,
        count: 5,
        target_audience,
      });
      return {
        ...result,
        auto_picked_topic: picked.topic,
        auto_attempt: attempt,
      };
    } catch (err) {
      console.warn(`[TrueStory.auto] attempt ${attempt} failed: ${err.message}`);
      lastError = err;
    }
  }
  throw lastError || new Error('Auto generate thất bại sau nhiều lần thử');
}

export default {
  findTrueStoryIdeas,
  generateTrueStoryBrief,
  generateFacebookCaptionFromTrueStory,
  generateTrueStoryImagePlan,
  fullGenerateTrueStory,
  autoGenerateTrueStory,
  pickAutoTopic,
};
