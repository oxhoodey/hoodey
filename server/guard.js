// Keeps the site ours: which domains may serve it, a signed per-page key the API asks for, and no
// embedding of our files on other websites. None of this needs a wallet or a login.
import crypto from 'node:crypto';
import { config } from './config.js';

const SECRET = config.GUARD_SECRET || crypto.randomBytes(32).toString('hex');
const KEY_TTL_MS = 2 * 24 * 3600e3;
const isLocal = (h) => /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/.test(h || '');
const hostOf = (u) => { try { return new URL(u).host.toLowerCase(); } catch { return ''; } };

export function ourHosts() {
  const set = new Set(config.allowedHosts);
  if (config.PUBLIC_URL) { const h = hostOf(config.PUBLIC_URL); if (h) set.add(h); }
  return set;
}
export const reqHost = (req) => String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();

// Is this domain allowed to serve the site? With no list set, every domain is (but pages still carry the lock).
export function hostAllowed(req) {
  const set = ourHosts();
  const h = reqHost(req);
  return !set.size || set.has(h) || isLocal(h);
}
export function canonicalUrl(req, path) {
  const base = config.PUBLIC_URL ? config.PUBLIC_URL.replace(/\/$/, '') : `https://${[...ourHosts()][0]}`;
  return base + path;
}

// signed page key: "<time>.<hmac(time|host)>"
const sign = (t, host) => crypto.createHmac('sha256', SECRET).update(`${t}|${host}`).digest('base64url').slice(0, 32);
export function pageKey(req) {
  const t = Date.now().toString(36);
  return `${t}.${sign(t, reqHost(req))}`;
}
export function keyValid(req) {
  const k = String(req.headers['x-hoodey-k'] || '');
  const [t, sig] = k.split('.');
  if (!t || !sig) return false;
  const at = parseInt(t, 36);
  if (!Number.isFinite(at) || Date.now() - at > KEY_TTL_MS || at - Date.now() > 60e3) return false;
  const want = sign(t, reqHost(req));
  return want.length === sig.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}

// Requests made by another website's page (browsers say so in Sec-Fetch-Site / Referer).
export function fromOtherSite(req) {
  const site = req.headers['sec-fetch-site'];
  if (site === 'cross-site') return true;
  const ref = req.headers.referer;
  if (ref) {
    const h = hostOf(ref);
    if (h && h !== reqHost(req) && !ourHosts().has(h) && !isLocal(h)) return true;
  }
  return false;
}

// Hosts a page may run on, sent to the browser (base64 so a quick find-and-replace misses it).
export function lockMeta(req) {
  const set = ourHosts();
  if (!set.size) set.add(reqHost(req));
  return Buffer.from(JSON.stringify([...set])).toString('base64');
}
