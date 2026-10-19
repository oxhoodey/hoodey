// Death Clock and Wallet X-Ray, built from the same Pons launches + curve trades as Cabal Eye.
//
// Death Clock: describe every launch by how its first minute looked ("birth signs"), learn how
// long tokens with similar births lived, and forecast a new token's life from its look-alikes.
// A token "dies" when its price falls 90% below its peak, or when trading stops for an hour.
//
// Wallet X-Ray: profile any wallet from its curve trades: entries, exits, PnL, hold times,
// whether it buys tops (exit liquidity), snipes, bundles, deploys, or runs with a crew.
import { config } from './config.js';
import { nameSimilarity } from './util.js';

const SUPPLY = 1e9;
const EARLY_S = () => config.CABAL_EARLY_SECONDS;
const SNIPE_S = () => config.CABAL_SNIPER_SECONDS;
const DEAD_DROP = 0.1;      // price at or below 10% of peak = dead
const QUIET_MS = 60 * 60e3; // or no trades for an hour
const RESOLVE_MS = 2 * 3600e3;

function groupByToken(trades) {
  const m = new Map();
  for (const x of trades) { let a = m.get(x.token); if (!a) m.set(x.token, (a = [])); a.push(x); }
  for (const a of m.values()) a.sort((p, q) => p.block - q.block || p.t - q.t);
  return m;
}

// ── token life ───────────────────────────────────────────────────────────
function lifeOf(launch, tr, now) {
  if (!tr || !tr.length) return { peak: 0, peakT: launch.t, last: 0, lastT: launch.t, deathT: launch.t + 60e3, dead: true, resolved: now - launch.t > QUIET_MS, trades: 0 };
  let peak = 0, peakT = tr[0].t, deathT = null;
  for (const x of tr) {
    if (x.priceEth > peak) { peak = x.priceEth; peakT = x.t; deathT = null; }
    else if (deathT == null && x.priceEth <= peak * DEAD_DROP && x.t > peakT) deathT = x.t;
  }
  const last = tr[tr.length - 1];
  if (deathT == null && now - last.t > QUIET_MS) deathT = last.t;
  const dead = deathT != null;
  return { peak, peakT, last: last.priceEth, lastT: last.t, deathT, dead, resolved: dead || now - launch.t > RESOLVE_MS, trades: tr.length };
}

// ── birth signs: what the first minute looked like ───────────────────────
function birthOf(launch, tr, creatorCounts, crewOf, launchesByT) {
  const t0 = launch.t, early = EARLY_S() * 1000, snipe = SNIPE_S() * 1000;
  const firstBuy = new Map();
  const blocks = new Map();
  let earlyEth = 0, deployerBought = 0;
  for (const x of tr) {
    if (x.t - t0 > early) break;
    if (x.side !== 'buy') continue;
    if (x.trader === launch.creator) { deployerBought = 1; continue; }
    earlyEth += x.eth;
    if (!firstBuy.has(x.trader)) firstBuy.set(x.trader, x.t);
    if (!blocks.has(x.block)) blocks.set(x.block, new Set());
    blocks.get(x.block).add(x.trader);
  }
  let snipers = 0, crew = 0;
  for (const [w, t] of firstBuy) { if (t - t0 <= snipe) snipers++; if (crewOf.has(w)) crew++; }
  let bundled = 0;
  for (const ws of blocks.values()) if (ws.size >= 2) bundled += ws.size;
  // copy of an older launch?
  let copy = 0;
  for (const o of launchesByT) {
    if (o.t >= launch.t) break;
    if (Math.max(nameSimilarity(launch.name, o.name), nameSimilarity(launch.symbol, o.symbol)) >= config.COPYCAT_NAME_THRESHOLD) { copy = 1; break; }
  }
  const signs = { snipers, bundled, deployerBought, deployerLaunches: creatorCounts.get(launch.creator) || 1, crew, copy, earlyBuyers: firstBuy.size, earlyEth: +earlyEth.toFixed(3) };
  const vec = [snipers / 5, bundled / 6, deployerBought, Math.min(10, signs.deployerLaunches - 1) / 4, crew / 4, copy, Math.min(30, firstBuy.size) / 12, Math.log10(1 + earlyEth * 10) / 1.5];
  return { signs, vec };
}

function birthScore(s) {
  return Math.min(100, Math.round(s.snipers * 5 + s.bundled * 3 + s.deployerBought * 15 + Math.min(20, (s.deployerLaunches - 1) * 4) + s.crew * 8 + s.copy * 15));
}

