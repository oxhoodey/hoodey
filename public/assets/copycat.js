import { agentScan, scanLabel } from './agent.js';
import { initPage, api, html, raw, esc, fmtDuration, timeAgo, short, sourceBadge, isAddress, explorerLink, ponsLink, tokenImg } from './common.js';

const cfg = await initPage('copycat');
const $ = (id) => document.getElementById(id);

const thumb = (size, dead, t) => `<span class="thumb${dead ? ' dead' : ''}" style="width: ${size}px; height: ${size}px; border-radius: ${Math.round(size / 3.5)}px" aria-hidden="true"><i style="width: ${Math.round(size * 0.42)}px; height: ${Math.round(size * 0.42)}px"></i>${tokenImg(t)}</span>`;
const fate = (alive, life) => (alive == null ? '<span class="fate muted">status unknown</span>' : `<span class="fate ${alive ? 'alive' : 'dead'}">${alive ? 'Alive' : 'Dead'}${life ? ' · ' + esc(life) : ''}</span>`);

function gauge(value, label) {
  const C = 2 * Math.PI * 56;
  const pct = value == null ? null : Math.round(value * 100);
  const hot = value != null && value >= cfg.COPYCAT_IMAGE_THRESHOLD;
  return html`<div class="gauge" style="width: 140px; height: 140px">
    <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="${label} ${pct == null ? 'not measured' : pct + '%'}"><circle cx="70" cy="70" r="56" fill="none" style="stroke: var(--track)" stroke-width="8"/>${raw(pct == null ? '' : `<circle cx="70" cy="70" r="56" fill="none" style="stroke: ${hot ? 'var(--danger)' : 'var(--accent)'}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(C * value).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 70 70)"/>`)}</svg>
    <div class="core" style="width: 80px; height: 80px; font-size: 22px">${pct == null ? '—' : pct + '%'}</div>
  </div>`;
}

