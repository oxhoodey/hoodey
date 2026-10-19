import { initPage, api, html, raw, esc, timeAgo, sourceBadge, isAddress, explorerLink, ponsLink, avatar, every } from './common.js';
import { agentScan, scanLabel } from './agent.js';
import { createParticleText } from './particletext.js';
import { deathText } from './launchtape.js';

const cfg = await initPage('xray');
const $ = (id) => document.getElementById(id);
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');
const X_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z"/></svg>';
const fmtEth = (v) => (v == null ? '—' : v === 0 ? '0' : Math.abs(v) < 0.001 ? '<0.001' : Math.abs(v).toFixed(Math.abs(v) < 1 ? 3 : 2));
const signed = (v) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${fmtEth(Math.abs(v))}`);
const mins = (m) => (m == null ? '—' : m < 1 ? '<1m' : m >= 120 ? `${Math.round(m / 60)}h` : `${Math.round(m)}m`);
const COL = { alive: '#B57A00', overtime: '#D93A1F', dead: '#D93A1F', none: '#0E1F15' };
const STATUS = { alive: 'Alive', overtime: 'Overtime', dead: 'Dead' };
const ARCH_TONE = { farmer: 'bad', crew: 'bad', sniper: 'bad', bot: 'bad', exit: 'warn', flipper: 'neutral', holder: 'good', trader: 'neutral' };

let clock = null, clockTimer = 0;
function stopClock() { clearInterval(clockTimer); if (clock) { clock.destroy(); clock = null; } }

// countdown string for the big particle clock
function bigClock(d) {
  if (d.status === 'dead') return { text: 'DEAD', color: COL.dead };
  if (!d.expectedDeathAt) return { text: '??:??', color: COL.none };
  const s = Math.round((Date.parse(d.expectedDeathAt) - Date.now()) / 1000);
  const a = Math.abs(s), h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), ss = String(a % 60).padStart(2, '0');
  const t = h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
  return s >= 0 ? { text: t, color: COL.alive } : { text: '+' + t, color: COL.overtime };
}

function shareBlock(kind, address, label, alt) {
  return html`<section class="panel share-panel" id="share-card" aria-label="Share card">
    <div class="panel-head"><div style="display: flex; flex-direction: column; gap: 4px"><span class="eyebrow">Share card</span><h2 class="h2">This image shows up when you post the link on X</h2></div></div>
    <div class="share-wrap">
      <img class="share-img" src="/og/xray/${address}.png?v=${Date.now().toString(36)}" width="1200" height="630" alt="${alt}">
      <div class="share-side">
        <button type="button" class="btn btn-primary btn-lg" data-post>${raw(X_ICON)} Post on X</button>
        <a class="btn btn-lg" href="/og/xray/${address}.png" download="${kind}-${label}.png">Download image</a>
        <button type="button" class="btn btn-lg" data-copy>Copy link</button>
        <p class="small muted">The post links to this page. X turns the link into the card on the left.</p>
      </div>
    </div>
  </section>`;
}

function wireShare(address, text) {
  const pageUrl = `${location.origin}/xray?address=${address}`;
  const post = () => window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}`, '_blank', 'noopener');
  $('result').querySelectorAll('[data-post]').forEach((b) => b.addEventListener('click', post));
  $('result').querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(pageUrl); e.target.textContent = 'Link copied'; } catch { prompt('Copy this link', pageUrl); }
    setTimeout(() => { e.target.textContent = 'Copy link'; }, 1800);
  }));
}

