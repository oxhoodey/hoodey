// Shared header, footer, helpers and settings for every page.
import { startBackground } from './bg.js';

export const LOGO = '<svg width="52" height="52" viewBox="0 0 64 64" role="img" aria-label="HoodEye logo"><circle cx="32" cy="32" r="23" fill="none" stroke="#1E6B3A" stroke-width="2"/><circle cx="32" cy="32" r="16" style="fill:var(--accent)"/><circle cx="32" cy="32" r="7" fill="#0B1F14"/><circle cx="35.5" cy="28.5" r="2.4" fill="#fff"/></svg>';

const ICONS = {
  radar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 12 L19 5"/></svg>',
  copycat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="11" height="11" rx="2"/><rect x="10" y="10" width="11" height="11" rx="2"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7 V12 L15.5 14"/></svg>',
  family: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5 V12 M12 12 L5 16.5 M12 12 L19 16.5"/></svg>',
  roadmap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 21 V4 H17 L15 8 L17 12 H5"/></svg>'
};
const NAV = [
  { key: 'radar', href: '/', label: 'Radar' },
  { key: 'copycat', href: '/copycat', label: 'Copycat' },
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
    <a class="brand" href="/" aria-label="${esc(cfg.APP_NAME)} home"><span class="brand-mark">${LOGO}</span><span class="brand-name">${esc(cfg.APP_NAME)}</span></a>
    <nav class="nav" aria-label="Main navigation">${nav}</nav>
    <div class="top-actions">
      <span class="ro-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="stroke: var(--accent-ink)" stroke-width="2.2" aria-hidden="true"><path d="M12 3 L20 6 V12 C20 16.5 16.5 20 12 21 C7.5 20 4 16.5 4 12 V6 Z"/><path d="M8.5 12 L11 14.5 L15.5 9.5"/></svg>Read-only · we never ask you to sign</span>
      ${alerts}
    </div>`;

  const foot = document.querySelector('footer.foot');
  if (foot) {
    const links = [['X', cfg.LINK_X], ['Telegram', cfg.LINK_TELEGRAM], ['Docs', cfg.LINK_DOCS], ['Buy $HOODEYE', cfg.TOKEN_BUY_URL]]
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