const dist = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += (a[i] - b[i]) ** 2; return Math.sqrt(d); };
// ETH left in a curve: an open bag can never be worth more than this
const poolOf = (tr) => Math.max(0, tr.reduce((a, x) => a + (x.side === 'buy' ? x.eth : -x.eth), 0));
const median = (arr) => { if (!arr.length) return null; const s = arr.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// ── the model: rebuilt every couple of minutes ───────────────────────────
export function buildModel(launches, trades, crewOf = new Map(), now = Date.now()) {
  const byToken = groupByToken(trades);
  const creatorCounts = new Map();
  launches.forEach((l) => creatorCounts.set(l.creator, (creatorCounts.get(l.creator) || 0) + 1));
  const byT = launches.filter((l) => l.t).slice().sort((a, b) => a.t - b.t);
  const tokens = new Map();
  for (const l of byT) {
    const tr = byToken.get(l.address) || [];
    const life = lifeOf(l, tr, now);
    const birth = birthOf(l, tr, creatorCounts, crewOf, byT);
    tokens.set(l.address, { launch: l, life, ...birth, score: birthScore(birth.signs), lifeMin: life.deathT ? Math.max(1, Math.round((life.deathT - l.t) / 60000)) : null });
  }
  const resolved = [...tokens.values()].filter((x) => x.life.resolved && now - x.launch.t > EARLY_S() * 1000);
  return { tokens, resolved, byToken, now, crewOf };
}

// ── Death Clock ──────────────────────────────────────────────────────────
export function forecast(model, address) {
  const me = model.tokens.get(address);
  if (!me) return null;
  const pool = model.resolved.filter((x) => x.launch.address !== address);
  const k = Math.min(30, pool.length, Math.max(5, Math.round(pool.length / 3)));
  const near = pool.map((x) => ({ x, d: dist(x.vec, me.vec) })).sort((a, b) => a.d - b.d).slice(0, k);
  const died = near.filter((n) => n.x.life.dead);
  const lives = died.map((n) => n.x.lifeMin).filter((v) => v != null);
  const medLife = median(lives);
  const dump90 = near.filter((n) => n.x.life.peak > 0 && n.x.life.last <= n.x.life.peak * DEAD_DROP).length;
  const ageMin = Math.max(0, (model.now - me.launch.t) / 60000);
  const buckets = [5, 15, 30, 60, 120, Infinity];
  const hist = buckets.map((b, i) => ({ label: i === 0 ? '<5m' : b === Infinity ? '2h+' : `${buckets[i - 1]}–${b}m`, n: 0 }));
  for (const n of near) { const v = n.x.life.dead ? n.x.lifeMin : Infinity; const i = buckets.findIndex((b) => v < b); hist[i < 0 ? hist.length - 1 : i].n++; }
  const status = me.life.dead ? 'dead' : medLife != null && ageMin > medLife ? 'overtime' : 'alive';
  return {
    address,
    ageMin: Math.round(ageMin),
    signs: me.signs,
    birthScore: me.score,
    lookalikes: near.length,
    learningFrom: model.resolved.length,
    diedPct: near.length ? Math.round((died.length / near.length) * 100) : null,
    dump90Pct: near.length ? Math.round((dump90 / near.length) * 100) : null,
    medianLifeMin: medLife,
    expectedDeathAt: medLife != null ? new Date(me.launch.t + medLife * 60000).toISOString() : null,
    status,
    diedAt: me.life.dead ? new Date(me.life.deathT).toISOString() : null,
    livedMin: me.lifeMin,
    peakAt: me.life.peakT ? new Date(me.life.peakT).toISOString() : null,
    fromPeakPct: me.life.peak ? Math.round(((me.life.last - me.life.peak) / me.life.peak) * 100) : null,
    hist,
    twins: near.slice(0, 6).map((n) => ({ address: n.x.launch.address, symbol: n.x.launch.symbol, name: n.x.launch.name, hasImage: !!n.x.launch.image, at: n.x.launch.at, dead: n.x.life.dead, lifeMin: n.x.lifeMin, birthScore: n.x.score, similarity: Math.max(0, Math.round(100 - n.d * 40)) }))
  };
}

// newest launches with their forecast, soonest expected death first among the living
export function deathRow(model, limit = 14) {
  const recent = [...model.tokens.values()].filter((x) => model.now - x.launch.t < 3 * 3600e3).sort((a, b) => b.launch.t - a.launch.t).slice(0, 40);
  return recent.map((x) => {
    const f = forecast(model, x.launch.address);
    return { address: x.launch.address, symbol: x.launch.symbol, name: x.launch.name, hasImage: !!x.launch.image, at: x.launch.at, birthScore: x.score, status: f.status, medianLifeMin: f.medianLifeMin, diedPct: f.diedPct, expectedDeathAt: f.expectedDeathAt, livedMin: f.livedMin, ageMin: f.ageMin };
  }).sort((a, b) => (a.status === 'dead') - (b.status === 'dead') || Date.parse(a.expectedDeathAt || 8.64e15) - Date.parse(b.expectedDeathAt || 8.64e15)).slice(0, limit);
}

// ── Wallet X-Ray ─────────────────────────────────────────────────────────
export function xrayWallet(model, wallet, ethUsd = null) {
  const w = wallet.toLowerCase();
  const rows = [];
  let buys = 0, sells = 0, inEth = 0, outEth = 0, sniped = 0, bundled = 0, earlyCount = 0, topBuys = 0, losers = 0, winners = 0, closed = 0;
  const holds = [], entries = [], gaps = [], sizes = [];
  let lastT = null;
  for (const [token, tr] of model.byToken) {
    const mine = tr.filter((x) => x.trader === w);
    if (!mine.length) continue;
    const info = model.tokens.get(token);
    const l = info ? info.launch : null;
    let b = 0, s = 0, bt = 0, st = 0, firstBuy = null, lastSell = null, bestTop = false;
    for (const x of mine) {
      if (lastT != null) gaps.push(Math.abs(x.t - lastT) / 1000);
      lastT = x.t; sizes.push(+x.eth.toFixed(3));
      if (x.side === 'buy') {
        buys++; b += x.eth; bt += x.amount;
        if (firstBuy == null) firstBuy = x;
        if (info && info.life.peak && x.priceEth >= info.life.peak * 0.7 && x.t > info.launch.t + 5 * 60e3) bestTop = true;
        const sameBlock = tr.some((y) => y.block === x.block && y.trader !== w && y.side === 'buy');
        if (sameBlock && l && x.t - l.t <= EARLY_S() * 1000) bundled++;
      } else { sells++; s += x.eth; st += x.amount; lastSell = x; }
    }
    inEth += b; outEth += s;
    const holdTok = Math.max(0, bt - st);
    const lastPrice = info ? info.life.last : (tr[tr.length - 1] || {}).priceEth || 0;
    const openValue = Math.min(holdTok * lastPrice, poolOf(tr));
    const pnl = s + openValue - b;
    const exited = bt > 0 && st >= bt * 0.9;
    if (exited) { closed++; if (s > b) winners++; else losers++; if (firstBuy && lastSell) holds.push((lastSell.t - firstBuy.t) / 60000); }
    if (firstBuy && l) { const e = (firstBuy.t - l.t) / 1000; entries.push(e); if (e <= SNIPE_S()) sniped++; if (e <= EARLY_S()) earlyCount++; }
    if (bestTop && pnl < 0) topBuys++;
    rows.push({ address: token, symbol: l ? l.symbol : '', name: l ? l.name : '', hasImage: !!(l && l.image), boughtEth: +b.toFixed(4), soldEth: +s.toFixed(4), openEth: +openValue.toFixed(4), pnlEth: +pnl.toFixed(4),
      entrySec: firstBuy && l ? Math.max(0, Math.round((firstBuy.t - l.t) / 1000)) : null, holdPct: +Math.min(100, (holdTok / SUPPLY) * 100).toFixed(2),
      status: bt === 0 ? 'sold' : exited ? 'exited' : st > 0 ? 'trimming' : 'holding', tokenDead: info ? info.life.dead : null, lastAt: new Date(mine[mine.length - 1].t).toISOString() });
  }
  const deployed = [...model.tokens.values()].filter((x) => x.launch.creator === w);
  if (!rows.length && !deployed.length) return null;
  const tokensTraded = rows.length;
  const pnlEth = rows.reduce((a, r) => a + r.pnlEth, 0);
  const medHold = median(holds);
  const medEntry = median(entries);
  const medGap = median(gaps);
  const sizeRepeat = sizes.length >= 6 ? Math.max(...Object.values(sizes.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {}))) / sizes.length : 0;
  const crew = model.crewOf.get(w) || null;
  const deadDeployed = deployed.filter((x) => x.life.dead && x.lifeMin != null && x.lifeMin <= 60).length;

  // DNA: 0–100 per trait
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const dna = {
    sniper: pct(sniped, tokensTraded),
    flipper: medHold == null ? 0 : Math.round(Math.max(0, Math.min(100, 100 - medHold * 4))),
    holder: tokensTraded ? pct(rows.filter((r) => r.status === 'holding').length, tokensTraded) : 0,
    exitLiquidity: pct(topBuys, tokensTraded),
    bot: Math.round(Math.min(100, (medGap != null && medGap < 20 ? 40 : 0) + sizeRepeat * 60 + (buys + sells > 40 ? 15 : 0)))
  };
  // archetype: the strongest signal wins
  const cands = [
    deployed.length >= 3 && { k: 'farmer', label: 'Farmer deployer', why: `Launched ${deployed.length} tokens; ${deadDeployed} died within an hour.`, w: 90 + deployed.length },
    crew && { k: 'crew', label: 'Crew member', why: `Buys early together with ${crew}.`, w: 85 },
    dna.sniper >= 50 && tokensTraded >= 3 && { k: 'sniper', label: 'Sniper', why: `First buy within ${SNIPE_S()}s of launch on ${dna.sniper}% of tokens.`, w: 70 + dna.sniper / 5 },
    dna.bot >= 60 && { k: 'bot', label: 'Trading bot', why: 'Clockwork timing and repeated trade sizes.', w: 65 + dna.bot / 10 },
    dna.exitLiquidity >= 40 && tokensTraded >= 2 && { k: 'exit', label: 'Exit liquidity', why: `Bought near the top and lost on ${dna.exitLiquidity}% of tokens.`, w: 60 + dna.exitLiquidity / 5 },
    dna.flipper >= 60 && tokensTraded >= 3 && { k: 'flipper', label: 'Flipper', why: `Median hold of ${medHold < 1 ? '<1' : Math.round(medHold)} min.`, w: 55 + dna.flipper / 10 },
    dna.holder >= 60 && { k: 'holder', label: 'Diamond hands', why: 'Still holding most of what it bought.', w: 50 + dna.holder / 10 },
    { k: 'trader', label: tokensTraded <= 2 ? 'New face' : 'Trader', why: tokensTraded <= 2 ? `Only ${tokensTraded} token${tokensTraded === 1 ? '' : 's'} in the last ${config.INDEX_KEEP_HOURS}h.` : 'No single habit stands out.', w: 1 }
  ].filter(Boolean).sort((a, b) => b.w - a.w);

  return {
    wallet: w,
    archetype: cands[0], tags: cands.slice(1, 4).filter((c) => c.k !== 'trader').map((c) => ({ k: c.k, label: c.label })),
    dna,
    stats: {
      tokensTraded, buys, sells, inEth: +inEth.toFixed(3), outEth: +outEth.toFixed(3), pnlEth: +pnlEth.toFixed(3), pnlUsd: ethUsd ? Math.round(pnlEth * ethUsd) : null,
      winRate: closed ? pct(winners, closed) : null, closed, medianHoldMin: medHold == null ? null : +medHold.toFixed(1), medianEntrySec: medEntry == null ? null : Math.round(medEntry),
      firstMinutePct: pct(earlyCount, tokensTraded), bundledBuys: bundled, deployed: deployed.length, deployedDeadFast: deadDeployed
    },
    crew,
    tokens: rows.sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt)).slice(0, 30),
    deployedTokens: deployed.slice(-8).reverse().map((x) => ({ address: x.launch.address, symbol: x.launch.symbol, hasImage: !!x.launch.image, at: x.launch.at, dead: x.life.dead, lifeMin: x.lifeMin }))
  };
}

