// Live data without Bitquery: Pons launches and trades from our own chain indexer (indexer.js),
// stock token prices and ETH/USD from DexPaprika (dexpaprika.js).
// Each function throws on failure; data.js catches and falls back to sample for that section only.
import { config } from './config.js';
import { fetchJson, log, nameSimilarity, zonedParts, toMinutes, median, isAddress } from './util.js';
import * as ix from './indexer.js';
import { tokenSummary, ethUsd, historyOf, startPriceWatch } from './dexpaprika.js';
import { buildMap, scanToken } from './cabal.js';
import { linkIndex, scanLarp, larpBoard, quickFlag } from './larp.js';
import { buildModel, forecast, deathRow, xrayWallet, walletBoard } from './insight.js';

async function rpc(method, params) {
  if (!config.RH_RPC_URL) throw new Error('RH_RPC_URL is not set');
  return ix.chainRpc(method, params); // retries when the endpoint is busy
}

function decodeAbiString(hex) {
  if (!hex || hex === '0x') return '';
  const data = hex.slice(2);
  try {
    if (data.length >= 128) {
      const offset = parseInt(data.slice(0, 64), 16) * 2;
      const len = parseInt(data.slice(offset, offset + 64), 16);
      return Buffer.from(data.slice(offset + 64, offset + 64 + len * 2), 'hex').toString('utf8').replace(/\0/g, '').trim();
    }
    return Buffer.from(data.slice(0, 64), 'hex').toString('utf8').replace(/\0/g, '').trim();
  } catch { return ''; }
}

const metaCache = new Map();
export async function tokenMeta(address) {
  const key = address.toLowerCase();
  if (metaCache.has(key)) return metaCache.get(key);
  const m = await readMeta(address);
  metaCache.set(key, m);
  if (metaCache.size > 5000) metaCache.delete(metaCache.keys().next().value);
  return m;
}
async function readMeta(address) {
  const [code, nameHex, symbolHex] = await Promise.all([
    rpc('eth_getCode', [address, 'latest']),
    rpc('eth_call', [{ to: address, data: '0x06fdde03' }, 'latest']).catch(() => '0x'),
    rpc('eth_call', [{ to: address, data: '0x95d89b41' }, 'latest']).catch(() => '0x')
  ]);
  if (!code || code === '0x') throw new Error('No contract at this address');
  return { name: decodeAbiString(nameHex), symbol: decodeAbiString(symbolHex) };
}

let blockCache = { at: 0, value: null };
export async function chainStatus() {
  const out = {};
  if (config.RH_RPC_URL) {
    if (Date.now() - blockCache.at < 4000 && blockCache.value) return { ...blockCache.value, indexer: ix.status() };
    try { out.block = parseInt(await rpc('eth_blockNumber', []), 16); out.at = Date.now(); blockCache = { at: Date.now(), value: out }; } catch (e) { out.rpcError = e.message; }
  }
  return { ...out, indexer: ix.status() };
}

export const launches = async () => ix.launches();
export const imageUrlOf = (token) => (ix.launchOf(token) || {}).image || null;

function creatorCountsOf(all) {
  const c = {};
  all.forEach((l) => { c[l.creator] = (c[l.creator] || 0) + 1; });
  return c;
}

function similarOlder(token, pool) {
  let best = null;
  for (const o of pool) {
    if (o.address === token.address || o.t >= token.t) continue;
    const s = Math.max(nameSimilarity(token.name, o.name), nameSimilarity(token.symbol, o.symbol));
    if (!best || s > best.score) best = { of: o.symbol, score: s, older: o };
  }
  return best && best.score >= config.COPYCAT_NAME_THRESHOLD ? best : null;
}

// Volume in USD per token over the indexed window.
function volumeByToken(usd) {
  const v = new Map();
  if (!usd) return v;
  for (const x of ix.trades()) v.set(x.token, (v.get(x.token) || 0) + x.eth * usd);
  return v;
}

