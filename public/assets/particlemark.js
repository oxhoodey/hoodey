// Particle mark: the Hoodey logo drawn with a few thousand dots.
// Dots spring back to their place in the logo, scatter away from the cursor, and every new
// Pons launch sends a small comet of green dots flying into the mark. The newest launch's
// ticker is written in dots too, bottom right; when a new one lands, the old ticker shatters
// and the dots re-form into the new one with a scan line and a short glitch.
import { LOGO_PATHS } from './common.js';

const VIEW = 390.85; // logo viewBox size
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createParticleMark(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, size = 0, ox = 0, oy = 0;
  let dots = [];       // logo dots
  let ring = [];       // dotted orbit ring
  let comets = [];     // temporary dots flying in
  let txt = [];        // dots spelling the latest ticker
  let label = null;    // { sym, risk, at, changedAt }
  let mcx = 0, mcy = 0; // centre of the mark
  const mouse = { x: -1e4, y: -1e4 };
  let running = false, visible = true, raf = 0, t0 = performance.now();

  function sample() {
    // Render each logo part off-screen and keep a dot wherever the shape is filled.
    const res = 78; // ~2,400 dots: sparse enough to read as a dot pattern
    const off = document.createElement('canvas');
    off.width = off.height = res;
    const o = off.getContext('2d');
    const parts = [['ring', '#0B1F14'], ['arc', '#00C805'], ['core', '#00C805']];
    const out = [];
    for (const [key, color] of parts) {
      o.clearRect(0, 0, res, res);
      o.save();
      o.scale(res / VIEW, res / VIEW);
      o.fill(new Path2D(LOGO_PATHS[key]));
      o.restore();
      const img = o.getImageData(0, 0, res, res).data;
      for (let y = 0; y < res; y++) {
        for (let x = 0; x < res; x++) {
          if (img[(y * res + x) * 4 + 3] > 128) out.push({ u: (x + 0.5 + (Math.random() - 0.5) * 0.5) / res, v: (y + 0.5 + (Math.random() - 0.5) * 0.5) / res, color, green: color !== '#0B1F14', a: 0.45 + Math.random() * 0.55 });
        }
      }
    }
    return out;
  }
  const points = sample();

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = Math.min(W, H) * 0.56;
    mcx = W * 0.47; mcy = H * 0.42;
    ox = mcx - size / 2; oy = mcy - size / 2;
    const first = !dots.length;
    dots = points.map((p, i) => {
      const tx = ox + p.u * size, ty = oy + p.v * size;
      const old = dots[i];
      // first time: start scattered on a wide circle, then assemble
      const a = Math.random() * Math.PI * 2, d = Math.max(W, H) * (0.45 + Math.random() * 0.4);
      return {
        tx, ty,
        x: old ? old.x : first && !reduceMotion ? mcx + Math.cos(a) * d : tx,
        y: old ? old.y : first && !reduceMotion ? mcy + Math.sin(a) * d : ty,
        vx: 0, vy: 0, color: p.color, green: p.green,
        s: (p.green ? 2.1 : 1.8) * (size / 420) * (0.75 + Math.random() * 0.5) + 0.6, al: p.a,
        ph: Math.random() * Math.PI * 2
      };
    });
    const R = size * 0.74, n = Math.round(R * 1.1);
    ring = Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 2, r: R * (0.99 + Math.random() * 0.03), s: Math.random() < 0.15 ? 1.8 : 1.1, o: 0.25 + Math.random() * 0.45 }));
    if (label) layoutText(false);
    if (reduceMotion) draw(performance.now());
  }

  // ── ticker in dots ──────────────────────────────────────────────────
  const RISK = { low: '#00C805', medium: '#D9A21B', high: '#E2553A' };
  function box() {
    const x0 = W * 0.36, x1 = W * 0.97, y1 = H * 0.96, h = Math.max(38, H * 0.155);
    return { x0, x1, y0: y1 - h, y1, w: x1 - x0, h };
  }
  function textTargets(str) {
    const b = box();
    const off = document.createElement('canvas');
    off.width = Math.ceil(b.w); off.height = Math.ceil(b.h);
    const o = off.getContext('2d');
    let fs = b.h * 0.92;
    const font = (n) => `700 ${n}px 'Funnel Display', 'Funnel Sans', system-ui, sans-serif`;
    o.font = font(fs);
    while (o.measureText(str).width > b.w * 0.98 && fs > 12) { fs -= 2; o.font = font(fs); }
    o.textBaseline = 'alphabetic';
    o.fillText(str, b.w - o.measureText(str).width, b.h * 0.86);
    const img = o.getImageData(0, 0, off.width, off.height).data;
    const step = Math.max(2.4, fs / 17);
    const out = [];
    for (let y = 0; y < off.height; y += step) for (let x = 0; x < off.width; x += step) {
      const xi = Math.round(x), yi = Math.round(y);
      if (img[(yi * off.width + xi) * 4 + 3] > 120) out.push({ x: b.x0 + x + (Math.random() - 0.5) * step * 0.3, y: b.y0 + y + (Math.random() - 0.5) * step * 0.3 });
    }
    return { pts: out, step };
  }
  function layoutText(animate) {
    const { pts, step } = textTargets('$' + label.sym);
    const col = RISK[label.risk] || RISK.low;
    const b = box();
    const greens = dots.filter((d) => d.green);
    const next = pts.map((p, i) => {
      const old = txt[i];
      const src = old || (greens.length ? greens[(Math.random() * greens.length) | 0] : { x: p.x, y: p.y });
      return {
        tx: p.x, ty: p.y,
        x: animate || !old ? (old ? old.x : src.x) : p.x, y: animate || !old ? (old ? old.y : src.y) : p.y,
        vx: animate && old ? (Math.random() - 0.5) * 14 : 0, vy: animate && old ? (Math.random() - 0.5) * 14 : 0,
        delay: animate ? ((p.x - b.x0) / b.w) * 0.55 : 0,
        color: Math.random() < 0.12 ? '#0B1F14' : col, s: step * (0.62 + Math.random() * 0.3), al: 0.55 + Math.random() * 0.45, ph: Math.random() * 6.28, dying: false
      };
    });
    // leftover dots from a longer ticker drift off and fade
    for (let i = pts.length; i < txt.length; i++) next.push({ ...txt[i], dying: true, vx: (Math.random() - 0.5) * 6, vy: -2 - Math.random() * 4 });
    txt = reduceMotion ? next.filter((d) => !d.dying).map((d) => ({ ...d, x: d.tx, y: d.ty })) : next;
  }

  function draw(now) {
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    const cx = mcx, cy = mcy;

    // dotted orbit ring, slowly turning
    const spin = reduceMotion ? 0 : t * 0.05;
    ctx.fillStyle = '#0B7A2E';
    for (const d of ring) {
      const a = d.a + spin;
      ctx.globalAlpha = d.o * (0.55 + 0.45 * Math.sin(a * 3 + t));
      ctx.fillRect(cx + Math.cos(a) * d.r, cy + Math.sin(a) * d.r * 0.98, d.s, d.s);
    }

    // logo dots
    for (const d of dots) {
      if (!reduceMotion) {
        let ax = (d.tx - d.x) * 0.055, ay = (d.ty - d.y) * 0.055;
        const dx = d.x - mouse.x, dy = d.y - mouse.y, dist2 = dx * dx + dy * dy, rad = 70;
        if (dist2 < rad * rad) { const dist = Math.sqrt(dist2) || 1, f = (1 - dist / rad) * 3.2; ax += (dx / dist) * f; ay += (dy / dist) * f; }
        d.vx = (d.vx + ax) * 0.84; d.vy = (d.vy + ay) * 0.84;
        d.x += d.vx; d.y += d.vy;
      }
      const tw = reduceMotion ? 1 : 0.75 + 0.25 * Math.sin(t * 2 + d.ph);
      ctx.globalAlpha = d.al * tw;
      ctx.fillStyle = d.color;
      const wob = reduceMotion ? 0 : Math.sin(t * 1.3 + d.ph) * 0.35;
      ctx.fillRect(d.x + wob, d.y - wob, d.s, d.s);
    }

    // comets: launches flying into the mark
    for (let i = comets.length - 1; i >= 0; i--) {
      const c = comets[i];
      c.p = Math.min(1, c.p + c.speed);
      const e = 1 - Math.pow(1 - c.p, 3);
      const x = c.sx + (c.tx - c.sx) * e + Math.sin(e * Math.PI) * c.bx;
      const y = c.sy + (c.ty - c.sy) * e + Math.sin(e * Math.PI) * c.by;
      ctx.globalAlpha = c.p < 0.92 ? 0.9 : (1 - c.p) * 10;
      ctx.fillStyle = c.color;
      ctx.fillRect(x, y, c.s, c.s);
      if (c.p >= 1) comets.splice(i, 1);
    }
    // ticker dots
    if (label) {
      const since = (now - label.changedAt) / 1000;
      const b = box();
      const glitch = !reduceMotion && since < 0.45;
      for (let i = txt.length - 1; i >= 0; i--) {
        const d = txt[i];
        if (!reduceMotion) {
          if (d.dying) { d.x += d.vx; d.y += d.vy; d.vy += 0.15; d.al -= 0.03; if (d.al <= 0) { txt.splice(i, 1); continue; } }
          else if (since >= d.delay) {
            let ax = (d.tx - d.x) * 0.08, ay = (d.ty - d.y) * 0.08;
            const dx = d.x - mouse.x, dy = d.y - mouse.y, dist2 = dx * dx + dy * dy, rad = 50;
            if (dist2 < rad * rad) { const dist = Math.sqrt(dist2) || 1, f = (1 - dist / rad) * 2.6; ax += (dx / dist) * f; ay += (dy / dist) * f; }
            d.vx = (d.vx + ax) * 0.8; d.vy = (d.vy + ay) * 0.8;
            d.x += d.vx; d.y += d.vy;
          } else { d.x += d.vx * 0.3; d.y += d.vy * 0.3; d.vx *= 0.92; d.vy *= 0.92; }
        }
        const tw = reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 2.4 + d.ph);
        // glitch: horizontal slices jump sideways for a moment
        const jx = glitch && Math.sin(d.ty * 0.9 + now * 0.05) > 0.7 ? (Math.random() - 0.5) * 16 : 0;
        ctx.globalAlpha = Math.max(0, d.al * tw);
        ctx.fillStyle = d.color;
        ctx.fillRect(d.x + jx, d.y, d.s, d.s);
        if (glitch && jx) { ctx.globalAlpha = 0.35; ctx.fillStyle = '#18C8FF'; ctx.fillRect(d.x + jx - 3, d.y, d.s, d.s); }
      }
      // scan line sweeping across the new ticker
      if (!reduceMotion && since < 1.1) {
        const sx = b.x0 + (since / 1.1) * b.w;
        const grd = ctx.createLinearGradient(sx - 40, 0, sx, 0);
        grd.addColorStop(0, 'rgba(0,200,5,0)'); grd.addColorStop(1, 'rgba(0,200,5,0.22)');
        ctx.globalAlpha = 1 - since / 1.1;
        ctx.fillStyle = grd; ctx.fillRect(sx - 40, b.y0 - 6, 40, b.h + 10);
        ctx.fillStyle = '#00C805'; ctx.fillRect(sx, b.y0 - 6, 1.5, b.h + 10);
      }
      // small mono caption above the ticker
      const age = label.at ? Math.max(0, Math.round((Date.now() - Date.parse(label.at)) / 1000)) : null;
      const ageTxt = age == null ? '' : age < 60 ? `${age}s ago` : age < 3600 ? `${Math.floor(age / 60)}m ago` : `${Math.floor(age / 3600)}h ago`;
      ctx.globalAlpha = 1;
      ctx.font = `500 ${Math.max(10, Math.round(H * 0.022))}px 'Spline Sans Mono', ui-monospace, monospace`;
      ctx.textAlign = 'right';
      const cap = `LATEST PONS LAUNCH${ageTxt ? ' · ' + ageTxt.toUpperCase() : ''}`;
      ctx.fillStyle = '#5B6E61';
      ctx.fillText(cap, b.x1, b.y0 - 6);
      const cw = ctx.measureText(cap).width;
      ctx.fillStyle = RISK[label.risk] || RISK.low;
      if (reduceMotion || Math.floor(t * 2) % 2 === 0) ctx.fillRect(b.x1 - cw - 14, b.y0 - 6 - Math.max(10, H * 0.022) * 0.72, 8, 8);
      ctx.textAlign = 'left';
    }
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    if (!running) return;
    draw(now);
    raf = requestAnimationFrame(loop);
  }
  function start() {
    if (running || reduceMotion || !visible || document.hidden) return;
    running = true; raf = requestAnimationFrame(loop);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
  canvas.addEventListener('pointerleave', () => { mouse.x = mouse.y = -1e4; });
  new ResizeObserver(() => resize()).observe(canvas);
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; visible ? start() : stop(); }).observe(canvas);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  resize();
  start();

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (label) layoutText(false); });

  return {
    // Show the newest launch's ticker in dots; a new ticker shatters the old one and re-forms.
    setLabel(sym, risk = 'low', at = null) {
      if (!sym) return;
      const changed = !label || label.sym !== sym;
      label = { sym: String(sym).slice(0, 14), risk, at, changedAt: changed ? performance.now() : label.changedAt };
      if (!W) return;
      if (changed) layoutText(!!txt.length && !reduceMotion);
      if (reduceMotion) draw(performance.now());
    },
    // A launch arrives: a stream of dots flies in from the edge toward the green arc.
    launch(risk = 'low') {
      if (reduceMotion || !W) return;
      const color = risk === 'high' ? '#E2553A' : risk === 'medium' ? '#D9A21B' : '#00C805';
      const greens = dots.filter((d) => d.green);
      const side = Math.random() < 0.5 ? -1 : 1;
      const sx = side < 0 ? -10 : W + 10, sy = H * (0.1 + Math.random() * 0.5);
      for (let i = 0; i < 46; i++) {
        const target = greens[(Math.random() * greens.length) | 0];
        comets.push({ sx: sx + (Math.random() - 0.5) * 30, sy: sy + (Math.random() - 0.5) * 30, tx: target.tx, ty: target.ty,
          bx: (Math.random() - 0.5) * 60, by: -40 - Math.random() * 60, p: -i * 0.012, speed: 0.012 + Math.random() * 0.008, s: 1.6 + Math.random(), color });
      }
      // nudge the mark so the hit is felt
      for (const d of greens) { d.vx += (Math.random() - 0.5) * 2.2; d.vy += (Math.random() - 0.5) * 2.2; }
    }
  };
}
