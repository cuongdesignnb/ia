/**
 * Topic Suggestion Service
 * Sinh batch các chủ đề gợi ý (kho tích luỹ) — user pick rồi mới chạy pipeline.
 * Tách biệt với storyDiscoveryService: ở đây CHỈ sinh title/summary, chưa verify nguồn.
 */
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Op } from 'sequelize';
import { TopicSuggestion, TrueStory } from '../models/index.js';
import { getSetting } from './settingsService.js';

const DEFAULT_BATCH_SIZE = 8;
const DEFAULT_CATEGORIES = ['survival', 'science', 'history', 'nature', 'humanity', 'space', 'disaster', 'animal'];

/**
 * Generate a new batch of topic suggestions
 * @param {object} opts
 * @param {'cron'|'manual'} opts.source
 * @param {number} [opts.count]
 * @returns {Promise<{batch_id: string, suggestions: TopicSuggestion[]}>}
 */
export async function generateBatch({ source = 'manual', count } = {}) {
  const batchSize = count || parseInt(await getSetting('topic_suggestion_batch_size') || String(DEFAULT_BATCH_SIZE));
  const categories = JSON.parse(await getSetting('auto_story_categories') || JSON.stringify(DEFAULT_CATEGORIES));
  const modelName = await getSetting('auto_story_ai_model') || 'gpt-4o-mini';

  // Avoid duplicates against both used stories and pending suggestions
  const [storyTitles, suggestionTitles] = await Promise.all([
    TrueStory.findAll({ attributes: ['title', 'title_vi'] }),
    TopicSuggestion.findAll({
      where: { status: { [Op.in]: ['pending', 'picked'] } },
      attributes: ['title', 'title_vi'],
    }),
  ]);
  const avoidList = [
    ...storyTitles.flatMap(s => [s.title, s.title_vi].filter(Boolean)),
    ...suggestionTitles.flatMap(s => [s.title, s.title_vi].filter(Boolean)),
  ];

  const prompt = buildBatchPrompt(batchSize, categories, avoidList);
  const raw = await callAI(modelName, prompt);
  const items = parseBatchResponse(raw);
  if (!items.length) throw new Error('AI không trả về danh sách hợp lệ');

  const batchId = randomUUID();
  const created = await TopicSuggestion.bulkCreate(
    items.slice(0, batchSize).map(it => ({
      title: it.title,
      title_vi: it.title_vi || null,
      summary: it.summary || null,
      category: it.category || categories[0],
      hint_keywords: it.hint_keywords || null,
      status: 'pending',
      source,
      batch_id: batchId,
    }))
  );

  return { batch_id: batchId, suggestions: created };
}

function buildBatchPrompt(count, categories, avoidList) {
  const avoidBlock = avoidList.length > 0
    ? `\n\nTUYỆT ĐỐI KHÔNG TRÙNG VỚI CÁC CHỦ ĐỀ ĐÃ CÓ:\n${avoidList.slice(0, 80).map(t => `- ${t}`).join('\n')}`
    : '';

  return `Bạn là biên tập viên gợi ý chủ đề cho fanpage chuyên kể câu chuyện có thật.

NHIỆM VỤ: Đề xuất ${count} chủ đề câu chuyện CÓ THẬT, ít người biết, hấp dẫn để làm bài viết Facebook.

YÊU CẦU:
1. Mỗi chủ đề là 1 sự kiện/câu chuyện CÓ THẬT, có thể xác minh được (Wikipedia, BBC, Reuters, NASA, National Geographic...)
2. Đa dạng thể loại trong: ${categories.join(', ')}
3. Ưu tiên chủ đề có yếu tố cảm xúc, kỳ diệu, bất ngờ, hoặc khoa học thú vị
4. Tránh chủ đề quá nổi tiếng, đại trà
5. Mỗi chủ đề khác nhau hoàn toàn, không lặp ý${avoidBlock}

CHỈ TRẢ VỀ JSON ARRAY (không text khác, không markdown fence):
[
  {
    "title": "Tên (tiếng Anh, ngắn gọn)",
    "title_vi": "Tên (tiếng Việt, hấp dẫn, dạng câu hỏi/giật tít cũng được)",
    "summary": "1-2 câu tóm tắt vì sao chủ đề này thú vị",
    "category": "một trong: ${categories.join('|')}",
    "hint_keywords": "keywords tiếng Anh để tìm ảnh"
  }
]`;
}

function parseBatchResponse(text) {
  if (!text) return [];
  // Strip markdown fences if any
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // Find first array
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr.filter(it => it && typeof it.title === 'string' && it.title.trim());
  } catch {
    return [];
  }
}

async function callAI(modelName, prompt) {
  const openaiKey = await getSetting('openai_api_key', 'OPENAI_API_KEY');
  if (openaiKey && (modelName.startsWith('gpt') || !modelName.startsWith('gemini'))) {
    const client = new OpenAI({ apiKey: openaiKey, timeout: 120000 });
    const params = {
      model: modelName.startsWith('gpt') ? modelName : 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    };
    if (modelName.startsWith('gpt-5')) {
      params.max_completion_tokens = 4000;
    } else {
      params.max_tokens = 4000;
    }
    const completion = await client.chat.completions.create(params);
    return completion.choices[0]?.message?.content || '';
  }

  const geminiKey = await getSetting('google_ai_api_key', 'GOOGLE_AI_API_KEY');
  if (geminiKey) {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  throw new Error('Không có AI key nào được cấu hình (OpenAI / Gemini)');
}

export default { generateBatch };
