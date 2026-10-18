// Token images: the launch transaction names an image (ipfs://… or an https URL). We fetch it once,
// keep it in a small in-memory cache and serve it from /img/<token> with long browser caching,
// so pages load logos from one fast origin whatever host the deployer used.
import dns from 'node:dns/promises';
import net from 'node:net';
import { config } from './config.js';
import { log, isAddress } from './util.js';

const cache = new Map(); // image URL -> { type, body, at } | { miss: true, at }
let cacheBytes = 0;
const inflight = new Map();

function gatewayUrl(image) {
  let cid = null;
  if (/^ipfs:\/\//i.test(image)) cid = image.replace(/^ipfs:\/\/(ipfs\/)?/i, '');
  else if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{50,})$/.test(image)) cid = image;
  if (!cid) return image;
  const base = config.IPFS_GATEWAY.replace(/\/?$/, '/');
  const params = config.IPFS_IMAGE_PARAMS ? (cid.includes('?') ? '&' : '?') + config.IPFS_IMAGE_PARAMS : '';
  return base + cid + params;
}

// Never let a token's image URL point the server at its own network (SSRF).
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:') && privateIp(x.slice(7));
}

async function checkUrl(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol) || (u.port && !['80', '443'].includes(u.port) && process.env.HOODEYE_TEST_ALLOW_PRIVATE !== '1')) throw new Error('unsupported URL');
  const addrs = await dns.lookup(u.hostname, { all: true });
  if (!addrs.length || (addrs.some((a) => privateIp(a.address)) && process.env.HOODEYE_TEST_ALLOW_PRIVATE !== '1')) throw new Error('blocked host');
  return u;
}

async function safeFetch(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.IMAGE_TIMEOUT_MS);
  try {
    // Follow redirects by hand so every hop is checked.
    let r, next = url;
    for (let hop = 0; hop < 4; hop++) {
      const u = await checkUrl(next);
      r = await fetch(u, { signal: ctrl.signal, redirect: 'manual', headers: { 'User-Agent': 'HoodEye/1.0 (+token logos)', Accept: 'image/*' } });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { next = new URL(r.headers.get('location'), u).href; continue; }
      break;
    }
    if (r.status >= 300 && r.status < 400) throw new Error('too many redirects');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const type = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!/^image\/(png|jpe?g|gif|webp|avif)$/.test(type)) throw new Error(`not an image (${type || 'unknown'})`);
    const max = config.IMAGE_MAX_KB * 1024;
    if (Number(r.headers.get('content-length')) > max) throw new Error('image too large');
    const reader = r.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) { ctrl.abort(); throw new Error('image too large'); }
      chunks.push(value);
    }
    return { type, body: Buffer.concat(chunks) };
  } finally {
    clearTimeout(timer);
  }
}

function remember(token, entry) {
  const old = cache.get(token);
  if (old && old.body) cacheBytes -= old.body.length;
  cache.delete(token);
  cache.set(token, entry);
  if (entry.body) cacheBytes += entry.body.length;
  const limit = config.IMAGE_CACHE_MB * 1024 * 1024;
  for (const [k, v] of cache) {
    if (cacheBytes <= limit && cache.size <= 5000) break;
    if (v.body) cacheBytes -= v.body.length;
    cache.delete(k);
  }
}

// Returns { type, body } or null when the token has no usable image.
export async function tokenImage(token, imageUrl) {
  if (!isAddress(token) || !imageUrl) return null;
  const key = String(imageUrl).trim(); // copies often reuse the same picture, so cache per image
  const hit = cache.get(key);
  if (hit) {
    if (hit.miss && Date.now() - hit.at > 10 * 60e3) cache.delete(key); // retry failed images after 10 min
    else { cache.delete(key); cache.set(key, hit); return hit.miss ? null : hit; }
  }
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const img = await safeFetch(gatewayUrl(imageUrl));
      remember(key, { ...img, at: Date.now() });
      return img;
    } catch (e) {
      log.debug(`image ${token} (${key.slice(0, 80)}): ${e.message}`);
      remember(key, { miss: true, at: Date.now() });
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export const imageStats = () => ({ cached: cache.size, mb: +(cacheBytes / 1048576).toFixed(1) });