function tokenRow(l, all, creatorCounts, refT, vol) {
  const copy = similarOlder(l, all);
  const repeat = creatorCounts[l.creator] || 0;
  return {
    name: l.name, symbol: l.symbol, address: l.address, launchpad: l.launchpad, at: l.at, ticker: l.ticker || null, hasImage: !!l.image,
    afterMin: refT == null ? null : Math.round((l.t - refT) / 60000),
    holders: null, volumeUsd: vol && vol.has(l.address) ? Math.round(vol.get(l.address)) : null, top10Pct: null, lifespanMin: null,
    copycat: copy ? { of: copy.of, score: Math.round(copy.score * 100) } : null,
    deployerLaunches: repeat,
    risk: copy || repeat >= 5 ? 'high' : repeat >= 2 ? 'medium' : 'low'
  };
}

function bucketSeries(points, from, to, n = 41) {
  const out = [];
  let i = 0, last = points.length ? points[0].p : 0;
  for (let k = 0; k < n; k++) {
    const edge = from + ((to - from) * k) / (n - 1);
    while (i < points.length && points[i].t <= edge) { last = points[i].p; i++; }
    out.push(+last.toFixed(4));
  }
  return out;
}

export async function radar(rangeHours) {
  const now = Date.now();
  const from = now - rangeHours * 3600e3;
  const all = ix.launches();
  const creatorCounts = creatorCountsOf(all);
  const vol = volumeByToken(await ethUsd().catch(() => null));

  const watched = config.stocks.filter((s) => s.address);
  const moves = [];
  const errors = [];
  for (const s of watched) {
    try {
      const t = await tokenSummary(s.address);
      const w = t[`${rangeHours}h`] || {};
      const price = Number(t.price_usd);
      const movePct = Number(w.last_price_usd_change) || 0;
      const trades = Number(w.txns) || 0;
      // Line: price at the start of the range (from DexPaprika's change), our recorded points, then now.
      const startP = price / (1 + movePct / 100);
      const recorded = historyOf(s.address).filter((x) => x.t > from && x.t < now);
      const pts = [{ t: from, p: startP }, ...recorded, { t: now, p: price }];
      const spike = Math.abs(movePct) >= config.SPIKE_THRESHOLD_PCT && trades >= config.SPIKE_MIN_TRADES;
      const half = startP + (price - startP) / 2;
      const crossed = recorded.find((x) => (movePct > 0 ? x.p >= half : x.p <= half));
      const refT = spike ? (crossed ? crossed.t : from) : from;
      const themed = all.filter((l) => l.ticker === s.ticker && l.t >= refT).sort((a, b) => a.t - b.t);
      moves.push({
        ticker: s.ticker, name: s.name, up: movePct >= 0, movePct: +movePct.toFixed(2), price: +price.toFixed(2), trades, spike,
        trigger: spike ? `Spike · ${movePct >= 0 ? 'up' : 'down'} ${Math.abs(movePct).toFixed(1)}%` : (trades ? `${trades} trades in ${rangeHours}h` : 'No trades in range'),
        at: new Date(spike ? refT : now).toISOString(),
        spikePos: spike ? (refT - from) / (now - from) : null, series: bucketSeries(pts, from, now),
        launches: themed.length, firstAfterMin: spike && themed.length ? Math.round((themed[0].t - refT) / 60000) : null,
        volumeUsd: w.volume_usd != null ? Math.round(w.volume_usd) : null, alivePct: null,
        tokens: themed.slice(0, config.RADAR_MAX_TOKENS).map((l) => tokenRow(l, all, creatorCounts, spike ? refT : null, vol))
      });
    } catch (e) {
      errors.push(`${s.ticker}: ${e.message}`);
    }
  }
  if (watched.length && errors.length === watched.length) throw new Error(errors.join(' | '));
  moves.sort((a, b) => (b.spike - a.spike) || Math.abs(b.movePct) - Math.abs(a.movePct));

  const dayAgo = now - 24 * 3600e3;
  const counts = {};
  all.filter((l) => l.ticker && l.t >= dayAgo).forEach((l) => { counts[l.ticker] = (counts[l.ticker] || 0) + 1; });
  const hot = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([ticker, count]) => ({ ticker, count }));

  const oldest = all.length ? Math.min(...all.map((l) => l.t)) : now;
  const windowStart = Math.max(oldest, dayAgo);
  const recent = all.filter((l) => l.t >= windowStart);
  const stats = {
    windowHours: +((now - windowStart) / 3600e3).toFixed(1),
    launches: recent.length,
    lastHour: all.filter((l) => l.t >= now - 3600e3).length,
    copycats: recent.filter((l) => similarOlder(l, all)).length,
    deployers: new Set(recent.map((l) => l.creator)).size,
    themed: recent.filter((l) => l.ticker).length
  };
  const model = insightModel();
  const withDeath = (l) => { const r = tokenRow(l, all, creatorCounts, null, vol); const f = forecast(model, l.address); if (f) r.death = { status: f.status, medianLifeMin: f.medianLifeMin, expectedDeathAt: f.expectedDeathAt, diedPct: f.diedPct }; r.larp = quickFlag(l, larpIndex()); return r; };
  // Life expectancy from the chain: how long launches in the window lived (dead = -90% from peak or an hour without trades)
  const lifeOf = () => {
    const done = [...model.tokens.values()].filter((x) => now - x.launch.t > 10 * 60e3);
    if (done.length < 5) return null;
    const lives = done.filter((x) => x.life.dead && x.lifeMin != null).map((x) => x.lifeMin).sort((p, q) => p - q);
    const alive = done.length - lives.length;
    const pct = (n) => Math.round((n / done.length) * 100);
    const n = (a, b) => lives.filter((m) => m >= a && m < b).length;
    return { source: 'live', medianMin: lives.length ? lives[Math.floor(lives.length / 2)] : null, sample: done.length,
      buckets: [{ label: '< 10m', pct: pct(n(0, 10)) }, { label: '10–60m', pct: pct(n(10, 60)) }, { label: '1h+', pct: pct(n(60, Infinity)) }, { label: 'Still alive', pct: pct(alive) }] };
  };
  const life = lifeOf();
  return { source: 'live', life: life || undefined, moves, events: moves.filter((m) => m.spike), latest: all.slice(0, 16).map(withDeath),
    timeline: all.filter((l) => l.t >= now - 3600e3).slice(0, 400).map((l) => ({ address: l.address, symbol: l.symbol, at: l.at, risk: tokenRow(l, all, creatorCounts, null, null).risk })),
    stats, hot: { source: 'live', items: hot }, errors };
}