// ── Death Clock ──────────────────────────────────────────────────────────
function renderToken(d) {
  const t = d.token, s = d.signs;
  const life = d.medianLifeMin ? Math.min(100, (d.ageMin / d.medianLifeMin) * 100) : 0;
  const maxH = Math.max(1, ...d.hist.map((h) => h.n));
  const sign = (label, v, bad, hint) => `<div class="dc-sign${bad ? ' bad' : ''}" title="${esc(hint)}"><span>${esc(label)}</span><b>${esc(v)}</b></div>`;
  let caption;
  if (d.status === 'dead') caption = `Died ${d.livedMin != null ? mins(d.livedMin) + ' after launch' : ''}${d.fromPeakPct != null ? ` · ${d.fromPeakPct}% from its peak` : ''}.`;
  else if (d.medianLifeMin == null) caption = 'Not enough finished launches yet to compare with. Check back in a few minutes.';
  else if (d.status === 'overtime') caption = `Already outlived the ~${mins(d.medianLifeMin)} its look-alikes got.`;
  else caption = `left of the ~${mins(d.medianLifeMin)} its look-alikes lived.`;
  $('result').innerHTML = html`
    ${raw(d.note ? html`<p class="note" style="margin-top: -8px">${d.note}</p>` : '')}
    <div class="split" style="align-items: stretch">
      <section class="panel dc-card ${raw(d.status)}" aria-label="Death Clock" style="flex: 1 1 400px">
        <div class="panel-head"><span class="eyebrow">Death Clock</span><span class="src" data-src hidden></span></div>
        <div class="tok cb-tok">${raw(avatar(t))}<span><span class="nm">${t.name || t.symbol}</span><span class="sy">$${t.symbol} · ${raw(explorerLink(cfg, t.address))}${t.launchedAt ? ' · launched ' + timeAgo(t.launchedAt) : ''}</span></span><span class="dc-chip ${raw(d.status)}">${STATUS[d.status]}</span></div>
        <div class="dc-clock" id="dc-clock" role="timer" aria-live="off"><span class="sr-only" id="dc-clock-sr"></span></div>
        <p class="dc-cap">${caption}</p>
        <div class="dc-life" aria-hidden="true"><span style="width: ${raw((d.status === 'dead' ? 100 : life).toFixed(1))}%"></span></div>
        <div class="dc-life-l small muted"><span>Launch</span><span>${d.medianLifeMin != null ? 'Expected death ~' + mins(d.medianLifeMin) : ''}</span></div>
        <div class="cb-actions">
          <button type="button" class="btn btn-primary" data-post>${raw(X_ICON)} Post on X</button>
          <a class="btn" href="/cabal?address=${t.address}">Cabal Scan</a>
          ${raw(ponsLink(cfg, t.address, 'Pons', 'pons-btn'))}
        </div>
      </section>
      <section class="panel" aria-label="Twins" style="flex: 999 1 520px">
        <div class="panel-head"><h2 class="h2">Born like this</h2><span class="small muted">the first ${cfg.CABAL_EARLY_SECONDS}s after launch</span></div>
        <div class="dc-signs">
          ${raw(sign('Snipers', s.snipers, s.snipers >= 3, `Wallets that bought within ${cfg.CABAL_SNIPER_SECONDS}s`))}
          ${raw(sign('Bundled buys', s.bundled, s.bundled >= 3, 'Buys from different wallets in the same block'))}
          ${raw(sign('Crew wallets', s.crew, s.crew >= 2, 'Wallets from a Cabal Map crew'))}
          ${raw(sign('Deployer launches', s.deployerLaunches, s.deployerLaunches >= 3, 'Tokens this deployer launched in the window'))}
          ${raw(sign('Deployer bought', s.deployerBought ? 'Yes' : 'No', !!s.deployerBought, 'The deployer bought its own token in the first minute'))}
          ${raw(sign('Copied name', s.copy ? 'Yes' : 'No', !!s.copy, 'An older launch had the same or a very close name'))}
          ${raw(sign('Early buyers', s.earlyBuyers, false, 'Wallets that bought in the first minute'))}
          ${raw(sign('Early ETH', fmtEth(s.earlyEth), false, 'ETH spent in the first minute'))}
        </div>
        <div class="panel-head" style="margin-top: 6px"><h2 class="h2">What happened to its ${d.lookalikes} twins</h2><span class="small muted">closest matches among ${d.learningFrom} finished launches</span></div>
        <div class="dc-twinstats">
          <div><span>Died</span><b class="${raw(d.diedPct >= 70 ? 'bad' : '')}">${d.diedPct == null ? '—' : d.diedPct + '%'}</b></div>
          <div><span>Median life</span><b>${mins(d.medianLifeMin)}</b></div>
          <div><span>Fell 90% from peak</span><b>${d.dump90Pct == null ? '—' : d.dump90Pct + '%'}</b></div>
        </div>
        <div class="dc-hist" role="img" aria-label="How long the twins lived">${raw(d.hist.map((h) => `<div><i style="height: ${Math.round((h.n / maxH) * 100)}%"></i><b>${h.n}</b><small>${esc(h.label)}</small></div>`).join(''))}</div>
        <div class="dc-twins">${raw(d.twins.map((w) => html`<a href="/xray?address=${w.address}" class="dc-twin">${raw(avatar(w))}<span><b>$${w.symbol}</b><small>${w.similarity}% alike</small></span><em class="${raw(w.dead ? 'dead' : 'alive')}">${w.dead ? 'lived ' + mins(w.lifeMin) : 'alive'}</em></a>`).join(''))}</div>
      </section>
    </div>
    ${raw(shareBlock('death-clock', t.address, t.symbol, `Death Clock card for $${t.symbol}`))}`;
  $('result').querySelectorAll('[data-src]').forEach((el) => sourceBadge(el, d));
  const host = $('dc-clock');
  clock = createParticleText(host, { glow: '#00C805' });
  const tick = () => {
    const c = bigClock(d);
    clock.set(c.text, c.color);
    $('dc-clock-sr').textContent = d.status === 'dead' ? 'Dead' : deathText(d.expectedDeathAt, d.status);
    if (d.status === 'alive' && d.expectedDeathAt && Date.parse(d.expectedDeathAt) < Date.now()) { d.status = 'overtime'; host.closest('.dc-card').classList.add('overtime'); }
  };
  tick();
  clockTimer = setInterval(tick, 1000);
  const verdict = d.status === 'dead' ? `already dead (lived ${mins(d.livedMin)})` : d.medianLifeMin == null ? 'too fresh to call' : d.status === 'overtime' ? `in overtime: its twins lived ~${mins(d.medianLifeMin)}` : `${deathText(d.expectedDeathAt, d.status)} (twins lived ~${mins(d.medianLifeMin)})`;
  wireShare(t.address, `Death Clock on $${t.symbol}: ${verdict}.\n${d.diedPct != null ? `${d.diedPct}% of ${d.lookalikes} launches born like it are dead.` : ''}\n\nvia ${cfg.APP_NAME}`);
}

