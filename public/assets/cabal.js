import { initPage, api, html, raw, esc, timeAgo, sourceBadge, isAddress, explorerLink, ponsLink, avatar, every } from './common.js';

const cfg = await initPage('cabal');
const $ = (id) => document.getElementById(id);
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');
const VERDICT = { high: 'High cabal risk', medium: 'Some cabal signs', low: 'Looks organic' };
const TAG_ORDER = ['deployer', 'sniper', 'bundle', 'circle', 'crew'];
const COLORS = { deployer: '#B42318', sniper: '#E2553A', bundle: '#D9A21B', other: '#9DB8A6' };

const fmtEth = (v) => (v == null ? '—' : v === 0 ? '0' : v < 0.001 ? '<0.001' : v.toFixed(v < 1 ? 3 : 2));
const wallet = (a) => explorerLink(cfg, a, short(a));

// ── first-minute chart: every early buy as a dot; same-block bundles shaded ──
function firstMinute(d) {
  const W = 640, H = 200, pad = 28;
  const pts = d.firstMinute || [];
  if (!pts.length) return '<div class="empty">No buys in the first minute.</div>';
  const maxEth = Math.max(...pts.map((p) => p.eth), 0.001);
  // square-root time axis: the first seconds (where snipers and bundles live) get most of the width
  const span = d.windowSec;
  const x = (s) => pad + Math.sqrt(Math.max(0, Math.min(s, span)) / span) * (W - pad * 2);
  const y = (e) => H - 34 - (Math.sqrt(e / maxEth)) * (H - 70);
  const bundles = (d.bundles || []).map((b) => {
    const ss = pts.filter((p) => p.bundle === b.id).map((p) => p.s);
    if (!ss.length) return '';
    const x0 = x(Math.min(...ss)) - 7, x1 = x(Math.max(...ss)) + 7;
    return `<rect x="${x0.toFixed(1)}" y="16" width="${Math.max(14, x1 - x0).toFixed(1)}" height="${H - 46}" rx="6" fill="rgba(217,162,27,0.12)" stroke="rgba(217,162,27,0.55)" stroke-dasharray="3 3"/><text x="${((x0 + x1) / 2).toFixed(1)}" y="${12 + (b.id % 2) * 0}" text-anchor="middle" class="cm-l" style="fill: #8A5A00">#${b.id}</text>`;
  }).join('');
  const sn = x(d.sniperSec);
  const dots = pts.map((p) => {
    const c = p.deployer ? COLORS.deployer : p.bundle ? COLORS.bundle : p.sniper ? COLORS.sniper : COLORS.other;
    return `<circle cx="${x(p.s).toFixed(1)}" cy="${y(p.eth).toFixed(1)}" r="${(3 + Math.sqrt(p.eth / maxEth) * 6).toFixed(1)}" fill="${c}" fill-opacity="0.85" stroke="#fff" stroke-width="1.5"><title>${esc(short(p.w))} · +${p.s}s · ${fmtEth(p.eth)} ETH</title></circle>`;
  }).join('');
  const ticks = [0, 1, 3, 10, 20, 40, span].filter((v, i, arr) => v <= span && arr.indexOf(v) === i).map((v) => `<line x1="${x(v).toFixed(1)}" x2="${x(v).toFixed(1)}" y1="${H - 30}" y2="${H - 25}" stroke="#C9DDCF"/><text x="${x(v).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="cm-t">+${v}s</text>`).join('');
  return `<svg class="cm" viewBox="0 0 ${W} ${H}" role="img" aria-label="Buys in the first ${d.windowSec} seconds after launch">
    <rect x="${pad}" y="16" width="${(sn - pad).toFixed(1)}" height="${H - 46}" fill="rgba(226,85,58,0.07)"/>
    <text x="${(pad + 4)}" y="${H - 38}" class="cm-l" style="fill: #C2410C">sniper zone · ${d.sniperSec}s</text>
    <line x1="${pad}" x2="${W - pad}" y1="${H - 30}" y2="${H - 30}" stroke="#DFEAE2"/>
    ${bundles}${dots}${ticks}
  </svg>`;
}

function meter(score) {
  return `<div class="cb-meter" aria-hidden="true"><span style="width: ${score}%"></span><i style="left: 30%"></i><i style="left: 60%"></i></div>`;
}

