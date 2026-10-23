# Hoodey

Read-only memecoin intelligence for **Robinhood Chain**. No wallet connection, no signatures.

- **Stock → Meme Radar**: when a stock token moves, see every themed memecoin that launches after it.
- **Copycat Eye**: paste a contract and see which older tokens it copies, plus the deployer's track record.
- **Cabal Eye**: Cabal Scan scores a launch for snipers, same-block bundles and crews; Cabal Map shows wallet crews that buy together.
- **X-Ray**: paste a token for its **Death Clock** (how long launches born the same way lived) or a wallet for its **Wallet X-Ray** (sniper, crew, farmer, flipper, exit liquidity, with PnL and trader DNA). Both have share cards for X.
- **LARP Scanner**: flags launches that wear someone else's identity: a famous X account or website, someone's tweet, or links an earlier launch already used. Optional X profile check (age, followers, bio).
- **Market Clock**: exchange sessions, overnight gaps, and the hours meme waves start.
- **Narrative Family Tree**: which token came first on a narrative and which ones cloned it.
- **Wallet Watch**: paste any address to mirror its meme trading.
- **Roadmap**: edit `data/roadmap.json`.

Plain Node.js (20+) with **zero dependencies**: no build step, nothing to install. Every setting is an environment variable, so on Railway you change the site from the **Variables** tab without touching code.

## Run locally

```bash
cp .env.example .env      # optional, defaults work
node --env-file=.env server/index.js
# or simply: npm start
```

Open http://localhost:3000. With the defaults (`DATA_MODE=sample`) every page shows built-in demo data, labelled "Sample data".

## Deploy: GitHub → Railway

1. **Push to GitHub**
   ```bash
   git init && git add . && git commit -m "Hoodey"
   git branch -M main
   git remote add origin https://github.com/<you>/hoodey.git
   git push -u origin main
   ```
2. **Create the Railway service**: Railway → *New Project* → *Deploy from GitHub repo* → pick the repo. Railway detects Node, runs `npm start`, and checks `/healthz` (see `railway.json`).
3. **Add a domain**: service → *Settings* → *Networking* → *Generate Domain*. Put that URL in `PUBLIC_URL`.
4. **Set variables**: service → *Variables* → *Raw Editor*, paste the contents of `.env.example`, then change what you need. Every push to `main` redeploys; every variable change restarts the service with the new value.

Do not set `PORT` on Railway; it provides one.

### Going live

Sample mode needs nothing. For real Robinhood Chain data:

| Set | Why |
|---|---|
| `DATA_MODE=live` | Switch from demo data to chain data. |
| `BITQUERY_API_KEY` | Pons launches, stock token trades, deployer history, wallet trades. |
| `RH_RPC_URL` | Token name/symbol for Copycat scans of any contract. |
| `STOCK_TOKENS` | Add each stock token's contract address (`TSLA:Tesla:0x…`) so price moves can be measured. |

Any section that can't load live data falls back to sample data and is labelled, so the site never breaks. Open `/healthz` to see the mode and RPC block height.

**Live data status.** By default (`DATA_SOURCE=chain`) Hoodey needs no paid API. The server indexes Pons itself over `RH_RPC_URL`: factory launch events (token, curve, creator) and bonding-curve buy/sell events, kept in memory for `INDEX_KEEP_HOURS` (`INDEX_BACKFILL_HOURS` are read on start). Stock token prices and ETH/USD come from DexPaprika's free API. Gap Watch fills in once the server has recorded a price at a market close. Token logos come from the image named in each launch transaction (IPFS through `IPFS_GATEWAY`, Filebase by default, or the deployer's own URL), fetched once by the server and served from `/img/<token>` with browser caching. Holder counts, survival stats and image similarity still show "—" or sample numbers (see the roadmap). `DATA_SOURCE=bitquery` switches back to the older Bitquery setup.

### Alerts on Telegram

1. Create a bot with @BotFather, add it as an admin to your channel.
2. Set `TELEGRAM_BOT_USERNAME` (the **Get alerts** button links to it), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
3. Turn on `ALERTS_ENABLED` (spike alerts) and/or `OPENING_BELL_BRIEF_ENABLED`.

Alerts post only live data, never samples.

## All settings

Generated from `server/config.js` by `npm run env:example`. 🔒 = secret, never sent to the browser.

