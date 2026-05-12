/**
 * Research Service — đi tìm câu chuyện CÓ THẬT trên internet.
 *
 * Provider order: Tavily → SerpAPI → Google CSE → Bing → Wikipedia fallback.
 * Nếu KHÔNG provider nào được cấu hình → throw lỗi rõ ràng để route trả 400.
 * KHÔNG được fallback sang chế độ "AI tự bịa".
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { getSetting } from './settingsService.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Domains lowest-quality / nội dung user-generated quá rác → loại bớt
const BLOCKED_HOSTS = new Set([
  'pinterest.com',
  'tiktok.com',
  'facebook.com',
  'x.com',
  'twitter.com',
]);

async function getKey(name, envName) {
  return await getSetting(name, envName);
}

export async function getResearchProviders() {
  const [tavily, serp, gcse, gcx, bing] = await Promise.all([
    getKey('tavily_api_key', 'TAVILY_API_KEY'),
    getKey('serpapi_api_key', 'SERPAPI_API_KEY'),
    getKey('google_search_api_key', 'GOOGLE_SEARCH_API_KEY'),
    getKey('google_search_cx', 'GOOGLE_SEARCH_CX'),
    getKey('bing_search_api_key', 'BING_SEARCH_API_KEY'),
  ]);
  return {
    tavily: !!tavily,
    serpapi: !!serp,
    google: !!gcse && !!gcx,
    bing: !!bing,
    wikipedia: true, // luôn available, dùng cho fallback chuyện lịch sử
    any: !!(tavily || serp || (gcse && gcx) || bing),
  };
}

/* ------------------------------------------------------------------
 * Query builder — sinh nhiều query khác nhau để tăng coverage
 * ------------------------------------------------------------------ */
const CONTENT_TYPE_HINTS = {
  mystery: ['unsolved mystery', 'real mystery case', 'true mystery story'],
  missing: ['mysterious disappearance', 'missing person mystery', 'unsolved disappearance'],
  cold_case: ['unsolved case', 'cold case true story', 'unresolved investigation'],
  strange_history: ['strange historical event', 'lesser known history', 'shocking history'],
  discovery: ['strange scientific discovery', 'unusual archaeological find', 'unexplained discovery'],
  character: ['extraordinary person true story', 'unusual life story', 'remarkable individual'],
  emotional: ['heartwarming true story', 'touching real story'],
  weird_world: ['strange news', 'weird true story', 'bizarre event'],
};

function buildQueries({ topic, content_type, country, language }) {
  if (!topic) return [];
  const hints = CONTENT_TYPE_HINTS[content_type] || ['true story', 'real case'];
  const en = [
    `${topic} true story`,
    `${topic} ${hints[0]}`,
    `${hints[1] || hints[0]} ${country || ''}`.trim(),
    `${topic} real case ${country || ''}`.trim(),
  ];
  const vi = [
    `${topic} có thật`,
    `${topic} bí ẩn có thật`,
    `câu chuyện ${topic} ${country || ''}`.trim(),
  ];
  let queries;
  if (language === 'vi') queries = vi;
  else if (language === 'en') queries = en;
  else queries = [...en, ...vi]; // auto
  return [...new Set(queries.filter((q) => q && q.length > 3))].slice(0, 6);
}

/* ------------------------------------------------------------------
 * Provider implementations
 * ------------------------------------------------------------------ */

async function searchTavily(query, key, { count = 10 } = {}) {
  const res = await axios.post(
    'https://api.tavily.com/search',
    {
      api_key: key,
      query,
      search_depth: 'advanced',
      max_results: Math.min(count, 10),
      include_answer: false,
    },
    { timeout: 20000 }
  );
  return (res.data?.results || []).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || r.snippet || '',
    source_name: hostname(r.url),
    published_at: r.published_date || null,
    relevance_score: typeof r.score === 'number' ? r.score : null,
    provider: 'tavily',
  }));
}

async function searchSerpAPI(query, key, { count = 10, hl = 'en', gl } = {}) {
  const res = await axios.get('https://serpapi.com/search.json', {
    params: { q: query, api_key: key, num: count, hl, gl, engine: 'google' },
    timeout: 20000,
  });
  return (res.data?.organic_results || []).map((r) => ({
    title: r.title || '',
    url: r.link || '',
    snippet: r.snippet || '',
    source_name: r.source || hostname(r.link),
    published_at: r.date || null,
    relevance_score: null,
    provider: 'serpapi',
  }));
}

async function searchGoogleCSE(query, key, cx, { count = 10, lr } = {}) {
  const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
    params: { q: query, key, cx, num: Math.min(count, 10), lr },
    timeout: 20000,
  });
  return (res.data?.items || []).map((r) => ({
    title: r.title || '',
    url: r.link || '',
    snippet: r.snippet || '',
    source_name: r.displayLink || hostname(r.link),
    published_at: null,
    relevance_score: null,
    provider: 'google_cse',
  }));
}

