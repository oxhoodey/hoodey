// Particle dial for the Market Clock: the 24h session ring, the hand and the exchange time,
// all drawn in dots. Dots assemble on load, scatter from the cursor, and the time digits
// re-form whenever the minute changes.
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = { pre: '#8FD67A', regular: '#00C805', after: '#0F5A2E', closed: '#CFDDD3' };

export function createParticleDial(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'pdial-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);
  const ctx = canvas.getContext('2d');
  let S = 0, dpr = 1, c = 0;
  let ring = [], ticks = [], digits = [], orbit = [];
  let state = null, timeStr = '', digitsChangedAt = 0;
  const mouse = { x: -1e4, y: -1e4 };
  let running = false, visible = true, raf = 0;
  const t0 = performance.now();

  const sessionOf = (minute) => (state ? state.sessionOf(minute) : 'closed');

  function build() {
    const r = host.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    S = Math.min(r.width, r.height) || 320;
    canvas.width = Math.round(S * dpr); canvas.height = Math.round(S * dpr);
    canvas.style.width = canvas.style.height = S + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    c = S / 2;
    const k = S / 350; // ring, ticks and labels all fit inside the square
    const first = !ring.length;
    // session ring: 4 rows of dots
    const rows = [118, 125, 132, 139].map((v) => v * k);
    const next = [];
    rows.forEach((rad, ri) => {
      const n = Math.round((2 * Math.PI * rad) / (5.2 * k));
      for (let i = 0; i < n; i++) {
        const minute = (i / n) * 1440;
        const a = (minute / 1440) * Math.PI * 2 - Math.PI / 2;
        const tx = c + Math.cos(a) * rad, ty = c + Math.sin(a) * rad;
        const old = ring[next.length];
        next.push({ minute, a, tx, ty, x: old ? old.x : first && !reduceMotion ? c + Math.cos(a) * 10 : tx, y: old ? old.y : first && !reduceMotion ? c + Math.sin(a) * 10 : ty,
          vx: 0, vy: 0, s: (1.9 + Math.random() * 0.9) * k, ph: Math.random() * 6.28, row: ri });
      }
    });
    ring = next;
    // hour ticks outside the ring
    ticks = Array.from({ length: 24 }, (_, h) => { const a = (h / 24) * Math.PI * 2 - Math.PI / 2; const rad = 152 * k; return { h, x: c + Math.cos(a) * rad, y: c + Math.sin(a) * rad, big: h % 6 === 0 }; });
    // slow outer orbit dust
    orbit = Array.from({ length: Math.round(110 * k) }, () => ({ a: Math.random() * 6.28, r: (160 + Math.random() * 6) * k, s: (Math.random() < 0.2 ? 1.6 : 1) * k, o: 0.15 + Math.random() * 0.35 }));
    if (timeStr) layoutDigits(false);
  }

  function layoutDigits(animate) {
    const k = S / 320;
    const off = document.createElement('canvas');
    const w = Math.round(150 * k), h = Math.round(56 * k);
    off.width = w; off.height = h;
    const o = off.getContext('2d');
    o.font = `700 ${Math.round(50 * k)}px 'Funnel Display', 'Funnel Sans', system-ui, sans-serif`;
    o.textAlign = 'center'; o.textBaseline = 'middle';
    o.fillText(timeStr, w / 2, h / 2 + 2 * k);
    const img = o.getImageData(0, 0, w, h).data;
    const step = 2.6 * k;
    const pts = [];
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (img[(Math.round(y) * w + Math.round(x)) * 4 + 3] > 120) pts.push({ x: c - w / 2 + x, y: c - h / 2 + y });
    const next = pts.map((p, i) => {
      const old = digits[i];
      return { tx: p.x, ty: p.y, x: old ? old.x : animate ? c + (Math.random() - 0.5) * 20 : p.x, y: old ? old.y : animate ? c + (Math.random() - 0.5) * 20 : p.y,
        vx: animate ? (Math.random() - 0.5) * 6 : 0, vy: animate ? (Math.random() - 0.5) * 6 : 0, s: step * (0.7 + Math.random() * 0.25), ph: Math.random() * 6.28, dying: false, al: 1 };
    });
    for (let i = pts.length; i < digits.length; i++) next.push({ ...digits[i], dying: true, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4 });
    digits = reduceMotion ? next.filter((d) => !d.dying).map((d) => ({ ...d, x: d.tx, y: d.ty })) : next;
    digitsChangedAt = performance.now();
  }

  const spring = (d, k, damp, rad, push) => {
    let ax = (d.tx - d.x) * k, ay = (d.ty - d.y) * k;
    const dx = d.x - mouse.x, dy = d.y - mouse.y, d2 = dx * dx + dy * dy;
    if (d2 < rad * rad) { const dist = Math.sqrt(d2) || 1, f = (1 - dist / rad) * push; ax += (dx / dist) * f; ay += (dy / dist) * f; }
    d.vx = (d.vx + ax) * damp; d.vy = (d.vy + ay) * damp; d.x += d.vx; d.y += d.vy;
  };

  function draw(now) {
    const t = (now - t0) / 1000;
    const k = S / 350;
    ctx.clearRect(0, 0, S, S);
    if (!state) return;
    const handMin = state.minute;
    const handA = (handMin / 1440) * Math.PI * 2 - Math.PI / 2;

    // outer orbit dust
    ctx.fillStyle = '#0B7A2E';
    for (const o of orbit) { const a = o.a + (reduceMotion ? 0 : t * 0.04); ctx.globalAlpha = o.o; ctx.fillRect(c + Math.cos(a) * o.r, c + Math.sin(a) * o.r, o.s, o.s); }

    // hour ticks + labels
    ctx.fillStyle = '#9DB8A6';
    for (const tk of ticks) { ctx.globalAlpha = tk.big ? 0.9 : 0.5; const s = (tk.big ? 3 : 1.6) * k; ctx.fillRect(tk.x - s / 2, tk.y - s / 2, s, s); }
    ctx.globalAlpha = 1;
    ctx.font = `500 ${Math.round(10 * k)}px 'Spline Sans Mono', ui-monospace, monospace`;
    ctx.fillStyle = '#5B6E61'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [['00', 0], ['06', 6], ['12', 12], ['18', 18]].forEach(([l, h]) => { const a = (h / 24) * Math.PI * 2 - Math.PI / 2; ctx.fillText(l, c + Math.cos(a) * 168 * k, c + Math.sin(a) * 168 * k); });

    // session ring: colour by session; dots near the hand light up
    for (const d of ring) {
      if (!reduceMotion) spring(d, 0.06, 0.82, 40 * k, 2.4);
      const sess = sessionOf(d.minute);
      let diff = d.minute - handMin; if (diff < -720) diff += 1440; if (diff > 720) diff -= 1440;
      const near = Math.max(0, 1 - Math.abs(diff) / 70);
      const behind = diff < 0 && diff > -180 ? 1 - Math.abs(diff) / 180 : 0; // the last 3 hours glow faintly
      const tw = reduceMotion ? 1 : 0.78 + 0.22 * Math.sin(t * 2 + d.ph);
      ctx.globalAlpha = Math.min(1, (sess === 'closed' ? 0.75 : 0.85) * tw + near * 0.3 + behind * 0.1);
      ctx.fillStyle = COLORS[sess];
      const s = d.s * (1 + near * 0.9);
      ctx.fillRect(d.x - s / 2, d.y - s / 2, s, s);
    }

    // hand: a line of dots with a pulsing head
    ctx.fillStyle = '#0E1F15';
    for (let rr = 92 * k; rr < 112 * k; rr += 4 * k) { ctx.globalAlpha = 0.3 + 0.7 * ((rr - 92 * k) / (20 * k)); const s = 2.2 * k; ctx.fillRect(c + Math.cos(handA) * rr - s / 2, c + Math.sin(handA) * rr - s / 2, s, s); }
    const hx = c + Math.cos(handA) * 128.5 * k, hy = c + Math.sin(handA) * 128.5 * k;
    const pulse = reduceMotion ? 0 : (t % 1.6) / 1.6;
    ctx.globalAlpha = 0.35 * (1 - pulse); ctx.fillStyle = COLORS[sessionOf(handMin)] === COLORS.closed ? '#0E1F15' : COLORS[sessionOf(handMin)];
    ctx.beginPath(); ctx.arc(hx, hy, (7 + pulse * 14) * k, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = '#0E1F15';
    ctx.beginPath(); ctx.arc(hx, hy, 6 * k, 0, Math.PI * 2); ctx.fill();

    // time digits
    const since = (now - digitsChangedAt) / 1000;
    for (let i = digits.length - 1; i >= 0; i--) {
      const d = digits[i];
      if (!reduceMotion) {
        if (d.dying) { d.x += d.vx; d.y += d.vy; d.al -= 0.04; if (d.al <= 0) { digits.splice(i, 1); continue; } }
        else spring(d, 0.09, 0.78, 26 * k, 1.8);
      }
      ctx.globalAlpha = d.dying ? d.al : (reduceMotion ? 1 : 0.82 + 0.18 * Math.sin(t * 3 + d.ph));
      ctx.fillStyle = since < 0.4 && Math.random() < 0.15 ? '#00C805' : '#0E1F15';
      ctx.fillRect(d.x, d.y, d.s, d.s);
    }
    ctx.globalAlpha = 1;
  }

  function loop(now) { if (!running) return; draw(now); raf = requestAnimationFrame(loop); }
  function start() { if (running || reduceMotion || !visible || document.hidden) return; running = true; raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
  canvas.addEventListener('pointerleave', () => { mouse.x = mouse.y = -1e4; });
  new ResizeObserver(() => build()).observe(host);
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; visible ? start() : stop(); }).observe(canvas);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (timeStr) layoutDigits(false); });
  build();
  start();

  return {
    // minute: minutes since exchange midnight (fractional); sessionOf(minute) -> 'pre' | 'regular' | 'after' | 'closed'
    update({ minute, time, sessionOf: fn }) {
      state = { minute, sessionOf: fn };
      if (time !== timeStr) { const animate = !!timeStr && !reduceMotion; timeStr = time; layoutDigits(animate); }
      if (reduceMotion) draw(performance.now());
    }
  };
}
