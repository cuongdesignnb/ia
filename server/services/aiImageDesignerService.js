/**
 * AI Image Designer
 * Dùng gpt-image-2 (images.edit với reference image hoặc images.generate) để
 * tạo ảnh Facebook post hoàn chỉnh — AI tự design typography + branding.
 *
 * Khác biệt với imageComposerService.js (Sharp + SVG overlay): output đẹp hơn,
 * dynamic typography, nhưng có rủi ro AI viết sai chính tả tiếng Việt.
 */
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { toFile } from 'openai/uploads';
import { MediaFile } from '../models/index.js';
import { getSetting } from './settingsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_BASE = path.join(__dirname, '..', '..', 'uploads', 'media');

/**
 * Build the design prompt for gpt-image-2.
 */
function buildDesignPrompt({ story, headline, subheadline, labelText, labelColor, hasReference }) {
  const eventContext = [
    story.event_date && `Date: ${story.event_date}`,
    story.location && `Location: ${story.location}`,
  ].filter(Boolean).join(', ');

  const referenceClause = hasReference
    ? `IMPORTANT: Use the provided reference photo as the main visual subject. Preserve the people, setting, and key elements of that photo. Apply cinematic photographic treatment (dramatic lighting, depth, color grading) but keep it photojournalistic and realistic.`
    : `Generate a cinematic photojournalistic image about: ${story.title}. ${story.summary || ''} Realistic, dramatic lighting, documentary photography style.`;

  return `Create a 1:1 square Facebook post image (1024x1024) — magazine-cover style storytelling design.

${referenceClause}

TYPOGRAPHY (write these texts EXACTLY as given, with all Vietnamese diacritics correct):
1. Top center — small rectangular badge with solid color "${labelColor}", white bold uppercase text inside:
   "${labelText}"
2. Center to upper-middle — large bold white uppercase headline with subtle drop shadow:
   "${headline}"
3. Bottom — smaller bold white uppercase subheadline:
   "${subheadline}"

CRITICAL: Vietnamese text MUST be spelled exactly as provided, including all diacritical marks (à á ả ã ạ â ấ ầ ẩ ẫ ậ ă ắ ằ ẳ ẵ ặ è é ẻ ẽ ẹ ê ế ề ể ễ ệ ì í ỉ ĩ ị ò ó ỏ õ ọ ô ố ồ ổ ỗ ộ ơ ớ ờ ở ỡ ợ ù ú ủ ũ ụ ư ứ ừ ử ữ ự ỳ ý ỷ ỹ ỵ đ Đ).

DESIGN STYLE:
- Bold editorial / news magazine cover aesthetic
- Strong contrast, high impact
- Subtle gradient at the bottom for text readability
- Clean sans-serif fonts, no decorative effects
- Photojournalistic mood, no cartoon / illustration / 3D

${eventContext ? `Event context: ${eventContext}` : ''}

Output: 1024x1024 photographic image with all the text above clearly legible and correctly spelled in Vietnamese.`;
}

/**
 * Tạo ảnh Facebook post bằng gpt-image-2.
 * @param {object} params
 * @param {string|null} params.sourceImagePath - Absolute path tới ảnh tham chiếu (null = generate from scratch)
 * @param {object} params.story
 * @param {string} params.headline
 * @param {string} params.subheadline
 * @param {string} [params.labelText]
 * @param {string} [params.labelColor]
 * @param {number} [params.storyId]
 * @param {number} [params.folderId]
 * @returns {Promise<MediaFile>}
 */
