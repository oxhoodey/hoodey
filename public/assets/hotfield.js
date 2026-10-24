// Heat map: the "Hot right now" board as treemap tiles, like a stock market heat map.
//   tile area = the metric chosen in "Size by" (volume by default)
//   colour    = price change in the window (green up, orange/red down, grey flat)
//   bottom bar = buy pressure (green share = buys)
//   red corner = at least one red flag
import { html, raw, esc, fmtUsd, fmtInt, fmtPct, timeAgo, avatar, ponsLink } from './common.js';

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function fmtPrice(p) {
  if (p == null || !Number.isFinite(p) || p <= 0) return '—';
  if (p >= 1) return '$' + p.toFixed(2);
  const zeros = Math.floor(-Math.log10(p));
  if (zeros < 4) return '$' + p.toPrecision(3);
  const sub = String(zeros).split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[c]).join('');
  const digits = Math.round(p * 10 ** (zeros + 3)).toString().slice(0, 3);
  return `$0.0${sub}${digits}`;
}

export const METRICS = {
  volume: { label: 'volume', of: (r) => r.volumeUsd || 0 },
  traders: { label: 'traders', of: (r) => r.traders || 0 },
  momentum: { label: 'price move', of: (r) => Math.abs(r.changePct || 0) },
  buy: { label: 'buy pressure', of: (r) => r.buyPct || 0 },
  new: { label: 'freshness', of: (r) => (r.launchedAt ? Math.max(0, 1 - (Date.now() - Date.parse(r.launchedAt)) / (6 * 3600e3)) : 0) }
};

// Squarified treemap (Bruls et al.): rows of tiles kept close to square so labels stay readable.
function treemap(items, x, y, w, h) {
  const out = [];
  const total = items.reduce((a, it) => a + it.v, 0) || 1;
  let rest = items.map((it) => ({ ...it, a: (it.v / total) * w * h }));
  let rx = x, ry = y, rw = w, rh = h;
  const worst = (row, side) => {
    const sum = row.reduce((a, r) => a + r.a, 0);
    const max = Math.max(...row.map((r) => r.a)), min = Math.min(...row.map((r) => r.a));
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };
  while (rest.length) {
    const side = Math.min(rw, rh);
    const row = [rest[0]];
    let i = 1;
    while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) { row.push(rest[i]); i++; }
    rest = rest.slice(i);
    const sum = row.reduce((a, r) => a + r.a, 0);
    if (rw >= rh) { // lay the row as a column on the left
      const cw = sum / rh;
      let cy = ry;
      for (const r of row) { const ch = r.a / cw; out.push({ ...r, x: rx, y: cy, w: cw, h: ch }); cy += ch; }
      rx += cw; rw -= cw;
    } else { // lay the row along the top
      const ch = sum / rw;
      let cx = rx;
      for (const r of row) { const cw = r.a / ch; out.push({ ...r, x: cx, y: ry, w: cw, h: ch }); cx += cw; }
      ry += ch; rh -= ch;
    }
  }
  return out;
}

function layout(rows, metric, W, H) {
  const vals = rows.map((r) => Math.max(0, METRICS[metric].of(r)));
  const max = Math.max(...vals, 1e-9);
  // keep small tokens visible: every tile gets at least a sliver of area
  const items = rows.map((row, i) => ({ row, rank: i, v: Math.max(vals[i], max * 0.035) }));
  items.sort((a, b) => b.v - a.v);
  return treemap(items, 0, 0, W, H);
}

// Colour by price move: tint strength grows with the size of the move, capped at ±40%.
function colorOf(r) {
  const c = r.changePct;
  if (c == null || Math.abs(c) < 0.5) return { bg: '#EEF3EF', ink: 'var(--ink)', strong: false };
  const k = Math.min(1, Math.abs(c) / 40);
  const strong = k > 0.45;
  if (c > 0) return { bg: `hsl(124 ${Math.round(55 + 35 * k)}% ${Math.round(90 - 52 * k)}%)`, ink: strong ? '#FFFFFF' : '#0B4A1D', strong };
  return { bg: `hsl(${Math.round(18 - 10 * k)} ${Math.round(70 + 20 * k)}% ${Math.round(91 - 42 * k)}%)`, ink: strong ? '#FFFFFF' : '#7A2A0C', strong };
}

