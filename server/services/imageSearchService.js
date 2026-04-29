/**
 * Image Search Service
 * Tìm ảnh tư liệu từ Wikimedia Commons + Unsplash
 * Download + lưu vào MediaFile
 */
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { MediaFile, MediaFolder } from '../models/index.js';
import { getSetting } from './settingsService.js';
import { generateImage as aiGenerateImage } from './aiService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_BASE = path.join(__dirname, '..', '..', 'uploads', 'media');

/**
 * Search and download images for a story
 * @param {Object} story - TrueStory record
 * @param {string} searchKeywords - English keywords for search
 * @param {number} maxImages - Max images to download (default 5)
 * @returns {Array<MediaFile>} downloaded media files
 */
export async function searchAndDownloadImages(story, searchKeywords, maxImages = 5) {
  const results = [];

  // Create folder for this story
  const folder = await getOrCreateStoryFolder(story);

  // 1. Search Wikimedia Commons
  try {
    const wikiImages = await searchWikimedia(searchKeywords, 3);
    for (const img of wikiImages) {
      if (results.length >= maxImages) break;
      try {
        const mediaFile = await downloadAndSaveImage(img, folder.id, story.id);
        if (mediaFile) results.push(mediaFile);
      } catch (err) {
        console.error(`[ImageSearch] Wikimedia download failed:`, err.message);
      }
    }
  } catch (err) {
    console.error('[ImageSearch] Wikimedia search failed:', err.message);
  }

  // 2. Search Unsplash
  const unsplashKey = await getSetting('unsplash_api_key');
  if (unsplashKey) {
    try {
      const unsplashImages = await searchUnsplash(searchKeywords, unsplashKey, 3);
      for (const img of unsplashImages) {
        if (results.length >= maxImages) break;
        try {
          const mediaFile = await downloadAndSaveImage(img, folder.id, story.id);
          if (mediaFile) results.push(mediaFile);
        } catch (err) {
          console.error(`[ImageSearch] Unsplash download failed:`, err.message);
        }
      }
    } catch (err) {
      console.error('[ImageSearch] Unsplash search failed:', err.message);
    }
  }

  if (results.length === 0) {
    console.warn(`[ImageSearch] No images found for: ${searchKeywords}`);
  }

  return results;
}

/**
 * Search Wikimedia Commons API
 */
async function searchWikimedia(query, limit = 5) {
  const url = 'https://commons.wikimedia.org/w/api.php';
  const resp = await axios.get(url, {
    params: {
      action: 'query',
      generator: 'images',
      titles: query,
      gimlimit: limit,
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|size|mime',
      format: 'json',
      origin: '*',
    },
    timeout: 15000,
  });

  // Also try search endpoint for better results
  const searchResp = await axios.get(url, {
    params: {
      action: 'query',
      list: 'search',
      srsearch: `${query} filetype:bitmap`,
      srnamespace: 6, // File namespace
      srlimit: limit,
      format: 'json',
      origin: '*',
    },
    timeout: 15000,
  });

  const results = [];
  const pages = searchResp.data?.query?.search || [];

  for (const page of pages.slice(0, limit)) {
    try {
      const infoResp = await axios.get(url, {
        params: {
          action: 'query',
          titles: page.title,
          prop: 'imageinfo',
          iiprop: 'url|extmetadata|size|mime',
          format: 'json',
          origin: '*',
        },
        timeout: 10000,
      });

      const infoPages = infoResp.data?.query?.pages || {};
      for (const p of Object.values(infoPages)) {
        const info = p.imageinfo?.[0];
        if (!info || !info.url) continue;
        if (!info.mime?.startsWith('image/')) continue;
        // Skip SVGs and small images
        if (info.mime === 'image/svg+xml') continue;
        if (info.size && info.size < 10000) continue;

        const ext = info.url.match(/\.(\w+)$/)?.[1] || 'jpg';
        const license = extractWikiLicense(info.extmetadata);

        results.push({
          url: info.url,
          source_url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
          license_type: license.type,
          author: license.author,
          attribution_text: license.attribution,
          original_name: page.title.replace('File:', '') || `wikimedia_${uuidv4()}.${ext}`,
        });
      }
    } catch { /* skip this image */ }
  }

  return results;
}

function extractWikiLicense(extmetadata) {
  if (!extmetadata) return { type: 'Unknown', author: 'Unknown', attribution: '' };

  const license = extmetadata.LicenseShortName?.value || 'Unknown';
  const author = extmetadata.Artist?.value?.replace(/<[^>]*>/g, '').trim() || 'Unknown';
  const attribution = `${author} / Wikimedia Commons / ${license}`;

  return { type: license, author, attribution };
}

/**
 * Search Unsplash API
 */
async function searchUnsplash(query, apiKey, limit = 5) {
  const resp = await axios.get('https://api.unsplash.com/search/photos', {
    params: {
      query,
      per_page: limit,
      orientation: 'squarish',
    },
    headers: { Authorization: `Client-ID ${apiKey}` },
    timeout: 15000,
  });

  return (resp.data?.results || []).map(photo => ({
    url: photo.urls?.regular || photo.urls?.full,
    source_url: photo.links?.html,
    license_type: 'Unsplash License',
    author: photo.user?.name || 'Unknown',
    attribution_text: `Photo by ${photo.user?.name || 'Unknown'} on Unsplash`,
    original_name: `unsplash_${photo.id}.jpg`,
  }));
}

/**
 * Download image and save to MediaFile
 */