// ── Hot right now: Pons bonding-curve trades in the last TRENDING_WINDOW_MIN, per token ──
const unknownMeta = new Map();
export async function trending() {
  const usd = await ethUsd();
  const now = Date.now();
  const since = now - config.TRENDING_WINDOW_MIN * 60e3;
  const list = ix.trades(since);
  if (!list.length) throw new Error(`No Pons trades in the last ${config.TRENDING_WINDOW_MIN} min`);
  const all = ix.launches();
  const byAddr = new Map(all.map((l) => [l.address, l]));
  const creatorCounts = creatorCountsOf(all);
  const groups = new Map();
  list.forEach((x) => { if (!groups.has(x.token)) groups.set(x.token, []); groups.get(x.token).push(x); });
  const oldest = list[0].t;

  const rows = [];
  for (const [address, tr] of groups) {
    let l = byAddr.get(address);
    if (!l) {
      // launched before our window: read name/symbol once
      if (!unknownMeta.has(address)) { const m = await tokenMeta(address).catch(() => null); if (m) unknownMeta.set(address, m); }
      const m = unknownMeta.get(address) || { name: '', symbol: '' };
      l = { address, name: m.name || m.symbol, symbol: m.symbol, creator: '', at: null, t: 0, ticker: null };
    }
    const volUsd = tr.reduce((a, x) => a + x.eth * usd, 0);
    const buys = tr.filter((x) => x.side === 'buy'), sells = tr.filter((x) => x.side === 'sell');
    const buyEth = buys.reduce((a, x) => a + x.eth, 0), sellEth = sells.reduce((a, x) => a + x.eth, 0);
    const perTrader = {};
    tr.forEach((x) => { perTrader[x.trader] = (perTrader[x.trader] || 0) + x.eth; });
    const traders = Object.keys(perTrader).length;
    const totalEth = buyEth + sellEth;
    const topShare = totalEth > 0 ? Math.max(...Object.values(perTrader)) / totalEth : null;
    const first = median(tr.slice(0, 3).map((x) => x.priceEth)) * usd;
    const last = median(tr.slice(-3).map((x) => x.priceEth)) * usd;
    const spark = [];
    let i = 0, lastP = tr[0].priceEth;
    for (let k = 0; k < 12; k++) {
      const edge = oldest + ((now - oldest) * (k + 1)) / 12;
      while (i < tr.length && tr[i].t <= edge) { lastP = tr[i].priceEth; i++; }
      spark.push(+(lastP * usd).toPrecision(6));
    }
    const copy = l.t ? similarOlder(l, all) : null;
    const repeat = l.creator ? creatorCounts[l.creator] || 0 : 0;
    const flags = [];
    if (copy) flags.push({ k: 'copy', label: `Copy of $${copy.of}` });
    if (repeat >= 3) flags.push({ k: 'repeat', label: `Deployer x${repeat}` });
    if (topShare != null && traders >= 2 && topShare >= 0.5) flags.push({ k: 'whale', label: `1 wallet ${Math.round(topShare * 100)}%` });
    if (traders <= 2 && tr.length >= 8) flags.push({ k: 'wash', label: 'Few traders, many trades' });
    rows.push({
      address, name: l.name, symbol: l.symbol, launchedAt: l.at, ticker: l.ticker || null, hasImage: !!l.image,
      volumeUsd: Math.round(volUsd), trades: tr.length, traders,
      buyPct: totalEth > 0 ? Math.round((buyEth / totalEth) * 100) : null,
      buys: buys.length, sells: sells.length,
      priceUsd: last, changePct: first > 0 ? +(((last - first) / first) * 100).toFixed(1) : null,
      spark, topWalletPct: topShare == null ? null : Math.round(topShare * 100),
      copycat: copy ? { of: copy.of, score: Math.round(copy.score * 100) } : null,
      deployerLaunches: repeat, flags,
      risk: flags.some((f) => f.k === 'copy' || f.k === 'wash') || repeat >= 5 ? 'high' : flags.length ? 'medium' : 'low'
    });
  }
  return {
    source: 'live',
    windowMin: Math.max(1, Math.round((now - Math.max(since, ix.status().since ? Date.parse(ix.status().since) : since)) / 60000)),
    totalTrades: list.length,
    rows: rows.sort((a, b) => b.volumeUsd - a.volumeUsd || b.trades - a.trades).slice(0, config.TRENDING_MAX_ROWS)
  };
}

