// Reads Pons launches and bonding-curve trades straight from Robinhood Chain over JSON-RPC.
// No third-party indexer: the server follows new blocks and keeps a rolling window in memory.
//
// Events (verified on mainnet):
//   Factory  Launch  0x8d4aad49…  topics: token, curve, creator
//   Curve    Buy     0xec36bf57…  topics: sender, recipient   data: ethIn, tokensOut, fee, _
//   Curve    Sell    0x8113d738…  topics: sender, recipient   data: tokensIn, ethOut, fee, _
import { config } from './config.js';
import { fetchJson, log, tagStock, isAddress } from './util.js';

const T_LAUNCH = '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607';
const T_BUY = '0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455';
const T_SELL = '0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df';
const T_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const state = {
  ready: false,
  error: null,
  head: 0, // last block fully indexed
  startedFrom: 0,
  startedAt: 0, // timestamp of the first block in the history window
  backfillFrom: 0,
  backfillTo: 0,
  backfilling: false,
  launches: new Map(), // token -> launch
  curves: new Map(), // curve -> token
  trades: [], // oldest first
  lastPollAt: 0
};

let rpcId = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpc(method, params, attempt = 0) {
  try {
    const body = await fetchJson(config.RH_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params })
    });
    if (body.error) throw new Error('RPC: ' + (body.error.message || JSON.stringify(body.error)));
    return body.result;
  } catch (e) {
    // Public endpoints rate-limit bursts: wait and try again a few times.
    if (attempt < 4 && /429|rate|limit exceeded|too many requests|timeout|ECONNRESET|fetch failed/i.test(e.message) && !/range|results/i.test(e.message)) {
      await sleep(1000 * 2 ** attempt);
      return rpc(method, params, attempt + 1);
    }
    throw e;
  }
}

const hex = (n) => '0x' + n.toString(16);
const addr = (topic) => '0x' + topic.slice(26).toLowerCase();
const word = (data, i) => BigInt('0x' + (data.slice(2 + i * 64, 2 + (i + 1) * 64) || '0'));
const units = (v) => Number(v / 10n ** 9n) / 1e9; // 18 decimals -> float

function decodeString(h) {
  if (!h || h === '0x') return '';
  const d = h.slice(2);
  try {
    if (d.length >= 128) {
      const off = parseInt(d.slice(0, 64), 16) * 2;
      const len = parseInt(d.slice(off, off + 64), 16);
      return Buffer.from(d.slice(off + 64, off + 64 + len * 2), 'hex').toString('utf8').replace(/\0/g, '').trim();
    }
    return Buffer.from(d.slice(0, 64), 'hex').toString('utf8').replace(/\0/g, '').trim();
  } catch { return ''; }
}

// The launch transaction carries the token's profile as ABI strings: name, symbol, image, description, links.
function stringsAt(d) {
  const words = Math.floor(d.length / 64);
  const strings = [];
  for (let i = 0; i < words; i++) {
    const len = parseInt(d.slice(i * 64, i * 64 + 64), 16);
    if (!(len > 0 && len < 4096) || d.slice(i * 64, i * 64 + 48) !== '0'.repeat(48)) continue;
    const span = Math.ceil(len / 32);
    if (i + 1 + span > words) continue;
    const body = d.slice((i + 1) * 64, (i + 1) * 64 + len * 2);
    const pad = d.slice((i + 1) * 64 + len * 2, (i + 1 + span) * 64);
    if (/[^0]/.test(pad)) continue;
    const text = Buffer.from(body, 'hex').toString('utf8');
    if (!text || /[\u0000-\u001f\ufffd]/.test(text.replace(/[\n\r\t]/g, ''))) continue;
    strings.push(text.trim());
    i += span;
  }
  return strings;
}

