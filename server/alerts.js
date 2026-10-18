// Optional Telegram posting: spike alerts and the opening bell brief.
// Runs only when TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set and the matching *_ENABLED flag is on.
import { config } from './config.js';
import { log, fetchJson, zonedParts, toMinutes } from './util.js';
import * as data from './data.js';

const sent = new Set();

async function send(text) {
  await fetchJson(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true })
  });
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const link = (path) => (config.PUBLIC_URL ? `\n${config.PUBLIC_URL.replace(/\/$/, '')}${path}` : '');

async function checkSpikes() {
  const r = await data.radar(1);
  if (r.source !== 'live') return; // never post sample data
  for (const e of r.events) {
    if (Math.abs(e.movePct) < config.ALERT_MIN_MOVE_PCT) continue;
    const key = `spike:${e.ticker}:${e.at}`;
    if (sent.has(key)) continue;
    sent.add(key);
    const first = e.tokens[0];
    const lines = [
      `👁 <b>${esc(e.ticker)} ${e.movePct > 0 ? '▲' : '▼'} ${Math.abs(e.movePct)}%</b>`,
      `${e.launches} themed meme${e.launches === 1 ? '' : 's'} launched since the move.`,
      first ? `First: ${esc(first.name)} ($${esc(first.symbol)}), +${first.afterMin}m${first.copycat ? ` · looks like $${esc(first.copycat.of)} (${first.copycat.score}%)` : ''}` : ''
    ].filter(Boolean);
    await send(lines.join('\n') + link('/'));
    log.info('alert sent', key);
  }
}

async function checkBrief() {
  const now = new Date();
  const z = zonedParts(now);
  if (z.weekday < 1 || z.weekday > 5 || config.holidays.includes(z.date)) return;
  const target = toMinutes(config.MARKET_OPEN) - config.OPENING_BELL_MINUTES_BEFORE;
  const nowMin = z.hour * 60 + z.minute;
  if (nowMin < target || nowMin > target + 2) return;
  const key = `brief:${z.date}`;
  if (sent.has(key)) return;
  sent.add(key);
  const [clock, radar] = await Promise.all([data.clock(), data.radar(24)]);
  if (clock.source !== 'live' && radar.source !== 'live') { log.info('brief skipped: no live data'); return; }
  const gaps = (clock.gaps.items || []).slice().sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct)).slice(0, 4)
    .map((g) => `${g.ticker} ${g.gapPct > 0 ? '+' : ''}${g.gapPct}%`).join(' · ');
  const hot = (radar.hot.items || []).slice(0, 3).map((h) => `${h.ticker} (${h.count})`).join(', ');
  const text = [
    `🔔 <b>Opening bell in ${config.OPENING_BELL_MINUTES_BEFORE} min</b>`,
    gaps ? `Overnight gaps: ${gaps}` : '',
    hot ? `Hottest meme narratives (24h): ${hot}` : ''
  ].filter(Boolean).join('\n');
  await send(text + link('/clock'));
  log.info('brief sent', key);
}

export function startAlerts() {
  const canPost = config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID;
  if (!canPost) {
    if (config.ALERTS_ENABLED || config.OPENING_BELL_BRIEF_ENABLED) log.warn('Alerts are enabled but TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing; not posting.');
    return;
  }
  if (config.ALERTS_ENABLED) {
    const every = Math.max(30, config.REFRESH_INTERVAL_SECONDS) * 1000;
    setInterval(() => checkSpikes().catch((e) => log.warn('spike alert:', e.message)), every).unref();
    log.info(`Spike alerts on, every ${every / 1000}s`);
  }
  if (config.OPENING_BELL_BRIEF_ENABLED) {
    setInterval(() => checkBrief().catch((e) => log.warn('brief:', e.message)), 30e3).unref();
    log.info('Opening bell brief on');
  }
}
