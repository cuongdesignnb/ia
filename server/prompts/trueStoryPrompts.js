/**
 * Prompts for True Story pipeline (research-based).
 * Khác với storyViralPrompts.js (luồng người dùng tự nhập câu chuyện),
 * file này dành cho luồng AI tự tìm câu chuyện thật từ internet.
 */

const SYSTEM = `Bạn là biên tập viên chuyên viết câu chuyện CÓ THẬT cho Facebook.
BẠN CHỈ ĐƯỢC DÙNG THÔNG TIN TỪ NGUỒN ĐÃ CUNG CẤP.
KHÔNG được bịa thêm nhân vật, địa điểm, thời gian, số liệu, nguyên nhân.
Nếu chi tiết chưa chắc chắn → phải nói rõ là "chưa rõ" hoặc "theo nguồn ghi nhận".
Bạn có thể viết hấp dẫn hơn về cách kể, nhưng KHÔNG được thay đổi sự thật.
Mục tiêu: bài viết cuốn hút, có trách nhiệm, không gây hiểu lầm.
Khi được yêu cầu trả JSON → trả JSON hợp lệ, KHÔNG bọc markdown fence.`;

const safe = (v, fb = '') => (v == null || v === '' ? fb : String(v));
const truncate = (s, n) => (String(s || '').length > n ? String(s).slice(0, n) + '…' : String(s || ''));

export const systemPrompt = () => SYSTEM;

/* ============================================================
 * IDEA SCORING — chọn ra các câu chuyện viral tiềm năng
 * ============================================================ */
export function ideaScoringPrompt({ topic, content_type, country, verified_candidates, count = 5 }) {
  const list = verified_candidates
    .slice(0, 25)
    .map((c, i) => {
      const sources = c.sources.map((s) => `${s.source_name} — ${s.url}`).join('\n      ');
      return `[${i + 1}] (${c.verification_status}, ${c.source_count} nguồn)
   Tiêu đề: ${c.main_title}
   Tóm tắt từ search: ${truncate(c.summary, 300)}
   Nguồn:
      ${sources}
   Cảnh báo: ${(c.warning_notes || []).join('; ') || 'không có'}`;
    })
    .join('\n\n');

  return `Dựa trên các ứng viên câu chuyện (đã được verify cơ học bằng số nguồn), hãy CHỌN ${count} câu chuyện có tiềm năng viral nhất.

CHỦ ĐỀ NGƯỜI DÙNG MUỐN: ${safe(topic)}
LOẠI: ${safe(content_type, 'không chỉ định')}
KHU VỰC: ${safe(country, 'toàn cầu')}

ỨNG VIÊN:
${list}

TIÊU CHÍ CHỌN:
- Có yếu tố bí ẩn / bất ngờ / cảm xúc.
- Có nguồn rõ ràng (ưu tiên ≥2 nguồn độc lập).
- Không quá nhạy cảm pháp lý (vu khống, kết tội).
- Có thể kể lại bằng tiếng Việt dễ hiểu.
- Có chi tiết đời thực để bài không bị giả.

QUY TẮC:
- CHỈ được chọn từ danh sách trên — KHÔNG được tạo thêm.
- Sử dụng "story_id" tham chiếu chính xác số thứ tự [n] ở trên.
- Nếu một ứng viên thiếu nguồn → vẫn có thể chọn nhưng đánh dấu risk_level cao.

TRẢ VỀ JSON (KHÔNG markdown fence):
{
  "ideas": [
    {
      "story_id": 1,
      "title": "tiêu đề tiếng Việt 8-14 từ",
      "short_summary": "2-3 câu tóm tắt câu chuyện",
      "why_it_is_interesting": "1 câu vì sao hấp dẫn",
      "mystery_point": "điểm bí ẩn / câu hỏi mở chính",
      "emotional_angle": "cảm xúc cốt lõi",
      "suggested_hook": "câu hook tối đa 16 từ",
      "risk_level": "low | medium | high"
    }
  ]
}`;
}