export function profileFromInput(input) {
  // Launches made through a smart wallet nest the call inside another one, shifted by 4-byte steps,
  // so try each alignment and keep the one that yields the most strings.
  let strings = [];
  for (let shift = 0; shift < 64; shift += 8) {
    const found = stringsAt((input || '').slice(10 + shift));
    if (found.length > strings.length) strings = found;
  }
  const social = /^(https?:\/\/)?(www\.)?(x\.com|twitter\.com|t\.me|telegram\.me|discord\.(gg|com))\//i;
  const isUrl = (x) => /^(ipfs:\/\/|https?:\/\/)\S+$/i.test(x) || /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{50,})$/.test(x);
  const image = strings.find((x) => isUrl(x) && !social.test(x)) || null;
  const links = {
    x: strings.find((x) => /^(https?:\/\/)?(www\.)?(x|twitter)\.com\//i.test(x)) || null,
    telegram: strings.find((x) => /^(https?:\/\/)?(t|telegram)\.me\//i.test(x)) || null,
    website: strings.find((x) => /^https?:\/\//i.test(x) && x !== image && !social.test(x)) || null
  };
  return { image, links };
}

const metaCache = new Map();
async function meta(token) {
  if (metaCache.has(token)) return metaCache.get(token);
  const [n, s] = await Promise.all([
    rpc('eth_call', [{ to: token, data: '0x06fdde03' }, 'latest']).catch(() => '0x'),
    rpc('eth_call', [{ to: token, data: '0x95d89b41' }, 'latest']).catch(() => '0x')
  ]);
  const m = { name: decodeString(n), symbol: decodeString(s) };
  metaCache.set(token, m);
  return m;
}

// Block times: logs on this chain carry no timestamp, so read the edges of each range and interpolate.
const blockTimes = new Map();
async function blockTime(n) {
  if (blockTimes.has(n)) return blockTimes.get(n);
  const b = await rpc('eth_getBlockByNumber', [hex(n), false]);
  const t = parseInt(b.timestamp, 16) * 1000;
  blockTimes.set(n, t);
  if (blockTimes.size > 500) blockTimes.delete(blockTimes.keys().next().value);
  return t;
}

// A curve we did not see launch (older than the backfill): its token is the one moving in or out of it in that transaction.
async function curveToken(curve, blockNumber, txHash) {
  if (state.curves.has(curve)) return state.curves.get(curve);
  const logs = await rpc('eth_getLogs', [{ fromBlock: hex(blockNumber), toBlock: hex(blockNumber), topics: [T_TRANSFER] }]);
  const pad = '0x' + curve.slice(2).padStart(64, '0');
  const hit = logs.find((x) => x.transactionHash === txHash && (x.topics[1] === pad || x.topics[2] === pad));
  const token = hit ? hit.address.toLowerCase() : null;
  state.curves.set(curve, token);
  return token;
}

async function indexRange(from, to) {
  const [t0, t1, logs] = await Promise.all([
    blockTime(from), blockTime(to),
    rpc('eth_getLogs', [{ fromBlock: hex(from), toBlock: hex(to), topics: [[T_LAUNCH, T_BUY, T_SELL]] }])
  ]);
  const timeOf = (bn) => Math.round(to === from ? t1 : t0 + ((t1 - t0) * (bn - from)) / (to - from));
  const factory = config.PONS_FACTORY_ADDRESS.toLowerCase();

  // Launches first, so trades in the same range can find their curve.
  for (const l of logs) {
    if (l.topics[0] !== T_LAUNCH || l.address.toLowerCase() !== factory) continue;
    const token = addr(l.topics[1]), curve = addr(l.topics[2]), creator = addr(l.topics[3]);
    const bn = parseInt(l.blockNumber, 16);
    const [m, tx] = await Promise.all([
      meta(token).catch(() => ({ name: '', symbol: '' })),
      rpc('eth_getTransactionByHash', [l.transactionHash]).catch(() => null)
    ]);
    const prof = tx ? profileFromInput(tx.input) : { image: null, links: {} };
    state.curves.set(curve, token);
    state.launches.set(token, { address: token, curve, creator, name: m.name || m.symbol, symbol: m.symbol, at: new Date(timeOf(bn)).toISOString(), t: timeOf(bn), block: bn, launchpad: 'Pons', ticker: tagStock(m.name, m.symbol), image: prof.image, links: prof.links });
  }

  // A sell names its sender twice. Direct sells: that is the trader. Router sells: the trader is
  // whoever sent tokens to the router in the same transaction, found with one batched transfer query.
  const sells = logs.filter((l) => l.topics[0] === T_SELL);
  const sellers = new Map();
  const senders = [...new Set(sells.map((l) => l.topics[1]))];
  for (let i = 0; i < senders.length; i += 50) {
    const tl = await rpc('eth_getLogs', [{ fromBlock: hex(from), toBlock: hex(to), topics: [T_TRANSFER, null, senders.slice(i, i + 50)] }]).catch(() => []);
    tl.forEach((x) => { if (x.topics[1] !== x.topics[2]) sellers.set(x.transactionHash + x.topics[2], addr(x.topics[1])); });
  }

  for (const l of logs) {
    const buy = l.topics[0] === T_BUY;
    if (!buy && l.topics[0] !== T_SELL) continue;
    const curve = l.address.toLowerCase();
    const bn = parseInt(l.blockNumber, 16);
    const token = await curveToken(curve, bn, l.transactionHash).catch(() => null);
    if (!token) continue;
    const eth = units(word(l.data, buy ? 0 : 1));
    const amount = units(word(l.data, buy ? 1 : 0));
    if (!(eth > 0 && amount > 0)) continue;
    const trader = buy ? addr(l.topics[2]) : (sellers.get(l.transactionHash + l.topics[1]) || addr(l.topics[1]));
    state.trades.push({ t: timeOf(bn), block: bn, token, side: buy ? 'buy' : 'sell', eth, amount, priceEth: eth / amount, trader, tx: l.transactionHash });
  }
}

function prune() {
  const cutoff = Date.now() - config.INDEX_KEEP_HOURS * 3600e3;
  if (state.trades.length && state.trades[0].t < cutoff) state.trades = state.trades.filter((x) => x.t >= cutoff);
  for (const [k, l] of state.launches) if (l.t < cutoff) state.launches.delete(k);
}

// Index a block range in chunks, narrowing the chunk when the RPC rejects a wide range.
async function indexSpan(from, to, onChunk) {
  let span = config.INDEX_CHUNK_BLOCKS;
  let cur = from;
  while (cur <= to) {
    const end = Math.min(to, cur + span - 1);
    try {
      await indexRange(cur, end);
    } catch (e) {
      if (span > 200) { span = Math.floor(span / 2); log.debug(`Indexer: narrowing to ${span} blocks (${e.message.slice(0, 80)})`); continue; }
      throw e;
    }
    cur = end + 1;
    if (onChunk) onChunk(end);
    if (span < config.INDEX_CHUNK_BLOCKS) span = Math.min(config.INDEX_CHUNK_BLOCKS, span * 2);
  }
}

// Older history fills in behind the live head, newest hours first, so pages are useful within seconds.
async function backfill() {
  state.backfilling = true;
  try {
    let hi = state.backfillTo;
    while (hi > state.backfillFrom) {
      const lo = Math.max(state.backfillFrom, hi - config.INDEX_CHUNK_BLOCKS + 1);
      await indexSpan(lo, hi);
      hi = lo - 1;
      state.backfillTo = hi;
      state.trades.sort((a, b) => a.t - b.t);
    }
    log.info(`Indexer: history loaded (${config.INDEX_BACKFILL_HOURS}h): ${state.launches.size} launches, ${state.trades.length} trades`);
  } catch (e) {
    log.warn('Indexer backfill stopped:', e.message.slice(0, 160));
  } finally {
    state.backfilling = false;
  }
}

async function catchUp() {
  const latest = parseInt(await rpc('eth_blockNumber', []), 16);
  if (!state.head) {
    // Estimate how many blocks the history needs from the recent block rate.
    const probe = Math.max(0, latest - 20000);
    const [tNow, tProbe] = await Promise.all([blockTime(latest), blockTime(probe)]);
    const perBlock = Math.max(1, tNow - tProbe) / (latest - probe);
    const back = Math.round((config.INDEX_BACKFILL_HOURS * 3600e3) / perBlock);
    const quick = Math.min(back, Math.round((20 * 60e3) / perBlock)); // last 20 minutes first
    state.head = Math.max(0, latest - quick);
    state.backfillFrom = Math.max(0, latest - back);
    state.backfillTo = state.head;
    state.startedFrom = state.backfillFrom;
    state.startedAt = await blockTime(state.backfillFrom);
    log.info(`Indexer: reading the last 20 min first, then ${config.INDEX_BACKFILL_HOURS}h of history (${back.toLocaleString('en-US')} blocks) in the background`);
  }
  if (state.head < latest) {
    await indexSpan(state.head + 1, latest, (end) => { state.head = end; });
  }
  state.trades.sort((a, b) => a.t - b.t);
  prune();
  state.lastPollAt = Date.now();
  if (!state.ready) {
    state.ready = true;
    log.info(`Indexer ready: ${state.launches.size} launches, ${state.trades.length} trades, head ${state.head}`);
    if (state.backfillTo > state.backfillFrom) backfill();
  }
}

let running = false;
export function startIndexer() {
  if (!config.RH_RPC_URL) { state.error = 'RH_RPC_URL is not set'; log.warn('Indexer off: RH_RPC_URL is not set'); return; }
  const tick = async () => {
    if (running) return;
    running = true;
    try { await catchUp(); state.error = null; }
    catch (e) { state.error = e.message; log.warn('Indexer:', e.message.slice(0, 160)); }
    finally { running = false; }
  };
  tick();
  setInterval(tick, config.INDEX_POLL_SECONDS * 1000).unref();
}

function need() {
  if (!state.ready) throw new Error(state.error ? `Indexer: ${state.error}` : 'Indexer is still catching up with the chain');
}

// Newest first, like the old Bitquery list.
export function launches() {
  need();
  return [...state.launches.values()].sort((a, b) => b.t - a.t);
}

export function trades(sinceMs = 0) {
  need();
  if (!sinceMs) return state.trades;
  let lo = 0, hi = state.trades.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (state.trades[mid].t < sinceMs) lo = mid + 1; else hi = mid; }
  return state.trades.slice(lo);
}

export function status() {
  return { ready: state.ready, head: state.head, history: state.backfilling ? `loading (${Math.round(100 * (1 - (state.backfillTo - state.backfillFrom) / Math.max(1, state.head - state.backfillFrom)))}%)` : 'complete', launches: state.launches.size, trades: state.trades.length, since: state.startedAt ? new Date(state.startedAt).toISOString() : null, error: state.error };
}

export const isReady = () => state.ready;
export { rpc as chainRpc }; // with retries, for one-off reads elsewhere
export const launchOf = (token) => state.launches.get(String(token).toLowerCase()) || null;
export { isAddress };
