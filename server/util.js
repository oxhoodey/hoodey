import { config } from './config.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
export const log = {};
for (const [lvl, n] of Object.entries(LEVELS)) {
  log[lvl] = (...args) => {
    if (n < LEVELS[config.LOG_LEVEL]) return;
    const line = `[${new Date().toISOString()}] ${lvl.toUpperCase()} ` + args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    (n >= 30 ? console.error : console.log)(line);
  };
}

export const isAddress = (s) => typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s);

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function seededRandom(seed) {
  let s = seed % 233280;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// Name similarity between two token names/symbols, 0..1.
// Mix of edit distance on a normalized form and word overlap, so
// "Tesla Doge" vs "TSLA Doge" and "Cyber Doge" vs "Tesla Doge" both score sensibly.
export function normalizeName(s) {
  // Split camelCase and letter/digit runs first, so "StrataLLM" → "strata llm" and "TeslaDoge2" → "tesla doge 2".
  return String(s || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)|(\d)([a-zA-Z])/g, (m, a, b, c, d) => (a ? `${a} ${b}` : `${c} ${d}`))
    .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
export function nameSimilarity(a, b) {
  const x = normalizeName(a), y = normalizeName(b);
  if (!x || !y) return 0;
  const compactX = x.replace(/ /g, ''), compactY = y.replace(/ /g, '');
  const edit = 1 - levenshtein(compactX, compactY) / Math.max(compactX.length, compactY.length);
  const wx = new Set(x.split(' ')), wy = new Set(y.split(' '));
  const inter = [...wx].filter((w) => wy.has(w)).length;
  const jaccard = inter / new Set([...wx, ...wy]).size;
  const contains = compactX.includes(compactY) || compactY.includes(compactX) ? 0.85 : 0;
  return Math.max(edit, jaccard, contains);
}

// Ties a token to a stock narrative. Keywords match whole words only, so "rocket" no longer
// catches "Sprocket" and "mstr" no longer catches "StrataLLM". Long, distinctive keywords
// (7+ letters, e.g. "zuckerberg", "gamestop") may also match inside a joined-up name like "GAMESTOPCAT".
export function tagStock(name, symbol) {
  const words = new Set([...normalizeName(name).split(' '), ...normalizeName(symbol).split(' ')].filter(Boolean));
  const compact = `${name} ${symbol}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  for (const [ticker, kws] of Object.entries(config.keywords)) {
    for (const k of kws) {
      if (words.has(k)) return ticker;
      if (k.length >= 7 && compact.split(' ').some((w) => w.includes(k))) return ticker;
    }
  }
  return null;
}

// Hours and minutes in the exchange time zone for a given Date.
export function zonedParts(date, timeZone = config.MARKET_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(date);
  const get = (t) => (parts.find((p) => p.type === t) || {}).value;
  return {
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: parseInt(get('hour'), 10) % 24,
    minute: parseInt(get('minute'), 10)
  };
}

export const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), config.REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}: ${JSON.stringify(body).slice(0, 300)}`);
    return body;
  } finally {
    clearTimeout(t);
  }
}

// Short cache with stale-while-revalidate: once a key has a value, callers never wait for a refresh.
// An expired value is returned at once (up to STALE_MAX) while a fresh one is built in the background.
const STALE_MAX = 10 * 60e3;
export function createCache(ttlSeconds) {
  const store = new Map();
  const refresh = (key, fn, hit) => {
    const pending = fn().then((value) => {
      store.set(key, { value, has: true, exp: Date.now() + ttlSeconds * 1000 });
      if (store.size > 500) store.delete(store.keys().next().value);
      return value;
    }).catch((e) => {
      if (hit && hit.has) { store.set(key, { ...hit, pending: null }); }
      else store.delete(key);
      throw e;
    });
    store.set(key, { ...(hit || {}), pending });
    return pending;
  };
  return async function cached(key, fn) {
    const hit = store.get(key);
    const now = Date.now();
    if (hit && hit.has && hit.exp > now) return hit.value;
    if (hit && hit.has && now - hit.exp < STALE_MAX) {
      if (!hit.pending) refresh(key, fn, hit).catch(() => {});
      return hit.value;
    }
    if (hit && hit.pending) return hit.pending;
    return refresh(key, fn, hit);
  };
}

export function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
