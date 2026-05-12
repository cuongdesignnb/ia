/**
 * Image templates for story posts.
 * Hướng documentary / editorial / chân thực.
 * KHÔNG còn template kiểu "shocked face", "red circle highlight", "fake news ticker".
 *
 * Mỗi template:
 *   id                     — slug
 *   name                   — tên hiển thị
 *   description            — mô tả ngắn
 *   recommended_for        — loại nội dung phù hợp
 *   prompt_template        — prompt tiếng Anh (placeholder {{product}}, {{thumbnail_text}})
 *   allow_text_overlay     — có hỗ trợ text overlay không
 *   default_thumbnail_text — gợi ý mặc định
 */

export const IMAGE_TEMPLATES = [
  {
    id: 'documentary-mystery',
    name: 'Documentary Mystery',
    icon: '🌙',
    description: 'Ảnh tài liệu, không khí bí ẩn, vẫn chân thực.',
    recommended_for: ['true-mystery', 'investigation-case'],
    prompt_template:
      'Realistic documentary photograph about "{{product}}". Mysterious atmosphere, soft natural light, ' +
      'subtle film grain, editorial composition, no surreal elements, no fake evidence. ' +
      'Leave dark space at the bottom for short Vietnamese headline.',
    allow_text_overlay: true,
    default_thumbnail_text: '',
  },
  {
    id: 'real-news-editorial',
    name: 'Real News Editorial',
    icon: '📰',
    description: 'Ảnh báo chí biên tập, neutral, không cường điệu.',
    recommended_for: ['verified-breaking'],
    prompt_template:
      'Photojournalistic editorial image about "{{product}}". Neutral cinematic lighting, realistic scene, ' +
      'no exaggerated drama, no fake news ticker, no red circles. Looks like a credible news photo.',
    allow_text_overlay: true,
    default_thumbnail_text: '',
  },
  {
    id: 'dark-investigation',
    name: 'Dark Investigation',
    icon: '🔍',
    description: 'Không khí điều tra, low-key, không dàn dựng.',
    recommended_for: ['investigation-case', 'true-mystery'],
    prompt_template:
      'Low-key editorial photograph related to "{{product}}". Muted palette, soft shadow, documentary realism. ' +
      'Do NOT include staged crime scene props, fake police tape, or manipulated evidence.',
    allow_text_overlay: true,
    default_thumbnail_text: '',
  },
  {
    id: 'emotional-human-story',
    name: 'Emotional Human Story',
    icon: '🤍',
    description: 'Ảnh người thật, ánh sáng tự nhiên, cảm xúc kiềm chế.',
    recommended_for: ['character-profile', 'emotional-story'],
    prompt_template:
      'Tender documentary portrait illustrating "{{product}}". Warm natural light, real-world imperfections, ' +
      'subtle emotion. No exaggerated facial expressions. Editorial composition. ' +
      'Do not depict a real named person unless reference photo provided.',
    allow_text_overlay: true,
    default_thumbnail_text: '',
  },
  {
    id: 'strange-discovery',
    name: 'Strange Discovery',
    icon: '🌌',
    description: 'Khoa học, thiên nhiên, kiểu National Geographic.',
    recommended_for: ['strange-discovery'],
    prompt_template:
      'National Geographic style documentary photograph about "{{product}}". Sharp subject, natural lighting, ' +
      'realistic environment, no surreal elements, no fake data overlays.',
    allow_text_overlay: true,
    default_thumbnail_text: '',
  },
  {
    id: 'historical-mystery',
    name: 'Historical Mystery',
    icon: '📜',
    description: 'Ảnh lịch sử, period-accurate, không anachronism.',
    recommended_for: ['strange-history'],
    prompt_template:
      'Period-accurate historical illustration of "{{product}}". Aged photo aesthetic, cinematic light, ' +
      'no anachronisms, no fantasy elements. Editorial mood.',
    allow_text_overlay: true,
    default_thumbnail_text: '',
  },
  {
    id: 'simple-text-thumbnail',
    name: 'Simple Text Thumbnail',
    icon: '🔤',
    description: 'Ảnh tối giản, chữ là trọng tâm — phù hợp khi không có ảnh thật.',
    recommended_for: ['true-mystery', 'character-profile', 'strange-history'],
    prompt_template:
      'Minimal dark editorial background suitable for a Facebook thumbnail about "{{product}}". ' +
      'Soft gradient, subtle texture, lots of negative space for headline. No characters, no symbols.',
    allow_text_overlay: true,
    default_thumbnail_text: '',
  },
  {
    id: 'upload-real-image',
    name: 'Upload Real Image',
    icon: '📷',
    description: 'Khuyến nghị cho chuyện có thật — dùng ảnh thật của câu chuyện.',
    recommended_for: ['*'],
    prompt_template: '',
    allow_text_overlay: true,
    default_thumbnail_text: '',
  },
];

export const findTemplate = (id) => IMAGE_TEMPLATES.find((t) => t.id === id);

export const buildPromptFromTemplate = (id, vars = {}) => {
  const tpl = findTemplate(id);
  if (!tpl || !tpl.prompt_template) return '';
  return tpl.prompt_template
    .replace(/\{\{product\}\}/g, vars.product || vars.topic || 'the story')
    .replace(/\{\{thumbnail_text\}\}/g, vars.thumbnail_text || '');
};

export default IMAGE_TEMPLATES;
