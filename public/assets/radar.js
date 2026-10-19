import { initPage, api, html, raw, esc, fmtInt, fmtUsd, fmtPct, fmtDuration, timeAgo, sourceBadge, every, isAddress, explorerLink, ponsLink, avatar } from './common.js';
import { createParticleMark } from './particlemark.js';
import { createHotField, fmtPrice, METRICS } from './hotfield.js';
import { createLaunchTape } from './launchtape.js';

const cfg = await initPage('radar');
const state = { range: [1, 6, 24].includes(cfg.SPIKE_LOOKBACK_HOURS) ? cfg.SPIKE_LOOKBACK_HOURS : 6, ticker: null, data: null };

const $ = (id) => document.getElementById(id);

function scale(series, w = 800, h = 240, pad = 14) {
  const min = Math.min(...series), max = Math.max(...series);
  const span = max - min || 1;
  return series.map((v, i) => [(i / (series.length - 1)) * w, pad + (1 - (v - min) / span) * (h - pad * 2)]);
}
const points = (pts) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

function renderRange() {
  $('range').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.h) === state.range)));
}

const movesOf = (d) => d.moves || d.events || [];

function renderCards(d) {
  sourceBadge($('src-events'), d);
  const list = movesOf(d);
  const spikes = list.filter((m) => m.spike).length;
  $('cards-note').textContent = list.length
    ? (spikes ? `${spikes} spike${spikes === 1 ? '' : 's'} of ${cfg.SPIKE_THRESHOLD_PCT}%+ in the last ${d.range}h` : `No spike of ${cfg.SPIKE_THRESHOLD_PCT}%+ in the last ${d.range}h. Watching ${list.length} stock tokens.`)
    : '';
  if (!list.length) {
    $('cards').innerHTML = html`<div class="empty" style="grid-column: 1 / -1">No stock token data yet. Add contract addresses to STOCK_TOKENS.</div>`;
    return;
  }
  if (!list.some((e) => e.ticker === state.ticker)) state.ticker = list[0].ticker;
  $('cards').innerHTML = list.map((e) => {
    const color = e.up ? 'var(--accent-ink)' : 'var(--down)';
    return html`<button type="button" class="stock-card${raw(e.spike ? ' spike' : '')}" data-t="${e.ticker}" aria-pressed="${e.ticker === state.ticker}">
      <div class="row"><span class="tk">${e.ticker}</span>${raw(e.spike ? '<span class="flag">SPIKE</span>' : '<span class="quiet">WATCHING</span>')}</div>
      <div class="row"><span style="font-size: 22px; font-weight: 700; letter-spacing: -0.02em">${e.price != null ? '$' + Number(e.price).toFixed(2) : '—'}</span><span style="font-size: 14px; font-weight: 600; color: ${raw(color)}">${e.up ? '▲' : '▼'} ${fmtPct(e.movePct, Math.abs(e.movePct) < 1 ? 2 : 1)}</span></div>
      <svg viewBox="0 0 800 240" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points(scale(e.series))}" fill="none" style="stroke: ${raw(color)}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>
      <span style="font-size: 13px" class="muted"><strong style="color: var(--ink)">${fmtInt(e.launches)}</strong> themed meme${e.launches === 1 ? '' : 's'} · ${e.trigger}</span>
    </button>`;
  }).join('');
}

