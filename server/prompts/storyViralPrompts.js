/**
 * Prompt registry for Story Viral pipeline.
 * Tách hẳn khỏi service để chỉnh prompt không phải đụng vào code logic.
 *
 * Quy ước: mọi prompt nhận object input → trả string đã thay placeholder.
 */

const SYSTEM_PROMPT_VI = `Bạn là biên tập viên Facebook chuyên viết câu chuyện có thật, bí ẩn, tin lạ và nội dung viral nhưng CÓ TRÁCH NHIỆM.
Bạn phải ưu tiên tính chân thực, KHÔNG bịa đặt, KHÔNG vu khống, KHÔNG tự tạo bằng chứng.
Bạn được phép kể chuyện hấp dẫn hơn, nhưng KHÔNG thêm facts không có trong dữ liệu đầu vào.
Nếu dữ kiện chưa chắc chắn → dùng ngôn ngữ thận trọng: "theo ghi nhận", "được cho là", "hiện vẫn chưa rõ", "một số nguồn cho biết".
Luôn viết tiếng Việt tự nhiên, có cảm xúc, dễ đọc trên Facebook.
Luôn trả về JSON hợp lệ khi được yêu cầu — KHÔNG bọc markdown fence.`;

const safe = (v, fallback = '') => (v == null || v === '' ? fallback : String(v));
const list = (arr) =>
  Array.isArray(arr) && arr.length
    ? arr.map((x) => `- ${typeof x === 'string' ? x : JSON.stringify(x)}`).join('\n')
    : '(chưa có)';

export const systemPrompt = () => SYSTEM_PROMPT_VI;

/* ============================================================
 * 1. STORY BRIEF
 * ============================================================ */
export function briefPrompt(input) {
  const {
    topic,
    source_url,
    source_text,
    location,
    time_context,
    main_character,
    mystery_point,
    verified_facts,
    unknown_parts,
    content_type,
    creativity_level,
    target_audience,
  } = input || {};

  return `Hãy phân tích câu chuyện sau và trả về JSON.

CHỦ ĐỀ: ${safe(topic, '(không có)')}
LOẠI NỘI DUNG: ${safe(content_type, 'true_mystery')}
MỨC SÁNG TẠO: ${safe(creativity_level, 'light_dramatization')}
ĐỘC GIẢ MỤC TIÊU: ${safe(target_audience, 'người dùng Facebook Việt Nam')}

NGUỒN URL: ${safe(source_url, '(không có)')}
NGUỒN TEXT:
"""
${safe(source_text, '(không có)')}
"""

ĐỊA ĐIỂM: ${safe(location, '(chưa rõ)')}
MỐC THỜI GIAN: ${safe(time_context, '(chưa rõ)')}
NHÂN VẬT CHÍNH: ${safe(main_character, '(chưa rõ)')}
ĐIỂM BÍ ẨN / NÚT THẮT: ${safe(mystery_point, '(chưa rõ)')}

FACTS NGƯỜI DÙNG ĐÃ XÁC MINH:
${list(verified_facts)}

ĐIỀU CHƯA RÕ:
${list(unknown_parts)}

YÊU CẦU:
1. KHÔNG bịa thêm sự kiện ngoài dữ liệu trên.
2. Nếu không có source_url hoặc source_text → thêm "needs_source_review" vào safety_notes.
3. Phân biệt rõ "verified_facts" (đã chắc) và "unknown_parts" (chưa rõ).
4. Không gán tội, không vu khống, không khẳng định khi chưa có bằng chứng.

TRẢ VỀ JSON CHÍNH XÁC THEO SCHEMA:
{
  "summary": "2-3 câu tóm tắt câu chuyện một cách trung tính",
  "verified_facts": ["fact 1", "fact 2", "..."],
  "unknown_parts": ["điều chưa rõ 1", "..."],
  "emotional_core": "cảm xúc cốt lõi (1 câu)",
  "curiosity_gap": "điểm khiến người đọc tò mò muốn biết thêm (1 câu)",
  "viral_potential": "low | medium | high — kèm 1 câu giải thích",
  "safety_notes": ["cảnh báo về tính xác thực / pháp lý / đạo đức nếu có"]
}`;
}

/* ============================================================
 * 2. VIRAL ANGLES (5 góc viết)
 * ============================================================ */
