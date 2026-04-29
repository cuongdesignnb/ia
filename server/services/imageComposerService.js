/**
 * Image Composer Service
 * Chèn text hook + logo lên ảnh thật bằng Sharp
 * Chế độ A: ảnh thật làm nền + gradient + text overlay
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { MediaFile } from '../models/index.js';
import { getSetting } from './settingsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_BASE = path.join(__dirname, '..', '..', 'uploads', 'media');

const OUTPUT_SIZE = 1080; // 1080x1080

/**
 * Compose a Facebook image from a source photo
 * @param {Object} params
 * @param {string} params.sourceImagePath - Absolute path to source image
 * @param {string} params.headline - Main text (e.g. "69 NGÀY DƯỚI LÒNG ĐẤT")
 * @param {string} params.subheadline - Sub text (e.g. "33 THỢ MỎ CHILE ĐƯỢC GIẢI CỨU SỐNG")
 * @param {string} params.label - Label text (from settings, e.g. "CÂU CHUYỆN CÓ THẬT")
 * @param {number} params.storyId - Story ID for saving
 * @param {number} params.folderId - Folder ID for saving
 * @returns {MediaFile} output media file
 */
export async function composeImage({ sourceImagePath, headline, subheadline, label, storyId, folderId }) {
  // Get settings
  const labelText = label || await getSetting('image_label_text') || 'CÂU CHUYỆN CÓ THẬT';
  const labelColor = await getSetting('image_label_color') || '#ff0000';
  const logoMediaId = await getSetting('image_logo_media_id');
  const logoPosition = await getSetting('image_logo_position') || 'top-right';
  const logoSize = parseInt(await getSetting('image_logo_size') || '120');

  // 1. Load + crop to 1:1
  const basePath = path.join(__dirname, '..', '..');
  const absoluteSource = sourceImagePath.startsWith('/')
    ? path.join(basePath, sourceImagePath)
    : sourceImagePath;

  let image = sharp(absoluteSource);
  const metadata = await image.metadata();

  // Smart crop to square
  const minDim = Math.min(metadata.width, metadata.height);
  image = image.extract({
    left: Math.floor((metadata.width - minDim) / 2),
    top: Math.floor((metadata.height - minDim) / 2),
    width: minDim,
    height: minDim,
  }).resize(OUTPUT_SIZE, OUTPUT_SIZE);

  // 2. Create SVG overlay (gradient + text)
  const svgOverlay = buildSVGOverlay({
    width: OUTPUT_SIZE,
    height: OUTPUT_SIZE,
    headline,
    subheadline,
    labelText,
    labelColor,
  });

  // 3. Composite: image + overlay
  const composites = [
    { input: Buffer.from(svgOverlay), top: 0, left: 0 },
  ];

  // 4. Add logo if configured
  if (logoMediaId) {
    try {
      const logoFile = await MediaFile.findByPk(parseInt(logoMediaId));
      if (logoFile) {
        const logoPath = path.join(basePath, logoFile.path);
        if (fs.existsSync(logoPath)) {
          const logoBuffer = await sharp(logoPath)
            .resize(logoSize, logoSize, { fit: 'inside' })
            .toBuffer();

          const pos = getLogoPosition(logoPosition, logoSize, OUTPUT_SIZE);
          composites.push({ input: logoBuffer, top: pos.top, left: pos.left });
        }
      }
    } catch (err) {
      console.error('[ImageComposer] Logo error:', err.message);
    }
  }

  // 5. Output
  const outputFilename = `composed_${uuidv4()}.jpg`;
  const now = new Date();
  const dir = path.join(UPLOAD_BASE, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
  fs.mkdirSync(dir, { recursive: true });

  const outputPath = path.join(dir, outputFilename);

  await image
    .composite(composites)
    .jpeg({ quality: 92 })
    .toFile(outputPath);

  // Create thumbnail
  let thumbRelative = null;
  try {
    const thumbName = `thumb_${outputFilename}`;
    const thumbPath = path.join(dir, thumbName);
    await sharp(outputPath).resize(300, 300, { fit: 'cover' }).toFile(thumbPath);
    thumbRelative = '/' + path.relative(basePath, thumbPath).replace(/\\/g, '/');
  } catch { /* ignore */ }

  const relativePath = '/' + path.relative(basePath, outputPath).replace(/\\/g, '/');
  const outputMeta = await sharp(outputPath).metadata();

  // Save to DB
  const mediaFile = await MediaFile.create({
    folder_id: folderId || null,
    story_id: storyId || null,
    filename: outputFilename,
    original_name: `composed_${headline?.substring(0, 30) || 'image'}.jpg`,
    mime_type: 'image/jpeg',
    path: relativePath,
    thumbnail_path: thumbRelative,
    size: fs.statSync(outputPath).size,
    width: outputMeta.width,
    height: outputMeta.height,
    uploaded_by: 'auto_story',
    tags: ['composed', 'true-story'],
  });

  return mediaFile;
}

/**
 * Build SVG overlay with gradient + text
 */
function buildSVGOverlay({ width, height, headline, subheadline, labelText, labelColor }) {
  // Escape XML special chars
  const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Word wrap for headline (split into lines if too long)
  const headlineLines = wordWrap(headline || '', 20);
  const subheadlineLines = wordWrap(subheadline || '', 30);

  // Calculate text positions
  const labelY = height - 280;
  const headlineStartY = height - 230;
  const subStartY = headlineStartY + headlineLines.length * 58 + 15;

  let headlineSVG = '';
  headlineLines.forEach((line, i) => {
    headlineSVG += `<text x="${width / 2}" y="${headlineStartY + i * 58}" text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="50" fill="white"
      stroke="black" stroke-width="1.5"
      filter="url(#shadow)">${esc(line)}</text>`;
  });

  let subSVG = '';
  subheadlineLines.forEach((line, i) => {
    subSVG += `<text x="${width / 2}" y="${subStartY + i * 36}" text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="28" fill="#f0f0f0"
      filter="url(#shadow)">${esc(line)}</text>`;
  });

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0)" />
      <stop offset="50%" stop-color="rgba(0,0,0,0)" />
      <stop offset="75%" stop-color="rgba(0,0,0,0.5)" />
      <stop offset="100%" stop-color="rgba(0,0,0,0.85)" />
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="1" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.7)" />
    </filter>
  </defs>

  <!-- Gradient overlay -->
  <rect width="${width}" height="${height}" fill="url(#grad)" />

  <!-- Label badge -->
  <rect x="${width / 2 - 140}" y="${labelY - 22}" width="280" height="30" rx="4"
    fill="${esc(labelColor)}" opacity="0.9" />
  <text x="${width / 2}" y="${labelY}" text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="16"
    fill="white" letter-spacing="2">${esc(labelText)}</text>

  <!-- Headline -->
  ${headlineSVG}

  <!-- Subheadline -->
  ${subSVG}
</svg>`;
}

/**
 * Word wrap text into lines
 */
function wordWrap(text, maxCharsPerLine) {
  if (!text) return [''];
  const words = text.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxCharsPerLine && current) {
      lines.push(current.trim());
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current.trim()) lines.push(current.trim());

  return lines.length ? lines : [''];
}

/**
 * Get logo position coordinates
 */
function getLogoPosition(position, logoSize, canvasSize) {
  const padding = 20;
  switch (position) {
    case 'top-left':     return { top: padding, left: padding };
    case 'top-right':    return { top: padding, left: canvasSize - logoSize - padding };
    case 'bottom-left':  return { top: canvasSize - logoSize - padding, left: padding };
    case 'bottom-right': return { top: canvasSize - logoSize - padding, left: canvasSize - logoSize - padding };
    default:             return { top: padding, left: canvasSize - logoSize - padding };
  }
}

export default { composeImage };
