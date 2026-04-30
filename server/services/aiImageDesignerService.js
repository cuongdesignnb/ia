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
import { MediaFile } from '../models/index.js';
import { getSetting } from './settingsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_BASE = path.join(__dirname, '..', '..', 'uploads', 'media');

/**
 * Build the design prompt for gpt-image-2.
 * Khi có visualBase (mô tả ảnh tham chiếu từ vision) → đặt làm content chính,
 * design rules chỉ là overlay rules, không được thay đổi visual chính.
 */
function buildDesignPrompt({ story, headline, subheadline, labelText, labelColor, visualBase }) {
  const eventContext = [
    story.event_date && story.event_date,
    story.location,
  ].filter(Boolean).join(' · ');

  // Visual content — ưu tiên mô tả từ ảnh tham chiếu, fallback về story
  const mainVisual = visualBase
    ? `## MAIN VISUAL CONTENT (this is the PRIMARY image — reproduce faithfully):

${visualBase}

CRITICAL FAITHFULNESS RULES:
- Reproduce the scene above EXACTLY: same subject(s), same pose, same setting, same composition, same lighting, same atmosphere.
- Do NOT add extra people, objects, or scenery not described.
- Do NOT change the subject's appearance, ethnicity, age, or clothing.
- Do NOT shift to a different location or time period.
- Treat this as a strict photo recreation, not creative interpretation.
- Keep it photorealistic — like a real documentary/news photograph, not stylized art.`
    : `## MAIN VISUAL CONTENT

A cinematic photojournalistic photograph documenting: ${story.title}.
${story.summary ? `Context: ${story.summary}` : ''}
Realistic, dramatic natural lighting, documentary photography style. Looks like a real news photo, not illustration.`;

  return `Design a 1024×1024 square Facebook post image. Two-layer composition: (A) the main photograph below, (B) text overlay on top.

${mainVisual}

## TEXT OVERLAY (rendered ON TOP of the main visual — do not replace or alter the visual)

Reserve appropriate space for text without obscuring key subjects (typically: small badge top-center, headline middle/upper area over subtle gradient, subheadline at bottom over darker gradient).

1. TOP CENTER BADGE — small rectangular tag, solid background color ${labelColor}, white bold uppercase text inside:
   "${labelText}"

2. HEADLINE — large bold white uppercase, with subtle dark drop-shadow for legibility:
   "${headline}"

3. SUBHEADLINE — smaller bold white uppercase, below headline:
   "${subheadline}"

## VIETNAMESE TEXT FIDELITY (CRITICAL)
All text above is in Vietnamese and MUST be reproduced EXACTLY, including every diacritical mark:
à á ả ã ạ â ấ ầ ẩ ẫ ậ ă ắ ằ ẳ ẵ ặ
è é ẻ ẽ ẹ ê ế ề ể ễ ệ
ì í ỉ ĩ ị
ò ó ỏ õ ọ ô ố ồ ổ ỗ ộ ơ ớ ờ ở ỡ ợ
ù ú ủ ũ ụ ư ứ ừ ử ữ ự
ỳ ý ỷ ỹ ỵ
đ Đ
No misspellings, no missing tones, no English substitutions.

## TYPOGRAPHY STYLE
Clean modern sans-serif (e.g., Inter / Helvetica / Open Sans family). Strong weight (700-900). No decorative or script fonts. Tight letter spacing on headline.

## OVERALL OUTPUT
- Format: 1024×1024 square
- Style: photographic realism with editorial text overlay (think National Geographic / TIME magazine cover)
- The PHOTO is the hero — text supports, never dominates
- No watermarks, no AI artifacts, no extra logos
- No cartoon/illustration/3D-render — strictly photographic look
${eventContext ? `\n## EVENT CONTEXT (for accuracy)\n${eventContext}` : ''}`;
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
  const client = new OpenAI({ apiKey, timeout: 300000 });
  const modelName = await getSetting('ai_design_model') || 'gpt-image-2';

  console.log(`[AIDesigner] Model: ${modelName}, Reference: ${hasReference ? sourceImagePath : 'none'}`);

  // Đồng nhất với flow tạo bài (CreatePost): images.generate gpt-image-2.
  // Có reference → gpt-4o-mini vision tạo ra "image generation prompt"
  //   chi tiết, đặt làm visual content chính trong design prompt.
  let designMethod = `generate-${modelName}`;
  let visualBase = '';

  if (hasReference) {
    try {
      const imageBase64 = fs.readFileSync(sourceImagePath).toString('base64');
      const ext = path.extname(sourceImagePath).slice(1).toLowerCase() || 'jpeg';
      const mime = ext === 'jpg' ? 'jpeg' : ext;
      const visionResp = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `Convert this photograph into a detailed image-generation prompt that will let another AI recreate it faithfully. Format: a single dense paragraph starting with "A photograph of...". Cover ALL of these in concrete specifics:

- SUBJECT(s): who/what, exact pose, expression, age/gender appearance, clothing details, what they're holding/doing
- SETTING: location type, surroundings, foreground, background, time of day, weather/atmosphere
- COMPOSITION: shot framing (close-up / medium / wide), camera angle (eye-level / low / high), depth (shallow DOF / deep focus)
- LIGHTING: direction (front / side / back / overhead), quality (hard / soft / dappled), color temperature, key shadows
- COLOR PALETTE: dominant 3-4 colors, mood (warm / cool / neutral / desaturated)
- STYLE: photographic genre (documentary / news / portrait / landscape / archival), era cues if visible (lens characteristics, film vs digital look)

Be SPECIFIC and CONCRETE — name actual visible details. Do NOT mention what's absent. Do NOT use vague words like "various" or "some". 120-200 words. English only. No bullet lists, write as flowing text.` },
            { type: 'image_url', image_url: { url: `data:image/${mime};base64,${imageBase64}` } },
          ],
        }],
        max_tokens: 500,
      });
      visualBase = visionResp.choices[0]?.message?.content?.trim() || '';
      console.log(`[AIDesigner] Vision prompt (${visualBase.length} chars): ${visualBase.slice(0, 160)}...`);
    } catch (visionErr) {
      console.warn(`[AIDesigner] Vision describe failed: ${visionErr.message}`);
    }
    if (visualBase) designMethod = `vision-guided-${modelName}`;
  }

  const finalPrompt = buildDesignPrompt({
    story, headline, subheadline,
    labelText: finalLabel, labelColor: finalColor,
    visualBase,
  });

  const params = {
    model: modelName,
    prompt: finalPrompt,
    size: '1024x1024',
    n: 1,
  };
  if (modelName.startsWith('gpt-image')) params.quality = 'high';

  let response;
  try {
    response = await client.images.generate(params);
    console.log(`[AIDesigner] ✅ ${designMethod} OK`);
  } catch (err) {
    console.error(`[AIDesigner] ${modelName} generate failed:`, err.message);
    throw err;
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