function render(d) {
  const t = d.token;
  const imgKnown = t.imageSimilarity != null;
  const headScore = imgKnown ? t.imageSimilarity : t.nameSimilarity;
  const closest = t.closest;
  const verdict = t.flagged
    ? html`<span class="chip chip-inset danger" style="align-self: flex-start; font-size: 12px; padding: 5px 12px">Copycat detected</span>`
    : html`<span class="chip chip-inset up" style="align-self: flex-start; font-size: 12px; padding: 5px 12px">Looks original</span>`;
  const closestLine = closest
    ? html`${imgKnown ? 'Image is' : 'Name is'} ${Math.round(headScore * 100) >= 90 ? 'nearly identical' : 'similar'} to <strong style="color: var(--ink)">$${closest.symbol}</strong>${closest.diedAfter ? `, which died ${closest.diedAfter} after launching ${closest.launchedAgo}` : ''}${closest.sameDeployer ? ' from the same deployer' : ''}.`
    : 'No older token with a similar name.';

  const matches = (d.matches || []).map((m) => {
    const w = Math.max(2, Math.min(100, m.score));
    const color = m.score >= cfg.COPYCAT_NAME_THRESHOLD * 100 ? 'var(--danger)' : 'var(--accent)';
    return html`<div class="match">
      ${raw(thumb(52, m.alive === false, m))}
      <div style="display: flex; flex-direction: column; gap: 10px; min-width: 0">
        <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline"><span style="font-weight: 600">${m.name}</span><span class="small muted">$${m.symbol} · ${m.note}</span>${raw(ponsLink(cfg, m.address))}</div>
        <div class="bar thin"><div class="fill" style="width: ${raw(w)}%; background: ${raw(color)}"></div><span class="knob" style="left: ${raw(w)}%"></span></div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px"><span style="font-weight: 700; font-size: 22px">${m.score}%</span>${raw(fate(m.alive, m.life))}</div>
    </div>`;
  }).join('');

  const dep = d.deployer;
  const stat = (k, v, danger) => html`<div class="stat"><span class="k">${k}</span><span class="v"${raw(danger ? ' style="color: var(--danger)"' : '')}>${v}</span></div>`;
  const patternChip = dep ? ({ farm: ['Farm pattern · high risk', 'var(--danger)'], repeat: ['Repeat deployer · medium risk', '#8A5A00'], new: ['First launch seen', 'var(--accent-ink)'] }[dep.pattern] || ['Unknown', 'var(--muted)']) : null;

  $('result').innerHTML = html`
    ${raw(d.note ? html`<p class="note" style="margin-top: -12px">${d.note}</p>` : '')}
    <div class="split">
      <section class="panel" aria-label="Scanned token" style="flex: 1 1 360px">
        <div class="panel-head"><span class="eyebrow">${d.mode === 'scan' ? 'Scanned token' : 'Just launched'}</span><span style="display: flex; gap: 8px; align-items: center"><span class="small muted">${t.launchpad}${t.launchedAt ? ' · ' + timeAgo(t.launchedAt) : ''}</span><span class="src" data-src hidden></span></span></div>
        <div style="display: flex; gap: 20px; align-items: center">
          <span class="thumb" style="width: 96px; height: 96px; border-radius: 26px" aria-hidden="true"><svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="36" r="20" style="fill: var(--accent)"/><path d="M17 26 L21 12 L28 23 Z M47 26 L43 12 L36 23 Z" style="fill: var(--accent)"/><circle cx="25" cy="34" r="3" fill="#fff"/><circle cx="39" cy="34" r="3" fill="#fff"/><path d="M26 44 Q32 49 38 44" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>${raw(tokenImg(t))}</span>
          <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0">
            <span style="font-weight: 700; font-size: 26px; letter-spacing: -0.02em; overflow-wrap: anywhere">${t.name || 'Unnamed token'}</span>
            <span class="small muted">$${t.symbol || '?'} · ${raw(explorerLink(cfg, t.address))}</span>
            ${raw(ponsLink(cfg, t.address, 'Open on Pons', 'pons-btn'))}
            ${raw(t.links && (t.links.x || t.links.telegram || t.links.website) ? `<span class="tok-links">${[['X', t.links.x], ['Telegram', t.links.telegram], ['Website', t.links.website]].filter(([, u]) => u && /^https?:\/\//i.test(u)).map(([k, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener nofollow">${k}</a>`).join('')}</span>` : '')}
          </div>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 24px; align-items: center">
          ${raw(gauge(headScore, imgKnown ? 'Image similarity' : 'Name similarity'))}
          <div style="display: flex; flex-direction: column; gap: 6px; flex: 1 1 180px">
            ${raw(verdict)}
            <span style="font-size: 14px" class="muted">${raw(closestLine)}</span>
            <span class="small muted">${imgKnown ? raw(html`Name similarity <strong style="color: var(--ink)">${Math.round(t.nameSimilarity * 100)}%</strong>`) : 'Image matching is on the roadmap; this score compares names.'}</span>
          </div>
        </div>
      </section>

      <section class="panel" aria-label="Matches with older tokens" style="flex: 999 1 560px">
        <div class="panel-head"><h2 class="h2">Matches with older tokens</h2><span class="small muted">${(d.matches || []).length} of ${(d.scanned || 0).toLocaleString('en-US')} tokens</span></div>
        ${raw(matches || '<div class="empty">No similar older tokens.</div>')}
      </section>
    </div>

    ${raw(dep ? html`<section class="panel" aria-label="Deployer profile">
      <div class="panel-head" style="align-items: center">
        <div style="display: flex; flex-direction: column"><h2 class="h2">Deployer behind $${t.symbol}</h2><span class="small muted">${raw(explorerLink(cfg, dep.address))}</span></div>
        <span class="chip" style="padding: 10px 18px; font-size: 13px; background: ${raw(patternChip[1])}; color: #fff">${patternChip[0]}</span>
      </div>
      <div class="stats">
        ${raw(stat('Tokens · 30 days', dep.tokens30d ?? '—'))}
        ${raw(stat('Dead within 6h', dep.deadWithin6h ?? '—', dep.deadWithin6h > 0))}
        ${raw(stat('Images reused', dep.imagesReused == null ? '—' : dep.imagesReused + '×'))}
        ${raw(stat('Median lifespan', fmtDuration(dep.medianLifespanMin)))}
      </div>
      ${raw(dep.history && dep.history.length ? `<div class="history">${dep.history.map((h) => html`<div>${raw(thumb(40, h.alive === false, h))}<div style="display: flex; flex-direction: column; min-width: 0"><span style="font-size: 12px; font-weight: 600">$${h.symbol}</span>${raw(h.alive == null ? `<span class="fate muted">${esc(h.at ? timeAgo(h.at) : '')}</span>` : fate(h.alive, h.life))}</div></div>`).join('')}</div>` : '<div class="empty">No other launches from this deployer.</div>')}
    </section>` : '')}`;
  $('result').querySelectorAll('[data-src]').forEach((el) => sourceBadge(el, d));
}

const pctOf = (v) => Math.round((v || 0) * 100);
function findings(d) {
  const t = d.token, dep = d.deployer, out = [];
  out.push({ text: `Compared $${t.symbol || '?'} with ${(d.scanned || 0).toLocaleString('en-US')} older launches`, tone: 'info' });
  if (t.closest) out.push({ text: `Closest match: $${t.closest.symbol}, ${pctOf(t.imageSimilarity ?? t.nameSimilarity)}% alike`, tone: t.flagged ? 'bad' : 'info' });
  else out.push({ text: 'No older token with a similar name', tone: 'good' });
  if (dep) out.push({ text: dep.pattern === 'farm' ? `Deployer launched ${dep.tokens30d ?? 'many'} tokens: farm pattern` : dep.pattern === 'repeat' ? `Deployer has launched before (${dep.tokens30d ?? '?'} tokens)` : 'First launch seen from this deployer', tone: dep.pattern === 'farm' ? 'bad' : dep.pattern === 'repeat' ? 'info' : 'good' });
  return out;
}
function read(d) {
  const t = d.token, dep = d.deployer, sym = `$${t.symbol || '?'}`;
  let s = t.flagged && t.closest
    ? `${sym} is most likely a copy of $${t.closest.symbol}: the names are ${pctOf(t.imageSimilarity ?? t.nameSimilarity)}% alike${t.closest.diedAfter ? `, and the original died ${t.closest.diedAfter} after launch` : ''}.`
    : `${sym} doesn't copy any older launch we've seen.`;
  if (dep && dep.pattern === 'farm') s += ` Its deployer farms launches${dep.deadWithin6h ? `: ${dep.deadWithin6h} died within 6 hours` : ''}, so treat it as a likely quick flip.`;
  else if (dep && dep.pattern === 'repeat') s += ' The deployer has launched before; check how those ended below.';
  else if (dep) s += ' It is the first launch we have seen from this deployer.';
  return s;
}

async function run(path, mode) {
  try {
    const job = await agentScan($('result'), {
      label: scanLabel('Copycat scan', mode === 'scan' ? new URL(path, location.origin).searchParams.get('address') : null),
      steps: ['Reading the launch transaction', 'Loading every launch name from the last 24h', 'Comparing name and ticker with older launches', "Tracing the deployer's launch history"],
      task: api(path), findings, read
    });
    const d = job.data;
    d.mode = mode;
    render(d);
    job.attach();
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
  run(`/api/copycat/scan?address=${encodeURIComponent(a)}`, 'scan');
});
$('latest-btn').addEventListener('click', () => {
  $('ca').value = '';
  history.replaceState(null, '', location.pathname);
  run('/api/copycat/latest', 'latest');
});

const initial = new URLSearchParams(location.search).get('address');
if (initial && isAddress(initial)) { $('ca').value = initial; run(`/api/copycat/scan?address=${encodeURIComponent(initial)}`, 'scan'); }
else run('/api/copycat/latest', 'latest');
void short;
