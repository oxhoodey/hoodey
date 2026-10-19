// Share card PNG (1200×630) drawn on the server with no dependencies: a pixel buffer, a 5×7
// dot-matrix font and Node's zlib. Used for the page preview and as og:image on X.
import zlib from 'node:zlib';

const W = 1200, H = 630;

// 5×7 glyphs, one string per row ('#' = dot)
const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'], D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'], F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'], H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'], J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'], L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'], N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'], R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'], T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'], X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'], Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], 1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], 3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], 5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'], 7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], 9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'], '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'], ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'], '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'], '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '·': ['.....', '.....', '.....', '..#..', '.....', '.....', '.....'], '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'], ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'], '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'], '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'], ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....']
};

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

function canvas() {
  const px = Buffer.alloc(W * H * 3, 255);
  const rect = (x, y, w, h, color) => {
    const [r, g, b] = hex(color);
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(W, Math.round(x + w)), y1 = Math.min(H, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * W + xx) * 3; px[i] = r; px[i + 1] = g; px[i + 2] = b; }
  };
  // a round dot, so glyphs read as dot-matrix (like the particle logo)
  const dot = (x, y, s, color) => {
    if (s < 3) return rect(x, y, s, s, color);
    const [r, g, b] = hex(color);
    const rad = s / 2, cx = x + rad, cy = y + rad;
    for (let yy = Math.floor(y); yy < Math.ceil(y + s); yy++) for (let xx = Math.floor(x); xx < Math.ceil(x + s); xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const dx = xx + 0.5 - cx, dy = yy + 0.5 - cy;
      if (dx * dx + dy * dy <= rad * rad) { const i = (yy * W + xx) * 3; px[i] = r; px[i + 1] = g; px[i + 2] = b; }
    }
  };
  const width = (text, s, gap = Math.max(1, Math.round(s * 0.18))) => [...text].length * (5 * (s + gap) + s);
  const text = (str, x, y, s, color, gap = Math.max(1, Math.round(s * 0.18))) => {
    let cx = x;
    for (const ch of String(str).toUpperCase()) {
      const g = FONT[ch] || FONT['?'];
      for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r][c] === '#') dot(cx + c * (s + gap), y + r * (s + gap), s, color);
      cx += 5 * (s + gap) + s;
    }
    return cx;
  };
  return { px, rect, text, width };
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(px) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const VERDICT = { high: 'HIGH CABAL RISK', medium: 'SOME CABAL SIGNS', low: 'LOOKS ORGANIC' };
const COLOR = { high: '#D93A1F', medium: '#C88A0A', low: '#00A804' };

function fit(str, max) { str = String(str || ''); return str.length > max ? str.slice(0, max - 1) + '.' : str; }

export function cabalCard(scan, host) {
  const { px, rect, text, width } = canvas();
  const col = COLOR[scan.verdict] || COLOR.low;
  // background dot grid
  for (let y = 18; y < H; y += 24) for (let x = 18; x < W; x += 24) rect(x, y, 2, 2, '#E4EEE7');
  rect(0, 0, W, 12, col);
  // left: brand, token, score
  text('HOODEY · CABAL SCAN', 64, 52, 3, '#067A2E');
  const sym = '$' + fit(scan.token.symbol || '?', 10);
  text(sym, 64, 92, sym.length > 7 ? 7 : 9, '#0E1F15');
  text(fit(scan.token.name || '', 26), 64, 182, 3, '#5B6E61');
  const score = String(scan.score);
  const end = text(score, 64, 250, 17, col, 3);
  text('/100', end + 8, 362, 6, '#A8C2B1');
  text(VERDICT[scan.verdict] || '', 64, 460, 5, col);
  rect(64, 520, 470, 14, '#EAF2EC'); rect(64, 520, Math.round(470 * scan.score / 100), 14, col);
  // right: the reasons as short dot-matrix lines
  const lines = (scan.reasons || []).slice(0, 6);
  rect(610, 70, 2, 470, '#DFEAE2');
  text('WHY', 646, 84, 3, '#5B6E61');
  if (!lines.length) text('NO SNIPES, BUNDLES', 646, 140, 3, '#0E1F15');
  lines.forEach((r, i) => {
    const y = 140 + i * 64;
    rect(646, y + 6, 10, 10, col);
    text(fit(r.short || r.text, 21), 674, y, 3, '#0E1F15');
  });
  text(fit(host, 34), 64, 590, 2, '#5B6E61');
  const disc = 'NOT PROOF · DYOR';
  text(disc, W - 64 - width(disc, 3), 586, 3, '#A8C2B1');
  return png(px);
}

