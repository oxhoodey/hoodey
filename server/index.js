import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, publicConfig } from './config.js';
import { log, isAddress } from './util.js';
import * as data from './data.js';
import { startAlerts } from './alerts.js';
import { tokenImage } from './images.js';
import { hostAllowed, canonicalUrl, pageKey, keyValid, fromOtherSite, lockMeta } from './guard.js';
import { cabalCard, deathCard, xrayCard, larpCard } from './ogcard.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const startedAt = Date.now();
const BUILD = startedAt.toString(36); // changes on every deploy/restart

const PAGES = {
  '/': { file: 'radar.html', feature: 'radar' },
  '/copycat': { file: 'copycat.html', feature: 'copycat' },
  '/cabal': { file: 'cabal.html', feature: 'cabal' },
  '/xray': { file: 'xray.html', feature: 'xray' },
  '/larp': { file: 'larp.html', feature: 'larp' },
  '/clock': { file: 'clock.html', feature: 'clock' },
  '/family': { file: 'family.html', feature: 'family' },
  '/roadmap': { file: 'roadmap.html', feature: 'roadmap' }
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8'
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'X-Frame-Options': 'DENY'
};

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── rate limit (per IP, per minute) ────────────────────────────────────
const hits = new Map();
setInterval(() => hits.clear(), 60e3).unref();
function clientIp(req) {
  if (config.TRUST_PROXY) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || 'unknown';
}
function limited(req) {
  const ip = clientIp(req);
  const n = (hits.get(ip) || 0) + 1;
  hits.set(ip, n);
  return n > config.RATE_LIMIT_PER_MINUTE;
}

// ── responses ──────────────────────────────────────────────────────────
function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
function json(res, status, obj, extra = {}) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store', ...extra });
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (origin && config.corsOrigins.includes(origin)) return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  return {};
}

function themeStyle() {
  return `<style>:root{--accent:${config.THEME_ACCENT};--accent-ink:${config.THEME_ACCENT_INK};--bg:${config.THEME_BG};}</style>`;
}

async function renderPage(req, res, file, pathname, url) {
  let html = await fs.readFile(path.join(PUBLIC, file), 'utf8');
  const base = config.PUBLIC_URL ? config.PUBLIC_URL.replace(/\/$/, '') : '';
  // absolute URL for previews: PUBLIC_URL, or the host the request came in on
  const origin = base || `${String(req.headers['x-forwarded-proto'] || 'https').split(',')[0]}://${req.headers.host}`;
  const addr = url && url.searchParams.get('address');
  const shareable = ['/cabal', '/xray', '/larp'].includes(pathname) && isAddress(addr || '');
  const ogImage = shareable ? `${origin}/og${pathname}/${addr.toLowerCase()}.png` : `${origin}/assets/og-default.png`;
  html = html
    .replaceAll('{{APP_NAME}}', escHtml(config.APP_NAME))
    .replaceAll('{{APP_TAGLINE}}', escHtml(config.APP_TAGLINE))
    .replaceAll('{{CANONICAL}}', escHtml(base + pathname))
    .replaceAll('{{OG_IMAGE}}', escHtml(ogImage))
    .replace('{{THEME_STYLE}}', themeStyle())
    .replace('</head>', `<meta name="hoodey-k" content="${pageKey(req)}">${config.COPY_LOCK ? `<meta name="hoodey-h" content="${lockMeta(req)}">` : ''}\n</head>`);
  send(res, 200, html, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
}

// Code and styles are revalidated on every load (cheap 304 when unchanged), so a new deploy
// reaches every browser at once. Images and fonts can be cached longer.
async function serveStatic(req, res, pathname) {
  const target = path.normalize(path.join(PUBLIC, pathname));
  if (!target.startsWith(PUBLIC + path.sep)) return false;
  try {
    const stat = await fs.stat(target);
    if (!stat.isFile()) return false;
    const ext = path.extname(target).toLowerCase();
    if (ext === '.html') return false;
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}-${BUILD}"`;
    const cache = ['.js', '.css', '.json', '.webmanifest'].includes(ext) ? 'no-cache' : 'public, max-age=86400';
    if (req.headers['if-none-match'] === etag) { send(res, 304, '', { ETag: etag, 'Cache-Control': cache }); return true; }
    const body = await fs.readFile(target);
    send(res, 200, body, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache, ETag: etag });
    return true;
  } catch {
    return false;
  }
}

// Share cards are cached briefly so a burst of X previews doesn't redraw the same PNG.
const ogStore = new Map();
function ogCache(key, draw) {
  const hit = ogStore.get(key);
  if (hit) return hit;
  const buf = draw();
  ogStore.set(key, buf);
  if (ogStore.size > 200) ogStore.delete(ogStore.keys().next().value);
  return buf;
}

