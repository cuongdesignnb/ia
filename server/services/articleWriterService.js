/**
 * Article Writer Service
 * AI viết bài Facebook từ dữ kiện đã xác minh
 * Tuân thủ: không emoji, không bịa, không giật tít
 */
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSetting } from './settingsService.js';

/**
 * Generate a Facebook post from verified story facts
 * @param {Object} story - TrueStory record
 * @param {string} modelName - AI model to use
 * @returns {{ post_body, hook, image_headline, image_subheadline, hashtags }}
 */
export async function writeArticle(story, modelName = null) {
  const model = modelName || await getSetting('auto_story_ai_model') || 'gpt-5.5';

  const prompt = buildWriterPrompt(story);
  const response = await callAI(model, prompt);
  const result = parseArticleResponse(response);

  if (!result) throw new Error('AI không trả về bài viết hợp lệ');

  return {
    ...result,
    ai_model_used: model,
  };
}

function buildWriterPrompt(story) {
  const factsText = (story.verified_facts || []).map((f, i) => `${i + 1}. ${f}`).join('\n');
  const sourcesText = (story.source_urls || []).join('\n');

  return `Bạn là biên tập viên Facebook viral chuyên kể câu chuyện có thật. Viết theo style Vietcetera + Atlas Obscura: cảm xúc, có nhịp, giật tít TRUNG THỰC để dừng scroll.

═══════════════════════════════════════
CÂU CHUYỆN
═══════════════════════════════════════
TÊN: ${story.title_vi || story.title}
TÓM TẮT: ${story.summary || ''}
THỜI GIAN: ${story.event_date || 'Không rõ'}
ĐỊA ĐIỂM: ${story.location || 'Không rõ'}

DỮ KIỆN XÁC MINH:
${factsText}

NGUỒN:
${sourcesText}

═══════════════════════════════════════
NGUYÊN TẮC TRUNG THỰC (KHÔNG VƯỢT QUA)
═══════════════════════════════════════
- CHỈ dùng dữ kiện ở trên. KHÔNG bịa con số, ngày tháng, lời thoại, cảm xúc cụ thể.
- "Giật tít trung thực" = chọn góc nhìn, không xuyên tạc. KHÔNG được phóng đại sai.
- KHÔNG emoji.
- KHÔNG ngôn ngữ phản cảm/bạo lực/chính trị nhạy cảm.
- Số liệu PHẢI đúng dữ kiện.

═══════════════════════════════════════
KỸ THUẬT VIẾT (BẮT BUỘC ÁP DỤNG)
═══════════════════════════════════════

1. HOOK MỞ BÀI (1-2 câu đầu) — phải DỪNG SCROLL:
   Chọn 1 trong 4 pattern:
   • Câu shock cụ thể: "Ngày 13 tháng 10 năm 2010, người thợ mỏ thứ 33 bước ra khỏi viên nang. Nhưng không ai khóc."
   • In medias res: "Khi cánh cửa khoang lái mở ra, anh chỉ còn lại một câu hỏi: cô ấy còn sống không?"
   • Câu hỏi shocking: "Làm sao một cô bé 14 tuổi sống sót qua 11 ngày trong rừng Amazon — một mình?"
   • Reverse expectation: "Họ tưởng đó là kết thúc. Hoá ra mới chỉ là khởi đầu."

   ❌ TRÁNH: "Câu chuyện cảm động về...", "Bạn có biết...", "Hôm nay tôi muốn kể..."

2. NHỊP KỂ:
   - Đoạn 2-3 câu, không dài
   - Câu ngắn xen câu dài để tạo nhịp
   - Mỗi đoạn ngắt 1 dòng trống

3. CẤU TRÚC 5 BEAT:
   B1. Hook (1-2 câu)
   B2. Setup nhân vật + bối cảnh (2-3 câu, đặt người đọc vào hoàn cảnh)
   B3. Tăng kịch (3-5 câu, dẫn đến đỉnh điểm)
   B4. Twist / khoảnh khắc quyết định (2-3 câu)
   B5. Kết — bài học hoặc câu cảm thán (1-2 câu)

4. ĐỘ DÀI: 200-350 chữ — đủ để hấp dẫn, đủ ngắn để đọc hết.

5. CTA CUỐI: 1 câu hỏi thật, gợi share/comment
   ✓ "Nếu là bạn, bạn sẽ làm gì trong 47 phút đó?"
   ✓ "Bạn đã từng nghe câu chuyện này chưa?"
   ✗ "Hãy like và share nếu thấy hay" (cliché)

═══════════════════════════════════════
IMAGE HEADLINE & SUBHEADLINE (in lên ảnh)
═══════════════════════════════════════

image_headline (5-8 chữ, IN HOA):
- Ngắn, đậm, có CON SỐ hoặc KEYWORD đắt
- Áp dụng: "[CON SỐ] [DANH TỪ] [ACTION/RESULT]"
✓ "69 NGÀY DƯỚI LÒNG ĐẤT"
✓ "11 NGÀY MỘT MÌNH GIỮA AMAZON"
✓ "8 PHÚT 46 GIÂY"
✗ "MỘT CÂU CHUYỆN CẢM ĐỘNG"
✗ "BÍ MẬT VŨ TRỤ"

image_subheadline (8-14 chữ, IN HOA):
- Bổ nghĩa cho headline, tăng tính cụ thể
- Có thể là kết quả / nhân vật / địa điểm
✓ "33 THỢ MỎ CHILE ĐƯỢC GIẢI CỨU SỐNG"
✓ "CÔ BÉ 17 TUỔI SỐNG SÓT SAU TAI NẠN MÁY BAY"

═══════════════════════════════════════
TRẢ VỀ JSON (chỉ JSON, không markdown):
═══════════════════════════════════════
{
  "post_body": "Toàn bộ bài Facebook 200-350 chữ, theo cấu trúc 5 beat, có dòng trống giữa đoạn",
  "hook": "1-2 câu hook đầu — copy y hệt từ post_body",
  "image_headline": "5-8 CHỮ IN HOA, có con số/keyword đắt",
  "image_subheadline": "8-14 CHỮ IN HOA, bổ nghĩa cho headline",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
}`;
}

