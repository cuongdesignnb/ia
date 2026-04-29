/**
 * Story Discovery Service
 * AI tự tìm câu chuyện có thật, xác minh sự kiện, lưu vào DB
 */
import { TrueStory } from '../models/index.js';
import { getSetting } from './settingsService.js';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Discover a true story using AI
 * @param {string|null} topic - Chủ đề gợi ý (null = AI tự chọn)
 * @param {string|null} category - Category filter
 * @returns {TrueStory} story record
 */
export async function discoverStory(topic = null, category = null) {
  const modelName = await getSetting('auto_story_ai_model') || 'gpt-5.5';
  const categories = category
    ? [category]
    : JSON.parse(await getSetting('auto_story_categories') || '["survival","science","history","nature","humanity"]');

  // Get existing story slugs to avoid duplicates
  const existingSlugs = (await TrueStory.findAll({ attributes: ['slug'] })).map(s => s.slug);
  const existingTitles = (await TrueStory.findAll({ attributes: ['title'] })).map(s => s.title);

  const prompt = buildDiscoveryPrompt(topic, categories, existingTitles);
  const response = await callAI(modelName, prompt);

  // Parse AI response
  const storyData = parseStoryResponse(response);
  if (!storyData) throw new Error('AI không trả về dữ liệu hợp lệ');

  // Check duplicate
  const slug = generateSlug(storyData.title);
  const existing = await TrueStory.findOne({ where: { slug } });
  if (existing) throw new Error(`Câu chuyện "${storyData.title}" đã tồn tại`);

  // Create story record
  const story = await TrueStory.create({
    title: storyData.title,
    title_vi: storyData.title_vi,
    slug,
    summary: storyData.summary,
    event_date: storyData.event_date || null,
    location: storyData.location || null,
    verified_facts: storyData.verified_facts || [],
    source_urls: storyData.source_urls || [],
    category: storyData.category || categories[0],
    status: 'verified',
  });

  return story;
}

function buildDiscoveryPrompt(topic, categories, existingTitles) {
  const avoidList = existingTitles.length > 0
    ? `\n\nCÁC CÂU CHUYỆN ĐÃ CÓ (TRÁNH TRÙNG):\n${existingTitles.map(t => `- ${t}`).join('\n')}`
    : '';

  const topicInstruction = topic
    ? `Tìm câu chuyện có thật về chủ đề: "${topic}"`
    : `Tìm 1 câu chuyện có thật ít người biết, thuộc 1 trong các thể loại: ${categories.join(', ')}`;

  return `Bạn là nhà nghiên cứu chuyên tìm câu chuyện có thật.

${topicInstruction}

YÊU CẦU BẮT BUỘC:
1. Câu chuyện PHẢI CÓ THẬT, có thể xác minh được
2. Phải có ít nhất 2 nguồn tin cậy (Wikipedia, BBC, Reuters, CNN, NASA, National Geographic...)
3. Không được bịa bất kỳ chi tiết nào
4. Ưu tiên câu chuyện có yếu tố cảm xúc, kỳ diệu, hoặc bất ngờ
5. Phải có đầy đủ: thời gian, địa điểm, nhân vật, diễn biến, kết quả
${avoidList}

TRẢ VỀ JSON (chỉ JSON, không text khác):
{
  "title": "Tên câu chuyện (tiếng Anh)",
  "title_vi": "Tên câu chuyện (tiếng Việt)",
  "summary": "Tóm tắt ngắn gọn bằng tiếng Việt (2-3 câu)",
  "event_date": "YYYY-MM-DD hoặc null",
  "location": "Địa điểm xảy ra",
  "category": "survival|science|history|nature|humanity|space|disaster|animal",
  "verified_facts": [
    "Dữ kiện 1 đã xác minh",
    "Dữ kiện 2 đã xác minh",
    "Dữ kiện 3...",
    "..."
  ],
  "source_urls": [
    "https://en.wikipedia.org/wiki/...",
    "https://www.bbc.com/..."
  ],
  "search_keywords_en": "keywords for image search in English"
}`;
}

function parseStoryResponse(text) {
  try {
    // Try to extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const data = JSON.parse(jsonMatch[0]);

    if (!data.title || !data.verified_facts || data.verified_facts.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 200);
}

async function callAI(modelName, prompt) {
  // Try OpenAI first
  const openaiKey = await getSetting('openai_api_key', 'OPENAI_API_KEY');
  if (openaiKey && (modelName.startsWith('gpt') || !modelName.startsWith('gemini'))) {
    const client = new OpenAI({ apiKey: openaiKey, timeout: 120000 });
    const params = {
      model: modelName.startsWith('gpt') ? modelName : 'gpt-5.5',
      messages: [{ role: 'user', content: prompt }],
    };
    // GPT-5.x uses max_completion_tokens
    if (modelName.startsWith('gpt-5')) {
      params.max_completion_tokens = 4000;
    } else {
      params.max_tokens = 4000;
    }
    const completion = await client.chat.completions.create(params);
    return completion.choices[0]?.message?.content || '';
  }

  // Fallback to Gemini
  const geminiKey = await getSetting('google_ai_api_key', 'GOOGLE_AI_API_KEY');
  if (geminiKey) {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-04-17' });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  throw new Error('Không có AI key nào được cấu hình');
}

export default { discoverStory };