async function downloadAndSaveImage(imageInfo, folderId, storyId) {
  const { url, source_url, license_type, author, attribution_text, original_name } = imageInfo;

  // Download
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    maxContentLength: 20 * 1024 * 1024,
  });

  const buffer = Buffer.from(response.data);

  // Determine extension
  const contentType = response.headers['content-type'] || 'image/jpeg';
  const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
  const ext = extMap[contentType] || '.jpg';
  const filename = `${uuidv4()}${ext}`;

  // Save to disk
  const now = new Date();
  const dir = path.join(UPLOAD_BASE, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);

  // Get dimensions
  let width = null, height = null;
  try {
    const meta = await sharp(filePath).metadata();
    width = meta.width;
    height = meta.height;
  } catch { /* ignore */ }

  // Create thumbnail
  let thumbRelative = null;
  try {
    const thumbName = `thumb_${filename}`;
    const thumbPath = path.join(dir, thumbName);
    await sharp(filePath).resize(300, 300, { fit: 'cover' }).toFile(thumbPath);
    thumbRelative = '/' + path.relative(path.join(__dirname, '..', '..'), thumbPath).replace(/\\/g, '/');
  } catch { /* ignore */ }

  const relativePath = '/' + path.relative(path.join(__dirname, '..', '..'), filePath).replace(/\\/g, '/');

  // Save to DB
  const mediaFile = await MediaFile.create({
    folder_id: folderId,
    story_id: storyId,
    filename,
    original_name: original_name || filename,
    mime_type: contentType,
    path: relativePath,
    thumbnail_path: thumbRelative,
    size: buffer.length,
    width,
    height,
    source_url,
    license_type,
    author,
    attribution_text,
    uploaded_by: 'auto_story',
  });

  return mediaFile;
}

/**
 * Fallback: generate an AI image when no real photo found.
 * Saves to MediaFile in the same story folder so it can be used as source for composeImage.
 */
export async function generateAIImageForStory(story) {
  const folder = await getOrCreateStoryFolder(story);

  const subject = story.title || story.title_vi || 'documentary subject';
  const summary = (story.summary || '').slice(0, 200);
  const prompt = `Editorial documentary photograph illustrating: ${subject}. ${summary} Cinematic lighting, photojournalistic style, realistic, high detail, 4k. No text, no watermark, no logo.`;

  console.log(`[ImageSearch] AI fallback prompt: ${subject}`);

  let aiResult;
  try {
    aiResult = await aiGenerateImage({ product: subject, customPrompt: prompt });
  } catch (err) {
    console.error('[ImageSearch] AI image generation failed:', err.message);
    return null;
  }
  if (!aiResult?.url) return null;

  // Decode b64 or download URL into a buffer
  let buffer, contentType;
  try {
    if (aiResult.isBase64 || aiResult.url.startsWith('data:')) {
      const m = aiResult.url.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) throw new Error('Invalid base64 data url');
      contentType = m[1];
      buffer = Buffer.from(m[2], 'base64');
    } else {
      const resp = await axios.get(aiResult.url, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: 20 * 1024 * 1024,
      });
      buffer = Buffer.from(resp.data);
      contentType = resp.headers['content-type'] || 'image/png';
    }
  } catch (err) {
    console.error('[ImageSearch] AI image fetch/decode failed:', err.message);
    return null;
  }

  const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
  const ext = extMap[contentType] || '.png';
  const filename = `ai_${uuidv4()}${ext}`;

  const now = new Date();
  const dir = path.join(UPLOAD_BASE, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);

  let width = null, height = null;
  try {
    const meta = await sharp(filePath).metadata();
    width = meta.width;
    height = meta.height;
  } catch { /* ignore */ }

  let thumbRelative = null;
  try {
    const thumbName = `thumb_${filename}`;
    const thumbPath = path.join(dir, thumbName);
    await sharp(filePath).resize(300, 300, { fit: 'cover' }).toFile(thumbPath);
    thumbRelative = '/' + path.relative(path.join(__dirname, '..', '..'), thumbPath).replace(/\\/g, '/');
  } catch { /* ignore */ }

  const relativePath = '/' + path.relative(path.join(__dirname, '..', '..'), filePath).replace(/\\/g, '/');

  const mediaFile = await MediaFile.create({
    folder_id: folder.id,
    story_id: story.id,
    filename,
    original_name: filename,
    mime_type: contentType,
    path: relativePath,
    thumbnail_path: thumbRelative,
    size: buffer.length,
    width,
    height,
    license_type: `AI Generated (${aiResult.model || 'unknown'})`,
    author: 'AI',
    attribution_text: `Generated by ${aiResult.model || 'AI'}`,
    uploaded_by: 'auto_story_ai',
    tags: ['ai-generated', 'fallback'],
  });

  console.log(`[ImageSearch] ✅ AI image saved: ${relativePath} (${aiResult.model})`);
  return mediaFile;
}

/**
 * Get or create a folder for a story
 */
async function getOrCreateStoryFolder(story) {
  // Find/create parent "Auto Stories"
  let parent = await MediaFolder.findOne({ where: { slug: 'auto-stories' } });
  if (!parent) {
    parent = await MediaFolder.create({ name: 'Auto Stories', slug: 'auto-stories', parent_id: null });
  }

  // Find/create story subfolder
  const storySlug = `story-${story.id}`;
  let folder = await MediaFolder.findOne({ where: { slug: storySlug } });
  if (!folder) {
    folder = await MediaFolder.create({
      name: story.title_vi || story.title,
      slug: storySlug,
      parent_id: parent.id,
    });
  }

  return folder;
}

export default { searchAndDownloadImages, generateAIImageForStory };
