import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { getSetting } from './settingsService.js';
import dotenv from 'dotenv';

dotenv.config();

const FB_API_BASE = 'https://graph.facebook.com';
const FB_API_VERSION = process.env.FB_API_VERSION || 'v25.0';

// ============================
// Core: Publish to Facebook Page
// Hỗ trợ: đăng ngay, draft, scheduled
// ============================

/**
 * Publish/Draft/Schedule a post to a Facebook Page
 * @param {Object} params
 * @param {string} params.caption - Nội dung bài viết
 * @param {string} params.imageUrl - URL ảnh (optional, hỗ trợ base64 data URI)
 * @param {string} params.imagePath - Đường dẫn ảnh local (optional)
 * @param {string} params.pageId - Facebook Page ID
 * @param {string} params.accessToken - Page Access Token
 * @param {Object} params.options - Tùy chọn publish
 * @param {boolean} params.options.published - true=đăng ngay (default), false=draft/scheduled
 * @param {string} params.options.unpublishedContentType - 'DRAFT' | 'SCHEDULED'
 * @param {number} params.options.scheduledPublishTime - Unix timestamp (10 phút → 30 ngày)
 */
export async function publishToPage({ caption, imageUrl, imagePath, pageId, accessToken, options = {} }) {
  if (!pageId || !accessToken) {
    throw new Error('Thiếu thông tin Page ID hoặc Access Token');
  }

  const { published = true, unpublishedContentType, scheduledPublishTime } = options;

  // Helper: detect nếu imageUrl là local path (VD: /uploads/xxx.png)
  const isLocalPath = (url) => url && (url.startsWith('/uploads') || url.startsWith('./uploads') || url.startsWith('uploads'));
  const getLocalFilePath = (url) => {
    if (!url) return null;
    // Convert /uploads/xxx.png → ./uploads/xxx.png
    const relativePath = url.startsWith('/') ? `.${url}` : url;
    const fullPath = path.resolve(relativePath);
    return fs.existsSync(fullPath) ? fullPath : null;
  };

  // Nếu imageUrl là local path → convert thành imagePath
  if (isLocalPath(imageUrl)) {
    const localFile = getLocalFilePath(imageUrl);
    if (localFile) {
      imagePath = localFile;
      imageUrl = null; // Clear để đi vào nhánh file upload
      console.log(`[FB] Converting local URL to file path: ${localFile}`);
    } else {
      console.warn(`[FB] Local image not found: ${imageUrl}, posting without image`);
      imageUrl = null;
    }
  }

  try {
    let response;

    // === Helper: 2-step DRAFT post với ảnh ===
    // FB API: photo + published=false → Unpublished Photo (không hiện trong Drafts UI).
    // Đúng cách: upload photo temporary → attach vào feed post với unpublished_content_type=DRAFT.
    const draftPostWithMedia = async (mediaSourceFn) => {
      const FormData = (await import('form-data')).default;

      // Step 1: upload photo as unpublished + temporary
      const photoForm = new FormData();
      mediaSourceFn(photoForm); // append 'source' field
      photoForm.append('published', 'false');
      photoForm.append('temporary', 'true');
      photoForm.append('access_token', accessToken);
      const photoResp = await axios.post(
        `${FB_API_BASE}/${FB_API_VERSION}/${pageId}/photos`,
        photoForm,
        { headers: photoForm.getHeaders(), maxContentLength: Infinity }
      );
      const photoId = photoResp.data.id;
      console.log(`[FB] Step 1/2: temporary photo uploaded ${photoId}`);

      // Step 2: feed post với attached media + DRAFT
      const feedPayload = {
        message: caption || '',
        published: 'false',
        attached_media: JSON.stringify([{ media_fbid: photoId }]),
        access_token: accessToken,
      };
      if (unpublishedContentType) feedPayload.unpublished_content_type = unpublishedContentType;
      if (scheduledPublishTime) feedPayload.scheduled_publish_time = scheduledPublishTime;
      const feedResp = await axios.post(`${FB_API_BASE}/${FB_API_VERSION}/${pageId}/feed`, feedPayload);
      console.log(`[FB] Step 2/2: ${unpublishedContentType || 'unpublished'} feed post created`);
      return feedResp;
    };

    // === Đăng ảnh từ file local ===
    if (imagePath && fs.existsSync(imagePath)) {
      const FormData = (await import('form-data')).default;
      if (!published) {
        // DRAFT/SCHEDULED có ảnh → 2-step để hiện trong Business Suite Drafts
        response = await draftPostWithMedia((form) => {
          form.append('source', fs.createReadStream(imagePath));
        });
      } else {
        // Publish ngay → 1-step photo (hiện luôn trên timeline)
        const url = `${FB_API_BASE}/${FB_API_VERSION}/${pageId}/photos`;
        const form = new FormData();
        form.append('source', fs.createReadStream(imagePath));
        form.append('caption', caption || '');
        form.append('access_token', accessToken);
        response = await axios.post(url, form, { headers: form.getHeaders(), maxContentLength: Infinity });
      }

    } else if (imageUrl && imageUrl.startsWith('data:')) {
      // === Ảnh base64 (từ AI generate) ===
      const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) throw new Error('Invalid base64 image format');
      const buffer = Buffer.from(matches[2], 'base64');
      const ext = matches[1];

      if (!published) {
        response = await draftPostWithMedia((form) => {
          form.append('source', buffer, { filename: `image.${ext}`, contentType: `image/${ext}` });
        });
      } else {
        const url = `${FB_API_BASE}/${FB_API_VERSION}/${pageId}/photos`;
        const FormData = (await import('form-data')).default;
        const form = new FormData();
        form.append('source', buffer, { filename: `image.${ext}`, contentType: `image/${ext}` });
        form.append('caption', caption || '');
        form.append('access_token', accessToken);
        response = await axios.post(url, form, { headers: form.getHeaders(), maxContentLength: Infinity });
      }

    } else if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
      // === Ảnh từ URL public ===
      if (!published) {
        // DRAFT với URL: download về buffer rồi đi qua draftPostWithMedia
        const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const buffer = Buffer.from(imgResp.data);
        const contentType = imgResp.headers['content-type'] || 'image/jpeg';
        const ext = (contentType.match(/image\/(\w+)/)?.[1]) || 'jpg';
        response = await draftPostWithMedia((form) => {
          form.append('source', buffer, { filename: `image.${ext}`, contentType });
        });
      } else {
        const url = `${FB_API_BASE}/${FB_API_VERSION}/${pageId}/photos`;
        const payload = {
          url: imageUrl,
          caption: caption || '',
          access_token: accessToken,
        };
        response = await axios.post(url, payload);
      }

    } else {
      // === Đăng text only (không có ảnh) ===
      const url = `${FB_API_BASE}/${FB_API_VERSION}/${pageId}/feed`;
      const payload = {
        message: caption || '',
        access_token: accessToken,
      };
      if (!published) {
        payload.published = 'false';
        if (unpublishedContentType) payload.unpublished_content_type = unpublishedContentType;
        if (scheduledPublishTime) payload.scheduled_publish_time = scheduledPublishTime;
      }
      response = await axios.post(url, payload);
    }

    console.log(`[FB] ✅ Post ${published ? 'published' : unpublishedContentType || 'unpublished'} to page ${pageId}`);
    return {
      success: true,
      fb_post_id: response.data.id || response.data.post_id,
      data: response.data,
    };
  } catch (err) {
    const fbError = err.response?.data?.error;
    const fbMsg = fbError?.message || err.message;
    const fbCode = fbError?.code;
    const fbSubcode = fbError?.error_subcode;
    console.error(`[FB] ❌ Post failed:`, JSON.stringify({ code: fbCode, subcode: fbSubcode, message: fbMsg }));

    // Translate common errors — include original FB message for debugging
    if (fbMsg.includes('publish_actions') || fbCode === 200) {
      throw new Error(`[FB #${fbCode}] ${fbMsg}\n\n👉 HINT: Token không đủ quyền. Sau khi tick scope mới (pages_manage_posts, pages_read_engagement), PHẢI bấm 'Generate Access Token' lại để tạo token mới. Token cũ KHÔNG tự cập nhật scope. Sau đó đổi sang Page Token và copy vào Settings.`);
    }
    if (fbCode === 190) {
      throw new Error(`[FB #190] ${fbMsg}\n\n👉 Page Access Token hết hạn / không hợp lệ. Cập nhật token mới trong Cài đặt.`);
    }
    if (fbCode === 100) {
      throw new Error(`[FB #100 invalid_param] ${fbMsg}`);
    }
    throw new Error(`[FB${fbCode ? ' #' + fbCode : ''}] ${fbMsg}`);
  }
}

