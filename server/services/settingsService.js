import { Setting } from '../models/index.js';

// In-memory cache to avoid hitting DB on every request
let cache = {};
let cacheLoaded = false;

/**
 * Load all settings into cache
 */
export async function loadSettings() {
  try {
    const rows = await Setting.findAll();
    cache = {};
    for (const row of rows) {
      cache[row.key] = row.value;
    }
    cacheLoaded = true;
  } catch (err) {
    console.error('Failed to load settings:', err.message);
  }
}

/**
 * Get a setting value — checks DB cache first, then falls back to .env
 */
export async function getSetting(key, fallbackEnvKey) {
  if (!cacheLoaded) await loadSettings();

  // DB value takes priority
  if (cache[key] && cache[key].trim()) {
    return cache[key];
  }

  // Fall back to .env
  if (fallbackEnvKey && process.env[fallbackEnvKey]) {
    const envVal = process.env[fallbackEnvKey];
    // Skip placeholder values
    if (envVal.startsWith('your_')) return null;
    return envVal;
  }

  return null;
}

/**
 * Set a setting value in DB and update cache
 */
export async function setSetting(key, value, group = 'general') {
  await Setting.upsert({ key, value, group });
  cache[key] = value;
}

/**
 * Get multiple settings at once (for frontend display)
 */
export async function getSettingsByGroup(group) {
  if (!cacheLoaded) await loadSettings();
  const rows = await Setting.findAll({ where: group ? { group } : {} });
  return rows.reduce((acc, r) => {
    acc[r.key] = r.value;
    return acc;
  }, {});
}

/**
 * Invalidate cache (call after bulk updates)
 */
export function invalidateCache() {
  cacheLoaded = false;
  cache = {};
}

export default { loadSettings, getSetting, setSetting, getSettingsByGroup, invalidateCache };
