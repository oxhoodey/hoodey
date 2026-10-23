// Every setting Hoodey uses lives here, read from environment variables.
// On Railway, set them under the service's "Variables" tab.
// This list is also the source for .env.example (run `npm run env:example`).

export const VARIABLES = [
  // ── App ──────────────────────────────────────────────────────────────
  { group: 'App', name: 'PORT', type: 'int', default: 3000, desc: 'Port the server listens on. Railway sets this for you; leave it empty there.' },
  { group: 'App', name: 'NODE_ENV', type: 'string', default: 'production', desc: 'production or development.' },
  { group: 'App', name: 'APP_NAME', type: 'string', default: 'Hoodey', public: true, desc: 'Name shown in the header, page titles and alerts.' },
  { group: 'App', name: 'APP_TAGLINE', type: 'string', default: "Every launch has a cabal. Every token has a clock. Don't be their exit.", public: true, desc: 'Short line used in page descriptions and link previews.' },
  { group: 'App', name: 'PUBLIC_URL', type: 'string', default: '', public: true, desc: 'Public address of the site, e.g. https://hoodey.up.railway.app. Used for link previews.' },
  { group: 'App', name: 'LOG_LEVEL', type: 'enum', options: ['debug', 'info', 'warn', 'error'], default: 'info', desc: 'How much the server logs.' },

  // ── Data ─────────────────────────────────────────────────────────────
  { group: 'Data', name: 'DATA_MODE', type: 'enum', options: ['sample', 'live'], default: 'sample', public: true, desc: 'sample = built-in demo data, no keys needed. live = read Robinhood Chain (see DATA_SOURCE); any section that cannot load falls back to sample and says so.' },
  { group: 'Data', name: 'DATA_SOURCE', type: 'enum', options: ['chain', 'bitquery'], default: 'chain', desc: 'Where live data comes from. chain = Hoodey reads Pons launches and trades itself over RH_RPC_URL and takes prices from DexPaprika (free, no keys). bitquery = the older Bitquery setup (needs BITQUERY_API_KEY and uses its points).' },
  { group: 'Data', name: 'CACHE_TTL_SECONDS', type: 'int', default: 30, desc: 'How long API answers are cached on the server.' },
  { group: 'Data', name: 'REFRESH_INTERVAL_SECONDS', type: 'int', default: 60, public: true, desc: 'How often open pages refresh their data.' },
  { group: 'Data', name: 'REQUEST_TIMEOUT_MS', type: 'int', default: 10000, desc: 'Timeout for calls to Bitquery and the RPC.' },

  // ── Robinhood Chain ──────────────────────────────────────────────────
  { group: 'Robinhood Chain', name: 'RH_CHAIN_ID', type: 'int', default: 4663, public: true, desc: 'Robinhood Chain mainnet chain ID.' },
  { group: 'Robinhood Chain', name: 'RH_RPC_URL', type: 'string', default: 'https://rpc.mainnet.chain.robinhood.com', secret: true, desc: 'JSON-RPC endpoint for Robinhood Chain. With DATA_SOURCE=chain every launch and trade is read through it, so a private endpoint (QuickNode, Alchemy, Chainstack…) is steadier than the public default.' },
  { group: 'Robinhood Chain', name: 'RH_EXPLORER_URL', type: 'string', default: '', public: true, desc: 'Block explorer base URL. When set, addresses link to it (e.g. <url>/address/0x…).' },
  { group: 'Robinhood Chain', name: 'PONS_TOKEN_URL', type: 'string', default: 'https://ponsfamily.com/launchpad/', public: true, desc: 'Token page on Pons. The token address is appended, so every token links to <url>0x…. Leave empty to hide the Pons links.' },
  { group: 'Robinhood Chain', name: 'INDEX_BACKFILL_HOURS', type: 'int', default: 6, desc: 'On start, how many hours of past launches and trades the chain indexer reads before going live. More hours = longer start and more RPC calls.' },
  { group: 'Robinhood Chain', name: 'INDEX_KEEP_HOURS', type: 'int', default: 24, desc: 'How many hours of launches and trades the indexer keeps in memory (deployer history, Copycat matches, launch clock).' },
  { group: 'Robinhood Chain', name: 'INDEX_POLL_SECONDS', type: 'int', default: 10, desc: 'How often the indexer reads new blocks. Lower = fresher data, more RPC calls.' },
  { group: 'Robinhood Chain', name: 'INDEX_CHUNK_BLOCKS', type: 'int', default: 10000, desc: 'Blocks per eth_getLogs call. Lower it if your RPC rejects large ranges.' },
  { group: 'Robinhood Chain', name: 'DEXPAPRIKA_URL', type: 'string', default: 'https://api.dexpaprika.com', desc: 'DexPaprika API (free, no key). Gives stock token prices and ETH/USD.' },
  { group: 'Robinhood Chain', name: 'DEXPAPRIKA_NETWORK', type: 'string', default: 'robinhood', desc: 'DexPaprika network id for Robinhood Chain.' },
  { group: 'Robinhood Chain', name: 'PRICE_REFRESH_SECONDS', type: 'int', default: 60, desc: 'How often stock token prices and ETH/USD are refreshed from DexPaprika.' },
  { group: 'Robinhood Chain', name: 'BITQUERY_API_KEY', type: 'string', default: '', secret: true, desc: 'Bitquery access token. Only used when DATA_SOURCE=bitquery.' },
  { group: 'Robinhood Chain', name: 'BITQUERY_ENDPOINT', type: 'string', default: 'https://streaming.bitquery.io/graphql', desc: 'Bitquery GraphQL endpoint.' },
  { group: 'Robinhood Chain', name: 'BITQUERY_DATASET', type: 'enum', options: ['realtime', 'archive', 'combined'], default: 'realtime', desc: 'Bitquery dataset for EVM queries. realtime works on every plan; archive and combined reach further back but need the Robinhood archive add-on.' },
  { group: 'Robinhood Chain', name: 'PONS_FACTORY_ADDRESS', type: 'string', default: '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e', desc: 'Pons launch factory contract.' },
  { group: 'Robinhood Chain', name: 'PONS_ROUTER_ADDRESS', type: 'string', default: '0xe33e9e479df8802cb0866d5d05258bec4cf62948', desc: 'Pons router contract.' },
  { group: 'Robinhood Chain', name: 'LIVE_CACHE_SECONDS', type: 'int', default: 120, desc: 'DATA_SOURCE=bitquery only: how long Bitquery results are reused before a background refresh.' },
  { group: 'Robinhood Chain', name: 'BITQUERY_MIN_INTERVAL_MS', type: 'int', default: 1500, desc: 'Minimum gap between Bitquery requests. Raise it (e.g. 4000) on plans with a low requests-per-minute limit.' },
  { group: 'Robinhood Chain', name: 'LAUNCH_LIMIT', type: 'int', default: 300, desc: 'DATA_SOURCE=bitquery only: how many recent launches to pull per refresh.' },

  // ── Radar ────────────────────────────────────────────────────────────
  { group: 'Radar', name: 'STOCK_TOKENS', type: 'string', default: 'TSLA:Tesla:0x322F0929c4625eD5bAd873c95208D54E1c003b2d,NVDA:Nvidia:0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC,AAPL:Apple:0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9,COIN:Coinbase:0x6330D8C3178a418788dF01a47479c0ce7CCF450b,MSTR:MicroStrategy:0xec262a75e413fAfD0dF80480274532C79D42da09,META:Meta:0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35', public: true, desc: 'Stock tokens to watch, comma separated, as TICKER:Name:tokenAddress. The address is needed for live price moves.' },
  { group: 'Radar', name: 'STOCK_KEYWORDS', type: 'string', default: 'TSLA=tesla|elon|musk|cyber|tsla|cybertruck;NVDA=nvidia|nvda|gpu|jensen|leather;AAPL=apple|aapl|iphone;COIN=coinbase|armstrong;MSTR=microstrategy|mstr|saylor;META=zuck|zuckerberg|facebook;GME=gamestop|gme|stonk|squeeze|kitty', desc: 'Words that tie a memecoin to a stock. TICKER=word|word;TICKER=word…' },
  { group: 'Radar', name: 'SPIKE_THRESHOLD_PCT', type: 'float', default: 5, public: true, desc: 'A stock token move of at least this many percent counts as a spike.' },
  { group: 'Radar', name: 'SPIKE_MIN_TRADES', type: 'int', default: 3, desc: 'Trades in the window needed before a move counts as a spike. Stops a single odd trade in a thin market from triggering the radar.' },
  { group: 'Radar', name: 'SPIKE_LOOKBACK_HOURS', type: 'int', default: 6, public: true, desc: 'Default time window for the radar (1, 6 or 24 are offered in the UI).' },
  { group: 'Radar', name: 'RADAR_MAX_TOKENS', type: 'int', default: 12, desc: 'Most themed tokens listed per spike.' },

  { group: 'Radar', name: 'TRENDING_WINDOW_MIN', type: 'int', default: 60, public: true, desc: 'Minutes of Pons trades the "Hot right now" board ranks.' },
  { group: 'Radar', name: 'TRENDING_TRADE_LIMIT', type: 'int', default: 3000, desc: 'DATA_SOURCE=bitquery only: how many of the latest trades to scan for the "Hot right now" board.' },
  { group: 'Radar', name: 'TRENDING_MAX_ROWS', type: 'int', default: 20, desc: 'Most tokens shown on the "Hot right now" board.' },

  // ── Copycat Eye ──────────────────────────────────────────────────────
  { group: 'Copycat Eye', name: 'COPYCAT_NAME_THRESHOLD', type: 'float', default: 0.7, public: true, desc: 'Name similarity (0–1) above which a token is flagged as a copy.' },
  { group: 'Copycat Eye', name: 'COPYCAT_IMAGE_THRESHOLD', type: 'float', default: 0.8, public: true, desc: 'Image similarity (0–1) above which a token is flagged as a copy (used once image matching is enabled).' },
  { group: 'Token images', name: 'IPFS_GATEWAY', type: 'string', default: 'https://ipfs.filebase.io/ipfs/', desc: 'IPFS gateway for token logos (ipfs://… images). The public Filebase gateway works without an account; a Filebase dedicated gateway (https://<name>.myfilebase.com/ipfs/) is faster and can resize.' },
  { group: 'Token images', name: 'IPFS_IMAGE_PARAMS', type: 'string', default: '', desc: 'Extra query added to IPFS image URLs. Only for a Filebase dedicated gateway, e.g. img-width=128&img-height=128&img-fit=cover&img-format=webp. Leave empty on the public gateway (it refuses resizing).' },
  { group: 'Token images', name: 'IMAGE_CACHE_MB', type: 'int', default: 64, desc: 'Memory the server may use to keep token logos.' },
  { group: 'Token images', name: 'IMAGE_MAX_KB', type: 'int', default: 3072, desc: 'Largest logo file the server will fetch.' },
  { group: 'Token images', name: 'IMAGE_TIMEOUT_MS', type: 'int', default: 8000, desc: 'Timeout for fetching one logo.' },

  // ── Cabal Eye ────────────────────────────────────────────────────────
  { group: 'LARP Scanner', name: 'LARP_FAMOUS_HANDLES', type: 'string', default: 'elonmusk,tesla,spacex,xai,grok,x,robinhoodapp,robinhood,vladtenev,nvidia,apple,microsoft,google,openai,sama,anthropicai,cz_binance,binance,coinbase,brian_armstrong,base,jessepollak,vitalikbuterin,ethereum,solana,saylor,strategy,realdonaldtrump,potus,whitehouse,cathiedwood,arkinvest,gamestop,theroaringkitty,ponsfamily,arbitrum', desc: 'X accounts that are famous and never a memecoin team (comma separated, no @). A token that links to one of these is flagged as borrowing it.' },
  { group: 'LARP Scanner', name: 'LARP_FAMOUS_DOMAINS', type: 'string', default: 'tesla.com,spacex.com,x.com,twitter.com,x.ai,robinhood.com,nvidia.com,apple.com,microsoft.com,google.com,openai.com,anthropic.com,binance.com,coinbase.com,base.org,ethereum.org,solana.com,strategy.com,whitehouse.gov,gamestop.com,ponsfamily.com,arbitrum.io', desc: 'Websites of famous companies (comma separated). A token that lists one of these as its own site is flagged.' },
  { group: 'LARP Scanner', name: 'X_PROFILE_API', type: 'string', default: 'https://api.fxtwitter.com', desc: 'Public API used to read an X profile (age, followers, bio) without an X key. Leave empty to skip profile checks.' },
  { group: 'LARP Scanner', name: 'X_PROFILE_TIMEOUT_MS', type: 'int', default: 5000, desc: 'Timeout for one X profile lookup.' },
  { group: 'Cabal Eye', name: 'CABAL_EARLY_SECONDS', type: 'int', default: 60, public: true, desc: 'Seconds after launch that count as "early" buying.' },
  { group: 'Cabal Eye', name: 'CABAL_SNIPER_SECONDS', type: 'int', default: 10, public: true, desc: 'A first buy within this many seconds of launch is tagged Sniper.' },
  { group: 'Cabal Eye', name: 'CABAL_EARLY_MAX', type: 'int', default: 25, desc: 'Most early buyers looked at per launch.' },
  { group: 'Cabal Eye', name: 'CABAL_MIN_SHARED', type: 'int', default: 3, public: true, desc: 'Cabal Map: two wallets are linked when they bought early in at least this many of the same launches.' },
  { group: 'Cabal Eye', name: 'CABAL_MIN_MEMBERS', type: 'int', default: 3, desc: 'Cabal Map: smallest crew shown.' },
  { group: 'Cabal Eye', name: 'CABAL_MAX_WALLETS', type: 'int', default: 40, desc: 'Cabal Scan: most wallets listed.' },
  { group: 'Cabal Eye', name: 'CABAL_MAP_MAX', type: 'int', default: 24, desc: 'Cabal Map: most crews listed.' },

  // ── Market Clock ─────────────────────────────────────────────────────
  { group: 'Market Clock', name: 'MARKET_TIMEZONE', type: 'string', default: 'America/New_York', public: true, desc: 'Time zone of the exchange.' },
  { group: 'Market Clock', name: 'MARKET_PREMARKET_OPEN', type: 'time', default: '04:00', public: true, desc: 'Pre-market start, HH:MM in exchange time.' },
  { group: 'Market Clock', name: 'MARKET_OPEN', type: 'time', default: '09:30', public: true, desc: 'Regular session open.' },
  { group: 'Market Clock', name: 'MARKET_CLOSE', type: 'time', default: '16:00', public: true, desc: 'Regular session close.' },
  { group: 'Market Clock', name: 'MARKET_AFTERHOURS_CLOSE', type: 'time', default: '20:00', public: true, desc: 'After-hours end.' },
  { group: 'Market Clock', name: 'MARKET_HOLIDAYS', type: 'string', default: '2026-11-26,2026-12-25,2027-01-01,2027-01-18,2027-02-15,2027-03-26,2027-05-31,2027-06-18,2027-07-05,2027-09-06,2027-11-25,2027-12-24', public: true, desc: 'Full-day exchange holidays, YYYY-MM-DD, comma separated. Check the exchange calendar each year.' },

  // ── Alerts (Telegram) ────────────────────────────────────────────────
  { group: 'Alerts', name: 'TELEGRAM_BOT_USERNAME', type: 'string', default: '', public: true, desc: 'Bot or channel username without @. The "Get alerts" button opens t.me/<this>.' },
  { group: 'Alerts', name: 'TELEGRAM_BOT_TOKEN', type: 'string', default: '', secret: true, desc: 'Bot token from @BotFather. Needed only for the server to post alerts.' },
  { group: 'Alerts', name: 'TELEGRAM_CHAT_ID', type: 'string', default: '', desc: 'Channel or group ID the server posts alerts to, e.g. @hoodey_alerts or -100…' },
  { group: 'Alerts', name: 'ALERTS_ENABLED', type: 'bool', default: false, desc: 'Post spike alerts to Telegram.' },
  { group: 'Alerts', name: 'ALERT_MIN_MOVE_PCT', type: 'float', default: 5, desc: 'Only alert on stock moves of at least this many percent.' },
  { group: 'Alerts', name: 'OPENING_BELL_BRIEF_ENABLED', type: 'bool', default: false, desc: 'Post a brief to Telegram before the regular session opens.' },
  { group: 'Alerts', name: 'OPENING_BELL_MINUTES_BEFORE', type: 'int', default: 30, public: true, desc: 'Minutes before the open to post the brief.' },

  // ── Links ────────────────────────────────────────────────────────────
  { group: 'Links', name: 'LINK_X', type: 'string', default: '', public: true, desc: 'X (Twitter) profile URL.' },
  { group: 'Links', name: 'LINK_TELEGRAM', type: 'string', default: '', public: true, desc: 'Telegram community URL.' },
  { group: 'Links', name: 'LINK_DOCS', type: 'string', default: '', public: true, desc: 'Docs URL.' },
  { group: 'Links', name: 'ROADMAP_VOTE_URL', type: 'string', default: '', public: true, desc: 'Where the "Vote on the roadmap" button goes. Hidden when empty.' },
  { group: 'Links', name: 'TOKEN_CONTRACT_ADDRESS', type: 'string', default: '', public: true, desc: '$HOODEY contract address, shown in the footer when set.' },
  { group: 'Links', name: 'TOKEN_BUY_URL', type: 'string', default: '', public: true, desc: 'Link to buy $HOODEY, shown in the footer when set.' },

  // ── Theme ────────────────────────────────────────────────────────────
  { group: 'Theme', name: 'THEME_ACCENT', type: 'color', default: '#00C805', public: true, desc: 'Main accent color (buttons, gauges, bars).' },
  { group: 'Theme', name: 'THEME_ACCENT_INK', type: 'color', default: '#078A33', public: true, desc: 'Darker accent used for text and chart lines on white.' },
  { group: 'Theme', name: 'THEME_BG', type: 'color', default: '#F7FAF8', public: true, desc: 'Page background.' },
  { group: 'Theme', name: 'BG_ANIMATION_ENABLED', type: 'bool', default: true, public: true, desc: 'Animated 3D dot field behind the pages.' },

  // ── Features ─────────────────────────────────────────────────────────
  { group: 'Follow gate', name: 'FOLLOW_GATE', type: 'bool', default: true, public: true, desc: 'Ask visitors to follow the X account before they can run more scans. Links shared on X still open their scan without asking.' },
  { group: 'Follow gate', name: 'FOLLOW_GATE_HANDLE', type: 'string', default: 'oxhoodey', public: true, desc: 'X username to follow (no @).' },
  { group: 'Follow gate', name: 'FOLLOW_GATE_FREE_SCANS', type: 'int', default: 1, public: true, desc: 'Scans a visitor can run before the follow prompt appears.' },
  { group: 'Features', name: 'FEATURE_RADAR', type: 'bool', default: true, public: true, desc: 'Show Stock → Meme Radar.' },
  { group: 'Features', name: 'FEATURE_COPYCAT', type: 'bool', default: true, public: true, desc: 'Show Copycat Eye.' },
  { group: 'Features', name: 'FEATURE_CABAL', type: 'bool', default: true, public: true, desc: 'Show Cabal Eye (Cabal Scan and Cabal Map).' },
  { group: 'Features', name: 'FEATURE_XRAY', type: 'bool', default: true, public: true, desc: 'Show X-Ray (Death Clock for tokens, Wallet X-Ray for wallets).' },
  { group: 'Features', name: 'FEATURE_LARP', type: 'bool', default: true, public: true, desc: 'Show LARP Scanner (tokens that borrow someone else\'s X account or website).' },
  { group: 'Features', name: 'FEATURE_CLOCK', type: 'bool', default: true, public: true, desc: 'Show Market Clock.' },
  { group: 'Features', name: 'FEATURE_FAMILY', type: 'bool', default: true, public: true, desc: 'Show Narrative Family Tree.' },
  { group: 'Features', name: 'FEATURE_ROADMAP', type: 'bool', default: true, public: true, desc: 'Show Roadmap.' },
  { group: 'Features', name: 'FEATURE_WALLET_WATCH', type: 'bool', default: true, public: true, desc: 'Show the Wallet Watch box on the radar.' },

  // ── Security ─────────────────────────────────────────────────────────
  { group: 'Security', name: 'RATE_LIMIT_PER_MINUTE', type: 'int', default: 120, desc: 'API requests allowed per visitor IP per minute.' },
  { group: 'Security', name: 'ALLOWED_HOSTS', type: 'string', default: '', desc: 'Domains allowed to serve Hoodey, comma separated (e.g. hoodey-production.up.railway.app,hoodey.xyz). The PUBLIC_URL domain is always allowed. Requests for any other domain are sent to PUBLIC_URL, and copies of the site opened elsewhere show a "this is a copy" notice.' },
  { group: 'Security', name: 'COPY_LOCK', type: 'bool', default: true, desc: 'Pages opened on a domain that is not ours (a saved or mirrored copy) stop working and point visitors to the real site.' },
  { group: 'Security', name: 'API_GUARD', type: 'bool', default: true, desc: 'The API only answers pages served by this server: each page carries a signed key that expires after 2 days. Copied frontends that call our API get nothing.' },
  { group: 'Security', name: 'GUARD_SECRET', type: 'string', default: '', secret: true, desc: 'Secret used to sign page keys. Set any long random text so keys survive restarts; if empty a new one is made on every start.' },
  { group: 'Security', name: 'HOTLINK_GUARD', type: 'bool', default: true, desc: 'Other websites cannot embed our scripts, styles, token images or share cards. X and Telegram previews still work.' },
  { group: 'Security', name: 'CORS_ORIGINS', type: 'string', default: '', desc: 'Other sites allowed to call the API, comma separated. Empty = same site only.' },
  { group: 'Security', name: 'TRUST_PROXY', type: 'bool', default: true, desc: 'Read the visitor IP from X-Forwarded-For (correct behind Railway).' }
];

