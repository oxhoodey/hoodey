# HoodEye

Read-only memecoin intelligence for **Robinhood Chain**. No wallet connection, no signatures.

- **Stock → Meme Radar**: when a stock token moves, see every themed memecoin that launches after it.
- **Copycat Eye**: paste a contract and see which older tokens it copies, plus the deployer's track record.
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
   git init && git add . && git commit -m "HoodEye"
   git branch -M main
   git remote add origin https://github.com/<you>/hoodeye.git
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

**Live data status.** Launches, name matching, narrative tagging, deployer history, hourly waves, family trees and gaps are computed from Bitquery and RPC. Holder counts, volume per token, survival stats, and image similarity still need an indexer and show "—" or sample numbers until it exists (see the roadmap). The Bitquery queries follow Bitquery's Robinhood Chain and Pons docs; check them against your plan and dataset before relying on them.

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
| `APP_NAME` | `HoodEye` | Name shown in the header, page titles and alerts. |
| `APP_TAGLINE` | `Eyes on every meme, before the market blinks.` | Short line used in page descriptions and link previews. |
| `PUBLIC_URL` | _empty_ | Public address of the site, e.g. https://hoodeye.up.railway.app. Used for link previews. |
| `LOG_LEVEL` | `info` | How much the server logs. Options: `debug`, `info`, `warn`, `error`. |
| **Data** | | |
| `DATA_MODE` | `sample` | sample = built-in demo data, no keys needed. live = read Robinhood Chain through Bitquery and RPC; any section that cannot load falls back to sample and says so. Options: `sample`, `live`. |
| `CACHE_TTL_SECONDS` | `30` | How long API answers are cached on the server. |
| `REFRESH_INTERVAL_SECONDS` | `60` | How often open pages refresh their data. |
| `REQUEST_TIMEOUT_MS` | `10000` | Timeout for calls to Bitquery and the RPC. |
| **Robinhood Chain** | | |
| `RH_CHAIN_ID` | `4663` | Robinhood Chain mainnet chain ID. |
| `RH_RPC_URL` 🔒 | _empty_ | JSON-RPC endpoint for Robinhood Chain. Used to read token name and symbol in Copycat scans. |
| `RH_EXPLORER_URL` | _empty_ | Block explorer base URL. When set, addresses link to it (e.g. <url>/address/0x…). |
| `BITQUERY_API_KEY` 🔒 | _empty_ | Bitquery access token. Needed for live launches, trades and deployer history. |
| `BITQUERY_ENDPOINT` | `https://streaming.bitquery.io/graphql` | Bitquery GraphQL endpoint. |
| `BITQUERY_DATASET` | `realtime` | Bitquery dataset for EVM queries. realtime works on every plan; archive and combined reach further back but need the Robinhood archive add-on. Options: `realtime`, `archive`, `combined`. |
| `PONS_FACTORY_ADDRESS` | `0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e` | Pons launch factory contract. |
| `PONS_ROUTER_ADDRESS` | `0xe33e9e479df8802cb0866d5d05258bec4cf62948` | Pons router contract. |
| `LAUNCH_LIMIT` | `300` | How many recent launches to pull per refresh in live mode. |
| **Radar** | | |
| `STOCK_TOKENS` | `TSLA:Tesla:0x322F0929c4625eD5bAd873c95208D54E1c003b2d,NVDA:Nvidia:0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC,AAPL:Apple:0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9,COIN:Coinbase:0x6330D8C3178a418788dF01a47479c0ce7CCF450b,MSTR:MicroStrategy:0xec262a75e413fAfD0dF80480274532C79D42da09,META:Meta:0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35` | Stock tokens to watch, comma separated, as TICKER:Name:tokenAddress. The address is needed for live price moves. |
| `STOCK_KEYWORDS` | `TSLA=tesla\|elon\|musk\|cyber\|tsla\|cybertruck;NVDA=nvidia\|nvda\|gpu\|jensen\|leather;AAPL=apple\|aapl\|iphone;COIN=coinbase\|armstrong;MSTR=microstrategy\|mstr\|saylor;META=zuck\|zuckerberg\|facebook;GME=gamestop\|gme\|stonk\|squeeze\|kitty` | Words that tie a memecoin to a stock. TICKER=word\|word;TICKER=word… |
| `SPIKE_THRESHOLD_PCT` | `5` | A stock token move of at least this many percent counts as a spike. |
| `SPIKE_MIN_TRADES` | `3` | Trades needed past the halfway price before a move counts as a spike. Stops a single odd trade in a thin market from triggering the radar. |
| `SPIKE_LOOKBACK_HOURS` | `6` | Default time window for the radar (1, 6 or 24 are offered in the UI). |
| `RADAR_MAX_TOKENS` | `12` | Most themed tokens listed per spike. |
| **Copycat Eye** | | |
| `COPYCAT_NAME_THRESHOLD` | `0.7` | Name similarity (0–1) above which a token is flagged as a copy. |
| `COPYCAT_IMAGE_THRESHOLD` | `0.8` | Image similarity (0–1) above which a token is flagged as a copy (used once image matching is enabled). |
| `IPFS_GATEWAY` | `https://ipfs.io/ipfs/` | Gateway used to show token logos stored on IPFS. |
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
| `TELEGRAM_CHAT_ID` | _empty_ | Channel or group ID the server posts alerts to, e.g. @hoodeye_alerts or -100… |
| `ALERTS_ENABLED` | `false` | Post spike alerts to Telegram. |
| `ALERT_MIN_MOVE_PCT` | `5` | Only alert on stock moves of at least this many percent. |
| `OPENING_BELL_BRIEF_ENABLED` | `false` | Post a brief to Telegram before the regular session opens. |
| `OPENING_BELL_MINUTES_BEFORE` | `30` | Minutes before the open to post the brief. |
| **Links** | | |
| `LINK_X` | _empty_ | X (Twitter) profile URL. |
| `LINK_TELEGRAM` | _empty_ | Telegram community URL. |
| `LINK_DOCS` | _empty_ | Docs URL. |
| `ROADMAP_VOTE_URL` | _empty_ | Where the "Vote on the roadmap" button goes. Hidden when empty. |
| `TOKEN_CONTRACT_ADDRESS` | _empty_ | $HOODEYE contract address, shown in the footer when set. |
| `TOKEN_BUY_URL` | _empty_ | Link to buy $HOODEYE, shown in the footer when set. |
| **Theme** | | |
| `THEME_ACCENT` | `#00C805` | Main accent color (buttons, gauges, bars). |
| `THEME_ACCENT_INK` | `#078A33` | Darker accent used for text and chart lines on white. |
| `THEME_BG` | `#F3F8F4` | Page background. |
| `BG_ANIMATION_ENABLED` | `true` | Animated 3D dot field behind the pages. |
| **Features** | | |
| `FEATURE_RADAR` | `true` | Show Stock → Meme Radar. |
| `FEATURE_COPYCAT` | `true` | Show Copycat Eye. |
| `FEATURE_CLOCK` | `true` | Show Market Clock. |
| `FEATURE_FAMILY` | `true` | Show Narrative Family Tree. |
| `FEATURE_ROADMAP` | `true` | Show Roadmap. |
| `FEATURE_WALLET_WATCH` | `true` | Show the Wallet Watch box on the radar. |
| **Security** | | |
| `RATE_LIMIT_PER_MINUTE` | `120` | API requests allowed per visitor IP per minute. |
| `CORS_ORIGINS` | _empty_ | Other sites allowed to call the API, comma separated. Empty = same site only. |
| `TRUST_PROXY` | `true` | Read the visitor IP from X-Forwarded-For (correct behind Railway). |
<!-- ENV:END -->

