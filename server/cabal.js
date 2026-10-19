// Cabal detection from on-chain behaviour only (Pons launches + bonding-curve trades).
//   Cabal Scan: who bought a token first, who bought together, who still holds.
//   Cabal Map:  groups of wallets that keep buying the same launches early, together.
// Wallet funding links are not used: they need native-ETH tracing the RPC can't index cheaply.
import { config } from './config.js';
import { hashString } from './util.js';

const SUPPLY = 1e9; // every Pons token mints 1,000,000,000

function walletBook(trades) {
  const book = new Map();
  for (const x of trades) {
    let w = book.get(x.trader);
    if (!w) { w = { wallet: x.trader, firstT: x.t, firstBlock: x.block, buys: 0, sells: 0, boughtEth: 0, soldEth: 0, boughtTok: 0, soldTok: 0, lastSellT: null }; book.set(x.trader, w); }
    if (x.side === 'buy') { w.buys++; w.boughtEth += x.eth; w.boughtTok += x.amount; if (x.t < w.firstT) { w.firstT = x.t; w.firstBlock = x.block; } }
    else { w.sells++; w.soldEth += x.eth; w.soldTok += x.amount; w.lastSellT = Math.max(w.lastSellT || 0, x.t); }
  }
  for (const w of book.values()) {
    w.holdTok = Math.max(0, w.boughtTok - w.soldTok);
    w.holdPct = Math.min(100, (w.holdTok / SUPPLY) * 100);
    w.status = w.boughtTok === 0 ? 'seller' : w.soldTok >= w.boughtTok * 0.9 ? 'exited' : w.soldTok > 0 ? 'trimming' : 'holding';
  }
  return book;
}

// Early buyers of each launch: distinct wallets whose first buy lands within the early window.
export function earlyBuyers(launch, trades, seconds = config.CABAL_EARLY_SECONDS, max = config.CABAL_EARLY_MAX) {
  const out = [];
  const seen = new Set();
  for (const x of trades) {
    if (x.side !== 'buy' || seen.has(x.trader) || x.trader === launch.creator) continue;
    if (x.t - launch.t > seconds * 1000) break;
    seen.add(x.trader);
    out.push(x.trader);
    if (out.length >= max) break;
  }
  return out;
}

function groupByToken(trades) {
  const m = new Map();
  for (const x of trades) { let a = m.get(x.token); if (!a) m.set(x.token, (a = [])); a.push(x); }
  for (const a of m.values()) a.sort((p, q) => p.block - q.block || p.t - q.t);
  return m;
}

const crewName = (members) => 'Crew ' + (hashString(members.slice().sort().join('')) >>> 0).toString(16).toUpperCase().padStart(4, '0').slice(-4);

