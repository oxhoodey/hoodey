// Launch Tape: the last hour of Pons launches on one live time axis, plus the newest launches as cards.
import { html, raw, esc, timeAgo, avatar, ponsLink } from './common.js';

const RISK_LABEL = { low: 'Low risk', medium: 'Medium risk', high: 'High risk' };
const ord = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

function ageShort(at) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return timeAgo(at).replace(' ago', '');
}

export function createLaunchTape({ tape, grid, count, cfg }) {
  const seen = new Set();
  let first = true;

  function renderTape(points) {
    const now = Date.now();
    const span = 3600e3;
    const pts = (points || []).filter((p) => now - Date.parse(p.at) <= span);
    // stack dots that land close together so bursts read as bursts
    const lanes = [];
    const gap = Math.max(1.1, 1500 / Math.max(200, tape.clientWidth - 80)); // ~15px between dots in a lane
    const dots = pts.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).map((p) => {
      const x = 100 - ((now - Date.parse(p.at)) / span) * 100;
      let lane = 0;
      while (lane < 5 && lanes[lane] != null && x - lanes[lane] < gap) lane++;
      lanes[lane] = x;
      return { p, x, lane: Math.min(lane, 5) };
    });
    count.textContent = String(pts.length);
    const ticks = [60, 45, 30, 15].map((m) => `<span class="tp-tick" style="left: ${100 - (m / 60) * 100}%">−${m}m</span>`).join('');
    tape.innerHTML = `<div class="tp-track">${ticks}<span class="tp-now"><i></i>now</span>${dots.map(({ p, x, lane }) =>
      `<a class="tp-dot ${esc(p.risk || 'low')}${seen.size && !seen.has(p.address) ? ' new' : ''}" href="/copycat?address=${esc(p.address)}" style="left: ${x.toFixed(2)}%; --lane: ${lane}" title="$${esc(p.symbol || '?')} · ${esc(timeAgo(p.at))} · ${esc(RISK_LABEL[p.risk] || '')}"><span class="sr">$${esc(p.symbol || '?')}</span></a>`).join('')}</div>`;
  }

  function card(t, isNew) {
    const copy = t.copycat;
    const verdict = copy
      ? html`<div class="lc-verdict bad"><i></i><span>Copy of <b>$${copy.of}</b> · ${copy.score}% name match</span></div>`
      : html`<div class="lc-verdict ok"><i></i><span>Original name · no older match</span></div>`;
    const dep = t.deployerLaunches > 1 ? `${ord(t.deployerLaunches)} launch from this wallet` : 'First launch from this wallet';
    const lvl = { low: 1, medium: 2, high: 3 }[t.risk] || 1;
    return html`<article class="lcard ${raw(t.risk || 'low')}${raw(isNew ? ' new' : '')}" tabindex="0" data-href="/copycat?address=${t.address}" aria-label="${t.name}, launched ${timeAgo(t.at)}, ${RISK_LABEL[t.risk] || ''}">
      <span class="lc-scan" aria-hidden="true"></span>
      <div class="lc-top">
        <div class="tok">${raw(avatar(t))}<span><span class="nm">${t.name || t.symbol}</span><span class="sy">$${t.symbol}</span></span></div>
        <span class="lc-age" data-at="${t.at}">${ageShort(t.at)}</span>
      </div>
      ${raw(verdict)}
      <div class="lc-meta">
        ${raw(t.ticker ? `<span class="chip chip-accent">${esc(t.ticker)} narrative</span>` : '')}
        <span class="lc-dep${raw(t.deployerLaunches >= 3 ? ' warn' : '')}">${dep}</span>
      </div>
      <div class="lc-foot">
        <span class="lc-risk" aria-hidden="true"><i class="${raw(lvl >= 1 ? 'on' : '')}"></i><i class="${raw(lvl >= 2 ? 'on' : '')}"></i><i class="${raw(lvl >= 3 ? 'on' : '')}"></i></span>
        <span class="lc-risk-l">${RISK_LABEL[t.risk] || '—'}</span>
        ${raw(ponsLink(cfg, t.address, 'Pons', 'pons-btn sm'))}
      </div>
    </article>`;
  }

  function renderCards(latest) {
    const list = (latest || []).slice(0, 12);
    if (!list.length) { grid.innerHTML = '<div class="empty">No launches seen yet.</div>'; return; }
    grid.innerHTML = list.map((t) => card(t, !first && !seen.has(t.address))).join('');
  }

  grid.addEventListener('click', (e) => { const c = e.target.closest('[data-href]'); if (c && !e.target.closest('a')) location.href = c.dataset.href; });
  grid.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const c = e.target.closest('[data-href]'); if (c) location.href = c.dataset.href; } });

  // live clocks: ages tick every second, dots drift left every few seconds
  let lastPoints = [];
  setInterval(() => { grid.querySelectorAll('.lc-age[data-at]').forEach((el) => { el.textContent = ageShort(el.dataset.at); }); }, 1000);
  setInterval(() => renderTape(lastPoints), 10000);

  return {
    update(latest, timeline) {
      lastPoints = timeline && timeline.length ? timeline : (latest || []);
      renderTape(lastPoints);
      renderCards(latest);
      [...lastPoints, ...(latest || [])].forEach((t) => seen.add(t.address));
      first = false;
    }
  };
}
