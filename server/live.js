// Live data from Robinhood Chain, through Bitquery (launches, trades) and JSON-RPC (token name/symbol).
// Each function throws on failure; data.js catches and falls back to sample for that section only.
import { config } from './config.js';
import { fetchJson, log, nameSimilarity, tagStock, zonedParts, toMinutes, median, isAddress } from './util.js';

// ── Bitquery: one request at a time, spaced out, with a shared cache ──
// Plans limit requests per minute, so every page shares the same launches list and the same
// trades per stock instead of asking again, and calls wait their turn in a queue.
let queue = Promise.resolve();
let lastCall = 0;
let cooldownUntil = 0;

function schedule(fn) {
  // While cooling down after a rate-limit answer, fail fast so callers reuse their last good data.
  if (Date.now() < cooldownUntil) return Promise.reject(new Error(`Bitquery rate limit: cooling down ${Math.ceil((cooldownUntil - Date.now()) / 1000)}s`));
  const run = queue.then(async () => {
    if (Date.now() < cooldownUntil) throw new Error('Bitquery rate limit: cooling down');
    const wait = lastCall + config.BITQUERY_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}

async function bitquery(query, variables = {}) {
  if (!config.BITQUERY_API_KEY) throw new Error('BITQUERY_API_KEY is not set');
  return schedule(async () => {
    try {
      const body = await fetchJson(config.BITQUERY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.BITQUERY_API_KEY}` },
        body: JSON.stringify({ query, variables })
      });
      if (body.errors && body.errors.length) throw new Error('Bitquery: ' + body.errors.map((e) => e.message).join('; ').slice(0, 400));
      return body.data;
    } catch (e) {
      if (/HTTP 429|rate limit/i.test(e.message)) {
        cooldownUntil = Date.now() + 60e3; // back off for a minute
        log.warn('Bitquery rate limit hit; pausing calls for 60s');
      }
      throw e;
    }
  });
}

// Shared results: fresh for LIVE_CACHE_SECONDS; if a refresh fails, the last good copy is reused.
const shared = new Map();
async function sharedFetch(key, fn) {
  const hit = shared.get(key);
  const now = Date.now();
  if (hit && hit.value !== undefined && now - hit.at < config.LIVE_CACHE_SECONDS * 1000) return hit.value;
  if (hit && hit.pending) return hit.pending;
  const pending = fn().then((value) => {
    shared.set(key, { value, at: Date.now() });
    return value;
  }).catch((e) => {
    const prev = shared.get(key);
    if (prev && prev.value !== undefined) {
      shared.set(key, { value: prev.value, at: prev.at });
      log.warn(`${key}: refresh failed (${e.message.slice(0, 80)}), serving last good data`);
      return prev.value;
    }
    shared.delete(key);
    throw e;
  });
  shared.set(key, { ...(hit || {}), pending });
  return pending;
}

async function rpc(method, params) {
  if (!config.RH_RPC_URL) throw new Error('RH_RPC_URL is not set');
  const body = await fetchJson(config.RH_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (body.error) throw new Error('RPC: ' + body.error.message);
  return body.result;
}

function decodeAbiString(hex) {
  if (!hex || hex === '0x') return '';
  const data = hex.slice(2);
  try {
    if (data.length >= 128) {
      const offset = parseInt(data.slice(0, 64), 16) * 2;
      const len = parseInt(data.slice(offset, offset + 64), 16);
      const bytes = data.slice(offset + 64, offset + 64 + len * 2);
      return Buffer.from(bytes, 'hex').toString('utf8').replace(/\0/g, '').trim();
    }
    return Buffer.from(data.slice(0, 64), 'hex').toString('utf8').replace(/\0/g, '').trim(); // bytes32 tokens
  } catch {
    return '';
  }
}

export async function tokenMeta(address) {
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
    if (Date.now() - blockCache.at < 4000 && blockCache.value) return { ...blockCache.value };
    try { out.block = parseInt(await rpc('eth_blockNumber', []), 16); out.at = Date.now(); blockCache = { at: Date.now(), value: out }; } catch (e) { out.rpcError = e.message; }
  }
  return out;
}

// Recent Pons launches (Bitquery "Transfers" mint pattern from the Pons API docs).
const LAUNCHES_Q = `
query Launches($limit: Int!, $contracts: [String!]) {
  EVM(network: robinhood, dataset: ${config.BITQUERY_DATASET}) {
    Transfers(
      limit: {count: $limit}
      orderBy: {descending: Block_Time}
      where: {
        Transfer: { Sender: {is: "0x0000000000000000000000000000000000000000"}, Amount: {eq: "1000000000"} }
        Transaction: { To: {in: $contracts} }
      }
    ) {
      Block { Time }
      Transaction { Hash From }
      Transfer { Receiver Currency { Name Symbol SmartContract } }
    }
  }
}`;

export function launches() {
  return sharedFetch('launches', fetchLaunches);
}

async function fetchLaunches() {
  const data = await bitquery(LAUNCHES_Q, { limit: config.LAUNCH_LIMIT, contracts: [config.PONS_FACTORY_ADDRESS, config.PONS_ROUTER_ADDRESS] });
  const rows = (data && data.EVM && data.EVM.Transfers) || [];
  return rows.map((r) => {
    const c = r.Transfer.Currency || {};
    const name = c.Name || c.Symbol || '';
    const symbol = c.Symbol || '';
    return {
      address: String(c.SmartContract || '').toLowerCase(),
      name, symbol,
      creator: String(r.Transaction.From || '').toLowerCase(),
      at: r.Block.Time,
      launchpad: 'Pons',
      ticker: tagStock(name, symbol)
    };
  }).filter((l) => isAddress(l.address));
}

const TRADES_Q = `
query StockTrades($token: String!, $limit: Int!) {
  Trading {
    Trades(
      limit: {count: $limit}
      orderBy: {descending: Block_Time}
      where: { Pair: { Token: {Address: {is: $token}}, Market: {Network: {is: "Robinhood"}} } }
    ) {
      Block { Time }
      PriceInUsd
    }
  }
}`;

function stockTrades(address) {
  return sharedFetch(`trades:${address}`, () => fetchStockTrades(address));
}

async function fetchStockTrades(address) {
  const data = await bitquery(TRADES_Q, { token: address, limit: 1000 });
  return ((data && data.Trading && data.Trading.Trades) || [])
    .map((t) => ({ t: Date.parse(t.Block.Time), p: Number(t.PriceInUsd) }))
    .filter((x) => Number.isFinite(x.t) && x.p > 0)
    .sort((a, b) => a.t - b.t);
}

function bucketSeries(trades, from, to, points = 41) {
  const out = [];
  let i = 0, last = trades.length ? trades[0].p : 0;
  for (let k = 0; k < points; k++) {
    const edge = from + ((to - from) * k) / (points - 1);
    while (i < trades.length && trades[i].t <= edge) { last = trades[i].p; i++; }
    out.push(+last.toFixed(4));
  }
  return out;
}

function similarOlder(token, pool) {
  let best = null;
  for (const o of pool) {
    if (o.address === token.address || Date.parse(o.at) >= Date.parse(token.at)) continue;
    const s = Math.max(nameSimilarity(token.name, o.name), nameSimilarity(token.symbol, o.symbol));
    if (!best || s > best.score) best = { of: o.symbol, score: s, older: o };
  }
  return best && best.score >= config.COPYCAT_NAME_THRESHOLD ? best : null;
}

function tokenRow(l, all, creatorCounts, refT) {
  const copy = similarOlder(l, all);
  const repeat = creatorCounts[l.creator] || 0;
  return {
    name: l.name, symbol: l.symbol, address: l.address, launchpad: l.launchpad, at: l.at, ticker: l.ticker || null,
    afterMin: refT == null ? null : Math.round((Date.parse(l.at) - refT) / 60000),
    holders: null, volumeUsd: null, top10Pct: null, lifespanMin: null,
    copycat: copy ? { of: copy.of, score: Math.round(copy.score * 100) } : null,
    deployerLaunches: repeat,
    risk: copy || repeat >= 5 ? 'high' : repeat >= 2 ? 'medium' : 'low'
  };
}

export async function radar(rangeHours) {
  const now = Date.now();
  const from = now - rangeHours * 3600e3;
  const all = await launches();
  const creatorCounts = {};
  all.forEach((l) => { creatorCounts[l.creator] = (creatorCounts[l.creator] || 0) + 1; });

  // Every watched stock token gets a card, spike or not, so the page is never empty.
  const watched = config.stocks.filter((s) => s.address);
  const moves = [];
  const errors = [];
  for (const s of watched) {
    try {
      const tr = (await stockTrades(s.address)).filter((x) => x.t >= from - 3600e3);
      const inRange = tr.filter((x) => x.t >= from);
      if (!tr.length) continue;
      // Median prices, so one odd trade in a thin market can't fake a move.
      const priorTrades = tr.filter((x) => x.t < from);
      const startP = median((priorTrades.length ? priorTrades.slice(-5) : (inRange.length ? inRange : tr).slice(0, 5)).map((x) => x.p));
      const lastP = median((inRange.length ? inRange : tr).slice(-3).map((x) => x.p));
      const movePct = ((lastP - startP) / startP) * 100;
      // A spike must be big enough and hold: SPIKE_MIN_TRADES trades past the halfway price.
      const half = startP + (lastP - startP) / 2;
      const past = inRange.filter((x) => (movePct > 0 ? x.p >= half : x.p <= half));
      const spike = Math.abs(movePct) >= config.SPIKE_THRESHOLD_PCT && inRange.length >= config.SPIKE_MIN_TRADES && past.length >= config.SPIKE_MIN_TRADES;
      const refT = spike ? past[0].t : from;
      const themed = all.filter((l) => l.ticker === s.ticker && Date.parse(l.at) >= refT).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      moves.push({
        ticker: s.ticker, name: s.name, up: movePct >= 0, movePct: +movePct.toFixed(2), price: +lastP.toFixed(2), trades: inRange.length, spike,
        trigger: spike ? `Spike · ${movePct >= 0 ? 'up' : 'down'} ${Math.abs(movePct).toFixed(1)}%` : (inRange.length ? `${inRange.length} trades in ${rangeHours}h` : 'No trades in range'),
        at: new Date(spike ? refT : (inRange.length ? inRange[inRange.length - 1].t : tr[tr.length - 1].t)).toISOString(),
        spikePos: spike ? (refT - from) / (now - from) : null, series: bucketSeries(tr, from, now),
        launches: themed.length, firstAfterMin: spike && themed.length ? Math.round((Date.parse(themed[0].at) - refT) / 60000) : null,
        volumeUsd: null, alivePct: null,
        tokens: themed.slice(0, config.RADAR_MAX_TOKENS).map((l) => tokenRow(l, all, creatorCounts, spike ? refT : null))
      });
    } catch (e) {
      errors.push(`${s.ticker}: ${e.message}`);
    }
  }
  if (watched.length && errors.length === watched.length) throw new Error(errors.join(' | '));
  moves.sort((a, b) => (b.spike - a.spike) || Math.abs(b.movePct) - Math.abs(a.movePct));

  const dayAgo = now - 24 * 3600e3;
  const counts = {};
  all.filter((l) => l.ticker && Date.parse(l.at) >= dayAgo).forEach((l) => { counts[l.ticker] = (counts[l.ticker] || 0) + 1; });
  const hot = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([ticker, count]) => ({ ticker, count }));

  // Live pulse: what the chain did recently, over the window the fetched launches cover.
  const oldest = all.length ? Math.min(...all.map((l) => Date.parse(l.at))) : now;
  const windowStart = Math.max(oldest, dayAgo);
  const recent = all.filter((l) => Date.parse(l.at) >= windowStart);
  const latest = all.slice(0, 16).map((l) => tokenRow(l, all, creatorCounts, null));
  const stats = {
    windowHours: +((now - windowStart) / 3600e3).toFixed(1),
    launches: recent.length,
    lastHour: all.filter((l) => Date.parse(l.at) >= now - 3600e3).length,
    copycats: recent.filter((l) => similarOlder(l, all)).length,
    deployers: new Set(recent.map((l) => l.creator)).size,
    themed: recent.filter((l) => l.ticker).length
  };

  return { source: 'live', moves, events: moves.filter((m) => m.spike), latest, stats, hot: { source: 'live', items: hot }, errors };
}

// ── Hot right now: recent Pons token trades, aggregated per token ─────
const TRENDING_Q = `
query HotTrades($limit: Int!) {
  Trading {
    Trades(
      limit: {count: $limit}
      orderBy: {descending: Block_Time}
      where: { Pair: { Market: {Network: {is: "Robinhood"}} } }
    ) {
      Block { Time }
      Side
      PriceInUsd
      AmountsInUsd { Quote }
      Trader { Address }
      Pair { Token { Address Name Symbol } Market { Protocol } }
    }
  }
}`;

function recentTrades() {
  return sharedFetch('hotTrades', async () => {
    const data = await bitquery(TRENDING_Q, { limit: config.TRENDING_TRADE_LIMIT });
    return ((data && data.Trading && data.Trading.Trades) || []).map((r) => ({
      t: Date.parse(r.Block.Time),
      side: String(r.Side || '').toLowerCase(),
      p: Number(r.PriceInUsd),
      usd: Number(r.AmountsInUsd && r.AmountsInUsd.Quote) || 0,
      trader: String((r.Trader && r.Trader.Address) || '').toLowerCase(),
      token: String((r.Pair && r.Pair.Token && r.Pair.Token.Address) || '').toLowerCase(),
      name: r.Pair && r.Pair.Token && r.Pair.Token.Name,
      symbol: r.Pair && r.Pair.Token && r.Pair.Token.Symbol,
      protocol: String((r.Pair && r.Pair.Market && r.Pair.Market.Protocol) || '').toLowerCase()
    })).filter((x) => Number.isFinite(x.t) && isAddress(x.token));
  });
}

export async function trending() {
  const [trades, all] = await Promise.all([recentTrades(), launches()]);
  const byAddr = new Map(all.map((l) => [l.address, l]));
  const stockAddrs = new Set(config.stocks.map((s) => s.address).filter(Boolean));
  const creatorCounts = {};
  all.forEach((l) => { creatorCounts[l.creator] = (creatorCounts[l.creator] || 0) + 1; });
  // Pons tokens only: launched through Pons (in our launch list) or traded on the Pons curve.
  const pons = trades.filter((x) => !stockAddrs.has(x.token) && (byAddr.has(x.token) || x.protocol.includes('pons')));
  if (!pons.length) throw new Error('No recent Pons token trades');
  const now = Date.now();
  const oldest = Math.min(...pons.map((x) => x.t));
  const groups = new Map();
  pons.forEach((x) => { if (!groups.has(x.token)) groups.set(x.token, []); groups.get(x.token).push(x); });

  const rows = [...groups.entries()].map(([addr, list]) => {
    list.sort((a, b) => a.t - b.t);
    const l = byAddr.get(addr);
    const vol = list.reduce((a, x) => a + x.usd, 0);
    const buys = list.filter((x) => x.side === 'buy');
    const sells = list.filter((x) => x.side === 'sell');
    const sided = buys.length + sells.length > 0;
    const buyVol = buys.reduce((a, x) => a + x.usd, 0), sellVol = sells.reduce((a, x) => a + x.usd, 0);
    const perTrader = {};
    list.forEach((x) => { perTrader[x.trader] = (perTrader[x.trader] || 0) + x.usd; });
    const traders = Object.keys(perTrader).length;
    const topShare = vol > 0 ? Math.max(...Object.values(perTrader)) / vol : null;
    const priced = list.filter((x) => x.p > 0);
    const first = priced.length ? median(priced.slice(0, 3).map((x) => x.p)) : null;
    const last = priced.length ? median(priced.slice(-3).map((x) => x.p)) : null;
    // 12-point price line over the window
    const spark = [];
    if (priced.length) {
      let i = 0, lastP = priced[0].p;
      for (let k = 0; k < 12; k++) {
        const edge = oldest + ((now - oldest) * (k + 1)) / 12;
        while (i < priced.length && priced[i].t <= edge) { lastP = priced[i].p; i++; }
        spark.push(+lastP.toPrecision(6));
      }
    }
    const token = l || { address: addr, name: list[0].name || '', symbol: list[0].symbol || '', creator: '', at: null, ticker: tagStock(list[0].name, list[0].symbol), launchpad: 'Pons' };
    const copy = l ? similarOlder(l, all) : null;
    const repeat = l ? creatorCounts[l.creator] || 0 : 0;
    const flags = [];
    if (copy) flags.push({ k: 'copy', label: `Copy of $${copy.of}` });
    if (repeat >= 3) flags.push({ k: 'repeat', label: `Deployer x${repeat}` });
    if (topShare != null && traders >= 2 && topShare >= 0.5) flags.push({ k: 'whale', label: `1 wallet ${Math.round(topShare * 100)}%` });
    if (traders <= 2 && list.length >= 8) flags.push({ k: 'wash', label: 'Few traders, many trades' });
    return {
      address: addr, name: token.name, symbol: token.symbol, launchedAt: token.at, ticker: token.ticker || null,
      volumeUsd: Math.round(vol), trades: list.length, traders,
      buyPct: sided && buyVol + sellVol > 0 ? Math.round((buyVol / (buyVol + sellVol)) * 100) : null,
      buys: buys.length, sells: sells.length,
      priceUsd: last, changePct: first && last ? +(((last - first) / first) * 100).toFixed(1) : null,
      spark, topWalletPct: topShare == null ? null : Math.round(topShare * 100),
      copycat: copy ? { of: copy.of, score: Math.round(copy.score * 100) } : null,
      deployerLaunches: repeat,
      flags,
      risk: flags.some((f) => f.k === 'copy' || f.k === 'wash') || repeat >= 5 ? 'high' : flags.length ? 'medium' : 'low'
    };
  });

  return {
    source: 'live',
    windowMin: Math.max(1, Math.round((now - oldest) / 60000)),
    totalTrades: pons.length,
    rows: rows.sort((a, b) => b.volumeUsd - a.volumeUsd || b.trades - a.trades).slice(0, config.TRENDING_MAX_ROWS)
  };
}

export async function copycat(address) {
  const all = await launches();
  let token = address ? all.find((l) => l.address === address.toLowerCase()) : all[0];
  if (!token && address) {
    const meta = await tokenMeta(address);
    token = { address: address.toLowerCase(), name: meta.name, symbol: meta.symbol, creator: '', at: new Date().toISOString(), launchpad: 'Unknown' };
  }
  if (!token) throw new Error('No launches found');

  const scored = all
    .filter((o) => o.address !== token.address && Date.parse(o.at) <= Date.parse(token.at))
    .map((o) => ({ o, score: Math.max(nameSimilarity(token.name, o.name), nameSimilarity(token.symbol, o.symbol)) }))
    .sort((a, b) => b.score - a.score)
    .filter((x, i, arr) => arr.findIndex((y) => y.o.name === x.o.name && y.o.symbol === x.o.symbol) === i)
    .slice(0, 5);
  const top = scored[0];
  const byCreator = token.creator ? all.filter((l) => l.creator === token.creator) : [];

  return {
    source: 'live',
    token: {
      name: token.name, symbol: token.symbol, address: token.address, launchpad: token.launchpad, launchedAt: token.at,
      imageSimilarity: null,
      nameSimilarity: top ? +top.score.toFixed(2) : 0,
      closest: top ? { symbol: top.o.symbol, name: top.o.name, launchedAgo: null, diedAfter: null, sameDeployer: !!token.creator && top.o.creator === token.creator } : null,
      flagged: !!top && top.score >= config.COPYCAT_NAME_THRESHOLD
    },
    matches: scored.map(({ o, score }) => ({ name: o.name, symbol: o.symbol, score: Math.round(score * 100), note: o.creator === token.creator ? 'same deployer' : 'different deployer', alive: null, life: null })),
    scanned: all.length,
    deployer: token.creator ? {
      address: token.creator,
      tokens30d: byCreator.filter((l) => Date.parse(l.at) > Date.now() - 30 * 86400e3).length,
      deadWithin6h: null, imagesReused: null, medianLifespanMin: null,
      pattern: byCreator.length >= 5 ? 'farm' : byCreator.length >= 2 ? 'repeat' : 'new',
      history: byCreator.filter((l) => l.address !== token.address).slice(0, 8).map((l) => ({ symbol: l.symbol, alive: null, life: null, at: l.at }))
    } : null
  };
}

export async function clockHours() {
  const all = await launches();
  const counts = Array(24).fill(0);
  const themed = Array(24).fill(0);
  let oldest = Date.now();
  all.forEach((l) => {
    const d = new Date(l.at);
    const h = zonedParts(d).hour;
    counts[h]++;
    if (l.ticker) themed[h]++;
    oldest = Math.min(oldest, d.getTime());
  });
  if (!all.length) throw new Error('No launches in the fetched window');
  return { source: 'live', counts, themed, total: all.length, hours: Math.max(1, Math.round((Date.now() - oldest) / 3600e3)), days: Math.max(1, Math.round((Date.now() - oldest) / 86400e3)) };
}

export async function clockGaps() {
  const watched = config.stocks.filter((s) => s.address);
  if (!watched.length) throw new Error('No stock token addresses in STOCK_TOKENS');
  const closeMin = toMinutes(config.MARKET_CLOSE);
  const items = [];
  for (const s of watched) {
    const tr = await stockTrades(s.address);
    if (!tr.length) continue;
    // last trade at or before the most recent regular-session close
    let closeTrade = null;
    for (let i = tr.length - 1; i >= 0; i--) {
      const z = zonedParts(new Date(tr[i].t));
      const tradingDay = z.weekday >= 1 && z.weekday <= 5 && !config.holidays.includes(z.date);
      if (tradingDay && z.hour * 60 + z.minute <= closeMin && tr[i].t < Date.now() - 60e3) { closeTrade = tr[i]; break; }
    }
    if (!closeTrade) continue;
    const last = median(tr.slice(-3).map((x) => x.p));
    items.push({ ticker: s.ticker, price: +last.toFixed(2), gapPct: +(((last - closeTrade.p) / closeTrade.p) * 100).toFixed(1) });
  }
  if (!items.length) throw new Error('Not enough trade history for gaps');
  return { source: 'live', items };
}

export async function family(ticker) {
  const all = await launches();
  const stocks = [...new Set(all.map((l) => l.ticker).filter(Boolean))];
  const t = stocks.includes(ticker) ? ticker : stocks[0];
  if (!t) throw new Error('No stock-themed launches found');
  const stock = config.stocks.find((s) => s.ticker === t) || { ticker: t, name: t };
  const fam = all.filter((l) => l.ticker === t).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-40);
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
      id, parent: best ? best.p.id : 'r', name: l.name, symbol: l.symbol, kind: best ? 'clone' : 'original', alive: null,
      note: new Date(l.at).toISOString(), deployer: l.creator ? `${l.creator.slice(0, 6)}…${l.creator.slice(-4)}` : '',
      similarity: best ? Math.round(best.s * 100) : null, at: l.at
    });
    placed.push({ id, l });
  });
  return { source: 'live', stocks, ticker: t, nodes };
}

const WALLET_Q = `
query WalletTrades($trader: String!, $since: DateTime!) {
  Trading {
    Trades(
      limit: {count: 2000}
      where: { Trader: {Address: {is: $trader}}, Block: {Time: {since: $since}}, Pair: {Market: {Network: {is: "Robinhood"}}} }
    ) {
      Side
      AmountsInUsd { Quote }
    }
  }
}`;

export async function wallet(address) {
  const since = new Date(Date.now() - 7 * 86400e3).toISOString();
  const data = await bitquery(WALLET_Q, { trader: address.toLowerCase(), since });
  const rows = (data && data.Trading && data.Trading.Trades) || [];
  let buys = 0, sells = 0;
  rows.forEach((r) => {
    const usd = Number(r.AmountsInUsd && r.AmountsInUsd.Quote) || 0;
    if (String(r.Side).toLowerCase() === 'sell') sells += usd; else buys += usd;
  });
  const netUsd = Math.round(sells - buys);
  let tslaShares = null;
  const tsla = config.stocks.find((s) => s.ticker === 'TSLA' && s.address);
  if (tsla) {
    try { const tr = await stockTrades(tsla.address); if (tr.length) tslaShares = +(netUsd / tr[tr.length - 1].p).toFixed(1); } catch (e) { log.debug('tsla price', e.message); }
  }
  return { source: 'live', address: address.toLowerCase(), days: 7, label: 'Net trade flow', netEth: null, netUsd, tslaShares, spyPct: null, trades: rows.length };
}

export { median };

// Keeps the shared launches and stock trades fresh in the background, so visitors read from
// cache instead of waiting on Bitquery, and the request rate stays flat no matter the traffic.
export function startWarmer() {
  if (!config.BITQUERY_API_KEY) return;
  const warm = async () => {
    try { await launches(); } catch (e) { log.warn('warm launches:', e.message.slice(0, 120)); }
    try { await recentTrades(); } catch (e) { log.warn('warm hot trades:', e.message.slice(0, 120)); }
    for (const s of config.stocks.filter((x) => x.address)) {
      try { await stockTrades(s.address); } catch (e) { log.warn(`warm ${s.ticker}:`, e.message.slice(0, 120)); }
    }
  };
  warm();
  setInterval(warm, Math.max(30, config.LIVE_CACHE_SECONDS - 10) * 1000).unref();
  log.info(`Live warmer on: refreshing launches and ${config.stocks.filter((x) => x.address).length} stock tokens every ~${config.LIVE_CACHE_SECONDS}s`);
}