function render(d) {
  const t = d.token, s = d.stats;
  const tags = (r) => r.tags.slice().sort((a, b) => TAG_ORDER.indexOf(a.k) - TAG_ORDER.indexOf(b.k)).map((g) => `<span class="ctag ${esc(g.k)}">${esc(g.label)}</span>`).join('') || '<span class="muted small">—</span>';
  const status = { holding: 'Holding', trimming: 'Selling', exited: 'Sold out', seller: 'Seller' };
  $('result').innerHTML = html`
    ${raw(d.note ? html`<p class="note" style="margin-top: -8px">${d.note}</p>` : '')}
    <div class="split" style="align-items: stretch">
      <section class="panel cb-card ${raw(d.verdict)}" aria-label="Cabal report card" style="flex: 1 1 360px">
        <div class="panel-head"><span class="eyebrow">Cabal Scan · report</span><span class="src" data-src hidden></span></div>
        <div class="tok cb-tok">${raw(avatar(t))}<span><span class="nm">${t.name || t.symbol}</span><span class="sy">$${t.symbol} · ${raw(explorerLink(cfg, t.address))}${t.launchedAt ? ' · launched ' + timeAgo(t.launchedAt) : ''}</span></span></div>
        <div class="cb-score"><b>${d.score}</b><span>/100</span><em class="cb-verdict ${raw(d.verdict)}">${VERDICT[d.verdict]}</em></div>
        ${raw(meter(d.score))}
        <ul class="cb-reasons">${raw(d.reasons.length ? d.reasons.map((r) => `<li><b>+${r.pts}</b><span>${esc(r.text)}</span></li>`).join('') : '<li><b>0</b><span>No sniping, bundling or crew activity found in the first minute.</span></li>')}</ul>
        <div class="cb-actions">
          <button type="button" class="btn btn-primary" id="share-x">Share on X</button>
          <button type="button" class="btn" id="save-card">Save card</button>
          ${raw(ponsLink(cfg, t.address, 'Pons', 'pons-btn'))}
        </div>
      </section>
      <section class="panel" aria-label="The first minute" style="flex: 999 1 560px">
        <div class="panel-head"><h2 class="h2">The first seconds after launch</h2><span class="small muted">${s.buyers} buyers so far · ${s.earlyBuyers} in the first minute</span></div>
        ${raw(firstMinute(d))}
        <div class="cm-legend"><span><i style="background: ${raw(COLORS.sniper)}"></i>Sniper</span><span><i style="background: ${raw(COLORS.bundle)}"></i>Same-block bundle</span><span><i style="background: ${raw(COLORS.deployer)}"></i>Deployer</span><span><i style="background: ${raw(COLORS.other)}"></i>Other buyer</span><span class="muted">dot size = ETH spent</span></div>
        <div class="cb-stats">
          <div><span>Snipers</span><b>${s.snipers}</b></div>
          <div><span>Bundled wallets</span><b>${s.bundledWallets}</b></div>
          <div><span>Flagged wallets hold</span><b class="${raw(s.flaggedHoldPct >= 20 ? 'bad' : '')}">${s.flaggedHoldPct.toFixed(1)}%</b></div>
          <div><span>Flagged sold out</span><b>${s.flaggedExited} / ${s.flagged}</b></div>
        </div>
        ${raw(d.bundles.length ? `<div class="cb-bundles"><span class="small muted" style="font-weight: 600">Same-block bundles</span>${d.bundles.map((b) => `<div class="cb-bundle"><b>#${b.id}</b><span>${b.afterBlocks <= 0 ? 'launch block' : '+' + b.afterBlocks + ' blocks'}</span><span class="mono">${b.wallets.map((w) => short(w)).join(' · ')}</span></div>`).join('')}</div>` : '')}
        ${raw(s.circle || s.crews.length ? `<p class="small muted">${s.circle ? `<b>Deployer circle</b> = wallets that also bought this deployer's earlier launches early. ` : ''}${s.crews.length ? `<b>Crew</b> = a group from the Cabal Map below.` : ''}</p>` : '')}
      </section>
    </div>
    <section class="panel" aria-label="Wallets">
      <div class="panel-head"><h2 class="h2">Wallets behind $${t.symbol}</h2><span class="small muted">Flagged wallets first · % of the 1B supply</span></div>
      <div class="table-scroll"><div class="ttable" role="table" style="min-width: 860px">
        <div class="cw-row head" role="row"><span role="columnheader">WALLET</span><span role="columnheader">SIGNALS</span><span role="columnheader">FIRST BUY</span><span role="columnheader">BOUGHT</span><span role="columnheader">SOLD</span><span role="columnheader">HOLDS NOW</span><span role="columnheader">STATUS</span></div>
        ${raw(d.wallets.map((r) => html`<div class="cw-row${raw(r.tags.length ? ' flagged' : '')}" role="row">
          <span role="cell" class="mono">${raw(wallet(r.wallet))}</span>
          <span role="cell" class="ctags">${raw(tags(r))}</span>
          <span role="cell" class="mono">+${r.firstSec < 3600 ? r.firstSec + 's' : Math.round(r.firstSec / 60) + 'm'}</span>
          <span role="cell" class="mono">${fmtEth(r.boughtEth)} ETH</span>
          <span role="cell" class="mono">${fmtEth(r.soldEth)} ETH</span>
          <span role="cell"><span class="cw-hold"><i style="width: ${raw(Math.min(100, r.holdPct * 4).toFixed(1))}%"></i></span><span class="mono">${r.holdPct.toFixed(2)}%</span></span>
          <span role="cell"><span class="cw-st ${raw(r.status)}">${status[r.status]}</span></span>
        </div>`).join(''))}
      </div></div>
    </section>`;
  $('result').querySelectorAll('[data-src]').forEach((el) => sourceBadge(el, d));
  const pageUrl = `${location.origin}/cabal?address=${t.address}`;
  $('share-x').addEventListener('click', () => {
    const top = d.reasons.slice(0, 2).map((r) => '• ' + r.text).join('\n');
    const text = `Cabal Scan on $${t.symbol}: ${d.score}/100 (${VERDICT[d.verdict]})\n${top}\n\nvia ${cfg.APP_NAME}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}`, '_blank', 'noopener');
  });
  $('save-card').addEventListener('click', () => saveCard(d));
}