export async function copycat(address) {
  const all = ix.launches();
  let token = address ? all.find((l) => l.address === address.toLowerCase()) : all[0];
  if (!token && address) {
    const meta = await tokenMeta(address);
    token = { address: address.toLowerCase(), name: meta.name, symbol: meta.symbol, creator: '', at: null, t: Date.now(), launchpad: 'Pons' };
  }
  if (!token) throw new Error('No launches indexed yet');

  const scored = all
    .filter((o) => o.address !== token.address && o.t <= token.t)
    .map((o) => ({ o, score: Math.max(nameSimilarity(token.name, o.name), nameSimilarity(token.symbol, o.symbol)) }))
    .sort((a, b) => b.score - a.score)
    .filter((x, i, arr) => arr.findIndex((y) => y.o.name === x.o.name && y.o.symbol === x.o.symbol) === i)
    .slice(0, 5);
  const top = scored[0];
  const byCreator = token.creator ? all.filter((l) => l.creator === token.creator) : [];

  return {
    source: 'live',
    note: [token.at ? '' : `This token launched before the ${config.INDEX_KEEP_HOURS}h window Hoodey keeps, so it is compared with recent launches only.`,
      ix.status().history !== 'complete' ? 'Hoodey restarted recently and is still loading older launches, so matches and deployer history may grow in a minute.' : ''].filter(Boolean).join(' ') || undefined,
    token: {
      name: token.name, symbol: token.symbol, address: token.address, launchpad: token.launchpad, launchedAt: token.at,
      hasImage: !!token.image, links: token.links || null,
      imageSimilarity: null,
      nameSimilarity: top ? +top.score.toFixed(2) : 0,
      closest: top ? { symbol: top.o.symbol, name: top.o.name, launchedAgo: null, diedAfter: null, sameDeployer: !!token.creator && top.o.creator === token.creator } : null,
      flagged: !!top && top.score >= config.COPYCAT_NAME_THRESHOLD
    },
    matches: scored.map(({ o, score }) => ({ name: o.name, symbol: o.symbol, address: o.address, hasImage: !!o.image, score: Math.round(score * 100), note: o.creator === token.creator ? 'same deployer' : 'different deployer', alive: null, life: null })),
    scanned: all.length,
    deployer: token.creator ? {
      address: token.creator,
      tokens30d: byCreator.length,
      deadWithin6h: null, imagesReused: null, medianLifespanMin: null,
      pattern: byCreator.length >= 5 ? 'farm' : byCreator.length >= 2 ? 'repeat' : 'new',
      history: byCreator.filter((l) => l.address !== token.address).slice(0, 8).map((l) => ({ symbol: l.symbol, address: l.address, hasImage: !!l.image, alive: null, life: null, at: l.at }))
    } : null
  };
}

