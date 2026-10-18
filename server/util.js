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
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
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

export function tagStock(name, symbol) {
  const text = normalizeName(`${name} ${symbol}`);
  const words = new Set(text.split(' '));
  const compact = text.replace(/ /g, '');
  for (const [ticker, kws] of Object.entries(config.keywords)) {
    for (const k of kws) {
      if (words.has(k) || (k.length >= 4 && compact.includes(k))) return ticker;
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

export function createCache(ttlSeconds) {
  const store = new Map();
  return async function cached(key, fn) {
    const hit = store.get(key);
    const now = Date.now();
    if (hit && hit.exp > now) return hit.value;
    if (hit && hit.pending) return hit.pending;
    const pending = fn().then((value) => {
      store.set(key, { value, exp: Date.now() + ttlSeconds * 1000 });
      if (store.size > 500) store.delete(store.keys().next().value);
      return value;
    }).catch((e) => { store.delete(key); throw e; });
    store.set(key, { ...(hit || {}), pending, exp: 0 });
    return pending;
  };
}

export function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