export function anglesPrompt(brief) {
  return `Dựa vào brief sau, hãy đề xuất CHÍNH XÁC 5 góc viết khác nhau cho bài Facebook.

BRIEF:
${JSON.stringify(brief, null, 2)}

YÊU CẦU:
- 5 hook hoàn toàn khác nhau về style (đừng cùng motif).
- Hook tối đa 16 từ tiếng Việt.
- KHÔNG được giật tít sai sự thật — chỉ chọn góc nhìn shocking nhất từ FACTS có sẵn.
- KHÔNG dùng cliché: "Sự thật về...", "Bí mật mà bạn chưa biết", "Không thể tin được...", "X điều thú vị về...".
- risk_level: "low" nếu nguồn rõ và an toàn; "medium" nếu có chi tiết nhạy cảm; "high" nếu liên quan người thật còn sống, pháp lý, hoặc thiếu nguồn.

TRẢ VỀ JSON ARRAY (KHÔNG markdown fence):
[
  {
    "title": "tiêu đề tiếng Việt 8-14 từ",
    "hook": "câu mở đầu caption — tối đa 16 từ",
    "style": "tên kỹ thuật (vd: 'nghịch lý', 'curiosity gap', 'con số cụ thể', 'tương phản trước/sau', 'câu hỏi mở', 'nhân vật + tình huống')",
    "curiosity_gap": "20% thông tin được giữ lại để câu click",
    "emotional_trigger": "shock / tò mò / cảm động / phẫn nộ / hoài niệm",
    "risk_level": "low | medium | high",
    "reason_why_it_works": "1 câu giải thích vì sao hook này hiệu quả"
  }
]`;
}

/* ============================================================
 * 3. FACEBOOK CAPTION
 * ============================================================ */
export function captionPrompt({ brief, selected_angle, creativity_level, target_audience }) {
  return `Hãy viết caption Facebook hoàn chỉnh dựa trên brief + góc viết đã chọn.

BRIEF:
${JSON.stringify(brief, null, 2)}

GÓC VIẾT ĐÃ CHỌN:
${JSON.stringify(selected_angle, null, 2)}

MỨC SÁNG TẠO: ${safe(creativity_level, 'light_dramatization')}
- "stick_to_facts" → bám sát sự thật, ít tô màu.
- "light_dramatization" → kể chuyện có nhịp, có cảm xúc, nhưng không thêm facts.
- "dramatic_no_lie" → kịch tính, có cao trào, nhưng tuyệt đối không bịa.

ĐỘC GIẢ: ${safe(target_audience, 'người dùng Facebook Việt Nam')}

CẤU TRÚC CAPTION:
1. Hook đầu tiên (tối đa 16 từ) — chính là "hook" trong angle.
2. Mở bối cảnh bằng MỘT chi tiết đời thực rất cụ thể.
3. Kể diễn biến chính ngắn gọn, có nhịp (2-4 đoạn).
4. Nêu điểm bí ẩn / câu hỏi còn bỏ ngỏ.
5. Kết bằng một câu hỏi kéo bình luận (vd: "Bạn nghĩ sao về chuyện này?").

RÀNG BUỘC:
- 180–350 chữ.
- Tối đa 3 emoji, đặt đúng chỗ, không trang trí thừa.
- KHÔNG bịa tên người / địa điểm / thời gian / số liệu.
- Nếu thông tin chưa chắc → dùng "theo ghi nhận", "được cho là", "hiện vẫn chưa rõ".
- Có thể xuống dòng giữa đoạn cho dễ đọc.

TRẢ VỀ JSON (KHÔNG markdown fence):
{
  "title": "tiêu đề bài để lưu vào hệ thống (8-14 từ)",
  "caption": "nội dung caption hoàn chỉnh để đăng Facebook",
  "thumbnail_text": "3-6 từ tiếng Việt cho overlay ảnh thumbnail (UPPERCASE OK)",
  "hashtags": ["#hashtag1", "#hashtag2", "..."],
  "fact_check_notes": ["điều biên tập cần kiểm tra lại trước khi đăng nếu có"]
}`;
}

/* ============================================================
 * 4. IMAGE PLAN
 * ============================================================ */