// Returns [ok, value]. ok=false means the variable was set but could not be read.
function parse(v) {
  const raw = process.env[v.name];
  if (raw === undefined || raw === '') return [true, v.default];
  const s = String(raw).trim();
  switch (v.type) {
    case 'int': { const n = Number(s); return Number.isInteger(n) ? [true, n] : [false, v.default]; }
    case 'float': { const n = Number(s); return Number.isFinite(n) ? [true, n] : [false, v.default]; }
    case 'bool': {
      const l = s.toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(l)) return [true, true];
      if (['0', 'false', 'no', 'off'].includes(l)) return [true, false];
      return [false, v.default];
    }
    case 'enum': return v.options.includes(s) ? [true, s] : [false, v.default];
    case 'color': return /^#[0-9a-fA-F]{3,8}$/.test(s) ? [true, s] : [false, v.default];
    case 'time': return /^([01]?\d|2[0-3]):[0-5]\d$/.test(s) ? [true, s] : [false, v.default];
    default: return [true, s];
  }
}

function loadValues() {
  const values = {};
  const warnings = [];
  for (const v of VARIABLES) {
    const [ok, value] = parse(v);
    if (!ok) warnings.push(`${v.name}="${process.env[v.name]}" is not a valid ${v.type}${v.options ? ' (' + v.options.join('|') + ')' : ''}; using default ${JSON.stringify(v.default)}`);
    values[v.name] = value;
  }
  return { values, warnings };
}

