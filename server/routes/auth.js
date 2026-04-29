import { Router } from 'express';
import { login, logout, changePassword, requireAuth } from '../services/authService.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, error: 'Vui lòng nhập mật khẩu' });

    const token = await login(password);
    res.json({ success: true, data: { token } });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) logout(token);
  res.json({ success: true });
});

// POST /api/auth/change-password  (requires auth)
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    await changePassword(current_password, new_password);
    res.json({ success: true, message: 'Đã đổi mật khẩu thành công' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/auth/verify  (check if token is still valid)
router.get('/verify', requireAuth, (req, res) => {
  res.json({ success: true });
});

export default router;
