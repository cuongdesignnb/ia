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
  const modelName = await getSetting('auto_story_ai_model') || 'gpt-5.5';

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

  return `Bạn là biên tập viên fanpage Facebook VIRAL chuyên kể câu chuyện có thật. Mỗi title đề xuất phải vượt qua bài test:

🔥 LITMUS TEST: Một người Việt đang lướt Facebook lúc 11h đêm thấy title này → DỪNG ngón tay → Bấm ngay. Nếu KHÔNG → loại.

NHIỆM VỤ: Đề xuất ${count} chủ đề CÓ THẬT, đọc title là không thể không click. Đây là loại "addictive content" — vẫn 100% trung thực, chỉ là chọn góc nhìn shocking nhất.

══════════════════════════════════════════
LOẠI CHỦ ĐỀ HOT NHẤT (ưu tiên):
══════════════════════════════════════════
🔥 SỐNG SÓT KHÔNG TƯỞNG: rơi máy bay, chìm tàu, kẹt hang động, mất tích nhiều ngày, đối đầu thiên nhiên
🧬 KHOA HỌC LÀM RỢN GÁY: kết quả thí nghiệm bất ngờ, bí ẩn vũ trụ vừa giải mã, hiện tượng tự nhiên không giải thích được
👤 NHÂN VẬT KHÔNG THỂ TƯỞNG: 1 con người làm điều phi thường, "ông/bà ấy là ai mà có thể...", trẻ em / cụ già làm điều gây sốc
🕵️ BÍ ẨN ĐƯỢC GIẢI MÃ: vụ án cũ, mất tích, cold case có manh mối mới
⚡ KHOẢNH KHẮC THAY ĐỔI THẾ GIỚI: 1 quyết định / 1 phút / 1 dòng tin → đảo lộn lịch sử
🦁 ĐỘNG VẬT ANH HÙNG: cứu người, hành vi thông minh phi thường, gắn bó kỳ lạ
🌑 LỊCH SỬ ĐEN: chương ít người dạy ở trường, sự kiện bị che giấu, hậu quả lâu dài
🛸 SỰ TRÙNG HỢP KỲ LẠ: 2 người / 2 sự kiện trùng theo cách thống kê không thể giải thích

══════════════════════════════════════════
6 KỸ THUẬT VIẾT TITLE_VI (chọn 1 cho mỗi title):
══════════════════════════════════════════

1. **CONFLICT / NGHỊCH LÝ**: kết quả ngược 180° dự đoán
   ✓ "Cô bé 17 tuổi rơi 3km từ máy bay xuống Amazon — và đi bộ 11 ngày một mình ra khỏi rừng"
   ✓ "Anh ấy đã chết 47 phút. Khi tỉnh lại, anh nhớ mọi thứ — kể cả bác sĩ đang nói chuyện gì."

2. **CON SỐ CỤ THỂ + KẾT CỤC GÂY SỐC**:
   ✓ "33 người. 69 ngày dưới lòng đất. Không ai chết."
   ✓ "1 dòng tweet. 4 phút. 38 tỉ USD bốc hơi."
   ✓ "8 phút 46 giây — và cả nước Mỹ thức tỉnh"

3. **CURIOSITY GAP — NÓI 80%, GIẤU 20%**:
   ✓ "NASA mất liên lạc với Voyager 1 trong 5 tháng. Khi tín hiệu trở lại, nó nói một điều khiến cả phòng kỹ sư im lặng."
   ✓ "Người duy nhất từng nghe được tín hiệu lạ từ vũ trụ — và biến mất 24 giờ sau đó"

4. **NHÂN VẬT + TÌNH HUỐNG**: profile ngắn + bối cảnh shocking
   ✓ "Một bà nội trợ 52 tuổi, 1 cuốn nhật ký, và bí mật đã được giấu suốt Chiến tranh Lạnh"
   ✓ "Cậu bé 12 tuổi gửi lá thư đến NASA — câu trả lời đã thay đổi cả chương trình Apollo"

5. **TƯƠNG PHẢN TRƯỚC/SAU**:
   ✓ "Trước: thợ hớt tóc vô danh ở Sài Gòn. Sau 1975: người duy nhất biết nơi giấu kho báu trị giá 80 triệu USD."
   ✓ "Hôm thứ Hai: bữa tối bình thường. Thứ Ba: 5 nhà khoa học mất tích vĩnh viễn."

6. **CÂU HỎI ĐÁNH VÀO TÒ MÒ**:
   ✓ "Làm sao một bức điện 4 ký tự cứu được 230 hành khách rơi xuống Đại Tây Dương?"
   ✓ "Tại sao 12 đứa trẻ kẹt trong hang Thái Lan lại sống sót — trong khi 1 thợ lặn dày dạn nhất chết?"

══════════════════════════════════════════
TUYỆT ĐỐI CẤM (signal AI/cliché):
══════════════════════════════════════════
✗ "Bí mật ... mà bạn chưa biết"
✗ "Sự thật về ..."
✗ "Câu chuyện cảm động về ..."
✗ "Không thể tin được ..."
✗ "X điều thú vị về ..."
✗ Title generic kiểu "Sao Mộc và những điều thú vị"
✗ Title-không-có-nhân-vật-cụ-thể-không-có-con-số

══════════════════════════════════════════
TUYỆT ĐỐI TRÁNH CHỦ ĐỀ ĐẠI TRÀ:
══════════════════════════════════════════
Hachiko, Titanic, Apollo 11, 9/11, Chernobyl, Holocaust, JFK, Hiroshima, Pompeii, COVID, Marie Curie, Einstein, da Vinci.
→ Tìm chủ đề "long-tail": câu chuyện ÍT NGƯỜI VIỆT BIẾT nhưng đáng kinh ngạc.

══════════════════════════════════════════
YÊU CẦU CHẤT LƯỢNG:
══════════════════════════════════════════
1. CÓ THẬT 100% — verifiable trên Wikipedia/BBC/Reuters/NASA/Nat Geo/AP/Smithsonian
2. Đa dạng category: ${categories.join(', ')}
3. Mỗi đề xuất KHÁC HẲN nhau — không cùng motif (vd: tránh 5 cái cùng kiểu "máy bay rơi sống sót")
4. title_vi 14-30 chữ tiếng Việt — đủ dài để có hook, đủ ngắn để đọc 1 nhịp
5. summary 2 câu: câu 1 setup tình huống → câu 2 dangle 1 chi tiết shocking nhưng KHÔNG spoil kết cục${avoidBlock}

══════════════════════════════════════════
TRẢ VỀ JSON ARRAY (chỉ JSON, không markdown fence):
══════════════════════════════════════════
[
  {
    "title": "Concise English event name (5-10 words)",
    "title_vi": "Title VIRAL theo 1 trong 6 kỹ thuật, 14-30 chữ, pass litmus test",
    "summary": "Câu 1 setup. Câu 2 dangle chi tiết shocking, không spoil.",
    "category": "${categories.join('|')}",
    "hint_keywords": "specific English keywords for image search (event name + year + location + key person)"
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
