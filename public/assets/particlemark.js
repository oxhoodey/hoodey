// Particle mark: the HoodEye logo drawn with a few thousand dots.
// Dots spring back to their place in the logo, scatter away from the cursor, and every new
// Pons launch sends a small comet of green dots flying into the mark.
import { LOGO_PATHS } from './common.js';

const VIEW = 390.85; // logo viewBox size
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createParticleMark(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, size = 0, ox = 0, oy = 0;
  let dots = [];       // logo dots
  let ring = [];       // dotted orbit ring
  let comets = [];     // temporary dots flying in
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
    size = Math.min(W, H) * 0.6;
    ox = (W - size) / 2; oy = (H - size) / 2;
    const first = !dots.length;
    dots = points.map((p, i) => {
      const tx = ox + p.u * size, ty = oy + p.v * size;
      const old = dots[i];
      // first time: start scattered on a wide circle, then assemble
      const a = Math.random() * Math.PI * 2, d = Math.max(W, H) * (0.45 + Math.random() * 0.4);
      return {
        tx, ty,
        x: old ? old.x : first && !reduceMotion ? W / 2 + Math.cos(a) * d : tx,
        y: old ? old.y : first && !reduceMotion ? H / 2 + Math.sin(a) * d : ty,
        vx: 0, vy: 0, color: p.color, green: p.green,
        s: (p.green ? 2.1 : 1.8) * (size / 420) * (0.75 + Math.random() * 0.5) + 0.6, al: p.a,
        ph: Math.random() * Math.PI * 2
      };
    });
    const R = size * 0.74, n = Math.round(R * 1.1);
    ring = Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 2, r: R * (0.99 + Math.random() * 0.03), s: Math.random() < 0.15 ? 1.8 : 1.1, o: 0.25 + Math.random() * 0.45 }));
    if (reduceMotion) draw(performance.now());
  }

  function draw(now) {
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;

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

  return {
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