// ── Wallet X-Ray ─────────────────────────────────────────────────────────
function renderWallet(d) {
  const st = d.stats, tone = ARCH_TONE[d.archetype.k] || 'neutral';
  const DNA = [['Sniper', d.dna.sniper, 'First buy within seconds of launch'], ['Flipper', d.dna.flipper, 'Sells fast'], ['Holder', d.dna.holder, 'Still holds what it bought'], ['Exit liquidity', d.dna.exitLiquidity, 'Bought near the top, then lost'], ['Bot', d.dna.bot, 'Clockwork timing, repeated sizes']];
  const STAT = { holding: 'Holding', trimming: 'Selling', exited: 'Sold out', sold: 'Seller' };
  $('result').innerHTML = html`
    ${raw(d.note ? html`<p class="note" style="margin-top: -8px">${d.note}</p>` : '')}
    <div class="split" style="align-items: stretch">
      <section class="panel xr-card ${raw(tone)}" aria-label="Wallet X-Ray" style="flex: 1 1 400px">
        <div class="panel-head"><span class="eyebrow">Wallet X-Ray</span><span class="src" data-src hidden></span></div>
        <div class="xr-wallet"><span class="xr-scan" aria-hidden="true"></span><span class="mono">${raw(explorerLink(cfg, d.wallet, short(d.wallet)))}</span>${raw(d.crew ? `<a class="ctag crew" href="/cabal#cabal-map">${esc(d.crew)}</a>` : '')}</div>
        <h2 class="xr-arch">${d.archetype.label}</h2>
        <p class="xr-why">${d.archetype.why}</p>
        ${raw(d.tags.length ? `<div class="xr-tags">${d.tags.map((g) => `<span class="ctag ${esc(g.k)}">${esc(g.label)}</span>`).join('')}</div>` : '')}
        <div class="xr-pnl ${raw(st.pnlEth >= 0 ? 'good' : 'bad')}"><b>${signed(st.pnlEth)}</b><span>ETH${st.pnlUsd != null ? ` · ${st.pnlUsd >= 0 ? '+' : '−'}$${Math.abs(st.pnlUsd).toLocaleString('en-US')}` : ''}</span></div>
        <p class="small muted" style="margin-top: -6px">Sold minus bought, plus open bags at the last curve price, last ${d.windowHours}h.</p>
        <div class="cb-actions"><button type="button" class="btn btn-primary" data-post>${raw(X_ICON)} Post on X</button><button type="button" class="btn" data-copy>Copy link</button></div>
      </section>
      <section class="panel" aria-label="Trader DNA" style="flex: 999 1 520px">
        <div class="panel-head"><h2 class="h2">Trader DNA</h2><span class="small muted">0–100 per habit</span></div>
        <div class="xr-dna">${raw(DNA.map(([k, v, hint]) => `<div class="xr-gene${v >= 60 ? ' hi' : ''}" title="${esc(hint)}"><span>${esc(k)}</span><span class="xr-bar"><i style="width: ${v}%"></i></span><b>${v}</b></div>`).join(''))}</div>
        <div class="cb-stats">
          <div><span>Tokens traded</span><b>${st.tokensTraded}</b></div>
          <div><span>Win rate</span><b>${st.winRate == null ? '—' : st.winRate + '%'}</b><small class="muted">${st.closed} closed</small></div>
          <div><span>Median hold</span><b>${st.medianHoldMin == null ? '—' : mins(st.medianHoldMin)}</b></div>
          <div><span>Median entry</span><b>${st.medianEntrySec == null ? '—' : '+' + (st.medianEntrySec < 120 ? st.medianEntrySec + 's' : Math.round(st.medianEntrySec / 60) + 'm')}</b></div>
          <div><span>Buys in 1st minute</span><b>${st.firstMinutePct}%</b></div>
          <div><span>Bundled buys</span><b>${st.bundledBuys}</b></div>
          <div><span>In / out</span><b>${fmtEth(st.inEth)} / ${fmtEth(st.outEth)}</b></div>
          <div><span>Tokens deployed</span><b class="${raw(st.deployed >= 3 ? 'bad' : '')}">${st.deployed}</b>${raw(st.deployed ? `<small class="muted">${st.deployedDeadFast} died &lt;1h</small>` : '')}</div>
        </div>
        ${raw(d.deployedTokens.length ? `<div class="dc-twins">${d.deployedTokens.map((w) => html`<a href="/xray?address=${w.address}" class="dc-twin">${raw(avatar(w))}<span><b>$${w.symbol}</b><small>deployed ${w.at ? timeAgo(w.at) : ''}</small></span><em class="${raw(w.dead ? 'dead' : 'alive')}">${w.dead ? 'lived ' + mins(w.lifeMin) : 'alive'}</em></a>`).join('')}</div>` : '')}
      </section>
    </div>
    ${raw(d.tokens.length ? html`<section class="panel" aria-label="Tokens">
      <div class="panel-head"><h2 class="h2">Tokens this wallet traded</h2><span class="small muted">newest first · open bags valued at the last curve price</span></div>
      <div class="table-scroll"><div class="ttable" role="table" style="min-width: 820px">
        <div class="xt-row head" role="row"><span role="columnheader">TOKEN</span><span role="columnheader">ENTRY</span><span role="columnheader">BOUGHT</span><span role="columnheader">SOLD</span><span role="columnheader">OPEN</span><span role="columnheader">PNL</span><span role="columnheader">STATUS</span></div>
        ${raw(d.tokens.map((r) => html`<a class="xt-row" role="row" href="/xray?address=${r.address}">
          <span role="cell" class="tok">${raw(avatar(r))}<span><span class="nm">$${r.symbol || short(r.address)}</span>${raw(r.tokenDead ? '<span class="xt-dead">dead</span>' : '')}</span></span>
          <span role="cell" class="mono">${r.entrySec == null ? '—' : '+' + (r.entrySec < 120 ? r.entrySec + 's' : Math.round(r.entrySec / 60) + 'm')}</span>
          <span role="cell" class="mono">${fmtEth(r.boughtEth)}</span>
          <span role="cell" class="mono">${fmtEth(r.soldEth)}</span>
          <span role="cell" class="mono">${fmtEth(r.openEth)}</span>
          <span role="cell" class="mono ${raw(r.pnlEth >= 0 ? 'good' : 'bad')}">${signed(r.pnlEth)}</span>
          <span role="cell"><span class="cw-st ${raw(r.status === 'sold' ? 'seller' : r.status)}">${STAT[r.status]}</span></span>
        </a>`).join(''))}
      </div></div>
    </section>` : '')}
    ${raw(shareBlock('wallet-xray', d.wallet, short(d.wallet).replace('…', '-'), `Wallet X-Ray card: ${d.archetype.label}`))}`;
  $('result').querySelectorAll('[data-src]').forEach((el) => sourceBadge(el, d));
  wireShare(d.wallet, `Wallet X-Ray: ${short(d.wallet)} is a ${d.archetype.label}.\n${d.archetype.why}\nPnL ${signed(st.pnlEth)} ETH on ${st.tokensTraded} Pons tokens.\n\nvia ${cfg.APP_NAME}`);
}

