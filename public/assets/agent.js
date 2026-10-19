// The Hoodey engine at work: every scan shows its checks as a live log (each line is a real step the
// scan does), then the findings, then a plain-English read of the result. When it finishes, the log
// folds into a small "Scan log" bar on top of the result.
import { esc } from './common.js';

const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));
const ICON = { run: '<i class="ag-spin"></i>', ok: '<i class="ag-ok">✓</i>', bad: '<i class="ag-bad">!</i>', good: '<i class="ag-good">✓</i>', info: '<i class="ag-info">›</i>', fail: '<i class="ag-bad">×</i>' };

// host: element to draw in. label: what is being scanned. steps: checks shown while the request runs.
// task: the request promise. findings(data) -> [{ text, tone: 'bad'|'good'|'info' }]. read(data) -> one paragraph.
export async function agentScan(host, { label, steps, task, findings = () => [], read = () => '' }) {
  const t0 = performance.now();
  host.innerHTML = `<section class="agent" aria-live="polite" aria-label="Scan in progress">
    <div class="ag-head"><span class="ag-orb" aria-hidden="true"><i></i></span><b>Hoodey engine</b><span class="ag-label">${esc(label)}</span><span class="ag-time">0.0s</span></div>
    <ol class="ag-steps"></ol><span class="ag-scanline" aria-hidden="true"></span></section>`;
  const ol = host.querySelector('.ag-steps');
  const timeEl = host.querySelector('.ag-time');
  const clock = setInterval(() => { timeEl.textContent = ((performance.now() - t0) / 1000).toFixed(1) + 's'; }, 100);
  const log = [];
  const line = (text, state) => {
    const li = document.createElement('li');
    li.className = `ag-${state}`;
    li.innerHTML = `${ICON[state] || ICON.info}<span>${esc(text)}</span>`;
    ol.appendChild(li);
    return li;
  };
  const settle = (li, state) => { li.className = `ag-${state}`; li.firstElementChild.outerHTML = ICON[state]; };

  let done = false, data, err;
  task.then((d) => { data = d; done = true; }, (e) => { err = e; done = true; });
  try {
    for (const s of steps) {
      const li = line(s, 'run');
      await sleep(170 + Math.random() * 120);
      settle(li, 'ok');
      log.push({ text: s, tone: 'ok' });
      if (done && err) break;
    }
    if (!done) {
      const li = line('Waiting for Robinhood Chain…', 'run');
      while (!done) await new Promise((r) => setTimeout(r, 60));
      settle(li, 'ok');
    }
    if (err) { line(err.message, 'fail'); throw err; }
    const found = findings(data) || [];
    if (found.length) {
      const div = document.createElement('li'); div.className = 'ag-div'; div.innerHTML = '<span>Findings</span>'; ol.appendChild(div);
    }
    for (const f of found) {
      line(f.text, f.tone || 'info');
      log.push(f);
      await sleep(110);
    }
    await sleep(320);
  } finally {
    clearInterval(clock);
  }
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  const text = read(data) || '';
  return {
    data,
    // put the read and the folded log on top of the rendered result
    attach(target = host) {
      const box = document.createElement('div');
      box.className = 'ag-after';
      box.innerHTML = `${text ? `<div class="ag-read"><span class="ag-read-k"><span class="ag-orb sm" aria-hidden="true"><i></i></span>Hoodey's read</span><p></p></div>` : ''}
        <details class="ag-log"><summary><span>Scan log</span><small>${log.length} checks · ${secs}s</small></summary><ol>${log.map((l) => `<li class="ag-${esc(l.tone)}">${ICON[l.tone] || ICON.info}<span>${esc(l.text)}</span></li>`).join('')}</ol></details>`;
      target.prepend(box);
      if (text) typeOut(box.querySelector('.ag-read p'), text);
    }
  };
}

function typeOut(el, text) {
  if (reduce) { el.textContent = text; return; }
  el.classList.add('typing');
  const step = Math.max(1, Math.ceil(text.length / 90)); // about 1.5s for any length
  let i = 0;
  const tick = () => {
    i = Math.min(text.length, i + step);
    el.textContent = text.slice(0, i);
    if (i < text.length) setTimeout(tick, 16); else el.classList.remove('typing');
  };
  tick();
}

// the label for a scan: "Cabal scan · 0x12ab…cdef"
export const scanLabel = (kind, a) => `${kind} · ${a ? `${a.slice(0, 6)}…${a.slice(-4)}` : 'newest launch'}`;