// ── share card: a 1200×630 PNG drawn on canvas ───────────────────────────
async function saveCard(d) {
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 630;
  const g = c.getContext('2d');
  const col = { high: '#D93A1F', medium: '#C88A0A', low: '#00A804' }[d.verdict];
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 1200, 630);
  g.fillStyle = '#F3F8F4';
  for (let y = 20; y < 630; y += 22) for (let x = 20; x < 1200; x += 22) g.fillRect(x, y, 2, 2);
  g.fillStyle = col; g.fillRect(0, 0, 1200, 10);
  const font = (w, s, fam = "'Funnel Display', 'Funnel Sans', system-ui, sans-serif") => `${w} ${s}px ${fam}`;
  g.fillStyle = '#067A2E'; g.font = font(500, 22, "'Spline Sans Mono', monospace"); g.fillText('CABAL SCAN · HOODEYE', 70, 80);
  g.fillStyle = '#0E1F15'; g.font = font(700, 64); g.fillText('$' + d.token.symbol, 70, 160);
  g.fillStyle = '#5B6E61'; g.font = font(500, 26, "'Funnel Sans', system-ui, sans-serif"); g.fillText((d.token.name || '').slice(0, 40), 70, 200);
  g.fillStyle = col; g.font = font(700, 200); g.fillText(String(d.score), 70, 420);
  const sw = g.measureText(String(d.score)).width;
  g.fillStyle = '#9DB8A6'; g.font = font(600, 54); g.fillText('/100', 80 + sw, 420);
  g.fillStyle = col; g.font = font(700, 34); g.fillText(VERDICT[d.verdict], 74, 480);
  g.fillStyle = '#EAF2EC'; g.fillRect(70, 510, 460, 14); g.fillStyle = col; g.fillRect(70, 510, 460 * d.score / 100, 14);
  g.font = font(500, 26, "'Funnel Sans', system-ui, sans-serif");
  const lines = d.reasons.slice(0, 5);
  lines.forEach((r, i) => {
    const y = 290 + i * 62;
    g.fillStyle = col; g.fillRect(620, y - 20, 8, 8);
    g.fillStyle = '#0E1F15';
    let txt = r.text;
    while (g.measureText(txt).width > 500 && txt.length > 4) txt = txt.slice(0, -2);
    if (txt !== r.text) txt = txt.replace(/\s*\S*$/, '') + '…';
    g.fillText(txt, 646, y - 8);
  });
  if (!lines.length) { g.fillStyle = '#0E1F15'; g.fillText('No sniping, bundling or crews found.', 620, 290); }
  g.fillStyle = '#5B6E61'; g.font = font(500, 22, "'Spline Sans Mono', monospace");
  g.fillText(`${location.host}/cabal`, 70, 590);
  g.fillText('Heuristics, not proof. Not financial advice.', 620, 590);
  c.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cabal-scan-${d.token.symbol || 'token'}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
}

async function run(address) {
  $('result').innerHTML = '<div class="skel" style="min-height: 380px"></div>';
  try {
    render(await api(`/api/cabal/scan?address=${encodeURIComponent(address)}`));
  } catch (err) {
    $('result').innerHTML = html`<div class="empty">${err.message}</div>`;
  }
}

