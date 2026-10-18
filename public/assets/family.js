import { initPage, api, html, raw, sourceBadge, timeAgo, every, tokenImg } from './common.js';

const cfg = await initPage('family');
const $ = (id) => document.getElementById(id);
const NW = 196, NH = 64, GX = 214, ROW = 84;
const state = { stock: new URLSearchParams(location.search).get('stock') || '', selected: null, data: null };

// Lay the tree out left to right: x by generation, y by leaf order.
function layout(nodes) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, { ...n, children: [] }]));
  let root = null;
  Object.values(byId).forEach((n) => { if (n.parent && byId[n.parent]) byId[n.parent].children.push(n); else if (!root) root = n; });
  let row = 0;
  (function place(n, gen) {
    n.gen = gen;
    if (!n.children.length) { n.y = row++ * ROW; return; }
    n.children.forEach((c) => place(c, gen + 1));
    n.y = (n.children[0].y + n.children[n.children.length - 1].y) / 2;
  })(root, 0);
  const list = Object.values(byId).filter((n) => n.gen != null);
  return { list, byId, width: (Math.max(...list.map((n) => n.gen)) * GX) + NW + 8, height: Math.max(1, row) * ROW - (ROW - NH) };
}

const noteText = (n) => (n.at ? timeAgo(n.at) : (/^\d{4}-\d{2}-\d{2}T/.test(n.note || '') ? timeAgo(n.note) : n.note || ''));

function render() {
  const d = state.data;
  sourceBadge($('src-tree'), d);
  $('tabs').innerHTML = d.stocks.map((s) => html`<button type="button" data-s="${s}" aria-pressed="${s === d.ticker}">${s}</button>`).join('');

  const tok = d.nodes.filter((n) => n.kind !== 'stock');
  const stat = (k, v, cls = '') => html`<div class="stat raised"><span class="k">${k}</span><span class="v ${cls}">${v}</span></div>`;
  const aliveKnown = tok.some((n) => n.alive != null);
  $('stats').innerHTML = stat('Tokens in family', tok.length) + stat('Originals', tok.filter((n) => n.kind === 'original').length, 'up') + stat('Clones', tok.filter((n) => n.kind === 'clone').length) + stat('Still alive', aliveKnown ? tok.filter((n) => n.alive).length : '—');

  const L = layout(d.nodes);
  if (!state.selected || !L.byId[state.selected] || L.byId[state.selected].kind === 'stock') {
    const firstClone = L.list.find((n) => n.kind === 'clone') || L.list.find((n) => n.kind !== 'stock');
    state.selected = firstClone ? firstClone.id : null;
  }
  const links = L.list.filter((n) => n.parent && L.byId[n.parent]).map((n) => {
    const p = L.byId[n.parent];
    const x1 = p.gen * GX + NW, y1 = p.y + NH / 2, x2 = n.gen * GX, y2 = n.y + NH / 2;
    const clone = n.kind === 'clone';
    return `<path d="M${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}" fill="none" style="stroke: ${clone ? '#9FB3A5' : 'var(--accent)'}" stroke-width="2"${clone ? ' stroke-dasharray="6 5"' : ''}/>`;
  }).join('');
  const nodes = L.list.map((n) => {
    const stock = n.kind === 'stock';
    const dead = n.alive === false;
    const dot = stock ? 'background: var(--accent)' : dead ? 'background: var(--faint)' : n.kind === 'original' ? 'background: var(--accent)' : 'border: 2px solid var(--accent); box-sizing: border-box';
    const sub = stock ? n.note : `$${n.symbol}${noteText(n) ? ' · ' + noteText(n) : ''}${n.similarity ? ' · ' + n.similarity + '%' : ''}`;
    return html`<button type="button" class="node${raw(stock ? ' stock' : '')}${raw(dead ? ' dead' : '')}" data-id="${n.id}" ${raw(stock ? 'disabled' : `aria-pressed="${n.id === state.selected}"`)} aria-label="${n.name}, ${stock ? 'stock' : n.kind}${n.alive == null ? '' : n.alive ? ', alive' : ', dead'}" style="left: ${raw(n.gen * GX)}px; top: ${raw(Math.round(n.y))}px">
      <span class="d" style="${raw(dot)}"></span>${raw(stock ? '' : tokenImg(n, 'nimg'))}<span><span class="n">${n.name}</span><span class="s">${sub}</span></span>
    </button>`;
  }).join('');
  $('tree').style.width = `${L.width}px`;
  $('tree').style.height = `${L.height}px`;
  $('tree').innerHTML = `<svg width="${L.width}" height="${L.height}" aria-hidden="true">${links}</svg>${nodes}`;

  const s = state.selected && L.byId[state.selected];
  if (!s) { $('detail').innerHTML = html`<div class="empty">No tokens on this narrative yet.</div>`; return; }
  const parent = s.parent && L.byId[s.parent];
  const original = s.kind === 'original';
  const note = original
    ? 'First token on this narrative. Clones below it borrow its name or image.'
    : parent && parent.deployer && parent.deployer === s.deployer ? 'Same deployer as the token it copies: a recycled launch.' : 'A different deployer copying an existing token.';
  const kv = (k, v) => html`<div class="kv"><span class="muted">${k}</span><strong>${v}</strong></div>`;
  $('detail').innerHTML = html`
    <span class="eyebrow">Selected</span>
    <div style="display: flex; flex-direction: column; gap: 4px"><span style="font-weight: 700; font-size: 26px; letter-spacing: -0.02em; line-height: 1.15">${s.name}</span><span class="small muted">$${s.symbol}</span></div>
    <span class="chip ${raw(original ? 'chip-accent' : 'chip-inset')}" style="align-self: flex-start; padding: 6px 14px; font-size: 12px">${original ? 'Original · gen 1' : `Clone · gen ${s.gen}`}</span>
    <div style="display: flex; flex-direction: column; gap: 10px">
      ${raw(kv('Copied from', original ? `${parent ? parent.symbol : '—'} (stock)` : parent ? '$' + parent.symbol : '—'))}
      ${raw(kv('Similarity', original ? 'Original' : (s.similarity != null ? s.similarity + '%' : '—')))}
      ${raw(kv('Status', s.alive == null ? 'Unknown' : s.alive ? 'Alive' : 'Dead'))}
      ${raw(kv('Deployer', s.deployer || '—'))}
    </div>
    <p class="small muted">${note}</p>
    ${raw(cfg.features.copycat ? '<a href="/copycat" style="align-self: flex-start; font-weight: 600; color: var(--accent-ink)">Open Copycat Eye</a>' : '')}`;
}

async function load() {
  try {
    state.data = await api(`/api/family?stock=${encodeURIComponent(state.stock)}`);
    state.stock = state.data.ticker;
    render();
  } catch (err) {
    $('tree').innerHTML = html`<div class="empty">Couldn't load: ${err.message}</div>`;
  }
}

$('tabs').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-s]');
  if (!b) return;
  state.stock = b.dataset.s;
  state.selected = null;
  history.replaceState(null, '', `?stock=${state.stock}`);
  load();
});
$('tree').addEventListener('click', (ev) => {
  const b = ev.target.closest('.node[data-id]');
  if (!b || b.disabled) return;
  state.selected = b.dataset.id;
  render();
});

await load();
every(cfg, load);