// best and worst wallets in the window (by curve PnL), for the X-Ray landing page
export function walletBoard(model, limit = 8) {
  const acc = new Map();
  for (const [token, tr] of model.byToken) {
    const info = model.tokens.get(token);
    const last = info ? info.life.last : (tr[tr.length - 1] || {}).priceEth || 0;
    const per = new Map();
    const pool = poolOf(tr);
    for (const x of tr) {
      let p = per.get(x.trader); if (!p) per.set(x.trader, (p = { b: 0, s: 0, bt: 0, st: 0 }));
      if (x.side === 'buy') { p.b += x.eth; p.bt += x.amount; } else { p.s += x.eth; p.st += x.amount; }
    }
    for (const [w, p] of per) {
      let a = acc.get(w); if (!a) acc.set(w, (a = { wallet: w, pnl: 0, tokens: 0, vol: 0 }));
      a.pnl += p.s + Math.min(pool, Math.max(0, p.bt - p.st) * last) - p.b; a.tokens++; a.vol += p.b + p.s;
    }
  }
  const all = [...acc.values()].filter((a) => a.tokens >= 2 && a.vol >= 0.05);
  const fmt = (a) => ({ wallet: a.wallet, pnlEth: +a.pnl.toFixed(3), tokens: a.tokens, crew: model.crewOf.get(a.wallet) || null });
  return {
    smart: all.slice().sort((a, b) => b.pnl - a.pnl).slice(0, limit).map(fmt),
    rekt: all.slice().sort((a, b) => a.pnl - b.pnl).slice(0, limit).map(fmt)
  };
}
