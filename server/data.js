// Chooses live or sample data per section, with a short cache.
import { config } from './config.js';
import { createCache, log } from './util.js';
import * as sample from './sample.js';
import * as chain from './live.js';
import * as bq from './live-bitquery.js';

const live = config.DATA_SOURCE === 'bitquery' ? bq : chain;
export const startLive = () => {
  live.startWarmer();
  if (!useLive()) return;
  // Keep the home page's answers built in the background so the first visitor never waits for them.
  const warm = () => {
    radar(config.SPIKE_LOOKBACK_HOURS).catch(() => {});
    trending().catch(() => {});
  };
  setTimeout(warm, 5000).unref?.();
  setInterval(warm, Math.max(10, config.CACHE_TTL_SECONDS - 5) * 1000).unref?.();
};

const cached = createCache(config.CACHE_TTL_SECONDS);
const useLive = () => config.DATA_MODE === 'live';

// Run a live loader; on any failure return the sample answer with the reason.
async function liveOr(key, liveFn, sampleFn) {
  if (!useLive()) return sampleFn();
  try {
    return await cached(key, liveFn);
  } catch (e) {
    log.warn(`live ${key} failed, using sample:`, e.message);
    const s = sampleFn();
    return s && typeof s === 'object' ? { ...s, source: 'sample', fallbackReason: e.message } : s;
  }
}

export async function radar(rangeHours) {
  const h = [1, 6, 24].includes(rangeHours) ? rangeHours : config.SPIKE_LOOKBACK_HOURS;
  const base = await liveOr(`radar:${h}`, () => live.radar(h), () => sample.radar(h));
  if (!base.life) base.life = sample.radar(h).life; // survival stats need history we do not index yet
  if (!base.hot) base.hot = sample.radar(h).hot;
  return { range: h, ...base };
}

export const copycatLatest = () => liveOr('copycat:latest', () => live.copycat(null), () => sample.copycatLatest());
// A scan must show the token that was asked for. In live mode we never swap in a demo token:
// if the chain read fails, the page gets a clear "try again" message instead.
export async function copycatScan(address) {
  if (!useLive()) return sample.copycatScan(address);
  try {
    return await cached(`copycat:${address.toLowerCase()}`, () => live.copycat(address));
  } catch (e) {
    log.warn(`live copycat scan ${address} failed:`, e.message);
    const warming = /catching up|Indexer/i.test(e.message);
    if (/No contract/i.test(e.message)) return null;
    return { error: warming ? 'Hoodey is still reading the latest blocks after a restart. Try this scan again in a minute.' : `Couldn't read this token from Robinhood Chain right now (${e.message.slice(0, 80)}). Try again in a moment.` };
  }
}

export async function clock() {
  if (!useLive()) return sample.clock();
  const s = sample.clock();
  const [hours, gaps] = await Promise.all([
    liveOr('clock:hours', () => live.clockHours(), () => s.hours),
    liveOr('clock:gaps', () => live.clockGaps(), () => s.gaps)
  ]);
  return { source: hours.source === 'live' || gaps.source === 'live' ? 'live' : 'sample', hours, gaps };
}

export const family = (ticker) => liveOr(`family:${ticker}`, () => live.family(ticker), () => sample.family(ticker));
export const wallet = (address) => liveOr(`wallet:${address.toLowerCase()}`, () => live.wallet(address), () => sample.wallet(address));
export const chainStatus = () => (useLive() ? live.chainStatus() : Promise.resolve({}));

export const trending = () => liveOr('trending', () => live.trending(), () => sample.trending());

// Image URL named in a token's launch transaction (chain source only).
export const imageUrlOf = (token) => (useLive() && live.imageUrlOf ? live.imageUrlOf(token) : null);

// Cabal Eye. Like Copycat scans, a scan never swaps in a demo token in live mode.
export const cabalMap = () => liveOr('cabal:map', () => live.cabalMap ? live.cabalMap() : Promise.reject(new Error('Cabal Map needs DATA_SOURCE=chain')), () => sample.cabalMap());
export async function cabalScan(address) {
  if (!useLive()) return sample.cabalScan(address);
  try {
    if (!live.cabalScan) throw new Error('Cabal Scan needs DATA_SOURCE=chain');
    return await cached(`cabal:${address.toLowerCase()}`, () => live.cabalScan(address));
  } catch (e) {
    if (/No contract/i.test(e.message)) return null;
    if (e.code === 'NO_TRADES') return { error: e.message, status: 404 };
    log.warn(`live cabal scan ${address} failed:`, e.message);
    const warming = /catching up|Indexer/i.test(e.message);
    return { error: warming ? 'Hoodey is still reading the latest blocks after a restart. Try this scan again in a minute.' : `Couldn't scan this token right now (${e.message.slice(0, 80)}). Try again in a moment.` };
  }
}

// Death Clock + Wallet X-Ray: one lookup box, a token or a wallet. Never a demo stand-in in live mode.
export const xrayBoard = () => liveOr('xray:board', () => live.xrayBoard ? live.xrayBoard() : Promise.reject(new Error('X-Ray needs DATA_SOURCE=chain')), () => sample.xrayBoard());
export async function xray(address) {
  if (!useLive()) return sample.xray(address);
  try {
    if (!live.xray) throw new Error('X-Ray needs DATA_SOURCE=chain');
    return await cached(`xray:${address.toLowerCase()}`, () => live.xray(address));
  } catch (e) {
    if (e.code === 'NO_TRADES') return { error: e.message, status: 404 };
    log.warn(`live xray ${address} failed:`, e.message);
    const warming = /catching up|Indexer/i.test(e.message);
    return { error: warming ? 'Hoodey is still reading the latest blocks after a restart. Try again in a minute.' : `Couldn't read this address right now (${e.message.slice(0, 80)}). Try again in a moment.` };
  }
}

// LARP Scanner: never a demo stand-in in live mode.
export const larpBoard = () => liveOr('larp:board', () => live.larpList ? live.larpList() : Promise.reject(new Error('LARP Scanner needs DATA_SOURCE=chain')), () => sample.larpBoard());
export async function larpScan(address) {
  if (!useLive()) return sample.larpScan(address);
  try {
    if (!live.larpScan) throw new Error('LARP Scanner needs DATA_SOURCE=chain');
    return await cached(`larp:${address.toLowerCase()}`, () => live.larpScan(address));
  } catch (e) {
    if (/No contract/i.test(e.message)) return null;
    if (e.code === 'NO_TRADES') return { error: e.message, status: 404 };
    log.warn(`live larp scan ${address} failed:`, e.message);
    const warming = /catching up|Indexer/i.test(e.message);
    return { error: warming ? 'Hoodey is still reading the latest blocks after a restart. Try again in a minute.' : `Couldn't scan this token right now (${e.message.slice(0, 80)}). Try again in a moment.` };
  }
}