function renderDetail(d) {
  const e = movesOf(d).find((x) => x.ticker === state.ticker);
  if (!e) { $('detail').innerHTML = html`<div class="empty">Pick a stock token above to see the memes around it.</div>`; return; }
  const pts = scale(e.series);
  const area = `M0,240 L${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')} L800,240 Z`;
  const C = 2 * Math.PI * 74;
  const alive = e.alivePct;
  const spikeLeft = e.spikePos == null ? null : `${(Math.min(0.97, Math.max(0.03, e.spikePos)) * 100).toFixed(1)}%`;
  const toks = [...e.tokens].sort((a, b) => Date.parse(a.at || 0) - Date.parse(b.at || 0) || (a.afterMin ?? 0) - (b.afterMin ?? 0));
  toks.forEach((t) => { t._pos = t.afterMin != null ? t.afterMin : (t.at ? (Date.parse(t.at) - (Date.now() - d.range * 3600e3)) / 60000 : 0); });
  const maxAfter = Math.max(1, ...toks.map((t) => t._pos || 0));
  const moveColor = e.up ? 'var(--accent-ink)' : 'var(--down)';

  const timeline = toks.length ? toks.slice(0, 6).map((t, i) => html`<div class="pt" style="left: calc(64px + (100% - 128px) * ${raw((Math.max(0, t._pos || 0) / maxAfter).toFixed(3))})">
      <span class="dot"></span><span class="chip ${raw(i === 0 ? 'chip-accent' : 'chip-raised')}">${t.afterMin == null ? timeAgo(t.at) : '+' + t.afterMin + 'm'} · ${t.symbol}</span></div>`).join('') : '';

  const rows = toks.map((t) => html`<div class="trow" role="row">
      <span role="cell" class="tok">${raw(avatar(t))}<span><span class="nm">${t.name}</span><span class="sy">${raw(explorerLink(cfg, t.address, '$' + (t.symbol || '')))} ${raw(ponsLink(cfg, t.address))}</span></span></span>
      <span role="cell" class="muted">${t.afterMin == null ? timeAgo(t.at).replace(' ago', '') : '+' + t.afterMin + 'm'}</span>
      <span role="cell" class="muted">${t.launchpad}</span>
      <span role="cell">${fmtInt(t.holders)}</span>
      <span role="cell">${fmtUsd(t.volumeUsd)}</span>
      <span role="cell">${t.top10Pct == null ? '—' : t.top10Pct + '%'}</span>
      <span role="cell" style="font-size: 12px; ${raw(t.copycat ? 'font-weight: 600; color: var(--danger)' : 'color: var(--muted)')}">${t.copycat ? `Like $${t.copycat.of} ${t.copycat.score}%` : 'Original'}</span>
      <span role="cell">${fmtDuration(t.lifespanMin)}</span>
      <span role="cell"><span class="risk ${t.risk}">${t.risk ? t.risk[0].toUpperCase() + t.risk.slice(1) : '—'}</span></span>
    </div>`).join('');

  $('detail').innerHTML = html`
    <div class="panel-head" style="align-items: center">
      <div style="display: flex; flex-direction: column; gap: 2px">
        <span class="eyebrow">${e.trigger} · last trade ${timeAgo(e.at)}</span>
        <h2 style="font-weight: 700; font-size: 30px; letter-spacing: -0.02em">${e.name} <span style="font-size: 18px; color: ${raw(moveColor)}">${e.up ? '▲' : '▼'} ${fmtPct(e.movePct)}</span></h2>
      </div>
      <span class="chip chip-inset" style="padding: 10px 16px; font-size: 13px; font-weight: 500" >Meme volume <strong>${fmtUsd(e.volumeUsd)}</strong></span>
    </div>
    <div style="display: flex; flex-wrap: wrap; gap: 28px; align-items: center">
      <figure style="margin: 0; flex: 999 1 420px; min-width: 0; display: flex; flex-direction: column; gap: 12px">
        <div class="chart">
          <svg viewBox="0 0 800 240" preserveAspectRatio="none" role="img" aria-label="${e.ticker} stock token price, the dashed line marks the spike">
            <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color: ${raw(e.up ? 'var(--accent)' : 'var(--down)')}" stop-opacity="0.22"/><stop offset="1" style="stop-color: ${raw(e.up ? 'var(--accent)' : 'var(--down)')}" stop-opacity="0"/></linearGradient></defs>
            <path d="${area}" fill="url(#area)"/>
            <polyline points="${points(pts)}" fill="none" style="stroke: ${raw(moveColor)}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
          </svg>
          ${raw(spikeLeft ? `<div class="spike" style="left: ${spikeLeft}"></div><span class="spike-label" style="left: ${spikeLeft}">Spike</span>` : '')}
        </div>
        <figcaption class="small muted">${e.ticker} stock token price over the last ${d.range}h${e.spike ? ' · dashed line marks the spike' : ''}</figcaption>
      </figure>
      <div style="flex: 1 1 200px; display: flex; flex-direction: column; align-items: center; gap: 12px">
        <div class="gauge" style="width: 180px; height: 180px">
          <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="${alive == null ? 'Survival not measured yet' : alive + '% of themed tokens still alive'}"><circle cx="90" cy="90" r="74" fill="none" style="stroke: var(--track)" stroke-width="8"/>${raw(alive == null ? '' : `<circle cx="90" cy="90" r="74" fill="none" style="stroke: var(--accent)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(C * alive / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 90 90)"/>`)}</svg>
          <div class="core" style="width: 104px; height: 104px; font-size: 26px">${alive == null ? '—' : alive + '%'}</div>
        </div>
        <span class="small muted" style="text-align: center">of themed tokens still alive</span>
      </div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 14px">
      <div class="panel-head"><h3 class="h2">Launch timeline</h3><span class="small muted">${e.spike ? (e.firstAfterMin == null ? 'no themed launch yet' : `first token +${e.firstAfterMin}m after the spike`) : `themed launches in the last ${d.range}h`}</span></div>
      ${raw(toks.length ? `<div class="timeline"><div class="line"></div>${timeline}</div>` : `<div class="empty">${e.spike ? 'No themed memecoin has launched since this move yet.' : `No ${esc(e.ticker)}-themed memecoin in the last ${d.range}h. We keep watching.`}</div>`)}
    </div>
    ${raw(toks.length ? html`<div style="display: flex; flex-direction: column; gap: 12px">
      <h3 class="h2">${e.spike ? 'Born from this spike' : 'Themed launches'}</h3>
      <div class="table-scroll"><div class="ttable" role="table" aria-label="Themed tokens">
        <div class="trow head" role="row"><span role="columnheader">TOKEN</span><span role="columnheader">BORN</span><span role="columnheader">PAD</span><span role="columnheader">HOLDERS</span><span role="columnheader">VOLUME</span><span role="columnheader">TOP10</span><span role="columnheader">COPYCAT</span><span role="columnheader">LIFESPAN</span><span role="columnheader">RISK</span></div>
        ${raw(rows)}
      </div></div>
    </div>` : '')}`;
}

