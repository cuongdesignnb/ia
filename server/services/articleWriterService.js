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

  return `Bạn là biên tập viên nội dung Facebook chuyên nghiệp.

Hãy viết bài Facebook bằng tiếng Việt dựa trên câu chuyện có thật sau.

CÂU CHUYỆN: ${story.title_vi || story.title}
TÓM TẮT: ${story.summary || ''}
THỜI GIAN: ${story.event_date || 'Không rõ'}
ĐỊA ĐIỂM: ${story.location || 'Không rõ'}

DỮ KIỆN ĐÃ XÁC MINH:
${factsText}

NGUỒN THAM KHẢO:
${sourcesText}

YÊU CẦU BẮT BUỘC:
1. CHỈ dùng các sự kiện đã xác minh ở trên. KHÔNG được bịa thêm bất kỳ chi tiết nào.
2. KHÔNG bịa lời thoại, KHÔNG bịa cảm xúc cụ thể nếu nguồn không nói.
3. KHÔNG dùng emoji trong toàn bộ bài viết.
4. KHÔNG giật tít sai sự thật.
5. KHÔNG dùng từ ngữ phản cảm, bạo lực, hoặc vi phạm chính sách Facebook.
6. KHÔNG sử dụng ngôn ngữ quá cường điệu hoặc lố bịch.
7. Văn phong: cảm xúc, dễ đọc, có nhịp kể chuyện.
8. Mở bài PHẢI có hook mạnh (1-2 câu ngắn, gây tò mò).
9. Chia đoạn ngắn (mỗi đoạn 2-3 câu).
10. Có CTA nhẹ nhàng cuối bài (VD: "Bạn còn nhớ câu chuyện này không?").
11. Nếu có con số, PHẢI đúng với dữ kiện đã cung cấp.
12. Tổng bài viết khoảng 150-300 từ.

TRẢ VỀ JSON (chỉ JSON, không text khác):
{
  "post_body": "Toàn bộ nội dung bài Facebook (bao gồm hook ở đầu)",
  "hook": "Câu hook mở đầu (1-2 câu ngắn nhất)",
  "image_headline": "TIÊU ĐỀ CHÍNH cho ảnh (5-8 từ, IN HOA, mạnh mẽ)",
  "image_subheadline": "Dòng phụ cho ảnh (8-12 từ, IN HOA)",
  "hashtags": ["#Hashtag1", "#Hashtag2", "#Hashtag3"]
}`;
}

function parseArticleResponse(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const data = JSON.parse(jsonMatch[0]);

    if (!data.post_body || !data.image_headline) return null;

    // Clean: remove any emojis that AI might sneak in
    data.post_body = removeEmojis(data.post_body);
    data.hook = removeEmojis(data.hook || '');

    return data;
  } catch {
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

async function callAI(modelName, prompt) {
  const openaiKey = await getSetting('openai_api_key', 'OPENAI_API_KEY');
  if (openaiKey && (modelName.startsWith('gpt') || !modelName.startsWith('gemini'))) {
    const client = new OpenAI({ apiKey: openaiKey, timeout: 120000 });
    const params = {
      model: modelName.startsWith('gpt') ? modelName : 'gpt-5.5',
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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-04-17' });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  throw new Error('Không có AI key nào được cấu hình');
}

export default { writeArticle };
