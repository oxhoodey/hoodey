import { initPage, api, html, raw, sourceBadge, every } from './common.js';

const cfg = await initPage('clock');
const $ = (id) => document.getElementById(id);
const tz = cfg.MARKET_TIMEZONE;
const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const T = { pre: toMin(cfg.MARKET_PREMARKET_OPEN), open: toMin(cfg.MARKET_OPEN), close: toMin(cfg.MARKET_CLOSE), after: toMin(cfg.MARKET_AFTERHOURS_CLOSE) };
const COLORS = { pre: '#B9E8A0', regular: 'var(--accent)', after: '#0F5A2E', closed: 'var(--track)' };
const NAMES = { pre: 'Pre-market', regular: 'Regular session', after: 'After-hours', closed: 'Closed' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n) => String(n).padStart(2, '0');

function zoned(d) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d);
  const g = (t) => (parts.find((p) => p.type === t) || {}).value;
  return { wd: DAYS.indexOf(g('weekday')), date: `${g('year')}-${g('month')}-${g('day')}`, h: parseInt(g('hour'), 10) % 24, m: parseInt(g('minute'), 10), s: parseInt(g('second'), 10) };
}

function sessionAt(wd, date, min) {
  if (wd === 0 || wd === 6 || cfg.holidays.includes(date)) return 'closed';
  if (min >= T.pre && min < T.open) return 'pre';
  if (min >= T.open && min < T.close) return 'regular';
  if (min >= T.close && min < T.after) return 'after';
  return 'closed';
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function arc(fromMin, toMin, color) {
  const C = 2 * Math.PI * 130;
  const len = (((toMin - fromMin + 1440) % 1440) || 1440) / 1440 * C;
  const rot = (fromMin / 1440) * 360 - 90;
  return `<circle cx="160" cy="160" r="130" fill="none" style="stroke: ${color}" stroke-width="18" stroke-dasharray="${len.toFixed(2)} ${C.toFixed(2)}" transform="rotate(${rot.toFixed(2)} 160 160)"/>`;
}

function tick() {
  const now = new Date();
  const z = zoned(now);
  const min = z.h * 60 + z.m;
  const cur = sessionAt(z.wd, z.date, min);

  // walk forward minute by minute (max 8 days) to find the next change
  let steps = 0, wd = z.wd, date = z.date, m = min, next = cur;
  while (steps < 8 * 1440) {
    steps++; m++;
    if (m >= 1440) { m = 0; wd = (wd + 1) % 7; date = addDays(date, 1); }
    next = sessionAt(wd, date, m);
    if (next !== cur) break;
  }
  const secs = Math.max(0, steps * 60 - z.s);
  const H = Math.floor(secs / 3600), M = Math.floor((secs % 3600) / 60), S = secs % 60;
  const D = Math.floor(H / 24);
  $('countdown').textContent = D >= 1 ? `${D}d ${H % 24}h ${pad(M)}m` : `${H ? H + 'h ' : ''}${pad(M)}m ${pad(S)}s`;
  $('next-label').textContent = cur === 'regular' ? 'Regular session closes in' : `${NAMES[next]} starts in`;

  const weekend = z.wd === 0 || z.wd === 6;
  const holiday = cfg.holidays.includes(z.date);
  const status = holiday ? 'Closed · holiday' : weekend ? 'Closed · weekend' : NAMES[cur];
  const pill = { pre: 'background:#B9E8A0;color:#0B1A0F', regular: 'background:var(--accent);color:var(--on-accent)', after: 'background:#0F5A2E;color:#fff', closed: 'background:var(--track);color:var(--ink)' }[cur];
  const deg = ((min + z.s / 60) / 1440) * 360;
  const city = tz.split('/').pop().replace(/_/g, ' ').toUpperCase();

  $('dial').innerHTML = `
    <svg width="320" height="320" viewBox="0 0 320 320" role="img" aria-label="${city} time ${pad(z.h)}:${pad(z.m)}, ${status}">
      ${arc(T.after, T.pre, COLORS.closed)}${arc(T.pre, T.open, COLORS.pre)}${arc(T.open, T.close, COLORS.regular)}${arc(T.close, T.after, COLORS.after)}
      <text x="160" y="20" text-anchor="middle" font-size="11" style="fill: var(--muted)">00</text>
      <text x="306" y="164" text-anchor="middle" font-size="11" style="fill: var(--muted)">06</text>
      <text x="160" y="310" text-anchor="middle" font-size="11" style="fill: var(--muted)">12</text>
      <text x="14" y="164" text-anchor="middle" font-size="11" style="fill: var(--muted)">18</text>
      <g transform="rotate(${deg.toFixed(2)} 160 160)"><line x1="160" y1="160" x2="160" y2="38" style="stroke: var(--ink)" stroke-width="3" stroke-linecap="round"/><circle cx="160" cy="38" r="6" style="fill: var(--ink)"/></g>
    </svg>
    <div class="face">
      <span style="font-size: 11px; font-weight: 600; letter-spacing: 0.1em" class="muted">${city}</span>
      <span style="font-weight: 700; font-size: 34px; letter-spacing: -0.02em; line-height: 1.1">${pad(z.h)}:${pad(z.m)}</span>
      <span class="chip" style="margin-top: 4px; ${pill}">${status}</span>
    </div>`;

  let localZone = '';
  try { localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* ignore */ }
  $('local').innerHTML = html`<span class="muted">Your time</span> <strong>${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong> <span class="muted">· ${localZone}</span>`;
}

function renderStatic() {
  $('legend').innerHTML = [
    ['pre', `Pre-market ${cfg.MARKET_PREMARKET_OPEN}–${cfg.MARKET_OPEN}`],
    ['regular', `Regular ${cfg.MARKET_OPEN}–${cfg.MARKET_CLOSE}`],
    ['after', `After-hours ${cfg.MARKET_CLOSE}–${cfg.MARKET_AFTERHOURS_CLOSE}`],
    ['closed', 'Closed']
  ].map(([k, label]) => html`<span><i style="background: ${raw(COLORS[k])}${raw(k === 'closed' ? '; box-shadow: inset 0 0 0 1px var(--faint)' : '')}"></i>${label}</span>`).join('');
  const city = tz.split('/').pop().replace(/_/g, ' ');
  $('clock-note').textContent = `Exchange time (${city}), live. ${cfg.holidays.length} holiday${cfg.holidays.length === 1 ? '' : 's'} on the calendar.`;
  $('tz-label').textContent = `(${city} time)`;

  if (cfg.alertsUrl) {
    $('brief-card').hidden = false;
    $('brief-text').textContent = `${cfg.OPENING_BELL_MINUTES_BEFORE} minutes before the open: the overnight gaps, the narratives that formed while the exchange slept, and the memes worth watching.`;
    $('brief-link').href = cfg.alertsUrl;
  }
}

async function load() {
  try {
    const d = await api('/api/clock');
    sourceBadge($('src-gaps'), d.gaps);
    sourceBadge($('src-hours'), d.hours);

    const items = d.gaps.items || [];
    $('gaps').innerHTML = items.length ? items.map((g) => {
      const up = g.gapPct >= 0;
      const w = Math.min(50, (Math.abs(g.gapPct) / 7) * 50);
      return html`<div class="gap-row">
        <div style="display: flex; flex-direction: column"><span style="font-weight: 700">${g.ticker}</span><span style="font-size: 11px" class="muted">$${g.price.toFixed(2)}</span></div>
        <div class="bar"><span class="mid"></span><span class="fill" style="width: ${raw(w.toFixed(1))}%; background: ${raw(up ? 'var(--accent)' : 'var(--down-soft)')}; ${raw(up ? 'left: 50%' : 'right: 50%')}"></span></div>
        <span style="text-align: right; font-weight: 700; color: ${raw(up ? 'var(--accent-ink)' : 'var(--down)')}">${up ? '+' : '−'}${Math.abs(g.gapPct).toFixed(1)}%</span>
      </div>`;
    }).join('') : html`<div class="empty">No gap data yet.</div>`;

    const counts = d.hours.counts;
    const max = Math.max(1, ...counts);
    const color = (h) => { const m = h * 60; return m >= T.pre && m < T.open ? COLORS.pre : m >= T.open && m < T.close ? COLORS.regular : m >= T.close && m < T.after ? COLORS.after : 'var(--faint)'; };
    $('hours').innerHTML = counts.map((c, h) => `<div><i style="background: ${color(h)}; height: ${Math.round((c / max) * 160)}px"></i><small>${h % 3 === 0 ? pad(h) : ''}</small></div>`).join('');
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    const regular = counts.reduce((a, c, h) => a + (h * 60 >= T.open && h * 60 < T.close ? c : 0), 0);
    const off = Math.round(((total - regular) / total) * 100);
    $('off-share').textContent = `${off}%`;
    const span = d.hours.hours && d.hours.hours < 48 ? `last ${d.hours.hours}h` : `last ${d.hours.days} day${d.hours.days === 1 ? '' : 's'}`;
    $('hours-sub').textContent = `Pons launches per hour${d.hours.total ? ' (' + d.hours.total.toLocaleString('en-US') + ')' : ''}, ${span}`;
    $('hours').setAttribute('aria-label', `Meme launches per hour. ${off}% happened outside regular trading hours.`);
  } catch (err) {
    $('gaps').innerHTML = html`<div class="empty">Couldn't load: ${err.message}</div>`;
  }
}

renderStatic();
tick();
setInterval(tick, 1000);
await load();
every(cfg, load);