function renderSide(d) {
  sourceBadge($('src-hot'), d.hot);
  const items = d.hot.items || [];
  const max = Math.max(1, ...items.map((h) => h.count));
  $('hot').innerHTML = items.length ? items.map((h) => {
    const w = Math.max(6, Math.round((h.count / max) * 100));
    return html`<div style="display: flex; flex-direction: column; gap: 8px">
      <div style="display: flex; justify-content: space-between; font-size: 13px"><span style="font-weight: 600">${h.ticker}</span><span class="muted">${h.count} tokens</span></div>
      <div class="bar"><div class="fill" style="width: ${raw(w)}%"></div><span class="knob" style="left: ${raw(w)}%"></span></div>
    </div>`;
  }).join('') : html`<div class="empty">No stock-themed launches in the last 24h.</div>`;

  sourceBadge($('src-life'), d.life);
  const L = d.life;
  const top = Math.max(1, ...L.buckets.map((b) => b.pct));
  $('life').innerHTML = html`
    <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px"><span style="font-weight: 700; font-size: 36px; letter-spacing: -0.03em">${fmtDuration(L.medianMin)}</span><span class="small muted">median lifespan</span></div>
    <div class="hist" role="img" aria-label="${L.buckets.map((b) => `${b.pct}% ${b.label}`).join(', ')}">${raw(L.buckets.map((b, i) => `<span style="height: ${Math.max(10, (b.pct / top) * 100)}%; opacity: ${[1, 0.75, 0.45, 0.3][i] ?? 0.3}"></span>`).join(''))}</div>
    <div style="display: grid; grid-template-columns: repeat(${raw(L.buckets.length)}, minmax(0, 1fr)); text-align: center; font-size: 11px; margin-top: 10px" class="muted">
      ${raw(L.buckets.map((b) => html`<span><strong style="display: block; color: var(--ink); font-size: 13px">${b.pct}%</strong>${b.label}</span>`).join(''))}
    </div>`;
}

