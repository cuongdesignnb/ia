/**
 * Image templates dành riêng cho True Story posts.
 * Hướng documentary / editorial / realistic — KHÔNG có template "shocked face",
 * "red circle highlight", "fake news ticker".
 *
 * Mỗi template kết thúc bằng nhắc rõ "ảnh minh hoạ / illustration", để AI
 * không tự ngụy trang ảnh AI thành tư liệu thật.
 */
import { IMAGE_TEMPLATES as BASE } from './imageTemplates';

// Lọc lại các template phù hợp với chuyện thật, bỏ "upload-real-image" (xử lý qua tab riêng)
const STORY_TEMPLATES = BASE.filter((t) => t.id !== 'upload-real-image').map((t) => ({
  ...t,
  prompt_template: appendIllustrationDisclaimer(t.prompt_template),
}));

function appendIllustrationDisclaimer(p) {
  if (!p) return p;
  if (/illustration|illustrative/i.test(p)) return p;
  return `${p}\n(Image is an AI illustration of the story — not a real documentary photograph.)`;
}

export const TRUE_STORY_IMAGE_TEMPLATES = STORY_TEMPLATES;

export const findTrueStoryTemplate = (id) =>
  TRUE_STORY_IMAGE_TEMPLATES.find((t) => t.id === id);

export const buildTrueStoryPrompt = (id, vars = {}) => {
  const tpl = findTrueStoryTemplate(id);
  if (!tpl || !tpl.prompt_template) return '';
  return tpl.prompt_template
    .replace(/\{\{product\}\}/g, vars.product || vars.topic || 'the story')
    .replace(/\{\{thumbnail_text\}\}/g, vars.thumbnail_text || '');
};

export default TRUE_STORY_IMAGE_TEMPLATES;
