import { initPage, api, html, raw } from './common.js';

const cfg = await initPage('roadmap');
const $ = (id) => document.getElementById(id);
const STATUS = { live: 'st-live', building: 'st-building', planned: 'st-planned', research: 'st-research' };

try {
  const rm = await api('/api/roadmap');
  $('steps').innerHTML = rm.phases.map((p, i) => html`<div><span class="pdot${raw(i === 0 ? ' now' : '')}"></span><span class="chip ${raw(i === 0 ? 'chip-dark' : 'chip-raised')}" style="font-size: 12px; padding: 4px 14px">${p.name}</span></div>`).join('');
  $('phases').innerHTML = rm.phases.map((p) => html`<div class="panel panel-sm" style="gap: 16px">
    <div class="panel-head"><h2 style="font-size: 18px; font-weight: 700">${p.name}</h2><span class="small muted">${p.tag}</span></div>
    ${raw(p.items.map((it) => html`<div class="item">
      <div class="t"><span style="font-weight: 700; font-size: 14px; line-height: 1.3">${it.title}</span><span class="chip ${raw(STATUS[String(it.status).toLowerCase()] || 'st-planned')}">${it.status}</span></div>
      <span style="font-size: 13px" class="muted">${it.desc}</span>
    </div>`).join(''))}
  </div>`).join('');
  $('tracks').innerHTML = rm.tracks.map((t, i) => html`<div class="track">
    <div style="display: flex; align-items: center; gap: 12px"><span class="n">${String(i + 1).padStart(2, '0')}</span><span style="font-weight: 700; font-size: 15px">${t.title}</span></div>
    <ul>${raw(t.points.map((p) => html`<li>${p}</li>`).join(''))}</ul>
  </div>`).join('');
} catch (err) {
  $('phases').innerHTML = html`<div class="empty">Couldn't load the roadmap: ${err.message}</div>`;
}

if (cfg.ROADMAP_VOTE_URL) {
  $('vote').hidden = false;
  $('vote-link').href = cfg.ROADMAP_VOTE_URL;
}