// ── hero: live pulse, radar scope, ticker, feed ──────────────────────
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const seen = new Set();

function countTo(el, to) {
  if (to == null || !Number.isFinite(to)) { el.textContent = '—'; return; }
  const from = Number(el.dataset.n || 0);
  el.dataset.n = to;
  if (reduceMotion || from === to) { el.textContent = fmtInt(to); return; }
  const t0 = performance.now(), dur = 900;
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmtInt(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderPulse(stats) {
  if (!stats) return;
  document.querySelectorAll('#pulse [data-k]').forEach((el) => countTo(el, stats[el.dataset.k]));
  const w = stats.windowHours;
  $('pulse-window').textContent = `Launches · ${w >= 23.5 ? '24h' : w >= 1 ? 'last ' + Math.round(w) + 'h' : 'last hour'}`;
}

// ── particle mark: the logo in dots; every new launch flies in ───────
const mark = createParticleMark($('pmark'));
if (/[?&]pmdebug/.test(location.search)) window.__mark = mark; // lets us test the ticker morph
const stage = $('eye-stage');
const knownMark = new Set();
function renderOrbit(latest) {
  const list = latest || [];
  const fresh = knownMark.size ? list.filter((t) => !knownMark.has(t.address)) : [];
  list.forEach((t) => knownMark.add(t.address));
  fresh.slice(0, 4).reverse().forEach((t, i) => setTimeout(() => mark.launch(t.risk), i * 700));
  if (list[0]) {
    mark.setLabel(list[0].symbol, list[0].risk, list[0].at);
    stage.setAttribute('aria-label', `The HoodEye mark drawn in dots. Newest Pons launch: $${list[0].symbol}.`);
  }
}
if (!reduceMotion) setTimeout(() => mark.launch('low'), 1400); // first arrival once the mark has formed

// ── stream: new launches drip in one by one, ages tick every second ──
const streamSeen = new Set();
const dripQueue = [];
const streamItems = [];
const STREAM_MAX = 5;
function badgeOf(t) {
  if (t.copycat) return `<span class="badge-s copy">COPY</span>`;
  if (t.ticker) return `<span class="badge-s tk">${esc(t.ticker)}</span>`;
  return `<span class="badge-s orig">ORIGINAL</span>`;
}
function ageText(at) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
function paintStream(enterAddr) {
  $('stream').innerHTML = streamItems.map((t) => html`<li class="${raw(t.address === enterAddr ? 'enter' : '')}"><i class="${raw(t.risk || 'low')}"></i><span class="nm"><b>$${t.symbol}</b>${t.name}</span>${raw(badgeOf(t))}<span class="age" data-at="${t.at}">${ageText(t.at)}</span></li>`).join('') || '<li><span></span><span class="muted">Waiting for the next launch…</span></li>';
}
function feedStream(latest, stats) {
  const list = (latest || []).filter((t) => t.at);
  if (!streamSeen.size) {
    list.slice(0, STREAM_MAX).forEach((t) => streamSeen.add(t.address));
    streamItems.push(...list.slice(0, STREAM_MAX));
    list.forEach((t) => streamSeen.add(t.address));
    paintStream();
  } else {
    list.filter((t) => !streamSeen.has(t.address)).reverse().forEach((t) => { streamSeen.add(t.address); dripQueue.push(t); });
  }
  if (stats && stats.lastHour != null) $('stream-count').textContent = `${fmtInt(stats.lastHour)} in the last hour`;
}
setInterval(() => {
  if (dripQueue.length) {
    const t = dripQueue.shift();
    streamItems.unshift(t);
    streamItems.length = Math.min(streamItems.length, STREAM_MAX);
    paintStream(t.address);
  } else {
    document.querySelectorAll('#stream .age').forEach((el) => { el.textContent = ageText(el.dataset.at); });
  }
}, reduceMotion ? 3000 : 1500);

function renderTicker(latest) {
  const items = (latest || []).map((t) => html`<a class="tk-item" href="/copycat?address=${t.address}"><i class="${raw(t.risk || 'low')}"></i><b>$${t.symbol}</b><span>${t.name}</span><span class="muted">${timeAgo(t.at)}${t.copycat ? ' · copy of $' + t.copycat.of : t.ticker ? ' · ' + t.ticker : ''}</span></a>`).join('');
  $('ticker').innerHTML = items + items.replace(/<a /g, '<a tabindex="-1" aria-hidden="true" ');
}

const tape = createLaunchTape({ tape: $('launch-tape'), grid: $('feed-rows'), count: $('lx-count'), cfg });

async function pollBlock() {
  if (cfg.DATA_MODE !== 'live') { $('live-label').textContent = 'SAMPLE MODE · DEMO DATA'; $('block').textContent = ''; return; }
  try {
    const h = await api('/healthz');
    if (h.chain && h.chain.block) $('block').textContent = '#' + h.chain.block.toLocaleString('en-US');
  } catch { /* keep last */ }
}
pollBlock();
setInterval(pollBlock, 5000);

// ── Hot right now ─────────────────────────────────────────────────────
const hot = { data: null, sort: 'volume', filters: {}, view: 'field' };
try { const saved = JSON.parse(localStorage.getItem('hoodeye.hot') || '{}'); if (saved.sort) hot.sort = saved.sort; if (saved.filters) hot.filters = saved.filters; if (saved.view) hot.view = saved.view; } catch { /* storage unavailable */ }
const saveHot = () => { try { localStorage.setItem('hoodeye.hot', JSON.stringify({ sort: hot.sort, filters: hot.filters, view: hot.view })); } catch { /* ignore */ } };

function spark(vals, up) {
  if (!vals || vals.length < 2) return '';
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * 64).toFixed(1)},${(23 - ((v - min) / span) * 20).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 64 26" aria-hidden="true"><polyline points="${pts}" fill="none" style="stroke: ${up ? 'var(--accent-ink)' : 'var(--down)'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function renderHot() {
  const d = hot.data;
  if (!d) return;
  sourceBadge($('src-trending'), d);
  $('hot-sub').textContent = `Most traded Pons tokens in the last ${d.windowMin} min · ${fmtInt(d.totalTrades)} trades scanned · every token checked for red flags.`;
  document.querySelectorAll('#hot-sort button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.s === hot.sort)));
  document.querySelectorAll('#hot-filters button').forEach((b) => b.setAttribute('aria-pressed', String(!!hot.filters[b.dataset.f])));
  const F = hot.filters;
  let rows = d.rows.filter((r) =>
    !(F.noCopy && r.copycat) && !(F.noRepeat && r.deployerLaunches >= 3) && !(F.noWhale && r.topWalletPct != null && r.topWalletPct >= 50) &&
    !(F.fresh && !(r.launchedAt && Date.now() - Date.parse(r.launchedAt) < 3600e3)) && !(F.stock && !r.ticker));
  const by = { volume: (r) => r.volumeUsd, traders: (r) => r.traders, momentum: (r) => r.changePct ?? -1e9, buy: (r) => r.buyPct ?? -1, new: (r) => (r.launchedAt ? Date.parse(r.launchedAt) : 0) }[hot.sort];
  rows = [...rows].sort((a, b) => by(b) - by(a));
  document.querySelectorAll('#hot-view button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === hot.view)));
  $('hot-field-wrap').hidden = hot.view !== 'field';
  document.querySelector('.hotx-legend').hidden = hot.view !== 'field';
  $('hot-list').hidden = hot.view !== 'list';
  $('legend-size').textContent = METRICS[hot.sort].label;
  if (hot.view === 'field') field.update(rows, hot.sort);
  const head = '<div class="hot-row head" role="row"><span role="columnheader">#</span><span role="columnheader">TOKEN</span><span role="columnheader">PRICE · CHANGE</span><span role="columnheader">VOLUME</span><span role="columnheader">TRADES</span><span role="columnheader">TRADERS</span><span role="columnheader">BUY PRESSURE</span><span role="columnheader">TOP WALLET</span><span role="columnheader">FLAGS</span><span role="columnheader">TRADE</span></div>';
  const body = rows.map((r, i) => {
    const up = (r.changePct ?? 0) >= 0;
    const flags = r.flags.length ? r.flags.map((f) => `<span class="flag-c ${esc(f.k)}">${esc(f.label)}</span>`).join('') : '<span class="flag-c clean">No red flags</span>';
    const bp = r.buyPct == null ? '<span class="muted">—</span>' : `<div class="bp"><div class="bp-track"><span style="width: ${r.buyPct}%"></span></div><small>${r.buyPct}% buys · ${r.buys}/${r.sells}</small></div>`;
    return html`<div class="hot-row" role="row" tabindex="0" data-href="/copycat?address=${r.address}">
      <span role="cell" class="rank${raw(i < 3 ? ' top' : '')}">${i + 1}</span>
      <span role="cell" class="tok">${raw(avatar(r))}<span><span class="nm">${r.name || r.symbol}</span><span class="sy">$${r.symbol}${r.ticker ? ' · ' + r.ticker : ''}${r.launchedAt ? ' · ' + timeAgo(r.launchedAt).replace(' ago', ' old') : ''}</span></span></span>
      <span role="cell" class="chg"><span style="display: flex; flex-direction: column; gap: 2px"><span style="color: ${raw(r.changePct == null ? 'var(--muted)' : up ? 'var(--accent-ink)' : 'var(--down)')}">${r.changePct == null ? '—' : fmtPct(r.changePct)}</span><small class="muted" style="font-weight: 500">${fmtPrice(r.priceUsd)}</small></span>${raw(spark(r.spark, up))}</span>
      <span role="cell" style="font-weight: 700">${fmtUsd(r.volumeUsd)}</span>
      <span role="cell">${fmtInt(r.trades)}</span>
      <span role="cell">${fmtInt(r.traders)}</span>
      <span role="cell">${raw(bp)}</span>
      <span role="cell" style="${raw(r.topWalletPct >= 50 ? 'color: var(--danger); font-weight: 700' : '')}">${r.topWalletPct == null ? '—' : r.topWalletPct + '%'}</span>
      <span role="cell" class="flagset">${raw(flags)}</span>
      <span role="cell">${raw(ponsLink(cfg, r.address, 'Pons', 'pons-btn sm'))}</span>
    </div>`;
  }).join('');
  $('hot-rows').innerHTML = head + (body || `<div class="empty">No token passes these filters right now. Turn a filter off to see more.</div>`);
}

const field = createHotField({ stage: $('hot-field'), focus: $('hot-focus'), cfg, onOpen: (a) => { location.href = `/copycat?address=${a}`; } });
$('hot-view').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; hot.view = b.dataset.v; saveHot(); renderHot(); });

async function loadHot() {
  try { hot.data = await api('/api/trending'); renderHot(); }
  catch (err) { $('hot-rows').innerHTML = html`<div class="empty">Couldn't load the board: ${err.message}</div>`; $('hot-focus').innerHTML = html`<div class="empty">Couldn't load the board: ${err.message}</div>`; }
}
// Rows open Copycat Eye; the Pons button inside opens ponsfamily.com instead.
for (const id of ['hot-rows']) {
  const box = $(id);
  const go = (e) => { const row = e.target.closest('[data-href]'); if (row && !e.target.closest('a')) location.href = row.dataset.href; };
  box.addEventListener('click', go);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(e); });
}
$('hot-sort').addEventListener('click', (e) => { const b = e.target.closest('button[data-s]'); if (!b) return; hot.sort = b.dataset.s; saveHot(); renderHot(); });
$('hot-filters').addEventListener('click', (e) => { const b = e.target.closest('button[data-f]'); if (!b) return; hot.filters[b.dataset.f] = !hot.filters[b.dataset.f]; saveHot(); renderHot(); });

async function load() {
  try {
    const d = await api(`/api/radar?range=${state.range}`);
    state.data = d;
    renderCards(d);
    renderDetail(d);
    renderSide(d);
    renderPulse(d.stats);
    renderOrbit(d.latest);
    feedStream(d.latest, d.stats);
    renderTicker(d.latest);
    tape.update(d.latest, d.timeline);
  } catch (err) {
    $('cards').innerHTML = html`<div class="empty" style="grid-column: 1 / -1">Couldn't load the radar: ${err.message}</div>`;
    $('detail').innerHTML = '';
  }
}

$('range').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-h]');
  if (!b) return;
  state.range = Number(b.dataset.h);
  renderRange();
  load();
});
$('cards').addEventListener('click', (ev) => {
  const b = ev.target.closest('.stock-card');
  if (!b || !state.data) return;
  state.ticker = b.dataset.t;
  renderCards(state.data);
  renderDetail(state.data);
});

