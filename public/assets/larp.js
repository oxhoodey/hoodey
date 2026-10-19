import { initPage, api, html, raw, esc, timeAgo, sourceBadge, isAddress, explorerLink, ponsLink, avatar, every } from './common.js';

const cfg = await initPage('larp');
const $ = (id) => document.getElementById(id);
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');
const X_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z"/></svg>';
const VERDICT = { high: 'Likely LARP', medium: 'Borrowed signs', low: 'Looks like its own' };
const safeUrl = (u) => (/^https:\/\//i.test(u || '') ? u : `https://${String(u || '').replace(/^\/*/, '')}`);
const fmtN = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n));

function linkCard(kind, l) {
  if (!l) return `<div class="lp-link none"><span class="lp-k">${esc(kind)}</span><span class="muted">Not set</span></div>`;
  const label = kind === 'X' ? l.label : kind === 'Website' ? l.host : `t.me/${l.handle}`;
  const bad = l.famous ? ' bad' : '';
  return `<a class="lp-link${bad}" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener nofollow"><span class="lp-k">${esc(kind)}</span><b>${esc(label)}</b>${l.famous ? '<em>famous</em>' : l.kind === 'tweet' ? '<em>tweet</em>' : l.kind === 'community' ? '<em>community</em>' : ''}</a>`;
}

function timeline(title, rows) {
  if (!rows || rows.length < 2) return '';
  return html`<div class="lp-tl"><span class="small muted" style="font-weight: 600">${title}</span>${raw(rows.map((r, i) => html`<a class="lp-tl-row${raw(r.self ? ' self' : '')}" href="/larp?address=${r.address}" data-go="${r.address}">
    <span class="lp-tl-dot${raw(i === 0 ? ' first' : '')}"></span>${raw(avatar(r))}<span><b>$${r.symbol}</b><small>${r.name}</small></span>
    <span class="lp-tl-tag">${i === 0 ? 'first' : r.self ? 'this token' : r.sameDeployer ? 'same deployer' : 'other deployer'}</span><small class="muted">${timeAgo(r.at)}</small></a>`).join(''))}</div>`;
}