export async function designAndSaveImage({
  sourceImagePath, story, headline, subheadline,
  labelText, labelColor, storyId, folderId,
}) {
  const apiKey = await getSetting('openai_api_key', 'OPENAI_API_KEY');
  if (!apiKey) throw new Error('Chưa cấu hình OpenAI API key');

  const finalLabel = labelText || await getSetting('image_label_text') || 'CÂU CHUYỆN CÓ THẬT';
  const finalColor = labelColor || await getSetting('image_label_color') || '#ff0000';

  const hasReference = !!sourceImagePath && fs.existsSync(sourceImagePath);
  const prompt = buildDesignPrompt({
    story, headline, subheadline, labelText: finalLabel, labelColor: finalColor, hasReference,
  });

  const client = new OpenAI({ apiKey, timeout: 300000 });
  const modelName = await getSetting('ai_design_model') || 'gpt-image-2';

  console.log(`[AIDesigner] Model: ${modelName}, Reference: ${hasReference ? sourceImagePath : 'none'}`);

  let response;
  let designMethod = 'generate';

  if (hasReference) {
    // Bước 1: thử images.edit với gpt-image-1 (account có thể không hỗ trợ
    // gpt-image-2 cho edit; dall-e-2 chất lượng quá thấp).
    // Bước 2: fallback — gpt-4o-mini vision describe ảnh + gpt-image-2.generate
    //   với mô tả đó. Giữ chất lượng gpt-image-2 cao, vẫn bám sát ảnh thật.
    const editModelChain = ['gpt-image-1'];
    let lastEditError = null;
    for (const editModel of editModelChain) {
      try {
        console.log(`[AIDesigner] Trying images.edit with ${editModel}...`);
        const imageFile = await toFile(fs.createReadStream(sourceImagePath), path.basename(sourceImagePath));
        response = await client.images.edit({
          model: editModel,
          image: imageFile,
          prompt,
          size: '1024x1024',
          n: 1,
        });
        designMethod = `edit-${editModel}`;
        console.log(`[AIDesigner] ✅ Edit OK with ${editModel}`);
        break;
      } catch (err) {
        lastEditError = err;
        console.warn(`[AIDesigner] images.edit ${editModel} failed: ${err.message}`);
      }
    }

    if (!response) {
      console.log(`[AIDesigner] All edit attempts failed → vision describe + ${modelName} generate`);
      let visionDescription = '';
      try {
        const imageBase64 = fs.readFileSync(sourceImagePath).toString('base64');
        const ext = path.extname(sourceImagePath).slice(1).toLowerCase() || 'jpeg';
        const mime = ext === 'jpg' ? 'jpeg' : ext;
        const visionResp = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this photograph for use as a visual reference. Cover: main subject(s) and pose, setting/background, lighting and mood, color palette, photographic style, key visual elements. Be specific and concrete. 80-150 words. English only.' },
              { type: 'image_url', image_url: { url: `data:image/${mime};base64,${imageBase64}` } },
            ],
          }],
          max_tokens: 300,
        });
        visionDescription = visionResp.choices[0]?.message?.content || '';
        console.log(`[AIDesigner] Vision description: ${visionDescription.slice(0, 120)}...`);
      } catch (visionErr) {
        console.warn(`[AIDesigner] Vision describe failed: ${visionErr.message}`);
      }

      const enhancedPrompt = visionDescription
        ? `${prompt}\n\nREFERENCE PHOTO DESCRIPTION (recreate a photographic image that closely matches this real reference):\n${visionDescription}\n\nIMPORTANT: Reproduce the same subject, composition, lighting, and mood as described above. Make it photorealistic, like a real news photograph.`
        : prompt;

      const params = {
        model: modelName,
        prompt: enhancedPrompt,
        size: '1024x1024',
        n: 1,
      };
      if (modelName.startsWith('gpt-image')) params.quality = 'high';

      try {
        response = await client.images.generate(params);
        designMethod = `vision-guided-${modelName}`;
      } catch (err) {
        console.error(`[AIDesigner] Vision-guided generate failed: ${err.message}`);
        throw lastEditError || err;
      }
    }
  } else {
    // images.generate from scratch — gpt-image-2 hỗ trợ quality
    const params = {
      model: modelName,
      prompt,
      size: '1024x1024',
      n: 1,
    };
    if (modelName.startsWith('gpt-image')) params.quality = 'high';
    try {
      response = await client.images.generate(params);
      designMethod = `generate-${modelName}`;
    } catch (err) {
      console.error(`[AIDesigner] ${modelName} generate failed:`, err.message);
      throw err;
    }
  }

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error('AI không trả về ảnh hợp lệ');

  const buffer = Buffer.from(b64, 'base64');
  const filename = `ai_design_${uuidv4()}.png`;

  const now = new Date();
  const dir = path.join(UPLOAD_BASE, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);

  const meta = await sharp(filePath).metadata();
  let thumbRelative = null;
  try {
    const thumbPath = path.join(dir, `thumb_${filename}`);
    await sharp(filePath).resize(300, 300, { fit: 'cover' }).toFile(thumbPath);
    thumbRelative = '/' + path.relative(path.join(__dirname, '..', '..'), thumbPath).replace(/\\/g, '/');
  } catch { /* ignore */ }

  const relativePath = '/' + path.relative(path.join(__dirname, '..', '..'), filePath).replace(/\\/g, '/');

  const mediaFile = await MediaFile.create({
    folder_id: folderId || null,
    story_id: storyId || null,
    filename,
    original_name: `ai_design_${(headline || 'post').slice(0, 30)}.png`,
    mime_type: 'image/png',
    path: relativePath,
    thumbnail_path: thumbRelative,
    size: buffer.length,
    width: meta.width,
    height: meta.height,
    license_type: `AI Designed (${designMethod})`,
    author: 'AI',
    attribution_text: hasReference
      ? `Designed via ${designMethod} from reference photo`
      : `Designed via ${designMethod}`,
    uploaded_by: 'auto_story',
    tags: ['ai-designed', hasReference ? 'with-reference' : 'from-scratch', designMethod],
  });

  console.log(`[AIDesigner] ✅ Saved: ${relativePath}`);
  return mediaFile;
}

export default { designAndSaveImage };
