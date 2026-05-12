/**
 * Style Seeder — story viral catalogue
 *
 * Mục tiêu: phong cách kể chuyện thật / bí ẩn / điều tra / sự kiện kỳ lạ.
 * Các style cũ kiểu sale/banner/product không còn liên quan tới dự án story —
 * giữ trong DB nhưng ẩn (is_active=false) để không phá dữ liệu cũ.
 */
import { Style } from '../models/index.js';

const STORY_STYLES = [
  {
    name: 'Chuyện bí ẩn có thật',
    slug: 'true-mystery',
    description: 'Sự việc có thật nhưng còn nhiều điểm bí ẩn, kể có kiểm soát, không bịa.',
    prompt_template:
      'Viết caption Facebook kể câu chuyện bí ẩn CÓ THẬT về: {{product}}. ' +
      'Hook tối đa 16 từ ở dòng đầu. Kể bằng giọng điềm tĩnh, có nhịp, gợi tò mò. ' +
      'Phân biệt rõ điều đã được xác minh và điều còn bỏ ngỏ. ' +
      'KHÔNG bịa tên người, địa điểm, số liệu, thời gian. Dùng "theo ghi nhận", "được cho là" khi chưa chắc. ' +
      '180–350 chữ, tối đa 3 emoji, kết bằng câu hỏi cho người đọc.',
    image_prompt_template:
      'Realistic documentary photograph illustrating "{{product}}". Cinematic but believable, natural lighting, ' +
      'subtle grain, editorial mood, no surreal elements, no fake documents, leave dark space for short Vietnamese headline.',
    tone: 'mysterious',
    icon: '🌙',
    color: '#6366f1',
    is_active: true,
    sort_order: 1,
  },
  {
    name: 'Kỳ án / Điều tra',
    slug: 'investigation-case',
    description: 'Đặt câu hỏi, phân tích, không kết tội ai. Trình bày bằng chứng cẩn trọng.',
    prompt_template:
      'Viết caption Facebook dạng điều tra về vụ việc: {{product}}. ' +
      'Hook tối đa 16 từ. Trình bày dữ kiện theo trình tự thời gian. ' +
      'Đặt câu hỏi mở thay vì kết luận. TUYỆT ĐỐI không vu khống, không gán tội. ' +
      'Dùng ngôn ngữ pháp lý cẩn trọng. 180–350 chữ. Kết: "Bạn nghĩ điều gì đã xảy ra?".',
    image_prompt_template:
      'Editorial investigative photograph related to "{{product}}". Muted color palette, documentary realism, ' +
      'no staged crime scene props unless verifiable, no fake police tape, no manipulated evidence. Cinematic light, soft contrast.',
    tone: 'investigative',
    icon: '🔍',
    color: '#475569',
    is_active: true,
    sort_order: 2,
  },
  {
    name: 'Hồ sơ nhân vật',
    slug: 'character-profile',
    description: 'Kể về một người / số phận / sự kiện xoay quanh nhân vật có thật.',
    prompt_template:
      'Viết caption Facebook dạng hồ sơ nhân vật: {{product}}. ' +
      'Hook tối đa 16 từ. Mở bằng một chi tiết đời thường rất nhỏ, sau đó mở rộng ra biến cố lớn của nhân vật. ' +
      'KHÔNG đặt lời thoại bịa, không thêm tâm trạng không có nguồn. ' +
      'Cảm xúc đến từ sự thật, không đến từ tính từ. 180–350 chữ, tối đa 3 emoji.',
    image_prompt_template:
      'Cinematic editorial portrait setting illustrating story of "{{product}}". Realistic, documentary-style, ' +
      'soft natural light. Do NOT depict a real named person unless a reference photo is provided. Leave space for headline.',
    tone: 'human',
    icon: '👤',
    color: '#0ea5e9',
    is_active: true,
    sort_order: 3,
  },
  {
    name: 'Lịch sử gây tò mò',
    slug: 'strange-history',
    description: 'Chương lịch sử ít người Việt biết, có nguồn kiểm chứng.',
    prompt_template:
      'Viết caption Facebook kể câu chuyện lịch sử ít người biết về: {{product}}. ' +
      'Hook tối đa 16 từ. Đặt người đọc vào bối cảnh thời điểm đó. ' +
      'Nêu đúng năm, đúng địa danh, đúng nhân vật — không tự sáng tác chi tiết kịch tính. ' +
      '180–350 chữ. Cuối bài đặt một câu hỏi liên hệ tới hiện tại.',
    image_prompt_template:
      'Historical documentary illustration of "{{product}}". Aged photo aesthetic, period-accurate setting, ' +
      'cinematic light, no anachronisms, no fantasy elements. Leave dark space for short Vietnamese headline.',
    tone: 'historical',
    icon: '📜',
    color: '#92400e',
    is_active: true,
    sort_order: 4,
  },
  {
    name: 'Câu chuyện cảm động',
    slug: 'emotional-story',
    description: 'Cảm xúc nhân văn, không sến, không cường điệu hoá.',
    prompt_template:
      'Viết caption Facebook kể câu chuyện cảm động có thật về: {{product}}. ' +
      'Hook tối đa 16 từ. Cảm xúc đến từ chi tiết cụ thể, KHÔNG từ tính từ kiểu "vô cùng xúc động". ' +
      'Tránh sến súa. Tối đa 3 emoji. 180–350 chữ. Kết bằng một câu khiến người đọc dừng lại nghĩ.',
    image_prompt_template:
      'Tender, documentary-style photograph illustrating "{{product}}". Warm natural light, real-world imperfections, ' +
      'human, believable. No exaggerated facial expressions. Editorial composition with space for headline.',
    tone: 'emotional',
    icon: '🤍',
    color: '#db2777',
    is_active: true,
    sort_order: 5,
  },
  {
    name: 'Khám phá kỳ lạ',
    slug: 'strange-discovery',
    description: 'Khoa học, thiên nhiên, khám phá lạ — phải có nguồn (NASA, Nat Geo, BBC...).',
    prompt_template:
      'Viết caption Facebook kể về một khám phá khoa học / thiên nhiên kỳ lạ: {{product}}. ' +
      'Hook tối đa 16 từ. Mở đầu bằng quan sát thực tế gây tò mò → giải thích khoa học ngắn gọn → câu hỏi mở. ' +
      'KHÔNG bịa số liệu, KHÔNG thêm "các nhà khoa học cho biết" nếu không có nguồn. ' +
      '180–350 chữ, tối đa 3 emoji.',
    image_prompt_template:
      'Documentary nature/science photograph related to "{{product}}". Realistic, National Geographic style, ' +
      'natural lighting, sharp subject, no surreal elements, no fake data overlays. Leave space for headline.',
    tone: 'curious',
    icon: '🌌',
    color: '#0891b2',
    is_active: true,
    sort_order: 6,
  },
  {
    name: 'Tin nóng có kiểm chứng',
    slug: 'verified-breaking',
    description: 'Tin nhanh nhưng có nguồn, không bịa, không giật tít quá đà.',
    prompt_template:
      'Viết caption Facebook dạng tin nóng có kiểm chứng về: {{product}}. ' +
      'Hook tối đa 16 từ — nêu sự kiện, không giật tít sai. ' +
      'Trình bày 5W1H ngắn gọn. Nếu thông tin chưa xác nhận → ghi rõ "đang được xác minh". ' +
      '180–350 chữ, tối đa 2 emoji.',
    image_prompt_template:
      'Realistic news editorial photograph about "{{product}}". Photojournalistic style, neutral lighting, ' +
      'no exaggerated drama, no fake news ticker. Leave clean space for short Vietnamese headline.',
    tone: 'urgent',
    icon: '📰',
    color: '#dc2626',
    is_active: true,
    sort_order: 7,
  },
];

// Style cũ (sale/product/clickbait) — ẩn để không phá dữ liệu cũ
const LEGACY_DEACTIVATE_SLUGS = [
  'breaking-news', // legacy "giật tít cấp tốc" — đã được thay bằng verified-breaking
  'clickbait',
  'investigation', // legacy — đã được thay bằng investigation-case
  'tech-news',
  'infographic',
  'professional',
  'promotional',
];

const seedStyles = async () => {
  // Upsert các style mới (active)
  for (const style of STORY_STYLES) {
    await Style.upsert(style);
  }
  // Vô hiệu hoá style legacy nhưng KHÔNG xoá (giữ FK an toàn cho dữ liệu cũ)
  for (const slug of LEGACY_DEACTIVATE_SLUGS) {
    await Style.update({ is_active: false }, { where: { slug } });
  }
  console.log('[Seed] Story styles ready (7 active, legacy hidden)');
};

export default seedStyles;