function parseArticleResponse(text) {
  if (!text) return null;
  try {
    // Strip markdown fences nếu AI trả ```json ... ```
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // Match JSON object — try greedy first, fallback non-greedy
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[ArticleWriter] No JSON found in response. First 200 chars:', text.slice(0, 200));
      return null;
    }

    const data = JSON.parse(jsonMatch[0]);

    if (!data.post_body || !data.image_headline) {
      console.error('[ArticleWriter] Missing required fields. Got keys:', Object.keys(data));
      return null;
    }

    // Clean: remove emojis AI có thể sneak in
    data.post_body = removeEmojis(data.post_body);
    data.hook = removeEmojis(data.hook || '');

    return data;
  } catch (err) {
    console.error('[ArticleWriter] JSON parse failed:', err.message);
    console.error('[ArticleWriter] First 300 chars of response:', text.slice(0, 300));
    return null;
  }
}

/**
 * Remove emojis from text (keep Vietnamese characters)
 */
function removeEmojis(text) {
  return text
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')  // Emoticons
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')  // Misc Symbols
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')  // Transport
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')  // Flags
    .replace(/[\u{2600}-\u{26FF}]/gu, '')    // Misc symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '')    // Dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')    // Variation Selectors
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')  // Supplemental
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')  // Chess symbols
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')  // Symbols Extended
    .replace(/[\u{200D}]/gu, '')              // Zero-width joiner
    .replace(/\s{2,}/g, ' ')                   // Clean extra spaces
    .trim();
}

// OpenAI text fallback chain — flagship → mini → legacy
const OPENAI_TEXT_FALLBACKS = ['gpt-5.5', 'gpt-5.4-mini', 'gpt-4o-mini'];

async function callAI(modelName, prompt) {
  const openaiKey = await getSetting('openai_api_key', 'OPENAI_API_KEY');
  const geminiKey = await getSetting('google_ai_api_key', 'GOOGLE_AI_API_KEY');

  // Build chain of models to try (preferred first, then fallbacks)
  const tryOpenAI = openaiKey && (modelName.startsWith('gpt') || !modelName.startsWith('gemini'));
  if (tryOpenAI) {
    const client = new OpenAI({ apiKey: openaiKey, timeout: 120000 });
    const chain = [modelName, ...OPENAI_TEXT_FALLBACKS.filter(m => m !== modelName)];

    let lastErr = null;
    for (const m of chain) {
      try {
        console.log(`[ArticleWriter] Trying OpenAI model: ${m}`);
        const params = {
          model: m,
          messages: [{ role: 'user', content: prompt }],
        };
        if (m.startsWith('gpt-5')) {
          params.max_completion_tokens = 4000;
        } else {
          params.max_tokens = 4000;
        }
        const completion = await client.chat.completions.create(params);
        const content = completion.choices[0]?.message?.content || '';
        if (content) {
          console.log(`[ArticleWriter] ✅ OpenAI ${m} OK (${content.length} chars)`);
          return content;
        }
      } catch (err) {
        lastErr = err;
        console.warn(`[ArticleWriter] ${m} failed: ${err.message}`);
        // Tiếp tục với model kế tiếp
      }
    }
    // All OpenAI models failed → thử Gemini nếu có
    if (!geminiKey) throw lastErr || new Error('Tất cả OpenAI models đều fail');
  }

  if (geminiKey) {
    try {
      console.log('[ArticleWriter] Trying Gemini fallback');
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      console.log(`[ArticleWriter] ✅ Gemini OK (${text.length} chars)`);
      return text;
    } catch (err) {
      throw new Error(`Gemini fallback failed: ${err.message}`);
    }
  }

  throw new Error('Không có AI key nào được cấu hình');
}

export default { writeArticle };