export async function clockHours() {
  const all = ix.launches();
  if (!all.length) throw new Error('No launches indexed yet');
  const counts = Array(24).fill(0);
  const themed = Array(24).fill(0);
  let oldest = Date.now();
  all.forEach((l) => {
    const h = zonedParts(new Date(l.t)).hour;
    counts[h]++;
    if (l.ticker) themed[h]++;
    oldest = Math.min(oldest, l.t);
  });
  return { source: 'live', counts, themed, total: all.length, hours: Math.max(1, Math.round((Date.now() - oldest) / 3600e3)), days: Math.max(1, Math.round((Date.now() - oldest) / 86400e3)) };
}

// Needs our own recorded prices from before the last close, so it fills in after the server has run through one.
export async function clockGaps() {
  const watched = config.stocks.filter((s) => s.address);
  if (!watched.length) throw new Error('No stock token addresses in STOCK_TOKENS');
  const closeMin = toMinutes(config.MARKET_CLOSE);
  const items = [];
  for (const s of watched) {
    const tr = historyOf(s.address);
    if (!tr.length) continue;
    let closeP = null;
    for (let i = tr.length - 1; i >= 0; i--) {
      const z = zonedParts(new Date(tr[i].t));
      const tradingDay = z.weekday >= 1 && z.weekday <= 5 && !config.holidays.includes(z.date);
      if (tradingDay && z.hour * 60 + z.minute <= closeMin && z.hour * 60 + z.minute >= closeMin - 30) { closeP = tr[i].p; break; }
    }
    if (closeP == null) continue;
    const last = tr[tr.length - 1].p;
    items.push({ ticker: s.ticker, price: +last.toFixed(2), gapPct: +(((last - closeP) / closeP) * 100).toFixed(1) });
  }
  if (!items.length) throw new Error('No price recorded at the last market close yet');
  return { source: 'live', items };
}

export async function family(ticker) {
  const all = ix.launches();
  const stocks = [...new Set(all.map((l) => l.ticker).filter(Boolean))];
  const t = stocks.includes(ticker) ? ticker : stocks[0];
  if (!t) throw new Error('No stock-themed launches found');
  const stock = config.stocks.find((s) => s.ticker === t) || { ticker: t, name: t };
  const fam = all.filter((l) => l.ticker === t).sort((a, b) => a.t - b.t).slice(-40);
  const nodes = [{ id: 'r', parent: null, name: stock.name, symbol: t, kind: 'stock', alive: true, note: `${fam.length} themed launches`, deployer: '', similarity: null }];
  const placed = [];
  fam.forEach((l, i) => {
    let best = null;
    for (const p of placed) {
      const s = Math.max(nameSimilarity(l.name, p.l.name), nameSimilarity(l.symbol, p.l.symbol));
      if (s >= config.COPYCAT_NAME_THRESHOLD && (!best || s > best.s)) best = { s, p };
    }
    const id = 'n' + i;
    nodes.push({
      id, parent: best ? best.p.id : 'r', name: l.name, symbol: l.symbol, address: l.address, hasImage: !!l.image, kind: best ? 'clone' : 'original', alive: null,
      note: l.at, deployer: l.creator ? `${l.creator.slice(0, 6)}…${l.creator.slice(-4)}` : '',
      similarity: best ? Math.round(best.s * 100) : null, at: l.at
    });
    placed.push({ id, l });
  });
  return { source: 'live', stocks, ticker: t, nodes };
}

