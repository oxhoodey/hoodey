// Shared header, footer, helpers and settings for every page.
import { startBackground } from './bg.js';

export const LOGO = '<svg width="30" height="30" viewBox="0 0 390.85 390.85" role="img" aria-label="Hoodey logo"><path fill="#0B1F14" d="M348.15,216.78c0,96.14-77.93,174.07-174.07,174.07C77.93,390.85,0,312.92,0,216.78S77.93,42.7,174.07,42.7v43.86c-71.93,0-130.22,58.29-130.22,130.22c0,71.93,58.29,130.22,130.22,130.22c71.93,0,130.22-58.29,130.22-130.22H348.15z"/><path style="fill:var(--accent)" d="M390.85,216.78h-42.7c0-96.14-77.93-174.07-174.07-174.07V0C293.79,0,390.85,97.06,390.85,216.78z"/><path style="fill:var(--accent)" d="M254.75,216.78c0,44.57-36.14,80.67-80.68,80.67c-44.57,0-80.67-36.1-80.67-80.67c0-44.53,36.1-80.67,80.67-80.67v80.67H254.75z"/></svg>';
export const LOGO_PATHS = { ring: 'M348.15,216.78c0,96.14-77.93,174.07-174.07,174.07C77.93,390.85,0,312.92,0,216.78S77.93,42.7,174.07,42.7v43.86c-71.93,0-130.22,58.29-130.22,130.22c0,71.93,58.29,130.22,130.22,130.22c71.93,0,130.22-58.29,130.22-130.22H348.15z', arc: 'M390.85,216.78h-42.7c0-96.14-77.93-174.07-174.07-174.07V0C293.79,0,390.85,97.06,390.85,216.78z', core: 'M254.75,216.78c0,44.57-36.14,80.67-80.68,80.67c-44.57,0-80.67-36.1-80.67-80.67c0-44.53,36.1-80.67,80.67-80.67v80.67H254.75z' };

const ICONS = {
  cabal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="6" cy="7" r="2.5"/><circle cx="18" cy="7" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8.3 8.2 L10.6 15.8 M15.7 8.2 L13.4 15.8 M8.5 7 H15.5"/></svg>',
  xray: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 6.5 V17.5 M8.5 9 H15.5 M8 12 H16 M8.5 15 H15.5"/></svg>',
  larp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9c0-3 3.5-5 8-5s8 2 8 5c0 5-3.5 10-8 11-4.5-1-8-6-8-11Z"/><path d="M8 10.5c.8-.7 1.8-.7 2.6 0M13.4 10.5c.8-.7 1.8-.7 2.6 0M9.5 15c1.5 1 3.5 1 5 0"/></svg>',
  radar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 12 L19 5"/></svg>',
  copycat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="11" height="11" rx="2"/><rect x="10" y="10" width="11" height="11" rx="2"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7 V12 L15.5 14"/></svg>',
  family: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5 V12 M12 12 L5 16.5 M12 12 L19 16.5"/></svg>',
  roadmap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 21 V4 H17 L15 8 L17 12 H5"/></svg>'
};
const NAV = [
  { key: 'radar', href: '/', label: 'Radar' },
  { key: 'copycat', href: '/copycat', label: 'Copycat' },
  { key: 'cabal', href: '/cabal', label: 'Cabal' },
  { key: 'xray', href: '/xray', label: 'X-Ray' },
  { key: 'larp', href: '/larp', label: 'LARP' },
  { key: 'clock', href: '/clock', label: 'Clock' },
  { key: 'family', href: '/family', label: 'Family' },
  { key: 'roadmap', href: '/roadmap', label: 'Roadmap' }
];

// ── escaping & formatting ─────────────────────────────────────────────
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function html(strings, ...vals) {
  return strings.reduce((out, s, i) => out + s + (i < vals.length ? (vals[i] && vals[i].__raw !== undefined ? vals[i].__raw : esc(vals[i])) : ''), '');
}
export const raw = (s) => ({ __raw: String(s) });

export const dash = '—';
export const fmtInt = (n) => (n == null ? dash : Math.round(n).toLocaleString('en-US'));
export function fmtUsd(n) {
  if (n == null) return dash;
  const a = Math.abs(n), sign = n < 0 ? '−' : '';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}K`;
  return `${sign}$${Math.round(a)}`;
}
export const fmtPct = (n, digits = 1) => (n == null ? dash : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}%`);
export function fmtDuration(min) {
  if (min == null) return dash;
  if (min < 60) return `${Math.round(min)}m`;
  if (min < 48 * 60) { const h = Math.floor(min / 60), m = Math.round(min % 60); return m ? `${h}h ${m}m` : `${h}h`; }
  return `${Math.round(min / 1440)} days`;
}
export function timeAgo(iso) {
  const min = (Date.now() - Date.parse(iso)) / 60000;
  if (!Number.isFinite(min)) return '';
  if (min < 1) return 'just now';
  if (min < 60) return `${Math.round(min)} min ago`;
  if (min < 48 * 60) { const h = Math.round(min / 60); return `${h} hour${h === 1 ? '' : 's'} ago`; }
  return `${Math.round(min / 1440)} days ago`;
}
export const short = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || dash);
export const isAddress = (s) => /^0x[0-9a-fA-F]{40}$/.test(String(s || '').trim());

// ── settings & API ────────────────────────────────────────────────────
let cfgPromise;
export function getConfig() {
  if (!cfgPromise) cfgPromise = fetch('/api/config').then((r) => r.json());
  return cfgPromise;
}

