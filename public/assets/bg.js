// Animated dot field behind every page, drawn with WebGL (no library).
// Waves slowly; the dots under the pointer rise and turn brighter green.
export function startBackground(canvas) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) return;
  const vs = `attribute vec2 aGrid; uniform float uT; uniform vec2 uMouse; uniform float uMI; uniform mat4 uP; uniform mat4 uV; uniform float uPR; varying float vH;
    void main(){ vec2 g = aGrid; float h = sin(g.x*0.35 + uT*0.9) * cos(g.y*0.35 + uT*0.7) * 0.45;
    float d = distance(g, uMouse); h += uMI * 1.8 * exp(-d*d/5.0); vH = h;
    vec4 mv = uV * vec4(g.x, h, g.y, 1.0); gl_Position = uP * mv; gl_PointSize = uPR * 5.0 * (12.0 / -mv.z); }`;
  const fs = `precision mediump float; uniform vec3 uA; uniform vec3 uB; varying float vH;
    void main(){ vec2 c = gl_PointCoord - 0.5; float r = dot(c, c); if (r > 0.25) discard;
    float t = clamp(vH*0.6 + 0.35, 0.0, 1.0); gl_FragColor = vec4(mix(uA, uB, t), (0.22 + 0.6*t) * (1.0 - r*2.0)); }`;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  const pts = [];
  for (let x = -24; x <= 24.01; x += 0.6) for (let z = -22; z <= 8.01; z += 0.6) pts.push(x, z);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STATIC_DRAW);
  const aGrid = gl.getAttribLocation(prog, 'aGrid');
  gl.enableVertexAttribArray(aGrid);
  gl.vertexAttribPointer(aGrid, 2, gl.FLOAT, false, 0, 0);

  const U = (n) => gl.getUniformLocation(prog, n);
  const uT = U('uT'), uMouse = U('uMouse'), uMI = U('uMI'), uP = U('uP'), uV = U('uV'), uPR = U('uPR');
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00C805';
  const rgb = hexToRgb(accent);
  gl.uniform3f(U('uA'), 0.62, 0.78, 0.66);
  gl.uniform3f(U('uB'), rgb[0], rgb[1], rgb[2]);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const tanH = Math.tan(0.45);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = { nx: 0, ny: 0, on: false, mi: 0, mx: 0, mz: -6, camX: 0 };

  window.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    st.nx = (e.clientX - r.left) / r.width * 2 - 1;
    st.ny = -((e.clientY - r.top) / r.height * 2 - 1);
    st.on = true;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { st.on = false; });

  let raf = 0;
  const frame = (ts) => {
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * pr)), h = Math.max(1, Math.round(canvas.clientHeight * pr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const aspect = w / h;
    st.mi += ((st.on ? 1 : 0) - st.mi) * 0.06;
    st.camX += ((st.on ? st.nx * 2.2 : 0) - st.camX) * 0.04;
    const eye = [st.camX, 7.5, 15], ctr = [0, 0, -3];
    const zA = norm(sub(eye, ctr)), xA = norm(cross([0, 1, 0], zA)), yA = cross(zA, xA);
    if (st.on) {
      const d = norm([0, 1, 2].map((i) => -zA[i] + xA[i] * st.nx * tanH * aspect + yA[i] * st.ny * tanH));
      if (d[1] < -0.01) { const t = -eye[1] / d[1]; st.mx += (eye[0] + d[0] * t - st.mx) * 0.15; st.mz += (eye[2] + d[2] * t - st.mz) * 0.15; }
    }
    const V = new Float32Array([xA[0], yA[0], zA[0], 0, xA[1], yA[1], zA[1], 0, xA[2], yA[2], zA[2], 0, -dot(xA, eye), -dot(yA, eye), -dot(zA, eye), 1]);
    const n = 0.1, fa = 100, ft = 1 / tanH;
    const P = new Float32Array([ft / aspect, 0, 0, 0, 0, ft, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uT, reduce ? 0 : ts * 0.001);
    gl.uniform2f(uMouse, st.mx, st.mz);
    gl.uniform1f(uMI, st.mi);
    gl.uniform1f(uPR, pr);
    gl.uniformMatrix4fv(uP, false, P);
    gl.uniformMatrix4fv(uV, false, V);
    gl.drawArrays(gl.POINTS, 0, pts.length / 2);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) raf = requestAnimationFrame(frame);
  });
}

function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
