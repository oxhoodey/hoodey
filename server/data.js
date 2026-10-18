// Chooses live or sample data per section, with a short cache.
import { config } from './config.js';
import { createCache, log } from './util.js';
import * as sample from './sample.js';
import * as live from './live.js';

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
export const copycatScan = (address) => liveOr(`copycat:${address.toLowerCase()}`, () => live.copycat(address), () => sample.copycatScan(address));

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
