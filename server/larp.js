// LARP Scanner: tokens that dress up in someone else's identity. A Pons launch carries its X, Telegram
// and website links in the launch transaction. We flag links that point at a famous account or site,
// at someone's tweet instead of an own account, or at an account an earlier launch already used.
// An optional profile lookup adds the X account's age, followers and whether its bio names the token.
import { config } from './config.js';
import { log, nameSimilarity, normalizeName } from './util.js';

// ── link parsing ────────────────────────────────────────────────────────
const RESERVED = new Set(['i', 'home', 'search', 'intent', 'share', 'explore', 'hashtag', 'settings', 'messages', 'notifications']);
export function parseX(url) {
  if (!url) return null;
  const m = String(url).trim().match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^?#]*)/i);
  if (!m) return null;
  const parts = m[1].split('/').filter(Boolean);
  if (parts[0] === 'i' && parts[1] === 'communities' && /^\d+$/.test(parts[2] || '')) return { kind: 'community', key: `community:${parts[2]}`, id: parts[2], label: `X community ${parts[2].slice(-6)}`, url };
  if (parts[0] === 'i' && parts[1] === 'status' && /^\d+$/.test(parts[2] || '')) return { kind: 'tweet', key: `tweet:${parts[2]}`, handle: null, id: parts[2], label: 'a tweet', url };
  const handle = (parts[0] || '').replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(handle) || RESERVED.has(handle)) return { kind: 'other', key: `url:${m[1].toLowerCase()}`, label: 'an X link', url };
  if (parts[1] === 'status' && /^\d+$/.test(parts[2] || '')) return { kind: 'tweet', key: `@${handle}`, handle, id: parts[2], label: `a tweet by @${handle}`, url };
  return { kind: 'profile', key: `@${handle}`, handle, label: `@${handle}`, url };
}

