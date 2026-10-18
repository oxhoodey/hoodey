import { initPage, api, html, raw, esc, fmtInt, fmtUsd, fmtPct, fmtDuration, timeAgo, sourceBadge, every, isAddress, explorerLink } from './common.js';

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

function renderCards(d) {
  sourceBadge($('src-events'), d);
  const n = d.events.length;
  $('cards-note').textContent = n ? `${n} move${n === 1 ? '' : 's'} of ${cfg.SPIKE_THRESHOLD_PCT}% or more in the last ${d.range}h` : '';
  if (!n) {
    $('cards').innerHTML = html`<div class="empty" style="grid-column: 1 / -1">No stock token moved ${cfg.SPIKE_THRESHOLD_PCT}% or more in the last ${d.range}h. Try a longer range.</div>`;
    return;
  }
  if (!d.events.some((e) => e.ticker === state.ticker)) state.ticker = d.events[0].ticker;
  $('cards').innerHTML = d.events.map((e) => {
    const color = e.up ? 'var(--accent-ink)' : 'var(--down)';
    return html`<button type="button" class="stock-card" data-t="${e.ticker}" aria-pressed="${e.ticker === state.ticker}">
      <div class="row"><span class="tk">${e.ticker}</span><span style="font-size: 14px; font-weight: 600; color: ${raw(color)}">${e.up ? '▲' : '▼'} ${fmtPct(e.movePct)}</span></div>
      <span class="small muted">${e.trigger} · ${timeAgo(e.at)}</span>
      <svg viewBox="0 0 800 240" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points(scale(e.series))}" fill="none" style="stroke: ${raw(color)}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>
      <span style="font-size: 13px" class="muted"><strong style="color: var(--ink)">${fmtInt(e.launches)}</strong> themed memecoins launched</span>
    </button>`;
  }).join('');
}

function renderDetail(d) {
  const e = d.events.find((x) => x.ticker === state.ticker);
  if (!e) { $('detail').innerHTML = html`<div class="empty">Pick a stock move above to see the memes it set off.</div>`; return; }
  const pts = scale(e.series);
  const area = `M0,240 L${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')} L800,240 Z`;
  const C = 2 * Math.PI * 74;
  const alive = e.alivePct;
  const spikeLeft = `${(Math.min(0.97, Math.max(0.03, e.spikePos)) * 100).toFixed(1)}%`;
  const toks = [...e.tokens].sort((a, b) => (a.afterMin ?? 0) - (b.afterMin ?? 0));
  const maxAfter = Math.max(1, ...toks.map((t) => t.afterMin || 0));
  const moveColor = e.up ? 'var(--accent-ink)' : 'var(--down)';

  const timeline = toks.length ? toks.slice(0, 6).map((t, i) => html`<div class="pt" style="left: calc(64px + (100% - 128px) * ${raw(((t.afterMin || 0) / maxAfter).toFixed(3))})">
      <span class="dot"></span><span class="chip ${raw(i === 0 ? 'chip-accent' : 'chip-raised')}">+${t.afterMin ?? 0}m · ${t.symbol}</span></div>`).join('') : '';

  const rows = toks.map((t) => html`<div class="trow" role="row">
      <span role="cell" class="tok"><span class="av">${(t.symbol || '?').slice(0, 2)}</span><span><span class="nm">${t.name}</span><span class="sy">${raw(explorerLink(cfg, t.address, '$' + (t.symbol || '')))}</span></span></span>
      <span role="cell" class="muted">+${t.afterMin ?? 0}m</span>
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
        <span class="eyebrow">${e.trigger} · ${timeAgo(e.at)}</span>
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
          <div class="spike" style="left: ${raw(spikeLeft)}"></div><span class="spike-label" style="left: ${raw(spikeLeft)}">Spike</span>
        </div>
        <figcaption class="small muted">${e.ticker} stock token price over the last ${d.range}h · dashed line marks the spike</figcaption>
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
      <div class="panel-head"><h3 class="h2">Launch timeline</h3><span class="small muted">${e.firstAfterMin == null ? 'no themed launch yet' : `first token +${e.firstAfterMin}m after the spike`}</span></div>
      ${raw(toks.length ? `<div class="timeline"><div class="line"></div>${timeline}</div>` : '<div class="empty">No themed memecoin has launched since this move yet.</div>')}
    </div>
    ${raw(toks.length ? html`<div style="display: flex; flex-direction: column; gap: 12px">
      <h3 class="h2">Born from this spike</h3>
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

async function load() {
  try {
    const d = await api(`/api/radar?range=${state.range}`);
    state.data = d;
    renderCards(d);
    renderDetail(d);
    renderSide(d);
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
        <span class="small" style="color: #CFE3D4">${w.address.slice(0, 6)}…${w.address.slice(-4)} · ${w.label.toLowerCase()} · last ${w.days} days${w.source !== 'live' ? ' · sample' : ''}</span>
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
await load();
every(cfg, load);