## API

All `GET`, JSON, rate-limited per IP (`RATE_LIMIT_PER_MINUTE`).

| Endpoint | Returns |
|---|---|
| `/healthz` | Status, data mode, RPC block |
| `/api/config` | Public settings (no secrets) |
| `/api/radar?range=1\|6\|24` | Stock moves, themed launches, hot narratives, lifespans |
| `/api/copycat/latest` | Newest launch, its matches and deployer |
| `/api/copycat/scan?address=0x…` | Same, for any contract |
| `/api/clock` | Overnight gaps and launches per hour |
| `/api/family?stock=TSLA` | Narrative family tree |
| `/api/wallet?address=0x…` | Wallet Watch result |
| `/api/roadmap` | `data/roadmap.json` |

Every data answer has `source: "live"` or `"sample"`; a fallback also includes `fallbackReason`.

## Project layout

```
server/        index.js (HTTP + API), config.js (all env vars), data.js (live/sample switch),
               live.js (Bitquery + RPC), sample.js (demo data), alerts.js (Telegram), util.js
public/        radar, copycat, clock, family, roadmap pages + assets/ (CSS, JS, WebGL background)
data/          roadmap.json
scripts/       gen-env.js (.env.example + table above), check.js (pre-deploy check)
railway.json   start command and health check for Railway
```

`npm run check` parses every file before you push.

## Disclaimer

HoodEye reads public on-chain data and labels patterns; it does not give financial advice. "Copycat", "farm pattern" and risk labels are heuristics, not proof.
