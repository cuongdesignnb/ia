import { Router } from 'express';
import axios from 'axios';
import { FbPage, Post } from '../models/index.js';
import { requireAuth } from '../services/authService.js';

const router = Router();
const FB_API_BASE = 'https://graph.facebook.com';
const FB_API_VERSION = process.env.FB_API_VERSION || 'v25.0';

function maskToken(token) {
  if (!token || token.length < 12) return '••••••••';
  return token.slice(0, 6) + '••••••' + token.slice(-4);
}

// All routes require auth
router.use(requireAuth);

// GET /api/fb-pages — list all pages
router.get('/', async (req, res) => {
  try {
    const pages = await FbPage.findAll({
      order: [['created_at', 'ASC']],
      attributes: { exclude: ['access_token'] },
    });

    // Count posts per page
    const result = [];
    for (const page of pages) {
      const postCount = await Post.count({ where: { fb_page_id: page.id } });
      result.push({ ...page.toJSON(), post_count: postCount, access_token_masked: maskToken(page.getDataValue('access_token')) });
    }

    // Re-query to get masked tokens
    const pagesRaw = await FbPage.findAll({ order: [['created_at', 'ASC']] });
    const final = pagesRaw.map(p => {
      const found = result.find(r => r.id === p.id);
      return {
        ...p.toJSON(),
        access_token: undefined,
        access_token_masked: maskToken(p.access_token),
        post_count: found?.post_count || 0,
      };
    });

    res.json({ success: true, data: final });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fb-pages/:id — get single page
router.get('/:id', async (req, res) => {
  try {
    const page = await FbPage.findByPk(req.params.id);
    if (!page) return res.status(404).json({ success: false, error: 'Không tìm thấy page' });
    res.json({
      success: true,
      data: { ...page.toJSON(), access_token: undefined, access_token_masked: maskToken(page.access_token) },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fb-pages — add new page (auto verify)
router.post('/', async (req, res) => {
  try {
    const { page_id, access_token, color } = req.body;
    if (!page_id || !access_token) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập Page ID và Access Token' });
    }

    // Verify with Facebook Graph API
    let pageInfo;
    try {
      const fbRes = await axios.get(`${FB_API_BASE}/${FB_API_VERSION}/${page_id}`, {
        params: { access_token, fields: 'name,fan_count,picture{url}' },
      });
      pageInfo = fbRes.data;
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      return res.status(400).json({ success: false, error: `Không thể xác minh page: ${msg}` });
    }

    // Check duplicate
    const existing = await FbPage.findOne({ where: { page_id } });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Page này đã được thêm trước đó' });
    }

    const page = await FbPage.create({
      name: pageInfo.name || `Page ${page_id}`,
      page_id,
      access_token,
      avatar_url: pageInfo.picture?.data?.url || null,
      fan_count: pageInfo.fan_count || 0,
      color: color || '#6366f1',
      is_active: true,
      last_synced: new Date(),
    });

    res.status(201).json({
      success: true,
      data: { ...page.toJSON(), access_token: undefined, access_token_masked: maskToken(access_token) },
      message: `Đã thêm page "${pageInfo.name}" thành công`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/fb-pages/:id — update page
router.put('/:id', async (req, res) => {
  try {
    const page = await FbPage.findByPk(req.params.id);
    if (!page) return res.status(404).json({ success: false, error: 'Không tìm thấy page' });

    const { access_token, color, is_active, name } = req.body;
    const updates = {};
    if (color !== undefined) updates.color = color;
    if (is_active !== undefined) updates.is_active = is_active;
    if (name !== undefined) updates.name = name;

    // If new access_token provided, verify it
    if (access_token && access_token.trim()) {
      try {
        const fbRes = await axios.get(`${FB_API_BASE}/${FB_API_VERSION}/${page.page_id}`, {
          params: { access_token, fields: 'name,fan_count,picture{url}' },
        });
        updates.access_token = access_token;
        updates.name = fbRes.data.name || page.name;
        updates.avatar_url = fbRes.data.picture?.data?.url || page.avatar_url;
        updates.fan_count = fbRes.data.fan_count || page.fan_count;
        updates.last_synced = new Date();
      } catch (err) {
        return res.status(400).json({ success: false, error: `Token không hợp lệ: ${err.response?.data?.error?.message || err.message}` });
      }
    }

    await page.update(updates);
    res.json({
      success: true,
      data: { ...page.toJSON(), access_token: undefined, access_token_masked: maskToken(page.access_token) },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/fb-pages/:id
router.delete('/:id', async (req, res) => {
  try {
    const page = await FbPage.findByPk(req.params.id);
    if (!page) return res.status(404).json({ success: false, error: 'Không tìm thấy page' });

    const postCount = await Post.count({ where: { fb_page_id: page.id } });
    if (postCount > 0) {
      return res.status(400).json({ success: false, error: `Không thể xoá: page này có ${postCount} bài viết. Hãy xoá hoặc chuyển bài viết trước.` });
    }

    await page.destroy();
    res.json({ success: true, message: `Đã xoá page "${page.name}"` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fb-pages/:id/sync — re-sync page info from Facebook
router.post('/:id/sync', async (req, res) => {
  try {
    const page = await FbPage.findByPk(req.params.id);
    if (!page) return res.status(404).json({ success: false, error: 'Không tìm thấy page' });

    const fbRes = await axios.get(`${FB_API_BASE}/${FB_API_VERSION}/${page.page_id}`, {
      params: { access_token: page.access_token, fields: 'name,fan_count,picture{url}' },
    });

    await page.update({
      name: fbRes.data.name || page.name,
      avatar_url: fbRes.data.picture?.data?.url || page.avatar_url,
      fan_count: fbRes.data.fan_count || page.fan_count,
      last_synced: new Date(),
      token_status: 'valid',
      token_checked_at: new Date(),
    });

    res.json({ success: true, data: { ...page.toJSON(), access_token: undefined }, message: 'Đã đồng bộ thành công' });
  } catch (err) {
    // Nếu sync lỗi → token có vấn đề
    const page = await FbPage.findByPk(req.params.id);
    if (page) {
      const fbError = err.response?.data?.error;
      const isExpired = fbError?.code === 190;
      await page.update({
        token_status: isExpired ? 'expired' : 'error',
        token_checked_at: new Date(),
      });
    }
    res.status(500).json({ success: false, error: `Lỗi đồng bộ: ${err.response?.data?.error?.message || err.message}` });
  }
});

// POST /api/fb-pages/:id/check-token — Kiểm tra token có hợp lệ
router.post('/:id/check-token', async (req, res) => {
  try {
    const page = await FbPage.findByPk(req.params.id);
    if (!page) return res.status(404).json({ success: false, error: 'Không tìm thấy page' });

    const { checkTokenValidity } = await import('../services/facebookService.js');
    const result = await checkTokenValidity(page.page_id, page.access_token);

    await page.update({
      token_status: result.valid ? 'valid' : (result.expired ? 'expired' : 'error'),
      token_checked_at: new Date(),
    });

    res.json({
      success: true,
      data: {
        valid: result.valid,
        token_status: result.valid ? 'valid' : (result.expired ? 'expired' : 'error'),
        error: result.error || null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fb-pages/check-all-tokens — Kiểm tra tất cả tokens
router.post('/check-all-tokens', async (req, res) => {
  try {
    const pages = await FbPage.findAll({ where: { is_active: true } });
    const { checkTokenValidity } = await import('../services/facebookService.js');

    const results = [];
    for (const page of pages) {
      const result = await checkTokenValidity(page.page_id, page.access_token);
      const status = result.valid ? 'valid' : (result.expired ? 'expired' : 'error');
      await page.update({ token_status: status, token_checked_at: new Date() });
      results.push({ id: page.id, name: page.name, token_status: status, error: result.error });
    }

  res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fb-pages/:id/exchange-token — Đổi token ngắn hạn → dài hạn
// Body (optional): { token: "new_short_lived_token" }
router.post('/:id/exchange-token', async (req, res) => {
  try {
    const page = await FbPage.findByPk(req.params.id);
    if (!page) return res.status(404).json({ success: false, error: 'Không tìm thấy page' });

    const appId = process.env.FB_APP_ID;
    const appSecret = process.env.FB_APP_SECRET;
    if (!appId || !appSecret || appId.startsWith('your_') || appSecret.startsWith('your_')) {
      return res.status(400).json({
        success: false,
        error: 'Chưa cấu hình FB_APP_ID hoặc FB_APP_SECRET. Vào Cài đặt → Cấu hình Facebook → nhập App ID và App Secret.',
      });
    }

    // Cho phép user truyền token mới qua body (thay vì dùng token cũ đã expired)
    const inputToken = req.body.token?.trim() || page.access_token;
    if (!inputToken) {
      return res.status(400).json({
        success: false,
        error: 'Không có token nào để exchange. Hãy nhập token mới vào ô bên dưới.',
      });
    }

    const { exchangeToken, checkTokenValidity } = await import('../services/facebookService.js');

    // Bước 0: Check token có hợp lệ không trước khi exchange
    const checkResult = await checkTokenValidity(inputToken, page.page_id);
    if (!checkResult.valid) {
      // Token hết hạn hoặc không hợp lệ
      const hint = checkResult.expired
        ? 'Token đã hết hạn. Hãy lấy token MỚI từ Graph API Explorer rồi paste vào ô bên dưới.'
        : `Token không hợp lệ: ${checkResult.error}`;
      return res.status(400).json({ success: false, error: hint });
    }

    // Bước 1: Exchange user token → long-lived user token
    let longLivedResult;
    try {
      longLivedResult = await exchangeToken(inputToken);
    } catch (err) {
      const fbErr = err.response?.data?.error;
      const msg = fbErr?.message || err.message;

      // Phân tích lỗi cụ thể để hướng dẫn
      if (msg.includes('does not belong to application')) {
        return res.status(400).json({
          success: false,
          error: `Token này được tạo từ một app khác (không phải App ID: ${appId}). `
            + `Hãy vào Graph API Explorer → chọn đúng app "${appId}" → tạo token mới → paste vào đây.`,
        });
      }
      return res.status(400).json({
        success: false,
        error: `Đổi token lỗi: ${msg}`,
      });
    }

    // Bước 2: Dùng long-lived user token để lấy Page Access Token (sẽ là long-lived)
    let pageToken = longLivedResult.accessToken;
    try {
      const pagesRes = await axios.get(`${FB_API_BASE}/${FB_API_VERSION}/me/accounts`, {
        params: { access_token: longLivedResult.accessToken, fields: 'id,name,access_token' },
      });
      const matchedPage = (pagesRes.data.data || []).find(p => p.id === page.page_id);
      if (matchedPage) {
        pageToken = matchedPage.access_token; // Page Access Token dài hạn (never expires nếu user không revoke)
        console.log(`[FB] Got long-lived Page Token for ${matchedPage.name}`);
      } else {
        console.warn(`[FB] Page ${page.page_id} not found in user's pages, using long-lived user token instead`);
      }
    } catch (e) {
      console.warn('[FB] Could not get page-specific token:', e.message);
    }

    // Bước 3: Verify token mới
    const verifyRes = await axios.get(`${FB_API_BASE}/${FB_API_VERSION}/${page.page_id}`, {
      params: { access_token: pageToken, fields: 'name,fan_count,picture{url}' },
    });

    // Bước 4: Update DB
    await page.update({
      access_token: pageToken,
      name: verifyRes.data.name || page.name,
      avatar_url: verifyRes.data.picture?.data?.url || page.avatar_url,
      fan_count: verifyRes.data.fan_count || page.fan_count,
      token_status: 'valid',
      token_checked_at: new Date(),
      last_synced: new Date(),
    });

    const expiresIn = longLivedResult.expiresIn;
    const expiresLabel = expiresIn ? `${Math.round(expiresIn / 86400)} ngày` : 'Không giới hạn (Page Token)';

    res.json({
      success: true,
      message: `✅ Đã đổi token dài hạn thành công! Hạn sử dụng: ${expiresLabel}`,
      data: {
        expires_in: expiresIn,
        expires_label: expiresLabel,
        token_masked: maskToken(pageToken),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.error?.message || err.message });
  }
});

export default router;