// ── Cabal Map ────────────────────────────────────────────────────────────
export function buildMap(launches, trades) {
  const byToken = groupByToken(trades);
  const early = new Map(); // token -> [wallets]
  for (const l of launches) {
    const tr = byToken.get(l.address);
    if (!tr || !l.t) continue;
    const e = earlyBuyers(l, tr);
    if (e.length >= 2) early.set(l.address, e);
  }
  // count how often two wallets are early buyers of the same launch
  const pair = new Map();
  const seenIn = new Map(); // wallet -> number of launches it bought early
  for (const ws of early.values()) for (const w of ws) seenIn.set(w, (seenIn.get(w) || 0) + 1);
  for (const ws of early.values()) {
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
      const k = ws[i] < ws[j] ? ws[i] + '|' + ws[j] : ws[j] + '|' + ws[i];
      pair.set(k, (pair.get(k) || 0) + 1);
    }
  }
  // union-find over strong pairs
  const parent = new Map();
  const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  const add = (a) => { if (!parent.has(a)) parent.set(a, a); };
  for (const [k, n] of pair) {
    if (n < config.CABAL_MIN_SHARED) continue;
    const [a, b] = k.split('|');
    // must be a habit, not a coincidence: together in most of the launches the quieter wallet joined
    if (n / Math.min(seenIn.get(a), seenIn.get(b)) < 0.6) continue;
    add(a); add(b);
    const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map();
  for (const a of parent.keys()) { const r = find(a); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(a); }

  const launchBy = new Map(launches.map((l) => [l.address, l]));
  const now = Date.now();
  const crews = [];
  for (const members of groups.values()) {
    if (members.length < config.CABAL_MIN_MEMBERS) continue;
    const set = new Set(members);
    const tokens = [];
    for (const [token, ws] of early) {
      const inside = ws.filter((w) => set.has(w));
      if (inside.length >= 2) tokens.push({ token, inside });
    }
    if (tokens.length < config.CABAL_MIN_SHARED) continue;
    let pnl = 0, dumped = 0;
    const exits = [];
    const tokenRows = tokens.map(({ token, inside }) => {
      const l = launchBy.get(token);
      const book = walletBook((byToken.get(token) || []).filter((x) => set.has(x.trader)));
      let bought = 0, sold = 0, hold = 0, fastExit = 0;
      for (const w of book.values()) {
        bought += w.boughtEth; sold += w.soldEth; hold += w.holdPct;
        if (w.status === 'exited' && w.lastSellT) { const mins = (w.lastSellT - w.firstT) / 60000; exits.push(mins); if (mins <= 30) fastExit++; }
      }
      pnl += sold - bought;
      if (fastExit >= Math.ceil(inside.length / 2)) dumped++;
      return { address: token, symbol: l ? l.symbol : '', name: l ? l.name : '', hasImage: !!(l && l.image), at: l ? l.at : null, t: l ? l.t : 0, members: inside.length, holdPct: +hold.toFixed(2), pnlEth: +(sold - bought).toFixed(3) };
    }).sort((a, b) => b.t - a.t);
    exits.sort((a, b) => a - b);
    const last = tokenRows[0];
    crews.push({
      id: crewName(members),
      members: members.sort(),
      tokens: tokenRows.slice(0, 12),
      tokenCount: tokenRows.length,
      dumpRate: Math.round((dumped / tokenRows.length) * 100),
      medianExitMin: exits.length ? Math.round(exits[Math.floor(exits.length / 2)]) : null,
      pnlEth: +pnl.toFixed(3),
      lastAt: last ? last.at : null,
      active: !!(last && last.t && now - last.t < 3600e3)
    });
  }
  crews.sort((a, b) => b.active - a.active || b.tokenCount - a.tokenCount || b.members.length - a.members.length);
  const memberOf = new Map();
  crews.forEach((c) => c.members.forEach((m) => memberOf.set(m, c.id)));
  return { crews, memberOf, scannedLaunches: early.size };
}