// ============================
// Token Permission Check
// ============================

/**
 * Check token có quyền gì — debug helper.
 * Returns array of permissions strings.
 */
export async function checkTokenPermissions(accessToken) {
  try {
    const resp = await axios.get(`${FB_API_BASE}/${FB_API_VERSION}/me/permissions`, {
      params: { access_token: accessToken },
      timeout: 10000,
    });
    return (resp.data?.data || [])
      .filter(p => p.status === 'granted')
      .map(p => p.permission);
  } catch (err) {
    // Page tokens không support /me/permissions; thử debug_token thay
    try {
      const debugResp = await axios.get(`${FB_API_BASE}/${FB_API_VERSION}/debug_token`, {
        params: { input_token: accessToken, access_token: accessToken },
        timeout: 10000,
      });
      return debugResp.data?.data?.scopes || [];
    } catch {
      throw new Error(err.response?.data?.error?.message || err.message);
    }
  }
}

// ============================
// Token Health Check
// ============================

/**
 * Kiểm tra token còn hợp lệ không
 * @returns {{ valid: boolean, error?: string, page?: object }}
 */
export async function checkTokenValidity(pageId, accessToken) {
  try {
    const response = await axios.get(
      `${FB_API_BASE}/${FB_API_VERSION}/${pageId}`,
      {
        params: { access_token: accessToken, fields: 'name,fan_count,picture{url}' },
        timeout: 10000,
      }
    );
    return { valid: true, page: response.data };
  } catch (err) {
    const fbError = err.response?.data?.error;
    const code = fbError?.code;
    const isExpired = code === 190 || fbError?.error_subcode === 463;
    return {
      valid: false,
      expired: isExpired,
      error: fbError?.message || err.message,
      code,
    };
  }
}

