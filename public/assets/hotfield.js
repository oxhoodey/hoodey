// Heat Core: the "Hot right now" board as a field of glowing token orbs.
//   size  = the metric chosen in "Size by" (volume by default)
//   place = rank: the hottest token sits in the core, cooler ones drift outward
//   glow  = price change in the window (green up, orange down)
//   ring  = buy pressure (green share = buys)
//   red dot = at least one red flag
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

// Circle packing: start on a golden-angle spiral by rank, then relax overlaps while pulling toward the core.
function layout(rows, metric, W, H) {
  const n = rows.length;
  if (!n) return [];
  const vals = rows.map((r) => METRICS[metric].of(r));
  const max = Math.max(...vals, 1e-9);
  const w = vals.map((v) => 0.32 + 0.68 * Math.sqrt(Math.max(0, v) / max));
  const area = W * H * (n < 6 ? 0.22 : 0.36);
  const s = Math.sqrt(area / (Math.PI * w.reduce((a, x) => a + x * x, 0)));
  const rMax = Math.min(W, H) * 0.2, rMin = Math.max(16, Math.min(W, H) * 0.045);
  const cx = W / 2, cy = H / 2;
  const sx = Math.max(1, W / H) ** 0.6; // spread wider than tall on wide stages
  const nodes = rows.map((row, i) => {
    const r = Math.max(rMin, Math.min(rMax, s * w[i]));
    const a = i * 2.39996, d = s * 0.95 * Math.sqrt(i);
    return { row, r, x: cx + Math.cos(a) * d * sx, y: cy + Math.sin(a) * d / sx, rank: i };
  });
  const pad = Math.max(6, Math.min(W, H) * 0.014);
  for (let it = 0; it < 260; it++) {
    const pull = 0.012 * (1 - it / 300);
    for (const a of nodes) {
      const k = pull * (1.6 - Math.min(1, a.rank / n)); // hotter = stronger pull to the core
      a.x += (cx - a.x) * k / sx;
      a.y += (cy - a.y) * k * sx;
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.hypot(dx, dy) || 0.01;
        const min = a.r + b.r + pad;
        if (dist < min) {
          const push = (min - dist) / 2;
          dx /= dist; dy /= dist;
          // the hotter orb moves less
          const wa = a.rank < b.rank ? 0.35 : 0.65, wb = 1 - wa;
          a.x -= dx * push * wa * 2; a.y -= dy * push * wa * 2;
          b.x += dx * push * wb * 2; b.y += dy * push * wb * 2;
        }
      }
    }
    for (const a of nodes) {
      a.x = Math.max(a.r + 4, Math.min(W - a.r - 4, a.x));
      a.y = Math.max(a.r + 4, Math.min(H - a.r - 22, a.y));
    }
  }
  return nodes;
}

function glowOf(r) {
  const c = r.changePct;
  if (c == null) return 'rgba(86, 104, 91, 0.25)';
  const k = Math.min(1, Math.abs(c) / 60);
  return c >= 0 ? `rgba(0, 200, 5, ${(0.18 + 0.5 * k).toFixed(2)})` : `rgba(240, 120, 70, ${(0.18 + 0.5 * k).toFixed(2)})`;
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
  const orbs = new Map(); // address -> element
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
    const W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H) return;
    lastSize = `${W}x${H}`;
    const nodes = layout(rows, metric, W, H);
    const keep = new Set(nodes.map((n) => n.row.address));
    for (const [a, el] of orbs) {
      if (!keep.has(a)) { el.classList.add('out'); setTimeout(() => el.remove(), 450); orbs.delete(a); }
    }
    nodes.forEach((n, i) => {
      const r = n.row;
      let el = orbs.get(r.address);
      const fresh = !el;
      if (fresh) {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'orb in';
        el.dataset.a = r.address;
        el.style.transform = `translate(${W / 2 - n.r}px, ${H / 2 - n.r}px) scale(0.2)`;
        stage.appendChild(el);
        orbs.set(r.address, el);
        requestAnimationFrame(() => el.classList.remove('in'));
      }
      const up = (r.changePct ?? 0) >= 0;
      const d = Math.round(n.r * 2);
      el.style.setProperty('--d', d + 'px');
      el.style.setProperty('--bp', (r.buyPct ?? 50) + '%');
      el.style.setProperty('--glow', glowOf(r));
      el.style.setProperty('--delay', (i * 0.37 % 4).toFixed(2) + 's');
      el.style.zIndex = String(100 - i);
      el.classList.toggle('flagged', r.flags.length > 0);
      el.classList.toggle('down', !up);
      el.classList.toggle('small', d < 78);
      el.setAttribute('aria-label', `#${i + 1} ${r.name || r.symbol}, ${fmtUsd(r.volumeUsd)} volume, ${r.changePct == null ? 'no price change' : fmtPct(r.changePct)}${r.flags.length ? ', ' + r.flags.length + ' red flag(s)' : ''}`);
      el.innerHTML = `<span class="orb-body"><span class="orb-ring"></span><span class="orb-core">${avatar(r)}</span>${r.flags.length ? '<i class="orb-flag" aria-hidden="true"></i>' : ''}</span>
        <span class="orb-tag"><b>$${esc(r.symbol || '?')}</b><em class="${up ? 'up' : 'down'}">${r.changePct == null ? '' : esc(fmtPct(r.changePct))}</em></span>`;
      el.style.transform = `translate(${(n.x - n.r).toFixed(1)}px, ${(n.y - n.r).toFixed(1)}px)`;
      if (fresh && reduceMotion) el.classList.remove('in');
    });
    if (!rows.find((r) => r.address === selected) || !pinned) select(rows[0] && rows[0].address);
    else select(selected);
  }

  stage.addEventListener('click', (e) => {
    const b = e.target.closest('.orb');
    if (!b) return;
    select(b.dataset.a, true);
    if (matchMedia('(max-width: 900px)').matches) focus.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  });
  stage.addEventListener('pointerover', (e) => {
    const b = e.target.closest('.orb');
    if (b && !pinned && matchMedia('(hover: hover)').matches) select(b.dataset.a);
  });
  stage.addEventListener('dblclick', (e) => { const b = e.target.closest('.orb'); if (b) onOpen && onOpen(b.dataset.a); });

  let t;
  new ResizeObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => { if (`${stage.clientWidth}x${stage.clientHeight}` !== lastSize) paint(); }, 120);
  }).observe(stage);

  return {
    update(newRows, newMetric) {
      rows = newRows;
      metric = newMetric;
      stage.querySelectorAll('.empty').forEach((e) => e.remove());
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