// Default preview for every page (written once to public/assets/og-default.png by scripts/og-default.js).
export function defaultCard() {
  const { px, rect, text } = canvas();
  for (let y = 18; y < H; y += 24) for (let x = 18; x < W; x += 24) rect(x, y, 2, 2, '#E4EEE7');
  rect(0, 0, W, 12, '#00C805');
  text('ROBINHOOD CHAIN · PONS', 64, 70, 3, '#067A2E');
  text('HOODEY', 64, 130, 16, '#0E1F15', 4);
  text('STOCKS MOVE.', 64, 330, 7, '#0E1F15');
  text('MEMES FOLLOW.', 64, 410, 7, '#0E1F15');
  text('WE SEE BOTH.', 64, 490, 7, '#00A804');
  text('READ-ONLY · NO WALLET NEEDED', 64, 580, 3, '#5B6E61');
  return png(px);
}

const bg = (rect) => { for (let y = 18; y < H; y += 24) for (let x = 18; x < W; x += 24) rect(x, y, 2, 2, '#E4EEE7'); };
const footer = (text, width, host) => {
  text(fit(host, 34), 64, 590, 2, '#5B6E61');
  const disc = 'NOT ADVICE · DYOR';
  text(disc, W - 64 - width(disc, 3), 586, 3, '#A8C2B1');
};
const mins = (m) => (m == null ? '?' : m >= 120 ? `${Math.round(m / 60)}H` : `${Math.round(m)}M`);

// Death Clock: how long this token is expected to live, from tokens born the same way.
export function deathCard(f, host) {
  const { px, rect, text, width } = canvas();
  const col = f.status === 'alive' ? '#C88A0A' : '#D93A1F';
  bg(rect);
  rect(0, 0, W, 12, col);
  text('HOODEY · DEATH CLOCK', 64, 52, 3, '#067A2E');
  const sym = '$' + fit(f.token.symbol || '?', 10);
  text(sym, 64, 92, sym.length > 7 ? 7 : 9, '#0E1F15');
  text(fit(f.token.name || '', 26), 64, 182, 3, '#5B6E61');
  let big, cap;
  if (f.status === 'dead') { big = 'DEAD'; cap = `LIVED ${mins(f.livedMin)}`; }
  else if (f.medianLifeMin == null) { big = '?'; cap = 'NOT ENOUGH TWINS YET'; }
  else if (f.status === 'overtime') { big = '+' + mins(f.ageMin - f.medianLifeMin); cap = `OVERTIME · LIFE ${mins(f.medianLifeMin)}`; }
  else { big = mins(f.medianLifeMin - f.ageMin); cap = `LEFT · LIFE ${mins(f.medianLifeMin)}`; }
  text(big, 64, 250, big.length > 4 ? 13 : 17, col, 3);
  text(fit(cap, 22), 64, 460, 3, col);
  const life = f.medianLifeMin ? Math.min(1, f.ageMin / f.medianLifeMin) : 0;
  rect(64, 520, 470, 14, '#EAF2EC'); rect(64, 520, Math.round(470 * (f.status === 'dead' ? 1 : life)), 14, col);
  // right: what the look-alikes did, and the birth signs
  rect(610, 70, 2, 470, '#DFEAE2');
  text(`${f.lookalikes} TWINS`, 646, 84, 3, '#5B6E61');
  const lines = [];
  if (f.diedPct != null) lines.push(`${f.diedPct}% OF THEM DIED`);
  if (f.medianLifeMin != null) lines.push(`MEDIAN LIFE ${mins(f.medianLifeMin)}`);
  if (f.dump90Pct) lines.push(`${f.dump90Pct}% FELL 90%`);
  const s = f.signs || {};
  if (s.snipers) lines.push(`${s.snipers} SNIPER${s.snipers === 1 ? '' : 'S'} AT BIRTH`);
  if (s.bundled) lines.push(`${s.bundled} BUNDLED BUYS`);
  if (s.crew) lines.push(`${s.crew} CREW WALLET${s.crew === 1 ? '' : 'S'}`);
  if (s.deployerLaunches > 1) lines.push(`DEPLOYER: ${s.deployerLaunches} LAUNCHES`);
  if (s.copy) lines.push('COPY OF A NAME');
  lines.slice(0, 6).forEach((l, i) => { const y = 140 + i * 64; rect(646, y + 6, 10, 10, col); text(fit(l, 21), 674, y, 3, '#0E1F15'); });
  footer(text, width, host);
  return png(px);
}

