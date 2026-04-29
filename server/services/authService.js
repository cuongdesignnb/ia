import crypto from 'crypto';
import { getSetting, setSetting } from '../services/settingsService.js';

// In-memory session tokens (cleared on server restart)
const activeSessions = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Seed the default admin password if none exists
 */
export async function seedAdminPassword() {
  const existing = await getSetting('admin_password');
  if (!existing) {
    // Default password: admin123 — user should change this immediately
    await setSetting('admin_password', hashPassword('admin123'), 'auth');
    console.log('Default admin password set (admin123). Please change it!');
  }
}

/**
 * Verify login credentials, return session token
 */
export async function login(password) {
  const stored = await getSetting('admin_password');
  if (!stored) throw new Error('Chưa thiết lập mật khẩu admin');

  if (hashPassword(password) !== stored) {
    throw new Error('Mật khẩu không chính xác');
  }

  const token = crypto.randomUUID();
  activeSessions.set(token, { createdAt: Date.now() });
  return token;
}

/**
 * Change admin password
 */
export async function changePassword(currentPassword, newPassword) {
  const stored = await getSetting('admin_password');
  if (hashPassword(currentPassword) !== stored) {
    throw new Error('Mật khẩu hiện tại không chính xác');
  }
  if (newPassword.length < 4) {
    throw new Error('Mật khẩu mới phải có ít nhất 4 ký tự');
  }
  await setSetting('admin_password', hashPassword(newPassword), 'auth');
}

/**
 * Validate a session token
 */
export function validateToken(token) {
  if (!token) return false;
  const session = activeSessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

/**
 * Logout (invalidate token)
 */
export function logout(token) {
  activeSessions.delete(token);
}

/**
 * Express middleware — require auth
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!validateToken(token)) {
    return res.status(401).json({ success: false, error: 'Phiên đăng nhập đã hết hạn' });
  }
  next();
}

export default { seedAdminPassword, login, changePassword, validateToken, logout, requireAuth };
