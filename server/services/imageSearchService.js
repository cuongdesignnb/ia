/**
 * Image Search Service
 * Tìm ảnh tư liệu từ Wikimedia Commons + Unsplash
 * Download + lưu vào MediaFile
 */
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import OpenAI from 'openai';
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

  // Determine extension — reject non-image responses (HTML pages, redirects, etc.)
  const contentType = (response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!contentType.startsWith('image/')) {
    throw new Error(`Not an image response (content-type: ${contentType || 'unknown'})`);
  }
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
 * Tìm URL ảnh qua DuckDuckGo Images (scrape, không cần API key).
 * Pattern: lấy vqd token từ HTML → gọi i.js trả JSON.
 * @param {string} query
 * @param {number} maxResults
 * @returns {Array<{url, source_url, source, title}>}
 */
async function searchDuckDuckGoImages(query, maxResults = 5) {
  try {
    const initResp = await axios.get('https://duckduckgo.com/', {
      params: { q: query, iax: 'images', ia: 'images' },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
      timeout: 15000,
    });

    const vqdMatch = initResp.data.match(/vqd=['"]?(\d+-\d+(?:-\d+)?)['"]?/);
    if (!vqdMatch) {
      console.warn('[DDG] No vqd token in response');
      return [];
    }
    const vqd = vqdMatch[1];

    const searchResp = await axios.get('https://duckduckgo.com/i.js', {
      params: {
        l: 'us-en',
        o: 'json',
        q: query,
        vqd,
        f: ',,,size:Large',
        p: '1',
        v7exp: 'a',
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Referer': 'https://duckduckgo.com/',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
      },
      timeout: 20000,
    });

    const results = searchResp.data?.results || [];
    return results.slice(0, maxResults).map(r => ({
      url: r.image,
      source_url: r.url || r.image,
      source: r.source || extractDomain(r.url),
      title: r.title || '',
    }));
  } catch (err) {
    console.error('[DDG] Search failed:', err.message);
    return [];
  }
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'web'; }
}

/**
 * Tìm ảnh thật qua DuckDuckGo (free, không tốn API).
 * @param {Object} story
 * @param {number} maxImages
 * @returns {Array<MediaFile>}
 */
export async function searchImagesViaDDG(story, maxImages = 3) {
  const folder = await getOrCreateStoryFolder(story);

  // Build search query: title + event_date year + location
  const queryParts = [story.title || story.title_vi];
  if (story.event_date) {
    const year = String(story.event_date).slice(0, 4);
    if (/^\d{4}$/.test(year)) queryParts.push(year);
  }
  if (story.location) queryParts.push(story.location);
  const query = queryParts.filter(Boolean).join(' ');

  console.log(`[DDG] Searching: "${query}"`);
  const candidates = await searchDuckDuckGoImages(query, 8);
  console.log(`[DDG] Found ${candidates.length} candidate URLs`);

  const results = [];
  for (const c of candidates) {
    if (results.length >= maxImages) break;
    if (!c.url) continue;
    try {
      const ext = (c.url.match(/\.(jpg|jpeg|png|webp)(?:\?|$)/i)?.[1] || 'jpg').toLowerCase();
      const mediaFile = await downloadAndSaveImage({
        url: c.url,
        source_url: c.source_url,
        license_type: c.source || 'Web (DuckDuckGo)',
        author: c.source || 'Unknown',
        attribution_text: `${c.title || ''} — ${c.source || 'web'} (via DuckDuckGo)`.trim(),
        original_name: `ddg_${uuidv4()}.${ext}`,
      }, folder.id, story.id);
      if (mediaFile) results.push(mediaFile);
    } catch (err) {
      console.warn(`[DDG] Skip ${c.url}: ${err.message}`);
    }
  }
  console.log(`[DDG] ✅ Downloaded ${results.length}/${candidates.length}`);
  return results;
}

/**
 * Tìm ảnh thật qua GPT-5 + web_search tool (OpenAI Responses API).
 * @deprecated Replaced by searchImagesViaDDG (free). Giữ lại nếu user muốn switch.
 * @param {Object} story - TrueStory record
 * @param {number} maxImages
 * @returns {Array<MediaFile>}
 */
export async function searchRealImagesViaWeb(story, maxImages = 3) {
  const apiKey = await getSetting('openai_api_key', 'OPENAI_API_KEY');
  if (!apiKey) {
    console.warn('[ImageSearch] No OpenAI key — skipping web search');
    return [];
  }

  const folder = await getOrCreateStoryFolder(story);
  const client = new OpenAI({ apiKey, timeout: 120000 });
  const model = await getSetting('web_image_search_model') || 'gpt-5-mini';

  const eventLine = [
    story.title,
    story.event_date && `(${story.event_date})`,
    story.location,
  ].filter(Boolean).join(' — ');

  const prompt = `Tìm ${maxImages} URL ảnh thật chất lượng cao về sự kiện sau, dùng web_search:

Sự kiện: ${eventLine}
Tóm tắt: ${(story.summary || '').slice(0, 300)}

YÊU CẦU NGHIÊM NGẶT:
1. URL phải trỏ TRỰC TIẾP đến file ảnh, kết thúc bằng .jpg/.jpeg/.png/.webp (không phải URL trang Wikipedia/article).
   - Đúng: https://upload.wikimedia.org/wikipedia/commons/.../File.jpg
   - SAI: https://en.wikipedia.org/wiki/Article_Name
2. Nguồn uy tín: Wikimedia Commons, Wikipedia, NASA, BBC, Reuters, AP, AFP, National Geographic, public domain archives.
3. Ảnh phải LIÊN QUAN TRỰC TIẾP đến sự kiện cụ thể (không phải minh hoạ chung chung).
4. Ưu tiên ảnh độ phân giải cao (>= 1200px).
5. KHÔNG dùng ảnh có watermark "preview", thumbnail, hoặc ảnh từ Getty/Shutterstock có paywall.

CHỈ TRẢ VỀ JSON ARRAY (không text khác, không markdown fence):
[
  {"url": "https://...", "source": "Wikimedia Commons", "description": "Khoảnh khắc..."},
  ...
]`;

  let raw = '';
  try {
    const response = await client.responses.create({
      model,
      tools: [{ type: 'web_search_preview' }],
      input: prompt,
    });
    raw = response.output_text || '';
  } catch (err) {
    console.error('[ImageSearch] Web search call failed:', err.message);
    return [];
  }

  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) {
    console.warn('[ImageSearch] Web search returned no JSON');
    return [];
  }

  let candidates;
  try {
    candidates = JSON.parse(match[0]);
    if (!Array.isArray(candidates)) return [];
  } catch (err) {
    console.error('[ImageSearch] Web search JSON parse failed:', err.message);
    return [];
  }

  console.log(`[ImageSearch] Web search found ${candidates.length} candidate URLs`);

  const results = [];
  for (const c of candidates) {
    if (!c?.url || typeof c.url !== 'string') continue;
    if (results.length >= maxImages) break;
    try {
      const mediaFile = await downloadAndSaveImage({
        url: c.url,
        source_url: c.url,
        license_type: c.source || 'Web',
        author: c.source || 'Unknown',
        attribution_text: `${c.description || ''} — Source: ${c.source || 'web'} (via GPT web search)`.trim(),
        original_name: `web_${uuidv4()}.jpg`,
      }, folder.id, story.id);
      if (mediaFile) results.push(mediaFile);
    } catch (err) {
      console.warn(`[ImageSearch] Web URL download skipped: ${err.message} — ${c.url}`);
    }
  }

  console.log(`[ImageSearch] ✅ Web search downloaded ${results.length}/${candidates.length} images`);
  return results;
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

  let mediaFile;
  try {
    mediaFile = await MediaFile.create({
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
      uploaded_by: 'auto_story', // ENUM: chỉ user|system|auto_story
      tags: ['ai-generated', 'fallback'],
    });
  } catch (err) {
    console.error('[ImageSearch] AI image DB save failed:', err.message);
    return null;
  }

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

export default { searchAndDownloadImages, generateAIImageForStory, searchRealImagesViaWeb };