export function parseSite(url) {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const root = host.split('.').slice(-2).join('.');
    return { host, root, url };
  } catch { return null; }
}
const parseTg = (url) => { const m = String(url || '').match(/(?:t|telegram)\.me\/([^/?#]+)/i); return m ? m[1].toLowerCase() : null; };

const famousHandle = (h) => !!h && config.famousHandles.has(h);
const famousSite = (s) => !!s && (config.famousDomains.has(s.host) || config.famousDomains.has(s.root));

// ── optional X profile lookup (no key needed) ───────────────────────────
const profiles = new Map();
export async function xProfile(handle) {
  if (!config.X_PROFILE_API || !handle) return null;
  const hit = profiles.get(handle);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.v;
  let v = null;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), config.X_PROFILE_TIMEOUT_MS);
    const r = await fetch(`${config.X_PROFILE_API.replace(/\/$/, '')}/${encodeURIComponent(handle)}`, { signal: ctl.signal, headers: { Accept: 'application/json', 'User-Agent': 'Hoodey/1.0' } });
    clearTimeout(timer);
    if (r.ok) {
      const j = await r.json();
      const u = j.user || j;
      if (u && (u.screen_name || u.name)) {
        v = {
          handle: String(u.screen_name || handle).toLowerCase(),
          name: u.name || '',
          bio: String(u.description || ''),
          website: (u.website && (u.website.url || u.website.display_url)) || '',
          followers: Number(u.followers) || 0,
          createdAt: u.joined ? new Date(u.joined).toISOString() : null,
          verified: !!(u.verification && u.verification.verified)
        };
        if (v.createdAt === 'Invalid Date') v.createdAt = null;
      }
    } else if (r.status === 404) v = { missing: true };
  } catch (e) { log.debug('x profile', handle, e.message); }
  profiles.set(handle, { at: Date.now(), v });
  if (profiles.size > 2000) profiles.delete(profiles.keys().next().value);
  return v;
}

// ── who used which link, across every launch in the window ──────────────
export function linkIndex(launches) {
  const byX = new Map(), bySite = new Map(), byTg = new Map();
  const add = (m, k, l) => { if (!k) return; let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(l); };
  for (const l of launches) {
    const x = parseX(l.links && l.links.x);
    const s = parseSite(l.links && l.links.website);
    add(byX, x && x.key, l);
    add(bySite, s && s.host, l);
    add(byTg, parseTg(l.links && l.links.telegram), l);
  }
  for (const m of [byX, bySite, byTg]) for (const a of m.values()) a.sort((p, q) => p.t - q.t);
  return { byX, bySite, byTg };
}

// quick, sync verdict for lists (no profile lookup)
export function quickFlag(l, idx) {
  const x = parseX(l.links && l.links.x);
  const s = parseSite(l.links && l.links.website);
  if (x && famousHandle(x.handle)) return { kind: 'famous', label: `Uses @${x.handle}` };
  if (s && famousSite(s)) return { kind: 'famous', label: `Uses ${s.host}` };
  if (x) {
    const users = idx.byX.get(x.key) || [];
    if (users.length > 1 && users[0].address !== l.address) return { kind: 'reused', label: `${x.label} taken from $${users[0].symbol}` };
    if (x.kind === 'tweet') return { kind: 'tweet', label: `Links ${x.label}` };
  }
  return null;
}

// ── full scan ───────────────────────────────────────────────────────────
export async function scanLarp(l, launches, idx, { profile = true } = {}) {
  const reasons = [];
  const add = (pts, text, short) => reasons.push({ pts, text, short });
  const x = parseX(l.links && l.links.x);
  const site = parseSite(l.links && l.links.website);
  const tg = parseTg(l.links && l.links.telegram);
  const ago = (a, b) => { const m = Math.round(Math.abs(b.t - a.t) / 60000); return m < 60 ? `${m} min` : `${Math.round(m / 60)}h`; };
  let xUsers = [], siteUsers = [], tgUsers = [], prof = null;

  if (!x && !site && !tg) add(0, 'No X, Telegram or website in the launch. Nothing to borrow, but nothing to check either.', 'NO SOCIALS');

  if (x) {
    xUsers = idx.byX.get(x.key) || [];
    const first = xUsers[0];
    if (x.handle && famousHandle(x.handle)) add(55, `Links @${x.handle}, a famous account that is not a memecoin team.`, `USES @${x.handle}`.toUpperCase());
    if (x.kind === 'tweet') add(x.handle && famousHandle(x.handle) ? 15 : 20, `Links ${x.label} instead of an own account. Pointing at a tweet borrows its buzz.`, 'LINKS A TWEET');
    if (x.kind === 'community') add(5, 'Links an X community, not an account. Anyone can point at a community.', 'X COMMUNITY');
    if (first && first.address !== l.address) {
      const otherDev = first.creator !== l.creator;
      add(otherDev ? 40 : 20, `${x.label} was first used by $${first.symbol} ${ago(first, l)} earlier${otherDev ? ', from a different deployer' : ' by the same deployer'}.`, `X TAKEN FROM $${first.symbol}`.toUpperCase());
    }
    const later = xUsers.filter((o) => o.t > l.t);
    if (later.length && first && first.address === l.address) add(0, `First to use ${x.label}. ${later.length} later launch${later.length === 1 ? '' : 'es'} copied it.`, 'FIRST TO USE IT');
    if (x.handle && x.kind !== 'tweet' && !famousHandle(x.handle)) {
      const sim = Math.max(nameSimilarity(x.handle, l.name), nameSimilarity(x.handle, l.symbol), normalizeName(x.handle).includes(normalizeName(l.symbol)) ? 1 : 0);
      if (sim < 0.35) add(10, `@${x.handle} has nothing in common with the name "${l.name}" or $${l.symbol}.`, 'NAME MISMATCH');
    }
    if (profile && x.handle) {
      prof = await xProfile(x.handle);
      if (prof && prof.missing) add(15, `@${x.handle} does not exist or is suspended.`, 'ACCOUNT GONE');
      else if (prof) {
        const text = `${prof.bio} ${prof.website}`.toLowerCase();
        const mentions = text.includes(l.address.toLowerCase()) || text.includes(l.address.slice(2, 10).toLowerCase()) || new RegExp(`\\$${l.symbol.toLowerCase().replace(/[^a-z0-9]/g, '')}\\b`).test(text);
        const ageDays = prof.createdAt ? (l.t - Date.parse(prof.createdAt)) / 86400e3 : null;
        if (mentions) add(-35, `@${x.handle}'s bio names this token, so the account likely belongs to the team.`, 'BIO NAMES THE TOKEN');
        else {
          if (ageDays != null && ageDays > 60) add(20, `@${x.handle} is ${ageDays > 730 ? Math.round(ageDays / 365) + ' years' : Math.round(ageDays / 30) + ' months'} older than this token and its bio never mentions it.`, 'OLD ACCOUNT, NO MENTION');
          if (prof.followers >= 25000) add(15, `@${x.handle} has ${prof.followers.toLocaleString('en-US')} followers and no word about this token.`, 'BIG ACCOUNT, NO MENTION');
        }
      }
    }
  }
  if (site) {
    siteUsers = idx.bySite.get(site.host) || [];
    if (famousSite(site)) add(40, `Lists ${site.host} as its website: a famous company's site.`, `USES ${site.host}`.toUpperCase());
    else if (siteUsers[0] && siteUsers[0].address !== l.address) add(20, `${site.host} was first listed by $${siteUsers[0].symbol} ${ago(siteUsers[0], l)} earlier.`, `SITE TAKEN FROM $${siteUsers[0].symbol}`.toUpperCase());
  }
  if (tg) {
    tgUsers = idx.byTg.get(tg) || [];
    if (tgUsers[0] && tgUsers[0].address !== l.address) add(15, `Telegram t.me/${tg} was first used by $${tgUsers[0].symbol}.`, `TG TAKEN FROM $${tgUsers[0].symbol}`.toUpperCase());
  }

  const score = Math.max(0, Math.min(100, reasons.reduce((a, r) => a + r.pts, 0)));
  const verdict = score >= 55 ? 'high' : score >= 25 ? 'medium' : 'low';
  const row = (o) => ({ address: o.address, symbol: o.symbol, name: o.name, hasImage: !!o.image, at: o.at, creator: o.creator, self: o.address === l.address, sameDeployer: o.creator === l.creator });
  return {
    score, verdict,
    reasons: reasons.sort((a, b) => b.pts - a.pts),
    links: {
      x: x ? { kind: x.kind, handle: x.handle || null, label: x.label, url: x.url, famous: famousHandle(x.handle) } : null,
      website: site ? { host: site.host, url: site.url, famous: famousSite(site) } : null,
      telegram: tg ? { handle: tg, url: `https://t.me/${tg}` } : null
    },
    profile: prof && !prof.missing ? prof : null,
    sharedX: xUsers.map(row),
    sharedSite: siteUsers.length > 1 ? siteUsers.map(row) : [],
    sharedTg: tgUsers.length > 1 ? tgUsers.map(row) : []
  };
}

// accounts and sites borrowed most in the window
export function larpBoard(launches, idx, limit = 12) {
  const accounts = [];
  for (const [key, users] of idx.byX) {
    const x = parseX(users[0].links.x);
    const famous = famousHandle(x && x.handle);
    if (users.length < 2 && !famous) continue;
    const devs = new Set(users.map((u) => u.creator)).size;
    accounts.push({ key, label: x ? x.label : key, url: x ? x.url : null, kind: x ? x.kind : 'other', famous, uses: users.length, deployers: devs, lastAt: users[users.length - 1].at,
      first: { address: users[0].address, symbol: users[0].symbol, hasImage: !!users[0].image },
      tokens: users.slice(-6).reverse().map((u) => ({ address: u.address, symbol: u.symbol, hasImage: !!u.image, at: u.at })) });
  }
  accounts.sort((a, b) => (b.famous - a.famous) || b.uses - a.uses || Date.parse(b.lastAt) - Date.parse(a.lastAt));
  const recent = launches.slice().sort((a, b) => b.t - a.t).slice(0, 300)
    .map((l) => ({ l, f: quickFlag(l, idx) })).filter((x) => x.f).slice(0, limit)
    .map(({ l, f }) => ({ address: l.address, symbol: l.symbol, name: l.name, hasImage: !!l.image, at: l.at, flag: f }));
  const withX = launches.filter((l) => l.links && l.links.x).length;
  const flagged = launches.filter((l) => quickFlag(l, idx)).length;
  return { accounts: accounts.slice(0, limit), recent, stats: { launches: launches.length, withX, flagged, flaggedPct: withX ? Math.round((flagged / withX) * 100) : 0 } };
}