// Pons curve trades by this wallet inside the indexed window.
export async function wallet(address) {
  const a = address.toLowerCase();
  const usd = await ethUsd().catch(() => null);
  const mine = ix.trades().filter((x) => x.trader === a);
  let buys = 0, sells = 0;
  mine.forEach((x) => { if (x.side === 'sell') sells += x.eth; else buys += x.eth; });
  const netEth = +(sells - buys).toFixed(4);
  const netUsd = usd ? Math.round(netEth * usd) : null;
  let tslaShares = null;
  const tsla = config.stocks.find((s) => s.ticker === 'TSLA' && s.address);
  if (tsla && netUsd != null) {
    try { tslaShares = +(netUsd / Number((await tokenSummary(tsla.address)).price_usd)).toFixed(1); } catch (e) { log.debug('tsla price', e.message); }
  }
  const st = ix.status();
  const hours = st.since ? Math.max(1, Math.round((Date.now() - Date.parse(st.since)) / 3600e3)) : config.INDEX_KEEP_HOURS;
  return { source: 'live', address: a, days: +(hours / 24).toFixed(1), window: `${hours}h`, label: 'Net Pons trade flow', netEth, netUsd, tslaShares, spyPct: null, trades: mine.length };
}

// ── Cabal Eye ────────────────────────────────────────────────────────────
let mapCache = { at: 0, v: null };
function cabalIndex() {
  if (mapCache.v && Date.now() - mapCache.at < 60e3) return mapCache.v;
  const v = buildMap(ix.launches(), ix.trades());
  mapCache = { at: Date.now(), v };
  return v;
}

export async function cabalMap() {
  const m = cabalIndex();
  const st = ix.status();
  const hours = st.since ? Math.max(1, Math.round((Date.now() - Date.parse(st.since)) / 3600e3)) : config.INDEX_KEEP_HOURS;
  const entries = m.crews.filter((c) => c.active).flatMap((c) => c.tokens.filter((t) => t.t && Date.now() - t.t < 3600e3).map((t) => ({ crew: c.id, members: t.members, ...t }))).sort((a, b) => b.t - a.t).slice(0, 12);
  return { source: 'live', windowHours: hours, scannedLaunches: m.scannedLaunches, crews: m.crews.slice(0, config.CABAL_MAP_MAX), totalCrews: m.crews.length, entries,
    note: st.history !== 'complete' ? 'Hoodey restarted recently and is still loading older launches, so crews may grow in a minute.' : undefined };
}

export async function cabalScan(address) {
  const a = address.toLowerCase();
  const launch = ix.launchOf(a);
  const r = scanToken(a, launch, ix.launches(), ix.trades(), cabalIndex());
  if (!r) {
    const meta = await tokenMeta(a); // throws "No contract" for non-contracts
    const e = new Error(`No Pons trades for $${meta.symbol || 'this token'} in the last ${config.INDEX_KEEP_HOURS}h, so there is nothing to scan yet.`);
    e.code = 'NO_TRADES';
    throw e;
  }
  const meta = launch || (await tokenMeta(a).catch(() => ({ name: '', symbol: '' })));
  if (!r.stats.buyers) {
    const e = new Error(`Only sells of $${meta.symbol || 'this token'} in the last ${config.INDEX_KEEP_HOURS}h, no buys to scan. It launched before Hoodey's window, so its early buyers are out of reach.`);
    e.code = 'NO_TRADES';
    throw e;
  }
  return {
    source: 'live',
    token: { address: a, name: meta.name || meta.symbol, symbol: meta.symbol, hasImage: !!(launch && launch.image), launchedAt: launch ? launch.at : null, creator: launch ? launch.creator : null },
    note: launch ? undefined : `This token launched before the ${config.INDEX_KEEP_HOURS}h window Hoodey keeps, so "early" is measured from the first trade we saw, not the real launch.`,
    ...r
  };
}