function findings(d) {
  if (d.kind === 'token') {
    const s = d.signs, out = [{ text: `Birth signs: ${s.snipers} snipers, ${s.bundled} bundled buys, ${s.crew} crew wallets`, tone: s.snipers + s.bundled + s.crew >= 5 ? 'bad' : 'info' }];
    out.push({ text: `Found ${d.lookalikes} look-alike launches among ${d.learningFrom} finished ones`, tone: 'info' });
    if (d.diedPct != null) out.push({ text: `${d.diedPct}% of them died, median life ${mins(d.medianLifeMin)}`, tone: d.diedPct >= 70 ? 'bad' : 'info' });
    out.push({ text: d.status === 'dead' ? `Already dead after ${mins(d.livedMin)}` : d.medianLifeMin == null ? 'Too fresh to call' : `${deathText(d.expectedDeathAt, d.status)}`, tone: d.status === 'alive' ? 'info' : 'bad' });
    return out;
  }
  const st = d.stats;
  return [
    { text: `Traced ${st.buys + st.sells} curve trades across ${st.tokensTraded} tokens`, tone: 'info' },
    { text: `Win rate ${st.winRate == null ? '—' : st.winRate + '%'}, median hold ${mins(st.medianHoldMin)}`, tone: 'info' },
    ...(d.crew ? [{ text: `Member of ${d.crew}`, tone: 'bad' }] : []),
    ...(st.deployed ? [{ text: `Deployed ${st.deployed} tokens`, tone: st.deployed >= 3 ? 'bad' : 'info' }] : []),
    { text: `Classified as: ${d.archetype.label}`, tone: ARCH_TONE[d.archetype.k] === 'bad' ? 'bad' : ARCH_TONE[d.archetype.k] === 'good' ? 'good' : 'info' }
  ];
}
function read(d) {
  if (d.kind === 'token') {
    const sym = `$${d.token.symbol}`;
    if (d.status === 'dead') return `${sym} is already dead: it lived ${mins(d.livedMin)}${d.fromPeakPct != null ? ` and sits ${Math.abs(d.fromPeakPct)}% below its peak` : ''}. ${d.diedPct != null ? `${d.diedPct}% of launches born like it ended the same way.` : ''}`;
    if (d.medianLifeMin == null) return `${sym} is too fresh to call. Not enough finished launches look like it yet; check back in a few minutes.`;
    return `${sym} was born with ${d.signs.snipers} snipers, ${d.signs.bundled} bundled buys and ${d.signs.crew} crew wallets. Launches that started like this lived about ${mins(d.medianLifeMin)}, and ${d.diedPct}% of them are dead. ${d.status === 'overtime' ? 'It has already outlived them, which is rare.' : `By that pattern it has ${deathText(d.expectedDeathAt, d.status).replace(' left', '')} left.`}`;
  }
  const st = d.stats;
  return `${short(d.wallet)} trades like a ${d.archetype.label.toLowerCase()}. ${d.archetype.why} Across ${st.tokensTraded} Pons tokens it is ${st.pnlEth >= 0 ? 'up' : 'down'} ${fmtEth(Math.abs(st.pnlEth))} ETH${st.winRate != null ? ` with a ${st.winRate}% win rate` : ''}.${d.crew ? ` It buys together with ${d.crew}.` : ''}`;
}

