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

const DEFAULT_BATCH_SIZE = 5;
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

  return `Bạn là biên tập viên fanpage Facebook viral chuyên kể câu chuyện có thật. Style: Atlas Obscura, BBC Future, Vietcetera.

NHIỆM VỤ: Đề xuất ${count} chủ đề CÓ THẬT, ít người biết, **giật tít theo curiosity-gap không bịa** — đọc title là phải DỪNG SCROLL và muốn click ngay.

══════════════════════════════════════════
NGUYÊN TẮC VIẾT TITLE_VI (giật tít trung thực):
══════════════════════════════════════════

1. **CONFLICT / UNEXPECTED**: bắt đầu bằng nghịch lý, kết quả ngược dự đoán
   ✓ "Cô bé 17 tuổi rơi 3km từ máy bay xuống rừng Amazon — và sống sót đi bộ 11 ngày"
   ✗ "Sự sống sót kỳ diệu của Juliane Koepcke" (quá generic)

2. **CON SỐ CỤ THỂ + KẾT CỤC**: số làm câu chuyện đáng tin, kết cục tạo hook
   ✓ "33 người. 69 ngày dưới lòng đất. Không ai chết."
   ✓ "8 phút 46 giây — và mọi thứ thay đổi"
   ✗ "Một sự kiện đáng nhớ"

3. **CURIOSITY GAP**: nói đủ để gợi tò mò, giấu phần kết
   ✓ "NASA mất liên lạc với Voyager 1 trong 5 tháng — và lý do khiến cả phòng kỹ sư im lặng"
   ✗ "Phi thuyền Voyager 1 và sự cố năm 2023"

4. **NHÂN VẬT TRƯỚC SỰ KIỆN**: tên/đặc điểm + tình huống bất thường
   ✓ "Một người gác hải đăng, một cơn bão, và lá thư anh viết khi nghĩ mình sẽ chết"
   ✗ "Câu chuyện về người gác hải đăng"

5. **SO SÁNH / TƯƠNG PHẢN**:
   ✓ "Trước: cậu bé bán báo. Sau 12 năm: người đầu tiên trên Mặt Trăng."

6. **CÂU HỎI MỞ KÍCH NÃO**:
   ✓ "Làm sao một bức điện 4 ký tự cứu được 230 hành khách máy bay rơi xuống Đại Tây Dương?"

══════════════════════════════════════════
TUYỆT ĐỐI TRÁNH:
══════════════════════════════════════════
- "Bí mật ... mà bạn chưa biết" — cliché, AI-feel
- "Sự thật về ..." — flat
- "Câu chuyện cảm động về ..." — telegraph cảm xúc
- "Không thể tin được ..." — empty filler
- Title chung chung kiểu "Sao Mộc và những điều thú vị"

══════════════════════════════════════════
YÊU CẦU NỘI DUNG:
══════════════════════════════════════════
1. CÓ THẬT, xác minh được (Wikipedia/BBC/Reuters/NASA/Nat Geo/AP)
2. Đa dạng category: ${categories.join(', ')}
3. ÍT NGƯỜI BIẾT — tránh: Hachiko, Titanic, 9/11, Apollo 11, Chernobyl... đã quá đại trà
4. Có yếu tố: kịch tính / khoa học khó tin / con người phi thường / nghịch lý
5. Mỗi đề xuất một câu chuyện hoàn toàn khác nhau${avoidBlock}

══════════════════════════════════════════
TRẢ VỀ JSON ARRAY (chỉ JSON, không markdown):
══════════════════════════════════════════
[
  {
    "title": "Concise English event name",
    "title_vi": "Title GIẬT TÍT trung thực, 12-25 chữ, áp dụng 1 trong 6 nguyên tắc trên",
    "summary": "2 câu — câu 1 setup nghịch lý, câu 2 hint kết cục mà không spoil hết",
    "category": "${categories.join('|')}",
    "hint_keywords": "specific English keywords for image search (event name + year + location/people)"
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