<!-- ENV:START -->
| Variable | Default | What it does |
|---|---|---|
| **App** | | |
| `PORT` | `3000` | Port the server listens on. Railway sets this for you; leave it empty there. |
| `NODE_ENV` | `production` | production or development. |
| `APP_NAME` | `Hoodey` | Name shown in the header, page titles and alerts. |
| `APP_TAGLINE` | `Every launch has a cabal. Every token has a clock. Don't be their exit.` | Short line used in page descriptions and link previews. |
| `PUBLIC_URL` | _empty_ | Public address of the site, e.g. https://hoodey.up.railway.app. Used for link previews. |
| `LOG_LEVEL` | `info` | How much the server logs. Options: `debug`, `info`, `warn`, `error`. |
| **Data** | | |
| `DATA_MODE` | `sample` | sample = built-in demo data, no keys needed. live = read Robinhood Chain (see DATA_SOURCE); any section that cannot load falls back to sample and says so. Options: `sample`, `live`. |
| `DATA_SOURCE` | `chain` | Where live data comes from. chain = Hoodey reads Pons launches and trades itself over RH_RPC_URL and takes prices from DexPaprika (free, no keys). bitquery = the older Bitquery setup (needs BITQUERY_API_KEY and uses its points). Options: `chain`, `bitquery`. |
| `CACHE_TTL_SECONDS` | `30` | How long API answers are cached on the server. |
| `REFRESH_INTERVAL_SECONDS` | `60` | How often open pages refresh their data. |
| `REQUEST_TIMEOUT_MS` | `10000` | Timeout for calls to Bitquery and the RPC. |
| **Robinhood Chain** | | |
| `RH_CHAIN_ID` | `4663` | Robinhood Chain mainnet chain ID. |
| `RH_RPC_URL` 🔒 | `https://rpc.mainnet.chain.robinhood.com` | JSON-RPC endpoint for Robinhood Chain. With DATA_SOURCE=chain every launch and trade is read through it, so a private endpoint (QuickNode, Alchemy, Chainstack…) is steadier than the public default. |
| `RH_EXPLORER_URL` | _empty_ | Block explorer base URL. When set, addresses link to it (e.g. <url>/address/0x…). |
| `PONS_TOKEN_URL` | `https://ponsfamily.com/launchpad/` | Token page on Pons. The token address is appended, so every token links to <url>0x…. Leave empty to hide the Pons links. |
| `INDEX_BACKFILL_HOURS` | `6` | On start, how many hours of past launches and trades the chain indexer reads before going live. More hours = longer start and more RPC calls. |
| `INDEX_KEEP_HOURS` | `24` | How many hours of launches and trades the indexer keeps in memory (deployer history, Copycat matches, launch clock). |
| `INDEX_POLL_SECONDS` | `10` | How often the indexer reads new blocks. Lower = fresher data, more RPC calls. |
| `INDEX_CHUNK_BLOCKS` | `10000` | Blocks per eth_getLogs call. Lower it if your RPC rejects large ranges. |
| `DEXPAPRIKA_URL` | `https://api.dexpaprika.com` | DexPaprika API (free, no key). Gives stock token prices and ETH/USD. |
| `DEXPAPRIKA_NETWORK` | `robinhood` | DexPaprika network id for Robinhood Chain. |
| `PRICE_REFRESH_SECONDS` | `60` | How often stock token prices and ETH/USD are refreshed from DexPaprika. |
| `BITQUERY_API_KEY` 🔒 | _empty_ | Bitquery access token. Only used when DATA_SOURCE=bitquery. |
| `BITQUERY_ENDPOINT` | `https://streaming.bitquery.io/graphql` | Bitquery GraphQL endpoint. |
| `BITQUERY_DATASET` | `realtime` | Bitquery dataset for EVM queries. realtime works on every plan; archive and combined reach further back but need the Robinhood archive add-on. Options: `realtime`, `archive`, `combined`. |
| `PONS_FACTORY_ADDRESS` | `0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e` | Pons launch factory contract. |
| `PONS_ROUTER_ADDRESS` | `0xe33e9e479df8802cb0866d5d05258bec4cf62948` | Pons router contract. |
| `LIVE_CACHE_SECONDS` | `120` | DATA_SOURCE=bitquery only: how long Bitquery results are reused before a background refresh. |
| `BITQUERY_MIN_INTERVAL_MS` | `1500` | Minimum gap between Bitquery requests. Raise it (e.g. 4000) on plans with a low requests-per-minute limit. |
| `LAUNCH_LIMIT` | `300` | DATA_SOURCE=bitquery only: how many recent launches to pull per refresh. |
| **Radar** | | |
| `STOCK_TOKENS` | `TSLA:Tesla:0x322F0929c4625eD5bAd873c95208D54E1c003b2d,NVDA:Nvidia:0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC,AAPL:Apple:0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9,COIN:Coinbase:0x6330D8C3178a418788dF01a47479c0ce7CCF450b,MSTR:MicroStrategy:0xec262a75e413fAfD0dF80480274532C79D42da09,META:Meta:0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35` | Stock tokens to watch, comma separated, as TICKER:Name:tokenAddress. The address is needed for live price moves. |
| `STOCK_KEYWORDS` | `TSLA=tesla\|elon\|musk\|cyber\|tsla\|cybertruck;NVDA=nvidia\|nvda\|gpu\|jensen\|leather;AAPL=apple\|aapl\|iphone;COIN=coinbase\|armstrong;MSTR=microstrategy\|mstr\|saylor;META=zuck\|zuckerberg\|facebook;GME=gamestop\|gme\|stonk\|squeeze\|kitty` | Words that tie a memecoin to a stock. TICKER=word\|word;TICKER=word… |
| `SPIKE_THRESHOLD_PCT` | `5` | A stock token move of at least this many percent counts as a spike. |
| `SPIKE_MIN_TRADES` | `3` | Trades in the window needed before a move counts as a spike. Stops a single odd trade in a thin market from triggering the radar. |
| `SPIKE_LOOKBACK_HOURS` | `6` | Default time window for the radar (1, 6 or 24 are offered in the UI). |
| `RADAR_MAX_TOKENS` | `12` | Most themed tokens listed per spike. |
| `TRENDING_WINDOW_MIN` | `60` | Minutes of Pons trades the "Hot right now" board ranks. |
| `TRENDING_TRADE_LIMIT` | `3000` | DATA_SOURCE=bitquery only: how many of the latest trades to scan for the "Hot right now" board. |
| `TRENDING_MAX_ROWS` | `20` | Most tokens shown on the "Hot right now" board. |
| **Copycat Eye** | | |
| `COPYCAT_NAME_THRESHOLD` | `0.7` | Name similarity (0–1) above which a token is flagged as a copy. |
| `COPYCAT_IMAGE_THRESHOLD` | `0.8` | Image similarity (0–1) above which a token is flagged as a copy (used once image matching is enabled). |
| **Token images** | | |
| `IPFS_GATEWAY` | `https://ipfs.filebase.io/ipfs/` | IPFS gateway for token logos (ipfs://… images). The public Filebase gateway works without an account; a Filebase dedicated gateway (https://<name>.myfilebase.com/ipfs/) is faster and can resize. |
| `IPFS_IMAGE_PARAMS` | _empty_ | Extra query added to IPFS image URLs. Only for a Filebase dedicated gateway, e.g. img-width=128&img-height=128&img-fit=cover&img-format=webp. Leave empty on the public gateway (it refuses resizing). |
| `IMAGE_CACHE_MB` | `64` | Memory the server may use to keep token logos. |
| `IMAGE_MAX_KB` | `3072` | Largest logo file the server will fetch. |
| `IMAGE_TIMEOUT_MS` | `8000` | Timeout for fetching one logo. |
| **LARP Scanner** | | |
| `LARP_FAMOUS_HANDLES` | `elonmusk,tesla,spacex,xai,grok,x,robinhoodapp,robinhood,vladtenev,nvidia,apple,microsoft,google,openai,sama,anthropicai,cz_binance,binance,coinbase,brian_armstrong,base,jessepollak,vitalikbuterin,ethereum,solana,saylor,strategy,realdonaldtrump,potus,whitehouse,cathiedwood,arkinvest,gamestop,theroaringkitty,ponsfamily,arbitrum` | X accounts that are famous and never a memecoin team (comma separated, no @). A token that links to one of these is flagged as borrowing it. |
| `LARP_FAMOUS_DOMAINS` | `tesla.com,spacex.com,x.com,twitter.com,x.ai,robinhood.com,nvidia.com,apple.com,microsoft.com,google.com,openai.com,anthropic.com,binance.com,coinbase.com,base.org,ethereum.org,solana.com,strategy.com,whitehouse.gov,gamestop.com,ponsfamily.com,arbitrum.io` | Websites of famous companies (comma separated). A token that lists one of these as its own site is flagged. |
| `X_PROFILE_API` | `https://api.fxtwitter.com` | Public API used to read an X profile (age, followers, bio) without an X key. Leave empty to skip profile checks. |
| `X_PROFILE_TIMEOUT_MS` | `5000` | Timeout for one X profile lookup. |
| **Cabal Eye** | | |
| `CABAL_EARLY_SECONDS` | `60` | Seconds after launch that count as "early" buying. |
| `CABAL_SNIPER_SECONDS` | `10` | A first buy within this many seconds of launch is tagged Sniper. |
| `CABAL_EARLY_MAX` | `25` | Most early buyers looked at per launch. |
| `CABAL_MIN_SHARED` | `3` | Cabal Map: two wallets are linked when they bought early in at least this many of the same launches. |
| `CABAL_MIN_MEMBERS` | `3` | Cabal Map: smallest crew shown. |
| `CABAL_MAX_WALLETS` | `40` | Cabal Scan: most wallets listed. |
| `CABAL_MAP_MAX` | `24` | Cabal Map: most crews listed. |
| **Market Clock** | | |
| `MARKET_TIMEZONE` | `America/New_York` | Time zone of the exchange. |
| `MARKET_PREMARKET_OPEN` | `04:00` | Pre-market start, HH:MM in exchange time. |
| `MARKET_OPEN` | `09:30` | Regular session open. |
| `MARKET_CLOSE` | `16:00` | Regular session close. |
| `MARKET_AFTERHOURS_CLOSE` | `20:00` | After-hours end. |
| `MARKET_HOLIDAYS` | `2026-11-26,2026-12-25,2027-01-01,2027-01-18,2027-02-15,2027-03-26,2027-05-31,2027-06-18,2027-07-05,2027-09-06,2027-11-25,2027-12-24` | Full-day exchange holidays, YYYY-MM-DD, comma separated. Check the exchange calendar each year. |
| **Alerts** | | |
| `TELEGRAM_BOT_USERNAME` | _empty_ | Bot or channel username without @. The "Get alerts" button opens t.me/<this>. |
| `TELEGRAM_BOT_TOKEN` 🔒 | _empty_ | Bot token from @BotFather. Needed only for the server to post alerts. |
| `TELEGRAM_CHAT_ID` | _empty_ | Channel or group ID the server posts alerts to, e.g. @hoodey_alerts or -100… |
| `ALERTS_ENABLED` | `false` | Post spike alerts to Telegram. |
| `ALERT_MIN_MOVE_PCT` | `5` | Only alert on stock moves of at least this many percent. |
| `OPENING_BELL_BRIEF_ENABLED` | `false` | Post a brief to Telegram before the regular session opens. |
| `OPENING_BELL_MINUTES_BEFORE` | `30` | Minutes before the open to post the brief. |
| **Links** | | |
| `LINK_X` | _empty_ | X (Twitter) profile URL. |
| `LINK_TELEGRAM` | _empty_ | Telegram community URL. |
| `LINK_DOCS` | _empty_ | Docs URL. |
| `ROADMAP_VOTE_URL` | _empty_ | Where the "Vote on the roadmap" button goes. Hidden when empty. |
| `TOKEN_CONTRACT_ADDRESS` | _empty_ | $HOODEY contract address, shown in the footer when set. |
| `TOKEN_BUY_URL` | _empty_ | Link to buy $HOODEY, shown in the footer when set. |
| **Theme** | | |
| `THEME_ACCENT` | `#00C805` | Main accent color (buttons, gauges, bars). |
| `THEME_ACCENT_INK` | `#078A33` | Darker accent used for text and chart lines on white. |
| `THEME_BG` | `#F7FAF8` | Page background. |
| `BG_ANIMATION_ENABLED` | `true` | Animated 3D dot field behind the pages. |
| **Follow gate** | | |
| `FOLLOW_GATE` | `true` | Ask visitors to follow the X account before they can run more scans. Links shared on X still open their scan without asking. |
| `FOLLOW_GATE_HANDLE` | `oxhoodey` | X username to follow (no @). |
| `FOLLOW_GATE_FREE_SCANS` | `1` | Scans a visitor can run before the follow prompt appears. |
| **Features** | | |
| `FEATURE_RADAR` | `true` | Show Stock → Meme Radar. |
| `FEATURE_COPYCAT` | `true` | Show Copycat Eye. |
| `FEATURE_CABAL` | `true` | Show Cabal Eye (Cabal Scan and Cabal Map). |
| `FEATURE_XRAY` | `true` | Show X-Ray (Death Clock for tokens, Wallet X-Ray for wallets). |
| `FEATURE_LARP` | `true` | Show LARP Scanner (tokens that borrow someone else's X account or website). |
| `FEATURE_CLOCK` | `true` | Show Market Clock. |
| `FEATURE_FAMILY` | `true` | Show Narrative Family Tree. |
| `FEATURE_ROADMAP` | `true` | Show Roadmap. |
| `FEATURE_WALLET_WATCH` | `true` | Show the Wallet Watch box on the radar. |
| **Security** | | |
| `RATE_LIMIT_PER_MINUTE` | `120` | API requests allowed per visitor IP per minute. |
| `ALLOWED_HOSTS` | _empty_ | Domains allowed to serve Hoodey, comma separated (e.g. hoodey-production.up.railway.app,hoodey.xyz). The PUBLIC_URL domain is always allowed. Requests for any other domain are sent to PUBLIC_URL, and copies of the site opened elsewhere show a "this is a copy" notice. |
| `COPY_LOCK` | `true` | Pages opened on a domain that is not ours (a saved or mirrored copy) stop working and point visitors to the real site. |
| `API_GUARD` | `true` | The API only answers pages served by this server: each page carries a signed key that expires after 2 days. Copied frontends that call our API get nothing. |
| `GUARD_SECRET` 🔒 | _empty_ | Secret used to sign page keys. Set any long random text so keys survive restarts; if empty a new one is made on every start. |
| `HOTLINK_GUARD` | `true` | Other websites cannot embed our scripts, styles, token images or share cards. X and Telegram previews still work. |
| `CORS_ORIGINS` | _empty_ | Other sites allowed to call the API, comma separated. Empty = same site only. |
| `TRUST_PROXY` | `true` | Read the visitor IP from X-Forwarded-For (correct behind Railway). |
<!-- ENV:END -->

## API

All `GET`, JSON, rate-limited per IP (`RATE_LIMIT_PER_MINUTE`). With `API_GUARD=true` (default) the API answers only Hoodey's own pages: each page carries a signed key (`X-Hoodey-K`). Sites listed in `CORS_ORIGINS` skip the key.

| Endpoint | Returns |
|---|---|
| `/healthz` | Status, data mode, RPC block |
| `/api/config` | Public settings (no secrets) |
| `/api/radar?range=1\|6\|24` | Stock moves, themed launches, hot narratives, lifespans |
| `/api/copycat/latest` | Newest launch, its matches and deployer |
| `/api/copycat/scan?address=0x…` | Same, for any contract |
| `/api/larp/scan?address=0x…` | LARP Scan for a token |
| `/api/larp/board` | Most borrowed X accounts and the newest LARPs |
| `/api/xray?address=0x…` | Death Clock (token) or Wallet X-Ray (wallet) |
| `/api/xray/board` | Death Row, smart money and exit-liquidity wallets |
| `/og/xray/0x….png` | Share card image for X |
| `/api/clock` | Overnight gaps and launches per hour |
| `/api/family?stock=TSLA` | Narrative family tree |
| `/api/wallet?address=0x…` | Wallet Watch result |
| `/api/roadmap` | `data/roadmap.json` |

Every data answer has `source: "live"` or `"sample"`; a fallback also includes `fallbackReason`.

## Project layout

```
server/        index.js (HTTP + API), config.js (all env vars), data.js (live/sample switch),
               live.js (chain indexer + DexPaprika), indexer.js, dexpaprika.js, images.js (token logos), live-bitquery.js (optional), sample.js (demo data), alerts.js (Telegram), util.js
public/        radar, copycat, clock, family, roadmap pages + assets/ (CSS, JS, WebGL background)
data/          roadmap.json
scripts/       gen-env.js (.env.example + table above), check.js (pre-deploy check)
railway.json   start command and health check for Railway
```

`npm run check` parses every file before you push.

## Disclaimer

Hoodey reads public on-chain data and labels patterns; it does not give financial advice. "Copycat", "farm pattern" and risk labels are heuristics, not proof.