function render(d) {
  const t = d.token, p = d.profile;
  $('result').innerHTML = html`
    ${raw(d.note ? html`<p class="note" style="margin-top: -8px">${d.note}</p>` : '')}
    <div class="split" style="align-items: stretch">
      <section class="panel cb-card ${raw(d.verdict)}" aria-label="LARP report" style="flex: 1 1 380px">
        <div class="panel-head"><span class="eyebrow">LARP Scan · report</span><span class="src" data-src hidden></span></div>
        <div class="tok cb-tok">${raw(avatar(t))}<span><span class="nm">${t.name || t.symbol}</span><span class="sy">$${t.symbol} · ${raw(explorerLink(cfg, t.address))}${t.launchedAt ? ' · launched ' + timeAgo(t.launchedAt) : ''}</span></span></div>
        <div class="cb-score"><b>${d.score}</b><span>/100</span><em class="cb-verdict ${raw(d.verdict)}">${VERDICT[d.verdict]}</em></div>
        <div class="cb-meter" aria-hidden="true"><span style="width: ${raw(d.score)}%"></span><i style="left: 25%"></i><i style="left: 55%"></i></div>
        <ul class="cb-reasons">${raw(d.reasons.length ? d.reasons.map((r) => `<li><b>${r.pts > 0 ? '+' : ''}${r.pts}</b><span>${esc(r.text)}</span></li>`).join('') : '<li><b>0</b><span>Its links are its own: no famous account, no borrowed tweet, no earlier launch with the same links.</span></li>')}</ul>
        <div class="cb-actions">
          <button type="button" class="btn btn-primary" data-post>${raw(X_ICON)} Post on X</button>
          <a class="btn" href="#share-card">See share card</a>
          ${raw(ponsLink(cfg, t.address, 'Pons', 'pons-btn'))}
        </div>
      </section>
      <section class="panel" aria-label="Links" style="flex: 999 1 520px">
        <div class="panel-head"><h2 class="h2">What it claims to be</h2><span class="small muted">links from the launch transaction</span></div>
        <div class="lp-links">${raw(linkCard('X', d.links.x))}${raw(linkCard('Website', d.links.website))}${raw(linkCard('Telegram', d.links.telegram))}</div>
        ${raw(p ? html`<div class="lp-prof">
          <div class="lp-prof-h"><b>${p.name || '@' + p.handle}</b><span class="muted">@${p.handle}${p.verified ? ' · verified' : ''}</span></div>
          ${raw(p.bio ? html`<p class="lp-bio">${p.bio}</p>` : '<p class="lp-bio muted">No bio.</p>')}
          <div class="lp-prof-s"><span><b>${fmtN(p.followers)}</b> followers</span>${raw(p.createdAt ? `<span>joined <b>${esc(new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }))}</b></span>` : '')}</div>
        </div>` : d.links.x && d.links.x.handle ? '<p class="small muted">X profile details unavailable right now.</p>' : '')}
        ${raw(timeline(`Every launch that linked ${d.links.x ? d.links.x.label : 'this X'}`, d.sharedX))}
        ${raw(timeline(`Every launch that listed ${d.links.website ? d.links.website.host : 'this site'}`, d.sharedSite))}
        ${raw(timeline('Every launch with this Telegram', d.sharedTg))}
      </section>
    </div>
    <section class="panel share-panel" id="share-card" aria-label="Share card">
      <div class="panel-head"><div style="display: flex; flex-direction: column; gap: 4px"><span class="eyebrow">Share card</span><h2 class="h2">This image shows up when you post the link on X</h2></div></div>
      <div class="share-wrap">
        <img class="share-img" src="/og/larp/${t.address}.png?s=${d.score}-${d.reasons.length}" width="1200" height="630" alt="LARP Scan card for $${t.symbol}: ${d.score} out of 100, ${VERDICT[d.verdict]}">
        <div class="share-side">
          <button type="button" class="btn btn-primary btn-lg" data-post>${raw(X_ICON)} Post on X</button>
          <a class="btn btn-lg" href="/og/larp/${t.address}.png" download="larp-scan-${t.symbol}.png">Download image</a>
          <button type="button" class="btn btn-lg" data-copy>Copy link</button>
          <p class="small muted">The post links to this scan. X turns the link into the card on the left.</p>
        </div>
      </div>
    </section>`;
  $('result').querySelectorAll('[data-src]').forEach((el) => sourceBadge(el, d));
  const pageUrl = `${location.origin}/larp?address=${t.address}`;
  const top = d.reasons.filter((r) => r.pts > 0).slice(0, 2).map((r) => '• ' + r.text).join('\n');
  const text = `LARP Scan on $${t.symbol}: ${d.score}/100 (${VERDICT[d.verdict]})\n${top}\n\nvia ${cfg.APP_NAME}`;
  $('result').querySelectorAll('[data-post]').forEach((b) => b.addEventListener('click', () => window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}`, '_blank', 'noopener')));
  $('result').querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(pageUrl); e.target.textContent = 'Link copied'; } catch { prompt('Copy this link', pageUrl); }
    setTimeout(() => { e.target.textContent = 'Copy link'; }, 1800);
  }));
}

async function run(address) {
  $('result').innerHTML = '<div class="skel" style="min-height: 380px"></div>';
  try { render(await api(`/api/larp/scan?address=${encodeURIComponent(address)}`)); }
  catch (err) { $('result').innerHTML = html`<div class="empty">${err.message}</div>`; }
}
function go(a) {
  $('la').value = a;
  history.replaceState(null, '', `?address=${a}`);
  run(a);
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('lp-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const a = $('la').value.trim();
  $('lp-error').textContent = '';
  if (!isAddress(a)) { $('lp-error').textContent = 'Paste a contract address: 0x followed by 40 characters.'; return; }
  go(a);
});
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-go]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  go(a.dataset.go);
});

let board = null;
const FLAG = { famous: 'Famous account', reused: 'Reused link', tweet: 'Borrowed tweet' };
function renderBoard(b) {
  board = b;
  sourceBadge($('src-board'), b);
  $('lb-sub').textContent = `Accounts linked by more than one launch, and famous accounts linked at all, over the last ${b.windowHours}h.`;
  $('lb-stats').innerHTML = html`
    <div><span>Launches with an X link</span><b>${b.stats.withX} / ${b.stats.launches}</b></div>
    <div><span>Borrowed links</span><b class="bad">${b.stats.flagged}</b></div>
    <div><span>Of launches with X</span><b class="bad">${b.stats.flaggedPct}%</b></div>`;
  $('lb-accounts').innerHTML = b.accounts.length ? b.accounts.map((a) => html`<article class="lb-acc${raw(a.famous ? ' famous' : '')}">
      <div class="lb-head"><a class="lb-handle" href="${safeUrl(a.url || '')}" target="_blank" rel="noopener nofollow">${a.label}</a>${raw(a.famous ? '<span class="cr-badge">Famous</span>' : '')}</div>
      <div class="cr-stats" style="grid-template-columns: repeat(2, minmax(0, 1fr))"><div><span>Tokens</span><b class="${raw(a.uses >= 3 ? 'bad' : '')}">${a.uses}</b></div><div><span>Deployers</span><b>${a.deployers}</b></div></div>
      <div class="cr-tokens">${raw(a.tokens.map((t) => html`<a href="/larp?address=${t.address}" data-go="${t.address}" title="${timeAgo(t.at)}">${raw(avatar(t))}<span>$${t.symbol}</span></a>`).join(''))}</div>
      <span class="small muted">First: <a href="/larp?address=${a.first.address}" data-go="${a.first.address}">$${a.first.symbol}</a> · last used ${timeAgo(a.lastAt)}</span>
    </article>`).join('') : '<div class="empty" style="grid-column: 1 / -1">No borrowed accounts yet.</div>';
  $('lb-recent').innerHTML = b.recent.length ? b.recent.map((r) => html`<a class="dr-row lp-row ${raw(r.flag.kind)}" href="/larp?address=${r.address}" data-go="${r.address}">
      ${raw(avatar(r))}<span class="dr-name"><b>$${r.symbol}</b><small>${r.flag.label} · ${timeAgo(r.at)}</small></span><span></span><span class="dr-left">${FLAG[r.flag.kind]}</span></a>`).join('') : '<div class="empty">No borrowed links in the newest launches.</div>';
}

async function loadBoard() {
  try { renderBoard(await api('/api/larp/board')); }
  catch (err) { $('lb-accounts').innerHTML = html`<div class="empty">Couldn't load the LARP board: ${err.message}</div>`; }
}
$('pick-larp').addEventListener('click', () => {
  const r = board && board.recent[0];
  if (r) go(r.address); else $('lp-error').textContent = 'No LARP in the newest launches right now.';
});

const initial = new URLSearchParams(location.search).get('address');
if (initial && isAddress(initial)) { $('la').value = initial; run(initial); }
else $('result').innerHTML = '<div class="empty cb-hint">Paste a token address above, or tap <b>Newest LARP</b>. Every token in the lists below opens with one tap.</div>';
loadBoard();
every(cfg, loadBoard);