/* ============================================================
 * BRIEF — phân tích kỹ một câu chuyện đã chọn
 * ============================================================ */
export function briefPrompt({ selected_idea, sources, article_texts }) {
  const sourceBlock = (article_texts || [])
    .map((a, i) => `[Nguồn ${i + 1}] ${a.source_name || ''} — ${a.url}
${truncate(a.content_text || a.excerpt || '', 4000)}`)
    .join('\n\n---\n\n');

  const sourceList = (sources || [])
    .map((s) => `- ${s.source_name || s.url} → ${s.url}`)
    .join('\n');

  return `Hãy phân tích câu chuyện sau dựa CHỈ vào nội dung các nguồn được cung cấp.

CÂU CHUYỆN ĐÃ CHỌN:
${JSON.stringify(selected_idea || {}, null, 2)}

DANH SÁCH NGUỒN:
${sourceList || '(không có)'}

NỘI DUNG NGUỒN (đã extract):
${sourceBlock || '(không có nội dung được fetch)'}

YÊU CẦU TUYỆT ĐỐI:
- Chỉ dùng dữ kiện CÓ TRONG nguồn ở trên.
- KHÔNG bịa tên người, năm, địa điểm, số liệu.
- Nếu nguồn không nói → ghi "chưa rõ".
- Nếu hai nguồn mâu thuẫn → cho vào disputed_points.

TRẢ VỀ JSON (KHÔNG markdown fence):
{
  "story_title": "tiêu đề chuẩn của câu chuyện",
  "summary": "3-5 câu kể lại trung tính",
  "timeline": [
    { "when": "thời điểm/mốc", "event": "sự kiện" }
  ],
  "people": [
    { "name": "tên (nếu có nguồn)", "role": "vai trò" }
  ],
  "places": ["địa điểm 1"],
  "verified_facts": ["facts được ≥1 nguồn xác nhận"],
  "unknown_parts": ["điều chưa rõ / nguồn không nói"],
  "disputed_points": ["điểm các nguồn nói khác nhau"],
  "emotional_core": "cảm xúc cốt lõi của câu chuyện",
  "curiosity_gap": "điểm khiến người đọc tò mò muốn biết thêm",
  "source_notes": ["lưu ý về độ tin cậy / khác biệt giữa các nguồn"]
}`;
}

/* ============================================================
 * CAPTION — viết caption Facebook từ brief
 * ============================================================ */
export function captionPrompt({ brief, selected_angle, tone, target_audience, regen_hint }) {
  return `Dựa trên story brief sau (đã được biên tập kỹ từ nguồn thật), viết caption Facebook tiếng Việt.

BRIEF:
${JSON.stringify(brief, null, 2)}

GÓC VIẾT / HOOK GỢI Ý:
${JSON.stringify(selected_angle || {}, null, 2)}

TONE: ${safe(tone, 'kể chuyện điềm tĩnh có cảm xúc')}
ĐỘC GIẢ: ${safe(target_audience, 'người dùng Facebook Việt Nam 25-45 tuổi')}
${regen_hint ? `\nGỢI Ý REGEN: ${regen_hint}` : ''}

YÊU CẦU:
- Hook đầu tối đa 16 từ.
- Tổng 180–350 chữ.
- Kể như một câu chuyện có thật — vì câu chuyện này LÀ có thật.
- KHÔNG bịa thêm chi tiết ngoài brief.
- Tối đa 3 emoji, đặt đúng chỗ.
- Có nhịp đọc tốt, có thể xuống dòng.
- Nếu brief có "unknown_parts" / "disputed_points" → dùng ngôn ngữ thận trọng: "theo một số nguồn", "được cho là", "hiện vẫn chưa rõ", "các tài liệu ghi nhận".
- Cuối bài đặt một câu hỏi kéo bình luận.
- KHÔNG đưa link nguồn trực tiếp vào caption (hệ thống sẽ lưu nguồn riêng).

TRẢ VỀ JSON (KHÔNG markdown fence):
{
  "title": "tiêu đề bài 8-14 từ để lưu hệ thống",
  "hook": "dòng hook đầu tiên",
  "caption": "nội dung caption đầy đủ",
  "thumbnail_text": "3-6 từ tiếng Việt cho overlay ảnh",
  "hashtags": ["#hashtag1", "#hashtag2"],
  "source_disclaimer": "câu disclaimer về nguồn nếu cần (có thể trống)",
  "fact_check_notes": ["điều biên tập cần kiểm tra lại trước khi đăng nếu có"]
}`;
}