async function searchBing(query, key, { count = 10, mkt } = {}) {
  const res = await axios.get('https://api.bing.microsoft.com/v7.0/search', {
    params: { q: query, count, mkt },
    headers: { 'Ocp-Apim-Subscription-Key': key },
    timeout: 20000,
  });
  return (res.data?.webPages?.value || []).map((r) => ({
    title: r.name || '',
    url: r.url || '',
    snippet: r.snippet || '',
    source_name: r.siteName || hostname(r.url),
    published_at: r.datePublished || null,
    relevance_score: null,
    provider: 'bing',
  }));
}

async function searchWikipedia(query, { lang = 'en', count = 5 } = {}) {
  try {
    const res = await axios.get(`https://${lang}.wikipedia.org/w/api.php`, {
      params: {
        action: 'query',
        list: 'search',
        srsearch: query,
        format: 'json',
        srlimit: count,
        origin: '*',
      },
      timeout: 15000,
    });
    return (res.data?.query?.search || []).map((r) => ({
      title: r.title,
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
      snippet: stripTags(r.snippet || ''),
      source_name: `${lang}.wikipedia.org`,
      published_at: r.timestamp || null,
      relevance_score: null,
      provider: 'wikipedia',
    }));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------
 * Public: searchTrueStories
 * ------------------------------------------------------------------ */
export async function searchTrueStories(payload) {
  const { topic, country, language = 'auto', content_type, count = 10, date_range, min_sources = 1 } = payload || {};
  if (!topic || !topic.trim()) throw new Error('Thiếu chủ đề');

  const providers = await getResearchProviders();
  if (!providers.any) {
    throw new Error('Chưa cấu hình Search API nên không thể tìm câu chuyện có thật.');
  }

  const queries = buildQueries({ topic, content_type, country, language });
  const tavily = await getKey('tavily_api_key', 'TAVILY_API_KEY');
  const serp = await getKey('serpapi_api_key', 'SERPAPI_API_KEY');
  const gcseKey = await getKey('google_search_api_key', 'GOOGLE_SEARCH_API_KEY');
  const gcseCx = await getKey('google_search_cx', 'GOOGLE_SEARCH_CX');
  const bing = await getKey('bing_search_api_key', 'BING_SEARCH_API_KEY');

  const all = [];
  for (const q of queries) {
    try {
      let batch = [];
      if (tavily) batch = await searchTavily(q, tavily, { count });
      else if (serp) batch = await searchSerpAPI(q, serp, { count });
      else if (gcseKey && gcseCx) batch = await searchGoogleCSE(q, gcseKey, gcseCx, { count });
      else if (bing) batch = await searchBing(q, bing, { count });
      if (!batch.length && content_type === 'strange_history') {
        // Lịch sử → bổ sung Wikipedia
        batch = await searchWikipedia(q, { lang: language === 'vi' ? 'vi' : 'en', count: 5 });
      }
      all.push(...batch);
    } catch (err) {
      console.error(`[Research] query "${q}" failed: ${err.message}`);
    }
  }

  // Dedupe theo URL, lọc host rác
  const seen = new Set();
  const filtered = [];
  for (const r of all) {
    if (!r.url || seen.has(r.url)) continue;
    const host = hostname(r.url);
    if (BLOCKED_HOSTS.has(host)) continue;
    seen.add(r.url);
    filtered.push({
      ...r,
      language: detectLanguageFromUrl(r.url),
    });
  }
  void date_range; void min_sources; // placeholder cho mở rộng filter sau này

  return { query_used: queries, results: filtered };
}

/* ------------------------------------------------------------------
 * Public: fetchAndExtractArticle
 * ------------------------------------------------------------------ */
export async function fetchAndExtractArticle(url) {
  if (!url) throw new Error('Thiếu URL');
  try {
    const res = await axios.get(url, {
      timeout: 25000,
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      maxRedirects: 5,
      validateStatus: (s) => s < 500,
    });
    const html = res.data;
    if (typeof html !== 'string' || html.length < 200) {
      return { url, fetch_status: 'empty', content_text: '', title: '', images: [] };
    }

    // Readability cho extraction tốt
    let extracted = {};
    try {
      const dom = new JSDOM(html, { url });
      const article = new Readability(dom.window.document).parse();
      if (article) {
        extracted = {
          title: article.title || '',
          author: article.byline || null,
          excerpt: article.excerpt || '',
          content_text: stripTags(article.textContent || '').slice(0, 8000),
        };
      }
    } catch {}

    // Cheerio để bổ sung meta + ảnh
    const $ = cheerio.load(html);
    const ogImage = $('meta[property="og:image"]').attr('content') || $('meta[name="og:image"]').attr('content');
    const twitterImage = $('meta[name="twitter:image"]').attr('content');
    const pubDate =
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[name="pubdate"]').attr('content') ||
      $('time[datetime]').first().attr('datetime') ||
      null;
    const siteName = $('meta[property="og:site_name"]').attr('content') || hostname(url);
    const images = [];
    if (ogImage) images.push(ogImage);
    if (twitterImage && twitterImage !== ogImage) images.push(twitterImage);
    $('article img, main img').slice(0, 5).each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && src.startsWith('http') && !images.includes(src)) images.push(src);
    });

    return {
      url,
      title: extracted.title || $('h1').first().text().trim() || $('title').text().trim(),
      author: extracted.author || $('meta[name="author"]').attr('content') || null,
      published_at: pubDate,
      source_name: siteName,
      content_text: extracted.content_text || extractFallbackText($),
      excerpt: extracted.excerpt || ($('meta[name="description"]').attr('content') || '').slice(0, 300),
      images: images.slice(0, 5),
      fetch_status: 'ok',
    };
  } catch (err) {
    return {
      url,
      fetch_status: 'error',
      error: err.message,
      content_text: '',
      title: '',
      images: [],
    };
  }
}