// Wallet X-Ray: the wallet's archetype, PnL and trait bars.
export function xrayCard(x, host) {
  const { px, rect, text, width } = canvas();
  const bad = ['farmer', 'crew', 'sniper', 'bot'].includes(x.archetype.k);
  const col = bad ? '#D93A1F' : x.archetype.k === 'exit' ? '#C88A0A' : '#00A804';
  bg(rect);
  rect(0, 0, W, 12, col);
  text('HOODEY · WALLET X-RAY', 64, 52, 3, '#067A2E');
  text(`${x.wallet.slice(0, 6)}.${x.wallet.slice(-4)}`, 64, 96, 4, '#5B6E61');
  const lab = x.archetype.label.toUpperCase();
  text(lab, 64, 150, lab.length > 11 ? 5 : 7, col);
  const p = x.stats.pnlEth;
  const pnl = `${p >= 0 ? '+' : '-'}${Math.abs(p) >= 10 ? Math.abs(p).toFixed(1) : Math.abs(p).toFixed(2)}`;
  const ps = pnl.length > 5 ? 9 : 11;
  const end = text(pnl, 64, 250, ps, p >= 0 ? '#00A804' : '#D93A1F', 3);
  text('ETH', end + 12, 250 + 7 * (ps + 3) - 7 * 6, 5, '#A8C2B1');
  const st = x.stats;
  text(fit(`${st.tokensTraded} TOKENS · WIN ${st.winRate == null ? '?' : st.winRate + '%'}`, 22), 64, 430, 3, '#0E1F15');
  text(fit(`HOLD ${st.medianHoldMin == null ? '?' : mins(st.medianHoldMin)} · ENTRY ${st.medianEntrySec == null ? '?' : st.medianEntrySec + 'S'}`, 22), 64, 474, 3, '#0E1F15');
  text(fit(x.crew ? x.crew.toUpperCase() : `${st.buys} BUYS · ${st.sells} SELLS`, 22), 64, 518, 3, '#5B6E61');
  // right: DNA bars
  rect(610, 70, 2, 470, '#DFEAE2');
  text('TRADER DNA', 646, 84, 3, '#5B6E61');
  [['SNIPER', x.dna.sniper], ['FLIPPER', x.dna.flipper], ['HOLDER', x.dna.holder], ['EXIT LIQ.', x.dna.exitLiquidity], ['BOT', x.dna.bot]].forEach(([k, v], i) => {
    const y = 144 + i * 74;
    text(k, 646, y, 3, '#0E1F15');
    const vs = `${v}`;
    text(vs, W - 64 - width(vs, 3), y, 3, '#5B6E61');
    rect(646, y + 34, 490, 12, '#EAF2EC'); rect(646, y + 34, Math.round(490 * v / 100), 12, v >= 60 ? col : '#9DB8A6');
  });
  footer(text, width, host);
  return png(px);
}