/* ============================================================
 * IMAGE PLAN
 * ============================================================ */
export function imagePlanPrompt({ brief, caption_meta, source_images }) {
  const imgs = (source_images || []).filter(Boolean);
  return `Đề xuất kế hoạch hình ảnh cho bài Facebook story này.

BRIEF:
${JSON.stringify(brief, null, 2)}

CAPTION META:
${JSON.stringify(caption_meta || {}, null, 2)}

ẢNH CÓ TRONG NGUỒN (URL):
${imgs.length ? imgs.map((u, i) => `${i + 1}. ${u}`).join('\n') : '(không có)'}

QUY TẮC TUYỆT ĐỐI:
- Nếu nguồn có ảnh hợp lệ (URL ảnh, không phải logo/icon) → KHUYẾN NGHỊ "upload_real_image" và đề xuất ảnh từ source_images.
- Nếu không có ảnh thật → "ai_illustration" với GPT Image 2.
- AI image phải được nói rõ là "ảnh minh hoạ / tái hiện".
- KHÔNG tạo ảnh giả tài liệu, giả cảnh sát, giả tin tức, giả bằng chứng.
- KHÔNG tạo mặt người thật cụ thể nếu không có ảnh gốc.
- Prompt ảnh phải theo phong cách realistic documentary editorial, believable, subtle cinematic lighting, real-world details.
- Text overlay 3-6 từ.

TRẢ VỀ JSON (KHÔNG markdown fence):
{
  "recommended_mode": "upload_real_image | ai_illustration",
  "reason": "1 câu giải thích",
  "real_image_suggestions": ["URL ảnh từ source_images nếu có"],
  "ai_image_prompt": "prompt tiếng Anh để gửi GPT Image 2 — documentary editorial, chân thực",
  "thumbnail_text": "3-6 từ tiếng Việt",
  "warnings": ["lưu ý độ chân thực / quyền sử dụng ảnh"]
}`;
}

/**
 * Build final image prompt — dùng khi muốn ghép cứng các rule.
 */
export function buildFinalImagePrompt({ topic, scene_description, thumbnail_text, negatives }) {
  const neg = Array.isArray(negatives) && negatives.length
    ? `\nDo NOT include: ${negatives.join(', ')}.`
    : '';
  return `Create a realistic documentary-style Facebook thumbnail image based on a true story.

Topic: ${safe(topic, 'untitled')}
Scene: ${safe(scene_description, 'editorial scene illustrating the story')}

Rules:
- This is an AI illustration, not a real documentary photo.
- Do not impersonate real people.
- Do not create fake evidence, fake documents, fake police scenes, or fake news screenshots.
- Square 1:1.
- Realistic editorial / documentary style.
- Natural or subtle cinematic lighting.
- Human, believable, grounded in real-world details.
- Leave clean space for short Vietnamese text overlay.
- Text overlay: "${safe(thumbnail_text)}"
- Text must be 3–6 words.${neg}`;
}

export default {
  systemPrompt,
  ideaScoringPrompt,
  briefPrompt,
  captionPrompt,
  imagePlanPrompt,
  buildFinalImagePrompt,
};