if (cfg.alertsUrl) { $('alerts-card').hidden = false; $('alerts-link').href = cfg.alertsUrl; }

if (cfg.features.walletWatch) {
  $('wallet-card').hidden = false;
  $('wallet-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const addr = $('wallet-addr').value.trim();
    $('wallet-error').textContent = '';
    if (!isAddress(addr)) { $('wallet-error').textContent = 'That doesn’t look like an address. It should be 0x followed by 40 characters.'; return; }
    const btn = ev.target.querySelector('button');
    btn.disabled = true;
    $('wallet-out').innerHTML = '<div class="small" style="color: #CFE3D4">Looking up…</div>';
    try {
      const w = await api(`/api/wallet?address=${encodeURIComponent(addr)}`);
      const headline = w.netEth != null ? `${w.netEth > 0 ? '+' : w.netEth < 0 ? '−' : ''}${Math.abs(w.netEth).toFixed(2)} ETH` : fmtUsd(w.netUsd);
      const shares = w.tslaShares != null ? html`Equal to <strong>${Math.abs(w.tslaShares)} shares of TSLA</strong> today.` : '';
      const spy = w.spyPct != null ? html` In SPY, the same money would be ${w.spyPct >= 0 ? 'up' : 'down'} ${Math.abs(w.spyPct)}%.` : '';
      $('wallet-out').innerHTML = html`<div style="display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px solid #1E4A2C">
        <span class="small" style="color: #CFE3D4">${w.address.slice(0, 6)}…${w.address.slice(-4)} · ${w.label.toLowerCase()} · last ${w.window || w.days + ' days'}${w.source !== 'live' ? ' · sample' : ''}</span>
        <div style="font-weight: 700; font-size: 34px; letter-spacing: -0.03em; line-height: 1.1">${headline}</div>
        <p style="font-size: 14px">${raw(shares)}${raw(spy)}</p>
        ${raw(w.note ? html`<p class="small" style="color: #CFE3D4">${w.note}</p>` : '')}
      </div>`;
    } catch (err) {
      $('wallet-out').innerHTML = '';
      $('wallet-error').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
}

renderRange();
loadHot();
await load();
every(cfg, load);
every(cfg, loadHot);
