// Prices from DexPaprika's free public API (no key): stock tokens on Robinhood Chain, and ETH in USD.
import { config } from './config.js';
import { fetchJson, log } from './util.js';

const WETH_MAINNET = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const cache = new Map();

async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  if (hit && hit.pending) return hit.pending;
  const pending = fn().then((value) => { cache.set(key, { value, at: Date.now() }); return value; })
    .catch((e) => {
      if (hit && hit.value !== undefined) { cache.set(key, { value: hit.value, at: hit.at }); log.warn(`${key}: ${e.message.slice(0, 80)}, serving last good data`); return hit.value; }
      cache.delete(key);
      throw e;
    });
  cache.set(key, { ...(hit || {}), pending });
  return pending;
}

const base = () => config.DEXPAPRIKA_URL.replace(/\/$/, '');

// Token summary: price_usd plus per-window blocks ("1h", "6h", "24h", …) with volume_usd, buys, sells, txns, last_price_usd_change (%).
export function tokenSummary(address, network = config.DEXPAPRIKA_NETWORK) {
  return cached(`dp:${network}:${address.toLowerCase()}`, config.PRICE_REFRESH_SECONDS * 1000, async () => {
    const t = await fetchJson(`${base()}/networks/${network}/tokens/${address.toLowerCase()}`);
    if (!t || !(Number(t.price_usd) > 0)) throw new Error(`DexPaprika: no price for ${address}`);
    return t;
  });
}

export async function ethUsd() {
  const t = await tokenSummary(WETH_MAINNET, 'ethereum');
  return Number(t.price_usd);
}

// Price history we record ourselves (one point per refresh), for sparklines and gap checks.
const history = new Map(); // address -> [{t, p}]
export function record(address, price) {
  const k = address.toLowerCase();
  const list = history.get(k) || [];
  const now = Date.now();
  if (!list.length || now - list[list.length - 1].t >= 30e3) list.push({ t: now, p: price });
  const cutoff = now - 4 * 86400e3;
  while (list.length && list[0].t < cutoff) list.shift();
  history.set(k, list);
}
export const historyOf = (address) => history.get(address.toLowerCase()) || [];

// Keeps stock prices and ETH fresh so pages read from memory.
export function startPriceWatch() {
  const tick = async () => {
    try { await ethUsd(); } catch (e) { log.warn('ETH price:', e.message.slice(0, 120)); }
    for (const s of config.stocks.filter((x) => x.address)) {
      try { const t = await tokenSummary(s.address); record(s.address, Number(t.price_usd)); }
      catch (e) { log.warn(`price ${s.ticker}:`, e.message.slice(0, 120)); }
    }
  };
  tick();
  setInterval(tick, Math.max(15, config.PRICE_REFRESH_SECONDS) * 1000).unref();
}