function bigSpark(vals, up) {
  if (!vals || vals.length < 2) return '';
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * 300, 70 - ((v - min) / span) * 60]);
  const line = pts.map((p) => p.map((x) => x.toFixed(1)).join(',')).join(' ');
  const color = up ? 'var(--accent)' : 'var(--down-soft)';
  return `<svg class="fx-spark" viewBox="0 0 300 76" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="fxg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${up ? '#00C805' : '#F08A5D'}" stop-opacity="0.28"/><stop offset="1" stop-color="${up ? '#00C805' : '#F08A5D'}" stop-opacity="0"/></linearGradient></defs>
    <polygon points="0,76 ${line} 300,76" fill="url(#fxg)"/>
    <polyline points="${line}" fill="none" style="stroke: ${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

export function createHotField({ stage, focus, cfg, onOpen }) {
  const orbs = new Map(); // address -> tile element
  let rows = [], metric = 'volume', selected = null, pinned = false, lastSize = '';

  function renderFocus(r, rank) {
    if (!r) { focus.innerHTML = '<div class="empty">No token passes these filters right now.</div>'; return; }
    const up = (r.changePct ?? 0) >= 0;
    const flags = r.flags.length ? r.flags.map((f) => `<span class="flag-c ${esc(f.k)}">${esc(f.label)}</span>`).join('') : '<span class="flag-c clean">No red flags</span>';
    focus.innerHTML = html`
      <div class="fx-head">
        <span class="fx-rank">#${rank + 1}</span>
        <div class="tok">${raw(avatar(r))}<span><span class="nm">${r.name || r.symbol}</span><span class="sy">$${r.symbol}${r.ticker ? ' · ' + r.ticker : ''}${r.launchedAt ? ' · ' + timeAgo(r.launchedAt).replace(' ago', ' old') : ''}</span></span></div>
      </div>
      <div class="fx-price">
        <span class="fx-big">${fmtPrice(r.priceUsd)}</span>
        <span class="fx-chg ${raw(r.changePct == null ? '' : up ? 'up' : 'down')}">${r.changePct == null ? '—' : fmtPct(r.changePct)}</span>
      </div>
      ${raw(bigSpark(r.spark, up))}
      <div class="fx-stats">
        <div><span>Volume</span><b>${fmtUsd(r.volumeUsd)}</b></div>
        <div><span>Trades</span><b>${fmtInt(r.trades)}</b></div>
        <div><span>Traders</span><b>${fmtInt(r.traders)}</b></div>
        <div><span>Top wallet</span><b class="${raw(r.topWalletPct >= 50 ? 'bad' : '')}">${r.topWalletPct == null ? '—' : r.topWalletPct + '%'}</b></div>
      </div>
      ${raw(r.buyPct == null ? '' : html`<div class="fx-bp"><div class="fx-bp-top"><span>Buy pressure</span><b>${r.buyPct}% buys</b></div><div class="bp-track"><span style="width: ${r.buyPct}%"></span></div><small class="muted">${r.buys} buys · ${r.sells} sells</small></div>`)}
      <div class="flagset">${raw(flags)}</div>
      <div class="fx-actions">
        ${raw(ponsLink(cfg, r.address, 'Trade on Pons', 'pons-btn'))}
        <a class="btn fx-check" href="/copycat?address=${r.address}">Copycat check</a>
      </div>`;
  }

  function select(addr, pin) {
    const idx = rows.findIndex((r) => r.address === addr);
    if (idx < 0) return;
    selected = addr;
    if (pin != null) pinned = pin;
    orbs.forEach((el, a) => el.classList.toggle('on', a === addr));
    renderFocus(rows[idx], idx);
  }

  function paint() {
    stage.querySelectorAll(':scope > .skel').forEach((e) => e.remove());
    const W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H) return;
    lastSize = `${W}x${H}`;
    const tiles = layout(rows, metric, W, H);
    const keep = new Set(tiles.map((t) => t.row.address));
    for (const [a, el] of orbs) {
      if (!keep.has(a)) { el.classList.add('out'); setTimeout(() => el.remove(), 400); orbs.delete(a); }
    }
    const gap = W < 520 ? 3 : 5;
    for (const t of tiles) {
      const r = t.row;
      let el = orbs.get(r.address);
      const fresh = !el;
      if (fresh) {
        el = document.createElement('button');
        el.type = 'button';
        el.dataset.a = r.address;
        stage.appendChild(el);
        orbs.set(r.address, el);
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('in')));
      }
      const w = Math.max(0, t.w - gap), h = Math.max(0, t.h - gap);
      const size = w > 220 && h > 140 ? 'xl' : w > 150 && h > 96 ? 'lg' : w > 84 && h > 80 ? 'md' : 'sm';
      // text scales with the tile so it never spills over the edge
      el.style.setProperty('--fchg', Math.max(10, Math.min({ xl: 34, lg: 24, md: 15, sm: 11 }[size], w / 7.2)).toFixed(1) + 'px');
      el.style.setProperty('--fsym', Math.max(10, Math.min({ xl: 20, lg: 15, md: 14, sm: 11 }[size], w / 8)).toFixed(1) + 'px');
      const flagText = w >= 210;
      const col = colorOf(r);
      const up = (r.changePct ?? 0) >= 0;
      el.style.left = (t.x + gap / 2).toFixed(1) + 'px';
      el.style.top = (t.y + gap / 2).toFixed(1) + 'px';
      el.style.width = w.toFixed(1) + 'px';
      el.style.height = h.toFixed(1) + 'px';
      el.style.setProperty('--tbg', col.bg);
      el.style.setProperty('--tink', col.ink);
      el.style.setProperty('--bp', (r.buyPct ?? 50) + '%');
      el.className = `tile ${size}${fresh && !reduceMotion ? ' in' : ''}${col.strong ? ' strong' : ''}${r.flags.length ? ' flagged' : ''}${r.address === selected ? ' on' : ''}`;
      el.setAttribute('aria-label', `#${t.rank + 1} ${r.name || r.symbol}, ${fmtUsd(r.volumeUsd)} volume, ${r.changePct == null ? 'no price change' : fmtPct(r.changePct)}${r.flags.length ? ', ' + r.flags.length + ' red flag(s)' : ''}`);
      const chg = r.changePct == null ? '—' : fmtPct(r.changePct);
      el.classList.toggle('tiny', w < 40 || h < 30);
      el.innerHTML = size === 'sm'
        ? `<span class="t-sym">${esc(r.symbol || '?')}</span><span class="t-chg">${esc(chg)}</span>${r.flags.length ? '<i class="t-flag" aria-hidden="true"></i>' : ''}<span class="t-bp" aria-hidden="true"></span>`
        : `<span class="t-top">${size === 'md' ? '' : avatar(r)}<span class="t-id"><span class="t-sym">$${esc(r.symbol || '?')}</span>${size === 'xl' ? `<span class="t-name">${esc(r.name || '')}</span>` : ''}</span></span>
           <span class="t-chg">${up && r.changePct ? '▲' : r.changePct ? '▼' : ''} ${esc(chg)}</span>
           <span class="t-vol">${esc(fmtUsd(r.volumeUsd))}${size === 'xl' || size === 'lg' ? ' vol · ' + esc(fmtInt(r.traders)) + ' traders' : ''}</span>
           ${r.flags.length ? `<i class="t-flag${flagText ? '' : ' mini'}" aria-hidden="true">${flagText ? esc(r.flags[0].label) : ''}</i>` : ''}
           <span class="t-bp" aria-hidden="true"></span>`;
    }
    if (!rows.find((r) => r.address === selected) || !pinned) select(rows[0] && rows[0].address);
    else select(selected);
  }

  stage.addEventListener('click', (e) => {
    const b = e.target.closest('.tile');
    if (!b) return;
    select(b.dataset.a, true);
    if (matchMedia('(max-width: 900px)').matches) focus.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  });
  stage.addEventListener('pointerover', (e) => {
    const b = e.target.closest('.tile');
    if (b && !pinned && matchMedia('(hover: hover)').matches) select(b.dataset.a);
  });
  stage.addEventListener('dblclick', (e) => { const b = e.target.closest('.tile'); if (b) onOpen && onOpen(b.dataset.a); });

  let t;
  new ResizeObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => { if (`${stage.clientWidth}x${stage.clientHeight}` !== lastSize) paint(); }, 120);
  }).observe(stage);

  return {
    update(newRows, newMetric) {
      rows = newRows;
      metric = newMetric;
      stage.querySelectorAll('.empty, :scope > .skel').forEach((e) => e.remove());
      if (!rows.length) {
        for (const [, el] of orbs) el.remove();
        orbs.clear();
        stage.insertAdjacentHTML('beforeend', '<div class="empty">No token passes these filters right now. Turn a filter off to see more.</div>');
        renderFocus(null);
        return;
      }
      paint();
    }
  };
}