export function imagePlanPrompt({ brief, selected_angle, caption_meta }) {
  return `Hãy đề xuất kế hoạch hình ảnh cho bài Facebook này.

BRIEF:
${JSON.stringify(brief, null, 2)}

ANGLE:
${JSON.stringify(selected_angle, null, 2)}

CAPTION META:
${JSON.stringify(caption_meta || {}, null, 2)}

QUY TẮC:
- Nếu câu chuyện là chuyện có thật / vụ việc thật / người thật → KHUYẾN NGHỊ "upload_real_image" để đảm bảo chân thực.
- Nếu là sự kiện lịch sử, khám phá khoa học, hoặc chủ đề không có ảnh thật → "generate_ai_image".
- Nếu khuyến nghị AI → mô tả là "ảnh minh hoạ / tái hiện", KHÔNG ngụy trang là ảnh tài liệu thật.
- KHÔNG tạo prompt giả ảnh giấy tờ / cảnh sát / hiện trường / bằng chứng nếu facts không xác nhận.
- KHÔNG yêu cầu AI tạo mặt người thật cụ thể nếu không có ảnh gốc.
- thumbnail_text chỉ 3-6 từ.

TRẢ VỀ JSON (KHÔNG markdown fence):
{
  "image_mode_recommendation": "upload_real_image | generate_ai_image",
  "reason": "1 câu giải thích vì sao khuyến nghị mode này",
  "main_scene": "mô tả cảnh chính bằng tiếng Anh ngắn gọn (cho AI image)",
  "image_prompt": "prompt tiếng Anh hoàn chỉnh để gửi cho GPT Image 2 — chân thực, documentary, không ảo",
  "thumbnail_text": "3-6 từ tiếng Việt",
  "negative_prompt_notes": ["những thứ KHÔNG được xuất hiện trong ảnh"],
  "authenticity_notes": ["lưu ý độ chân thực để biên tập viên kiểm tra trước khi đăng"]
}`;
}

/**
 * Build prompt tiếng Anh cuối cùng cho images.generate.
 * Thường gọi sau khi đã có image_plan từ AI.
 */
export function buildFinalImagePrompt({ topic, main_scene, location, time_context, thumbnail_text, mood, negative_notes }) {
  const negatives = Array.isArray(negative_notes) && negative_notes.length
    ? `\nDo NOT include: ${negative_notes.join(', ')}.`
    : '';
  return `Create a realistic documentary-style Facebook thumbnail image for this story.

Story topic: ${safe(topic, 'untitled story')}
Main scene: ${safe(main_scene, 'editorial scene illustrating the story')}
Location / context: ${safe(location, 'unspecified location')} / ${safe(time_context, 'unspecified time')}
Mood: ${safe(mood, 'mysterious, tense, human, realistic, cinematic but believable')}

Rules:
- Square 1:1 composition.
- Looks like real editorial / documentary photography.
- Natural lighting or subtle cinematic lighting.
- Real-world imperfections.
- No exaggerated shocked faces.
- No surreal / fantasy elements.
- No fake police tape, fake documents, fake evidence unless explicitly present in facts.
- Do not portray a real named person unless a real reference image is provided.
- Leave clean dark space at bottom or top for short Vietnamese headline.
- Text overlay only: "${safe(thumbnail_text, '')}"
- Text must be 3–6 words, large and readable.
- Style: realistic news editorial, documentary photo, subtle grain, sharp subject, emotional atmosphere, high detail.${negatives}`;
}

/* ============================================================
 * 5. QUALITY CHECK
 * ============================================================ */
export function qualityCheckPrompt({ brief, caption, thumbnail_text, image_prompt }) {
  return `Hãy đánh giá bài Facebook story sau theo tiêu chí biên tập có trách nhiệm.

BRIEF:
${JSON.stringify(brief, null, 2)}

CAPTION FACEBOOK:
"""
${safe(caption)}
"""

THUMBNAIL TEXT: "${safe(thumbnail_text)}"
IMAGE PROMPT: "${safe(image_prompt)}"

KIỂM TRA:
1. Caption có bịa facts không (so với brief.verified_facts)?
2. Hook có quá lố / sai sự thật không?
3. Thumbnail text có quá dài (>6 từ) hoặc khẳng định sai không?
4. Image prompt có tạo cảm giác giả tài liệu / giả ảnh thật không?
5. Nếu brief.safety_notes chứa "needs_source_review" → cảnh báo người dùng kiểm tra lại nguồn.

TRẢ VỀ JSON (KHÔNG markdown fence):
{
  "passed": true | false,
  "warnings": ["cảnh báo cần kiểm tra"],
  "suggestions": ["gợi ý cải thiện cụ thể"],
  "score": {
    "authenticity": 0-10,
    "curiosity": 0-10,
    "clarity": 0-10,
    "facebook_readability": 0-10,
    "image_relevance": 0-10
  }
}`;
}

export default {
  systemPrompt,
  briefPrompt,
  anglesPrompt,
  captionPrompt,
  imagePlanPrompt,
  buildFinalImagePrompt,
  qualityCheckPrompt,
};