$('scan-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const a = $('ca').value.trim();
  $('scan-error').textContent = '';
  if (!isAddress(a)) { $('scan-error').textContent = 'Paste a contract address: 0x followed by 40 characters.'; return; }
  history.replaceState(null, '', `?address=${a}`);
  run(a);
});
$('hot-btn').addEventListener('click', async () => {
  try {
    const t = await api('/api/trending');
    const top = t.rows && t.rows[0];
    if (!top) throw new Error('No hot token right now.');
    $('ca').value = top.address;
    history.replaceState(null, '', `?address=${top.address}`);
    run(top.address);
  } catch (err) { $('scan-error').textContent = err.message; }
});

// ── Cabal Map ────────────────────────────────────────────────────────────
function constellation(n, active) {
  const R = 30, cx = 40, cy = 40, pts = Array.from({ length: Math.min(n, 9) }, (_, i) => { const a = (i / Math.min(n, 9)) * Math.PI * 2 - Math.PI / 2; return [cx + Math.cos(a) * R, cy + Math.sin(a) * R]; });
  let lines = '';
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) lines += `<line x1="${pts[i][0].toFixed(1)}" y1="${pts[i][1].toFixed(1)}" x2="${pts[j][0].toFixed(1)}" y2="${pts[j][1].toFixed(1)}"/>`;
  return `<svg class="cr-net${active ? ' on' : ''}" viewBox="0 0 80 80" aria-hidden="true"><g class="l">${lines}</g>${pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5"/>`).join('')}</svg>`;
}

function renderMap(m) {
  sourceBadge($('src-map'), m);
  $('map-sub').textContent = `Wallets that bought early in at least ${cfg.CABAL_MIN_SHARED} of the same launches. ${m.totalCrews} crew${m.totalCrews === 1 ? '' : 's'} found in ${m.scannedLaunches} launches over the last ${m.windowHours}h.${m.note ? ' ' + m.note : ''}`;
  $('map-live').innerHTML = (m.entries || []).length ? `<div class="cr-live"><span class="cr-live-h"><span class="live-dot"></span>Crews buying in the last hour</span>${m.entries.map((e) => html`<a class="cr-entry" href="/cabal?address=${e.address}">${raw(avatar(e))}<span><b>${e.crew}</b> · ${e.members} wallets in <b>$${e.symbol}</b></span><small>${e.at ? timeAgo(e.at) : ''}</small></a>`).join('')}</div>` : '';
  if (!m.crews.length) { $('crews').innerHTML = '<div class="empty" style="grid-column: 1 / -1">No crews yet. They show up once the same wallets buy early in several launches together.</div>'; return; }
  $('crews').innerHTML = m.crews.map((c) => html`<article class="crew${raw(c.active ? ' active' : '')}">
    <div class="cr-head">${raw(constellation(c.members.length, c.active))}
      <div><h3>${c.id}</h3><span class="small muted">${c.members.length} wallets · last seen ${c.lastAt ? timeAgo(c.lastAt) : '—'}</span></div>
      ${raw(c.active ? '<span class="cr-badge">Active now</span>' : '')}
    </div>
    <div class="cr-stats">
      <div><span>Launches</span><b>${c.tokenCount}</b></div>
      <div><span>Dump rate</span><b class="${raw(c.dumpRate >= 50 ? 'bad' : '')}">${c.dumpRate}%</b></div>
      <div><span>Median exit</span><b>${c.medianExitMin == null ? '—' : c.medianExitMin + 'm'}</b></div>
      <div><span>Net ETH</span><b class="${raw(c.pnlEth >= 0 ? 'good' : 'bad')}">${c.pnlEth >= 0 ? '+' : ''}${c.pnlEth.toFixed(2)}</b></div>
    </div>
    <div class="cr-tokens">${raw(c.tokens.slice(0, 6).map((t) => html`<a href="/cabal?address=${t.address}" title="${t.members} crew wallets bought early${t.at ? ' · ' + timeAgo(t.at) : ''}">${raw(avatar(t))}<span>$${t.symbol}</span></a>`).join(''))}${c.tokenCount > 6 ? raw(`<span class="muted small">+${c.tokenCount - 6}</span>`) : ''}</div>
    <details><summary>Show wallets</summary><ul>${raw(c.members.map((w) => `<li class="mono">${wallet(w)}</li>`).join(''))}</ul></details>
  </article>`).join('');
}

async function loadMap() {
  try { renderMap(await api('/api/cabal/map')); }
  catch (err) { $('crews').innerHTML = html`<div class="empty" style="grid-column: 1 / -1">Couldn't load the Cabal Map: ${err.message}</div>`; }
}

const initial = new URLSearchParams(location.search).get('address');
if (initial && isAddress(initial)) { $('ca').value = initial; run(initial); }
else $('result').innerHTML = '<div class="empty cb-hint">Paste a token address above, or tap <b>Scan the hottest token</b>. Any token in a crew card below opens its scan.</div>';
loadMap();
every(cfg, loadMap);