async function run(address) {
  stopClock();
  try {
    const job = await agentScan($('result'), {
      label: scanLabel('X-Ray', address),
      steps: ['Checking if this is a token or a wallet', 'Reading its Pons launches and curve trades', 'Comparing with every launch in the window', 'Building the profile'],
      task: api(`/api/xray?address=${encodeURIComponent(address)}`), findings, read
    });
    const d = job.data;
    d.kind === 'token' ? renderToken(d) : renderWallet(d);
    job.attach();
  } catch (err) {
    $('result').innerHTML = html`<div class="empty">${err.message}</div>`;
  }
}

function go(a) {
  $('xa').value = a;
  history.replaceState(null, '', `?address=${a}`);
  run(a);
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('xr-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const a = $('xa').value.trim();
  $('xr-error').textContent = '';
  if (!isAddress(a)) { $('xr-error').textContent = 'Paste an address: 0x followed by 40 characters.'; return; }
  go(a);
});

// ── Death Row + wallet boards ────────────────────────────────────────────
let board = null;
function renderBoard(b) {
  board = b;
  sourceBadge($('src-board'), b);
  const s = b.stats;
  $('dr-sub').textContent = `Every Pons launch in the last 3 hours, with a Death Clock from its first minute. Learning from ${s.learningFrom} finished launches.`;
  $('dr-stats').innerHTML = html`
    <div><span>Launches in ${b.windowHours}h</span><b>${s.launches}</b></div>
    <div><span>Already dead</span><b class="bad">${s.deadPct}%</b></div>
    <div><span>Median life</span><b>${mins(s.medianLifeMin)}</b></div>`;
  $('dr-list').innerHTML = b.deathRow.length ? b.deathRow.map((r) => html`<a class="dr-row ${raw(r.status)}" href="/xray?address=${r.address}" data-go="${r.address}">
      ${raw(avatar(r))}
      <span class="dr-name"><b>$${r.symbol}</b><small>${r.name} · ${timeAgo(r.at)}</small></span>
      <span class="dr-score" title="Birth score: how cabal-heavy the first minute was"><i style="width: ${r.birthScore}%"></i></span>
      <span class="dr-left" data-death="${r.expectedDeathAt || ''}" data-status="${r.status}">${deathText(r.expectedDeathAt, r.status)}</span>
    </a>`).join('') : '<div class="empty">No launches in the last 3 hours yet.</div>';
  const wb = (list, empty) => (list.length ? list.map((w, i) => html`<a class="wb-row" href="/xray?address=${w.wallet}" data-go="${w.wallet}"><span class="wb-rank">${i + 1}</span><span class="mono">${short(w.wallet)}</span>${raw(w.crew ? `<span class="ctag crew">${esc(w.crew)}</span>` : '')}<span class="muted small">${w.tokens} tokens</span><b class="${raw(w.pnlEth >= 0 ? 'good' : 'bad')}">${signed(w.pnlEth)} ETH</b></a>`).join('') : `<div class="empty">${empty}</div>`);
  $('wb-smart').innerHTML = wb(b.smart, 'No wallets yet.');
  $('wb-rekt').innerHTML = wb(b.rekt.filter((w) => w.pnlEth < 0), 'Nobody is down yet.');
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-go]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  go(a.dataset.go);
});
setInterval(() => document.querySelectorAll('.dr-left[data-death]').forEach((el) => { el.textContent = deathText(el.dataset.death, el.dataset.status); }), 1000);

async function loadBoard() {
  try { renderBoard(await api('/api/xray/board')); }
  catch (err) { $('dr-list').innerHTML = html`<div class="empty">Couldn't load Death Row: ${err.message}</div>`; }
}

$('pick-token').addEventListener('click', () => {
  const r = board && (board.deathRow.find((x) => x.status !== 'dead') || board.deathRow[0]);
  if (r) go(r.address); else $('xr-error').textContent = 'No fresh launch yet, try again in a moment.';
});
$('pick-wallet').addEventListener('click', () => {
  const w = board && (board.smart[0] || board.rekt[0]);
  if (w) go(w.wallet); else $('xr-error').textContent = 'No wallets yet, try again in a moment.';
});

const initial = new URLSearchParams(location.search).get('address');
if (initial && isAddress(initial)) { $('xa').value = initial; run(initial); }
else $('result').innerHTML = '<div class="empty cb-hint">Paste a token or wallet above, or tap <b>Newest launch</b> or <b>Top wallet</b>. Anything in Death Row below opens with one tap.</div>';
loadBoard();
every(cfg, loadBoard);