// ── API ────────────────────────────────────────────────────────────────
async function api(req, res, url) {
  const p = url.pathname;
  const q = url.searchParams;
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return send(res, 204, '', { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Content-Type' });
  if (req.method !== 'GET') return json(res, 405, { error: 'Only GET is supported' }, cors);
  if (config.API_GUARD && !(req.headers.origin && config.corsOrigins.includes(req.headers.origin))) {
    if (fromOtherSite(req)) return json(res, 403, { error: 'The Hoodey API only answers hoodey pages.' });
    if (!keyValid(req)) return json(res, 401, { error: 'Page key expired. Reload the page.', code: 'stale' });
  }
  if (limited(req)) return json(res, 429, { error: 'Too many requests, slow down a little.' }, { ...cors, 'Retry-After': '60' });

  const f = publicConfig().features;
  const off = (name) => json(res, 404, { error: `${name} is turned off` }, cors);
  const needAddress = () => json(res, 400, { error: 'Pass a valid address: 0x followed by 40 hex characters.' }, cors);

  switch (p) {
    case '/api/config': return json(res, 200, publicConfig(), cors);
    case '/api/radar':
      if (!f.radar) return off('Radar');
      return json(res, 200, await data.radar(parseInt(q.get('range') || String(config.SPIKE_LOOKBACK_HOURS), 10)), cors);
    case '/api/trending':
      if (!f.radar) return off('Radar');
      return json(res, 200, await data.trending(), cors);
    case '/api/copycat/latest':
      if (!f.copycat) return off('Copycat Eye');
      return json(res, 200, await data.copycatLatest(), cors);
    case '/api/copycat/scan': {
      if (!f.copycat) return off('Copycat Eye');
      const a = (q.get('address') || '').trim();
      if (!isAddress(a)) return needAddress();
      const out = await data.copycatScan(a);
      if (out && out.error) return json(res, 503, out, cors);
      return out ? json(res, 200, out, cors) : json(res, 404, { error: 'No token contract at this address on Robinhood Chain.' }, cors);
    }
    case '/api/cabal/map':
      if (!f.cabal) return off('Cabal Eye');
      return json(res, 200, await data.cabalMap(), cors);
    case '/api/cabal/scan': {
      if (!f.cabal) return off('Cabal Eye');
      const a = (q.get('address') || '').trim();
      if (!isAddress(a)) return needAddress();
      const out = await data.cabalScan(a);
      if (out && out.error) return json(res, out.status || 503, { error: out.error }, cors);
      return out ? json(res, 200, out, cors) : json(res, 404, { error: 'No token contract at this address on Robinhood Chain.' }, cors);
    }
    case '/api/larp/board':
      if (!f.larp) return off('LARP Scanner');
      return json(res, 200, await data.larpBoard(), cors);
    case '/api/larp/scan': {
      if (!f.larp) return off('LARP Scanner');
      const a = (q.get('address') || '').trim();
      if (!isAddress(a)) return needAddress();
      const out = await data.larpScan(a);
      if (out && out.error) return json(res, out.status || 503, { error: out.error }, cors);
      return out ? json(res, 200, out, cors) : json(res, 404, { error: 'No token contract at this address on Robinhood Chain.' }, cors);
    }
    case '/api/xray/board':
      if (!f.xray) return off('X-Ray');
      return json(res, 200, await data.xrayBoard(), cors);
    case '/api/xray': {
      if (!f.xray) return off('X-Ray');
      const a = (q.get('address') || '').trim();
      if (!isAddress(a)) return needAddress();
      const out = await data.xray(a);
      if (out && out.error) return json(res, out.status || 503, { error: out.error }, cors);
      return out ? json(res, 200, out, cors) : json(res, 404, { error: 'Nothing found for this address.' }, cors);
    }
    case '/api/clock':
      if (!f.clock) return off('Market Clock');
      return json(res, 200, await data.clock(), cors);
    case '/api/family':
      if (!f.family) return off('Family Tree');
      return json(res, 200, await data.family(String(q.get('stock') || '').toUpperCase().slice(0, 10)), cors);
    case '/api/wallet': {
      if (!f.walletWatch) return off('Wallet Watch');
      const a = (q.get('address') || '').trim();
      if (!isAddress(a)) return needAddress();
      return json(res, 200, await data.wallet(a), cors);
    }
    case '/api/roadmap': {
      if (!f.roadmap) return off('Roadmap');
      const rm = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'roadmap.json'), 'utf8'));
      return json(res, 200, rm, cors);
    }
    default: return json(res, 404, { error: 'Unknown endpoint' }, cors);
  }
}

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, 'Bad request'); }
  try {
    const p = url.pathname.replace(/\/+$/, '') || '/';
    // a domain that isn't ours (a mirror or a pointed domain): send people to the real site
    if (p !== '/healthz' && !hostAllowed(req)) {
      if (p.startsWith('/api/')) return json(res, 403, { error: 'Unofficial mirror.' });
      return send(res, 302, '', { Location: canonicalUrl(req, url.pathname + url.search), 'Cache-Control': 'no-store' });
    }
    // other websites may not embed our code, styles, logos or share cards
    if (config.HOTLINK_GUARD && (p.startsWith('/assets/') || p.startsWith('/img/') || p.startsWith('/og/')) && fromOtherSite(req) && req.headers['sec-fetch-dest'] !== 'document') {
      return send(res, 403, '', { 'Cache-Control': 'no-store' });
    }
    if (p === '/healthz') {
      return json(res, 200, { ok: true, mode: config.DATA_MODE, source: config.DATA_SOURCE, liveReady: config.liveReady, uptimeSec: Math.round((Date.now() - startedAt) / 1000), chain: await data.chainStatus().catch(() => ({})) });
    }
    if (p.startsWith('/api/')) return await api(req, res, url);
    if (p.startsWith('/og/cabal/')) {
      const token = p.slice(10).replace(/\.png$/, '');
      if (!isAddress(token)) return send(res, 404, '');
      const out = await data.cabalScan(token);
      if (!out || out.error) return send(res, 404, '', { 'Cache-Control': 'public, max-age=60' });
      const host = (config.PUBLIC_URL ? config.PUBLIC_URL.replace(/^https?:\/\//, '') : String(req.headers.host || '')).replace(/\/$/, '');
      return send(res, 200, ogCache(`cabal:${token}:${out.score}:${out.reasons.length}`, () => cabalCard(out, host)), { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    }
    if (p.startsWith('/og/larp/')) {
      const a = p.slice(9).replace(/\.png$/, '');
      if (!isAddress(a)) return send(res, 404, '');
      const out = await data.larpScan(a);
      if (!out || out.error) return send(res, 404, '', { 'Cache-Control': 'public, max-age=60' });
      const host = (config.PUBLIC_URL ? config.PUBLIC_URL.replace(/^https?:\/\//, '') : String(req.headers.host || '')).replace(/\/$/, '');
      return send(res, 200, ogCache(`larp:${a}:${out.score}:${out.reasons.length}`, () => larpCard(out, host)), { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    }
    if (p.startsWith('/og/xray/')) {
      const a = p.slice(9).replace(/\.png$/, '');
      if (!isAddress(a)) return send(res, 404, '');
      const out = await data.xray(a);
      if (!out || out.error) return send(res, 404, '', { 'Cache-Control': 'public, max-age=60' });
      const host = (config.PUBLIC_URL ? config.PUBLIC_URL.replace(/^https?:\/\//, '') : String(req.headers.host || '')).replace(/\/$/, '');
      const key = out.kind === 'token' ? `death:${a}:${out.status}:${out.medianLifeMin}:${out.ageMin}` : `xray:${a}:${out.archetype.k}:${out.stats.pnlEth}`;
      return send(res, 200, ogCache(key, () => (out.kind === 'token' ? deathCard(out, host) : xrayCard(out, host))), { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    }
    if (p.startsWith('/img/')) {
      const token = p.slice(5);
      const img = isAddress(token) ? await tokenImage(token, data.imageUrlOf(token)) : null;
      if (!img) return send(res, 404, '', { 'Cache-Control': 'public, max-age=300' });
      return send(res, 200, img.body, { 'Content-Type': img.type, 'Cache-Control': 'public, max-age=604800, immutable', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

    const page = PAGES[p];
    if (page) {
      const features = publicConfig().features;
      if (!features[page.feature]) {
        const first = Object.entries(PAGES).find(([, v]) => features[v.feature]);
        if (p === '/' && first) return send(res, 302, '', { Location: first[0] });
        return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
      }
      return await renderPage(req, res, page.file, p === '/' ? '/' : p, url);
    }
    if (await serveStatic(req, res, url.pathname)) return;
    send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
  } catch (e) {
    log.error(req.method, url.pathname, e.stack || e.message);
    if (!res.headersSent) json(res, 500, { error: 'Something went wrong on our side.' });
  } finally {
    log.debug(req.method, url.pathname, res.statusCode, `${Date.now() - t0}ms`);
  }
});

config.warnings.forEach((w) => log.warn(w));
if (config.DATA_MODE === 'live' && !config.liveReady) log.warn(`DATA_MODE=live but ${config.DATA_SOURCE === 'bitquery' ? 'BITQUERY_API_KEY' : 'RH_RPC_URL'} is empty: every section will show sample data.`);

server.listen(config.PORT, '0.0.0.0', () => {
  log.info(`${config.APP_NAME} listening on :${config.PORT} (data: ${config.DATA_MODE}/${config.DATA_SOURCE}${config.liveReady ? ', live ready' : ''})`);
  if (config.DATA_MODE === 'live') data.startLive();
  startAlerts();
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    log.info(`${sig} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