function parseStocks(str) {
  return String(str || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [ticker, name, address] = s.split(':').map((x) => (x || '').trim());
      return { ticker: ticker.toUpperCase(), name: name || ticker.toUpperCase(), address: /^0x[0-9a-fA-F]{40}$/.test(address || '') ? address.toLowerCase() : '' };
    })
    .filter((s) => s.ticker);
}

function parseKeywords(str) {
  const out = {};
  String(str || '').split(';').forEach((part) => {
    const [t, words] = part.split('=');
    if (!t || !words) return;
    out[t.trim().toUpperCase()] = words.split('|').map((w) => w.trim().toLowerCase()).filter(Boolean);
  });
  return out;
}

const { values, warnings } = loadValues();

export const config = {
  ...values,
  stocks: parseStocks(values.STOCK_TOKENS),
  famousHandles: new Set(String(values.LARP_FAMOUS_HANDLES || '').split(',').map((x) => x.trim().replace(/^@/, '').toLowerCase()).filter(Boolean)),
  famousDomains: new Set(String(values.LARP_FAMOUS_DOMAINS || '').split(',').map((x) => x.trim().replace(/^www\./, '').toLowerCase()).filter(Boolean)),
  keywords: parseKeywords(values.STOCK_KEYWORDS),
  holidays: String(values.MARKET_HOLIDAYS).split(',').map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
  allowedHosts: String(values.ALLOWED_HOSTS || '').split(',').map((x) => x.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean),
  corsOrigins: String(values.CORS_ORIGINS).split(',').map((s) => s.trim()).filter(Boolean),
  liveReady: values.DATA_MODE === 'live' && (values.DATA_SOURCE === 'bitquery' ? !!values.BITQUERY_API_KEY : !!values.RH_RPC_URL),
  warnings
};

// Everything the browser is allowed to see. Secrets are never included.
export function publicConfig() {
  const pub = {};
  for (const v of VARIABLES) {
    if (v.public && !v.secret) pub[v.name] = config[v.name];
  }
  return {
    ...pub,
    stocks: config.stocks.map((s) => ({ ticker: s.ticker, name: s.name })),
    holidays: config.holidays,
    features: {
      radar: config.FEATURE_RADAR,
      copycat: config.FEATURE_COPYCAT,
      cabal: config.FEATURE_CABAL,
      xray: config.FEATURE_XRAY,
      larp: config.FEATURE_LARP,
      clock: config.FEATURE_CLOCK,
      family: config.FEATURE_FAMILY,
      roadmap: config.FEATURE_ROADMAP,
      walletWatch: config.FEATURE_WALLET_WATCH
    },
    alertsUrl: config.TELEGRAM_BOT_USERNAME ? `https://t.me/${config.TELEGRAM_BOT_USERNAME.replace(/^@/, '')}` : (config.LINK_TELEGRAM || ''),
    liveReady: config.liveReady
  };
}
