import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, publicConfig } from './config.js';
import { log, isAddress } from './util.js';
import * as data from './data.js';
import { startAlerts } from './alerts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const startedAt = Date.now();

const PAGES = {
  '/': { file: 'radar.html', feature: 'radar' },
  '/copycat': { file: 'copycat.html', feature: 'copycat' },
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

async function renderPage(res, file, pathname) {
  let html = await fs.readFile(path.join(PUBLIC, file), 'utf8');
  const base = config.PUBLIC_URL ? config.PUBLIC_URL.replace(/\/$/, '') : '';
  html = html
    .replaceAll('{{APP_NAME}}', escHtml(config.APP_NAME))
    .replaceAll('{{APP_TAGLINE}}', escHtml(config.APP_TAGLINE))
    .replaceAll('{{CANONICAL}}', escHtml(base + pathname))
    .replace('{{THEME_STYLE}}', themeStyle());
  send(res, 200, html, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
}

async function serveStatic(res, pathname) {
  const target = path.normalize(path.join(PUBLIC, pathname));
  if (!target.startsWith(PUBLIC + path.sep)) return false;
  try {
    const stat = await fs.stat(target);
    if (!stat.isFile()) return false;
    const ext = path.extname(target).toLowerCase();
    if (ext === '.html') return false;
    const body = await fs.readFile(target);
    send(res, 200, body, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
    return true;
  } catch {
    return false;
  }
}

// ── API ────────────────────────────────────────────────────────────────
async function api(req, res, url) {
  const p = url.pathname;
  const q = url.searchParams;
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return send(res, 204, '', { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Content-Type' });
  if (req.method !== 'GET') return json(res, 405, { error: 'Only GET is supported' }, cors);
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
      return out ? json(res, 200, out, cors) : json(res, 404, { error: 'Token not found' }, cors);
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
    if (p === '/healthz') {
      return json(res, 200, { ok: true, mode: config.DATA_MODE, source: config.DATA_SOURCE, liveReady: config.liveReady, uptimeSec: Math.round((Date.now() - startedAt) / 1000), chain: await data.chainStatus().catch(() => ({})) });
    }
    if (p.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

    const page = PAGES[p];
    if (page) {
      const features = publicConfig().features;
      if (!features[page.feature]) {
        const first = Object.entries(PAGES).find(([, v]) => features[v.feature]);
        if (p === '/' && first) return send(res, 302, '', { Location: first[0] });
        return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
      }
      return await renderPage(res, page.file, p === '/' ? '/' : p);
    }
    if (await serveStatic(res, url.pathname)) return;
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