function extractFallbackText($) {
  const ps = [];
  $('article p, main p, p').each((_, el) => {
    const t = $(el).text().trim();
    if (t.length > 40) ps.push(t);
  });
  return ps.join('\n\n').slice(0, 8000);
}

/* ------------------------------------------------------------------
 * Public: verifyStorySources
 *
 * Gom kết quả về cùng một câu chuyện (so sánh tiêu đề đơn giản),
 * chấm điểm confidence dựa trên số nguồn độc lập (theo domain).
 * KHÔNG dùng AI ở bước này — đây là verification cơ học.
 * ------------------------------------------------------------------ */
export function verifyStorySources(candidate_results = []) {
  // Group by similarity của title (chuẩn hoá, lấy 6 từ đầu)
  const groups = new Map();
  for (const r of candidate_results) {
    const key = normalizeTitleKey(r.title);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const verified_candidates = [];
  let storyId = 0;
  for (const [key, items] of groups) {
    const uniqueHosts = new Set(items.map((x) => hostname(x.url)).filter(Boolean));
    const source_count = uniqueHosts.size;
    let verification_status = 'weak';
    if (source_count >= 3) verification_status = 'strong';
    else if (source_count === 2) verification_status = 'medium';

    const warning_notes = [];
    if (source_count < 2) warning_notes.push('Chỉ có 1 nguồn độc lập — cần kiểm tra thêm.');
    const hostList = [...uniqueHosts];
    if (hostList.some((h) => /wordpress|blogspot|medium\.com/i.test(h))) {
      warning_notes.push('Có nguồn từ blog cá nhân — độ tin cậy thấp hơn báo chính thống.');
    }

    verified_candidates.push({
      story_id: ++storyId,
      main_title: items[0].title,
      summary: items[0].snippet,
      sources: items.map((x) => ({
        title: x.title,
        url: x.url,
        source_name: x.source_name,
        published_at: x.published_at,
      })),
      source_count,
      confidence_score: Math.min(10, source_count * 3 + (verification_status === 'strong' ? 1 : 0)),
      verification_status,
      warning_notes,
      _group_key: key,
    });
  }

  // Sắp xếp: strong → medium → weak; cùng status thì nguồn nhiều hơn lên trước
  verified_candidates.sort((a, b) => {
    const order = { strong: 0, medium: 1, weak: 2 };
    if (order[a.verification_status] !== order[b.verification_status]) {
      return order[a.verification_status] - order[b.verification_status];
    }
    return b.source_count - a.source_count;
  });

  return { verified_candidates };
}

/* ------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------ */
function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function detectLanguageFromUrl(url) {
  const h = hostname(url);
  if (/\.vn$/.test(h) || /vnexpress|tuoitre|thanhnien|dantri|vietnamnet|kenh14/.test(h)) return 'vi';
  if (/wikipedia\.org/.test(h)) {
    const m = h.match(/^([a-z]{2})\./);
    return m ? m[1] : 'en';
  }
  return 'en';
}

function normalizeTitleKey(title) {
  if (!title) return '';
  const cleaned = String(title)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove diacritics
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Bỏ stopword phổ biến để gom nhóm tốt hơn
  const stop = new Set(['the', 'a', 'an', 'of', 'in', 'and', 'or', 'on', 'is', 'are', 'was', 'were', 'this', 'that', 'how', 'why']);
  const tokens = cleaned.split(' ').filter((t) => t && !stop.has(t)).slice(0, 6);
  return tokens.join(' ');
}

export default {
  getResearchProviders,
  searchTrueStories,
  fetchAndExtractArticle,
  verifyStorySources,
};