// ============================
// Exchange Token (short → long-lived)
// ============================

/**
 * Đổi Short-lived User Token → Long-lived User Token
 * Cần FB_APP_ID và FB_APP_SECRET
 */
export async function exchangeToken(shortToken) {
  const appId = process.env.FB_APP_ID;
  const appSecret = process.env.FB_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('Chưa cấu hình FB_APP_ID hoặc FB_APP_SECRET');
  }

  const response = await axios.get(`${FB_API_BASE}/${FB_API_VERSION}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken,
    },
  });

  return {
    accessToken: response.data.access_token,
    tokenType: response.data.token_type,
    expiresIn: response.data.expires_in,
  };
}

/**
 * Lấy danh sách Pages từ User Access Token
 */
export async function getUserPages(userAccessToken) {
  const response = await axios.get(`${FB_API_BASE}/${FB_API_VERSION}/me/accounts`, {
    params: {
      access_token: userAccessToken,
      fields: 'id,name,access_token,tasks,picture{url},fan_count',
    },
  });
  return response.data.data || [];
}

// ============================
// Legacy helpers
// ============================

/**
 * Get page info by credentials (for verification)
 */
export async function getPageInfoByCredentials(pageId, accessToken) {
  try {
    const response = await axios.get(
      `${FB_API_BASE}/${FB_API_VERSION}/${pageId}`,
      { params: { access_token: accessToken, fields: 'name,fan_count,picture{url}' } }
    );
    return { connected: true, page: response.data };
  } catch (err) {
    return { connected: false, message: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Legacy: publish using global settings
 */
export async function publishPost({ caption, imageUrl, imagePath }) {
  const pageId = await getSetting('fb_page_id', 'FB_PAGE_ID');
  const accessToken = await getSetting('fb_access_token', 'FB_ACCESS_TOKEN');

  if (!pageId || !accessToken) {
    throw new Error('Chưa cấu hình Facebook. Vui lòng thêm page trong Quản lý Pages.');
  }

  return publishToPage({ caption, imageUrl, imagePath, pageId, accessToken });
}

/**
 * Legacy: get page info
 */
export async function getPageInfo() {
  const pageId = await getSetting('fb_page_id', 'FB_PAGE_ID');
  const accessToken = await getSetting('fb_access_token', 'FB_ACCESS_TOKEN');

  if (!pageId || !accessToken) {
    return { connected: false, message: 'Chưa cấu hình' };
  }

  return getPageInfoByCredentials(pageId, accessToken);
}

export default {
  publishPost,
  publishToPage,
  getPageInfo,
  getPageInfoByCredentials,
  checkTokenValidity,
  exchangeToken,
  getUserPages,
};