// ── Death Clock + Wallet X-Ray ───────────────────────────────────────────
let modelCache = { at: 0, v: null };
function insightModel() {
  if (modelCache.v && Date.now() - modelCache.at < 60e3) return modelCache.v;
  const v = buildModel(ix.launches(), ix.trades(), cabalIndex().memberOf);
  modelCache = { at: Date.now(), v };
  return v;
}
const windowHours = () => { const st = ix.status(); return st.since ? Math.max(1, Math.round((Date.now() - Date.parse(st.since)) / 3600e3)) : config.INDEX_KEEP_HOURS; };

// One box for both: a token address gets its Death Clock, a wallet gets its X-Ray.
export async function xray(address) {
  const a = address.toLowerCase();
  const model = insightModel();
  const note = ix.status().history !== 'complete' ? 'Hoodey restarted recently and is still loading older blocks, so this may change in a minute.' : undefined;
  const launch = ix.launchOf(a);
  if (launch) {
    const f = forecast(model, a);
    return { source: 'live', kind: 'token', windowHours: windowHours(), note,
      token: { address: a, name: launch.name, symbol: launch.symbol, hasImage: !!launch.image, launchedAt: launch.at, creator: launch.creator }, ...f };
  }
  const usd = await ethUsd().catch(() => null);
  const w = xrayWallet(model, a, usd);
  if (w) return { source: 'live', kind: 'wallet', windowHours: windowHours(), note, ...w };
  // neither a launch we saw nor a wallet that traded: say which
  const meta = await tokenMeta(a).catch(() => null);
  const e = new Error(meta && meta.symbol
    ? `$${meta.symbol} launched before the ${config.INDEX_KEEP_HOURS}h window Hoodey keeps, so there is no first minute to read. Death Clock works on fresh Pons launches.`
    : `This wallet made no Pons curve trades in the last ${config.INDEX_KEEP_HOURS}h, so there is nothing to X-ray yet.`);
  e.code = 'NO_TRADES';
  throw e;
}

export async function xrayBoard() {
  const model = insightModel();
  const b = walletBoard(model);
  const dead = [...model.tokens.values()].filter((x) => x.life.dead && x.lifeMin != null);
  const lives = dead.map((x) => x.lifeMin).sort((p, q) => p - q);
  return { source: 'live', windowHours: windowHours(), deathRow: deathRow(model), ...b,
    stats: { launches: model.tokens.size, dead: dead.length, deadPct: model.tokens.size ? Math.round((dead.length / model.tokens.size) * 100) : 0, medianLifeMin: lives.length ? lives[Math.floor(lives.length / 2)] : null, learningFrom: model.resolved.length } };
}

// ── LARP Scanner ─────────────────────────────────────────────────────────
let larpCache = { at: 0, v: null };
function larpIndex() {
  if (larpCache.v && Date.now() - larpCache.at < 30e3) return larpCache.v;
  larpCache = { at: Date.now(), v: linkIndex(ix.launches()) };
  return larpCache.v;
}

export async function larpScan(address) {
  const a = address.toLowerCase();
  const launch = ix.launchOf(a);
  if (!launch) {
    const meta = await tokenMeta(a); // throws "No contract" for non-contracts
    const e = new Error(`$${meta.symbol || 'This token'} launched before the ${config.INDEX_KEEP_HOURS}h window Hoodey keeps, so its launch links are out of reach. LARP Scanner works on Pons launches from the last ${config.INDEX_KEEP_HOURS}h.`);
    e.code = 'NO_TRADES';
    throw e;
  }
  const r = await scanLarp(launch, ix.launches(), larpIndex());
  return { source: 'live', windowHours: windowHours(), token: { address: a, name: launch.name, symbol: launch.symbol, hasImage: !!launch.image, launchedAt: launch.at, creator: launch.creator }, ...r };
}

export async function larpList() {
  return { source: 'live', windowHours: windowHours(), ...larpBoard(ix.launches(), larpIndex()) };
}

export { median, isAddress };

export function startWarmer() {
  ix.startIndexer();
  startPriceWatch();
  log.info(`Live data: chain indexer (poll ${config.INDEX_POLL_SECONDS}s, keep ${config.INDEX_KEEP_HOURS}h) + DexPaprika prices`);
}