// ── Cabal Scan ───────────────────────────────────────────────────────────
export function scanToken(token, launch, launches, trades, map) {
  const byToken = groupByToken(trades);
  const tr = byToken.get(token) || [];
  if (!tr.length) return null;
  const t0 = launch && launch.t ? launch.t : tr[0].t;
  const b0 = launch && launch.block ? launch.block : tr[0].block;
  const creator = launch ? launch.creator : null;
  const book = walletBook(tr);
  const early = new Set(earlyBuyers({ t: t0, creator }, tr));

  // same-block buys by different wallets in the early window = bundles
  const blocks = new Map();
  for (const x of tr) {
    if (x.side !== 'buy' || x.t - t0 > config.CABAL_EARLY_SECONDS * 1000) continue;
    if (!blocks.has(x.block)) blocks.set(x.block, new Set());
    blocks.get(x.block).add(x.trader);
  }
  const bundles = [...blocks.entries()].filter(([, ws]) => ws.size >= 2).map(([block, ws], i) => ({ id: i + 1, block, afterBlocks: block - b0, wallets: [...ws] }));
  const bundleOf = new Map();
  bundles.forEach((b) => b.wallets.forEach((w) => bundleOf.set(w, b.id)));

  // deployer circle: wallets that were early buyers in this deployer's other launches
  const circle = new Set();
  if (creator) {
    const mine = launches.filter((l) => l.creator === creator && l.address !== token && l.t);
    const counts = new Map();
    for (const l of mine) {
      const t = byToken.get(l.address);
      if (!t) continue;
      for (const w of earlyBuyers(l, t)) counts.set(w, (counts.get(w) || 0) + 1);
    }
    for (const [w, n] of counts) if (n >= 2 || (mine.length === 1 && n >= 1)) circle.add(w);
  }

  const sniperSec = config.CABAL_SNIPER_SECONDS;
  const rows = [...book.values()].map((w) => {
    const tags = [];
    if (creator && w.wallet === creator) tags.push({ k: 'deployer', label: 'Deployer' });
    if (w.boughtTok > 0 && (w.firstT - t0) / 1000 <= sniperSec) tags.push({ k: 'sniper', label: 'Sniper' });
    if (bundleOf.has(w.wallet)) tags.push({ k: 'bundle', label: `Bundle #${bundleOf.get(w.wallet)}` });
    if (circle.has(w.wallet)) tags.push({ k: 'circle', label: 'Deployer circle' });
    if (map && map.memberOf.has(w.wallet)) tags.push({ k: 'crew', label: map.memberOf.get(w.wallet) });
    return { wallet: w.wallet, firstSec: Math.max(0, Math.round((w.firstT - t0) / 1000)), boughtEth: +w.boughtEth.toFixed(4), soldEth: +w.soldEth.toFixed(4), holdPct: +w.holdPct.toFixed(2), boughtPct: +Math.min(100, (w.boughtTok / SUPPLY) * 100).toFixed(2), status: w.status, early: early.has(w.wallet), tags };
  }).filter((r) => r.boughtEth > 0 || r.tags.length)
    .sort((a, b) => (b.tags.length > 0) - (a.tags.length > 0) || a.firstSec - b.firstSec)
    .slice(0, config.CABAL_MAX_WALLETS);

  const flagged = rows.filter((r) => r.tags.length);
  const sum = (arr, k) => arr.reduce((a, r) => a + r[k], 0);
  const snipers = rows.filter((r) => r.tags.some((t) => t.k === 'sniper'));
  const crewsHere = map ? [...new Set(rows.flatMap((r) => r.tags.filter((t) => t.k === 'crew').map((t) => t.label)))] : [];
  const deployerRow = rows.find((r) => r.tags.some((t) => t.k === 'deployer'));
  const stats = {
    buyers: [...book.values()].filter((w) => w.boughtTok > 0).length,
    earlyBuyers: early.size,
    snipers: snipers.length,
    bundles: bundles.length,
    bundledWallets: bundleOf.size,
    deployerBought: !!(deployerRow && deployerRow.boughtEth > 0),
    circle: circle.size,
    crews: crewsHere,
    flaggedHoldPct: +Math.min(100, sum(flagged, 'holdPct')).toFixed(2),
    flaggedBoughtPct: +Math.min(100, sum(flagged, 'boughtPct')).toFixed(2),
    flaggedExited: flagged.filter((r) => r.status === 'exited').length,
    flagged: flagged.length
  };

  // score: each signal adds weight; capped at 100
  const reasons = [];
  let score = 0;
  const add = (pts, text, short) => { score += pts; reasons.push({ pts, text, short }); };
  if (stats.snipers) add(Math.min(25, 6 + stats.snipers * 3), `${stats.snipers} wallet${stats.snipers > 1 ? 's' : ''} bought in the first ${sniperSec}s`, `${stats.snipers} SNIPERS IN ${sniperSec}S`);
  if (stats.bundles) add(Math.min(25, 10 + stats.bundledWallets * 2), `${stats.bundledWallets} wallets bought in the same block (${stats.bundles} bundle${stats.bundles > 1 ? 's' : ''})`, `${stats.bundledWallets} WALLETS BUNDLED`);
  if (stats.deployerBought) add(15, 'The deployer bought its own token', 'DEPLOYER BOUGHT IN');
  if (stats.circle) add(Math.min(20, 8 + stats.circle * 3), `${stats.circle} early buyer${stats.circle > 1 ? 's' : ''} also bought this deployer's earlier launches`, `${stats.circle} DEPLOYER FRIENDS`);
  if (crewsHere.length) add(Math.min(25, 15 + crewsHere.length * 5), `Known crew${crewsHere.length > 1 ? 's' : ''} inside: ${crewsHere.join(', ')}`, crewsHere.length > 1 ? `${crewsHere.length} KNOWN CREWS IN` : `${crewsHere[0]} INSIDE`);
  if (stats.flaggedHoldPct >= 10) add(Math.min(20, Math.round(stats.flaggedHoldPct / 2)), `Flagged wallets still hold ${stats.flaggedHoldPct.toFixed(1)}% of supply`, `FLAGGED HOLD ${Math.round(stats.flaggedHoldPct)}%`);
  if (stats.flaggedExited >= 2) add(10, `${stats.flaggedExited} flagged wallets already sold out`, `${stats.flaggedExited} ALREADY SOLD OUT`);
  score = Math.min(100, score);
  const verdict = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';

  // first-minute strip for the chart: every buy in the early window
  const firstMinute = tr.filter((x) => x.side === 'buy' && x.t - t0 <= config.CABAL_EARLY_SECONDS * 1000)
    .slice(0, 160).map((x) => ({ s: +((x.t - t0) / 1000).toFixed(1), eth: +x.eth.toFixed(4), w: x.trader, bundle: bundleOf.get(x.trader) || null, sniper: (x.t - t0) / 1000 <= sniperSec, deployer: x.trader === creator }));

  return { score, verdict, reasons, stats, bundles, wallets: rows, firstMinute, windowSec: config.CABAL_EARLY_SECONDS, sniperSec };
}