export async function api(path) {
  const r = await fetch(path, { headers: { Accept: 'application/json' } });
  let body = {};
  try { body = await r.json(); } catch { /* empty */ }
  if (!r.ok) throw new Error(body.error || `Request failed (${r.status})`);
  return body;
}

export function explorerLink(cfg, address, text) {
  if (!address) return esc(text || dash);
  const label = esc(text || short(address));
  if (!cfg.RH_EXPLORER_URL || !isAddress(address)) return label;
  return `<a href="${esc(cfg.RH_EXPLORER_URL.replace(/\/$/, ''))}/address/${esc(address)}" target="_blank" rel="noopener">${label}</a>`;
}

// Token logos are served by our server at /img/<address>. The image sits over the initials, so a logo
// that fails to load simply disappears and the initials show through.
export function tokenImg(t, cls = 'tok-img') {
  if (!t || !t.hasImage || !isAddress(t.address)) return '';
  return `<img class="${esc(cls)}" src="/img/${esc(t.address.toLowerCase())}" alt="" loading="lazy" decoding="async">`;
}
export function avatar(t) {
  return `<span class="av">${esc(((t && t.symbol) || '?').slice(0, 2))}${tokenImg(t)}</span>`;
}
if (typeof document !== 'undefined') {
  document.addEventListener('error', (e) => {
    const el = e.target;
    if (el && el.tagName === 'IMG' && /(^| )(tok-img|nimg)( |$)/.test(el.className)) el.remove();
  }, true);
}

// Link to the token's page on the Pons launchpad (PONS_TOKEN_URL + address).
export function ponsUrl(cfg, address) {
  if (!cfg.PONS_TOKEN_URL || !isAddress(address)) return '';
  return cfg.PONS_TOKEN_URL.replace(/\/?$/, '/') + address;
}
export function ponsLink(cfg, address, label = 'Pons', cls = 'pons-link') {
  const u = ponsUrl(cfg, address);
  if (!u) return '';
  return `<a class="${esc(cls)}" href="${esc(u)}" target="_blank" rel="noopener" title="Open on ponsfamily.com">${esc(label)}<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2h6v6M10 2 3 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></a>`;
}

// Small label shown on a section whenever its numbers are demo data.
export function sourceBadge(el, part) {
  if (!el) return;
  const isSample = !part || part.source !== 'live';
  el.hidden = !isSample;
  el.textContent = 'Sample data';
  el.title = part && part.fallbackReason ? `Live data unavailable: ${part.fallbackReason}` : 'Demo numbers. Set DATA_MODE=live to read Robinhood Chain.';
}

export function every(cfg, fn) {
  const ms = Math.max(15, cfg.REFRESH_INTERVAL_SECONDS || 60) * 1000;
  let timer = setInterval(fn, ms);
  document.addEventListener('visibilitychange', () => {
    clearInterval(timer);
    if (!document.hidden) { fn(); timer = setInterval(fn, ms); }
  });
}

// ── header & footer ───────────────────────────────────────────────────
export async function initPage(current) {
  const cfg = await getConfig();
  const header = document.querySelector('header.top');
  const nav = NAV.filter((n) => cfg.features[n.key]).map((n) => `<a href="${n.href}"${n.key === current ? ' aria-current="page"' : ''}>${ICONS[n.key]}${esc(n.label)}</a>`).join('');
  const alerts = cfg.alertsUrl
    ? `<a class="btn btn-lg btn-primary" href="${esc(cfg.alertsUrl)}" target="_blank" rel="noopener"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M22 3 L2 11 L9 13 L11 20 L14 15 L19 19 Z"/><path d="M9 13 L22 3"/></svg>Get alerts</a>`
    : '';
  header.innerHTML = `
    <a class="brand" href="/" aria-label="${esc(cfg.APP_NAME)} home"><span class="brand-mark">${LOGO}</span><img class="brand-word" src="/assets/wordmark.svg" alt="${esc(cfg.APP_NAME)}" width="216" height="60"></a>
    <nav class="nav" aria-label="Main navigation">${nav}</nav>
    <div class="top-actions">
      <span class="ro-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="stroke: var(--accent-ink)" stroke-width="2.2" aria-hidden="true"><path d="M12 3 L20 6 V12 C20 16.5 16.5 20 12 21 C7.5 20 4 16.5 4 12 V6 Z"/><path d="M8.5 12 L11 14.5 L15.5 9.5"/></svg>Read-only · we never ask you to sign</span>
      ${alerts}
    </div>`;

  const foot = document.querySelector('footer.foot');
  if (foot) {
    const links = [['X', cfg.LINK_X], ['Telegram', cfg.LINK_TELEGRAM], ['Docs', cfg.LINK_DOCS], ['Buy $HOODEY', cfg.TOKEN_BUY_URL]]
      .filter(([, u]) => u).map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`).join('');
    const ca = cfg.TOKEN_CONTRACT_ADDRESS ? `<span>CA <code>${esc(cfg.TOKEN_CONTRACT_ADDRESS)}</code></span>` : '';
    foot.innerHTML = `<span>${esc(cfg.APP_NAME)} reads public on-chain data. Read-only, never asks for a signature. Not financial advice.${cfg.DATA_MODE === 'sample' ? ' Currently showing sample data.' : ''}</span>${ca}<nav aria-label="Links">${links}</nav>`;
  }

  if (cfg.BG_ANIMATION_ENABLED) {
    const c = document.getElementById('bg');
    if (c) startBackground(c);
  }
  return cfg;
}
