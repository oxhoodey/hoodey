// Big text drawn in dots (used by the Death Clock countdown). When the text changes, the dots
// fly to their new places, extra dots fade out, new ones burst in. Dots scatter from the cursor.
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createParticleText(host, { color = '#0E1F15', glow = '#00C805' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'ptext-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let Wd = 0, Ht = 0, dpr = 1, dots = [], text = '', col = color, changedAt = 0;
  const mouse = { x: -1e4, y: -1e4 };
  let running = false, visible = true, raf = 0;
  const t0 = performance.now();

  function size() {
    const r = host.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    Wd = Math.max(120, r.width); Ht = Math.max(60, r.height);
    canvas.width = Math.round(Wd * dpr); canvas.height = Math.round(Ht * dpr);
    canvas.style.width = Wd + 'px'; canvas.style.height = Ht + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function layout(animate) {
    if (!Wd) return;
    const off = document.createElement('canvas');
    off.width = Math.round(Wd); off.height = Math.round(Ht);
    const o = off.getContext('2d');
    let fs = Ht * 0.92;
    const font = (s) => `700 ${Math.round(s)}px 'Funnel Display', 'Funnel Sans', system-ui, sans-serif`;
    o.font = font(fs);
    const w = o.measureText(text).width;
    if (w > Wd * 0.98) { fs *= (Wd * 0.98) / w; o.font = font(fs); }
    o.textAlign = 'left'; o.textBaseline = 'middle';
    o.fillText(text, 0, Ht / 2 + fs * 0.04);
    const img = o.getImageData(0, 0, off.width, off.height).data;
    const step = Math.max(3, fs / 22);
    const pts = [];
    for (let y = 0; y < off.height; y += step) for (let x = 0; x < off.width; x += step) if (img[(Math.round(y) * off.width + Math.round(x)) * 4 + 3] > 120) pts.push({ x, y });
    const next = pts.map((p, i) => {
      const old = dots[i] && !dots[i].dying ? dots[i] : null;
      return { tx: p.x, ty: p.y, x: old ? old.x : animate ? p.x + (Math.random() - 0.5) * 60 : p.x, y: old ? old.y : animate ? p.y + (Math.random() - 0.5) * 60 : p.y,
        vx: 0, vy: 0, s: step * (0.62 + Math.random() * 0.25), ph: Math.random() * 6.28, dying: false, al: old ? 1 : animate ? 0 : 1 };
    });
    for (let i = pts.length; i < dots.length; i++) if (!dots[i].dying) next.push({ ...dots[i], dying: true, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5 });
    dots = reduceMotion ? next.filter((d) => !d.dying).map((d) => ({ ...d, x: d.tx, y: d.ty, al: 1 })) : next;
    changedAt = performance.now();
  }

  function draw(now) {
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, Wd, Ht);
    const since = (now - changedAt) / 1000;
    for (let i = dots.length - 1; i >= 0; i--) {
      const d = dots[i];
      if (!reduceMotion) {
        if (d.dying) { d.x += d.vx; d.y += d.vy; d.al -= 0.05; if (d.al <= 0) { dots.splice(i, 1); continue; } }
        else {
          let ax = (d.tx - d.x) * 0.12, ay = (d.ty - d.y) * 0.12;
          const dx = d.x - mouse.x, dy = d.y - mouse.y, d2 = dx * dx + dy * dy, R = Ht * 0.35;
          if (d2 < R * R) { const dist = Math.sqrt(d2) || 1, f = (1 - dist / R) * 3; ax += (dx / dist) * f; ay += (dy / dist) * f; }
          d.vx = (d.vx + ax) * 0.74; d.vy = (d.vy + ay) * 0.74; d.x += d.vx; d.y += d.vy;
          if (d.al < 1) d.al = Math.min(1, d.al + 0.08);
        }
      }
      ctx.globalAlpha = d.al * (reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 3 + d.ph));
      ctx.fillStyle = since < 0.25 && Math.random() < 0.2 ? glow : col;
      ctx.beginPath(); ctx.arc(d.x + d.s / 2, d.y + d.s / 2, d.s / 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function loop(now) { if (!running) return; draw(now); raf = requestAnimationFrame(loop); }
  function start() { if (running || reduceMotion || !visible || document.hidden) return; running = true; raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
  canvas.addEventListener('pointerleave', () => { mouse.x = mouse.y = -1e4; });
  const ro = new ResizeObserver(() => { size(); layout(false); if (reduceMotion) draw(performance.now()); });
  ro.observe(host);
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; visible ? start() : stop(); });
  io.observe(canvas);
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layout(false); });
  size();
  start();

  return {
    set(next, nextColor) {
      if (nextColor) col = nextColor;
      if (next === text) return;
      const animate = !!text && !reduceMotion;
      text = next;
      layout(animate);
      if (reduceMotion) draw(performance.now());
    },
    destroy() { stop(); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); canvas.remove(); }
  };
}
