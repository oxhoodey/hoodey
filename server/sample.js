// Built-in demo data, used when DATA_MODE=sample or when a live section cannot load.
// Every answer is marked source: "sample" so the UI can label it.
import { config } from './config.js';
import { hashString, seededRandom, isAddress } from './util.js';
import { buildMap, scanToken } from './cabal.js';
import { buildModel, forecast, deathRow, xrayWallet, walletBoard } from './insight.js';


const MIN = 60 * 1000;
const ago = (minutes) => new Date(Date.now() - minutes * MIN).toISOString();
const fakeAddr = (seed) => '0x' + Array.from({ length: 5 }, (_, i) => hashString(seed + i).toString(16).padStart(8, '0')).join('');

// A stock token price path with a spike at `spikePos` (0..1).
function series(start, movePct, spikePos, seed, points = 41) {
  const rnd = seededRandom(seed);
  const out = [];
  const end = start * (1 + movePct / 100);
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const noise = (rnd() - 0.5) * Math.abs(end - start) * 0.12;
    const k = t < spikePos ? 0 : Math.min(1, (t - spikePos) / 0.09);
    out.push(+(start + (end - start) * k + noise).toFixed(2));
  }
  return out;
}

const T = (name, symbol, afterMin, launchpad, holders, volumeUsd, top10Pct, copyOf, copyScore, lifespanMin, risk) => ({
  name, symbol, address: fakeAddr(symbol), afterMin, launchpad, holders, volumeUsd, top10Pct,
  copycat: copyOf ? { of: copyOf, score: copyScore } : null, lifespanMin, risk
});

const EVENTS = [
  { ticker: 'TSLA', name: 'Tesla', movePct: 8.2, trigger: 'Q3 earnings', agoMin: 14, spikePos: 0.625, seed: 11, price: 232.3, launches: 23, volumeUsd: 1.4e6, alivePct: 61,
    tokens: [T('Tesla Doge', 'TDOGE', 3, 'Pons', 412, 186e3, 38, 'TSLADOGE', 94, 110, 'high'), T('Red Rocket', 'RROCK', 7, 'Pons', 1208, 402e3, 21, null, 0, 540, 'medium'), T('Cybertruck Cat', 'CYCAT', 11, 'Pools', 640, 95e3, 46, 'CYBRCAT', 81, 130, 'high'), T('Q3 Beat', 'BEAT', 18, 'Pons', 2341, 611e3, 14, null, 0, 1680, 'low')] },
  { ticker: 'NVDA', name: 'Nvidia', movePct: -5.1, trigger: 'Chip export news', agoMin: 60, spikePos: 0.55, seed: 29, price: 124.6, launches: 11, volumeUsd: 716e3, alivePct: 45,
    tokens: [T('Chip Ban Frog', 'CBFROG', 5, 'Pons', 233, 41e3, 52, 'CHIPFROG', 89, 65, 'high'), T('Leather Jacket', 'JACKET', 9, 'Pons', 980, 287e3, 24, null, 0, 840, 'medium'), T('Buy The Dip', 'BTDNV', 14, 'Pools', 1512, 330e3, 17, null, 0, 1200, 'low'), T('GPU Tears', 'TEARS', 26, 'Pons', 318, 58e3, 41, null, 0, 180, 'medium')] },
  { ticker: 'COIN', name: 'Coinbase', movePct: 6.4, trigger: 'Crypto volume up', agoMin: 180, spikePos: 0.375, seed: 47, price: 199.9, launches: 7, volumeUsd: 543e3, alivePct: 57,
    tokens: [T('Coin Kid', 'CNKID', 4, 'Pons', 701, 210e3, 29, null, 0, 660, 'medium'), T('Base Boy', 'BBOY', 12, 'Pons', 166, 22e3, 61, 'BASEBOY', 97, 40, 'high'), T('Crypto Summer', 'SUMMR', 21, 'Pools', 1044, 264e3, 19, null, 0, 1320, 'low'), T('Blue Hat', 'BHAT', 33, 'Pons', 289, 47e3, 44, null, 0, 150, 'medium')] },
  { ticker: 'GME', name: 'GameStop', movePct: 12.9, trigger: 'Social surge', agoMin: 300, spikePos: 0.25, seed: 83, price: 24.7, launches: 31, volumeUsd: 3.2e6, alivePct: 68,
    tokens: [T('Diamond Paws', 'DPAWS', 1, 'Pons', 3880, 1.1e6, 12, null, 0, 2880, 'low'), T('Short Squeeze', 'SQZ', 2, 'Pons', 2017, 690e3, 16, null, 0, 1800, 'low'), T('GameStonk Cat', 'GSCAT', 6, 'Pools', 455, 88e3, 49, 'STONKCAT', 92, 80, 'high'), T('Ape Again', 'APEAG', 15, 'Pons', 812, 151e3, 33, null, 0, 360, 'medium')] }
];

const QUIET = [
  { ticker: 'AAPL', name: 'Apple', movePct: 0.8, agoMin: 3, seed: 5, price: 228.1, trades: 41 },
  { ticker: 'MSTR', name: 'MicroStrategy', movePct: -1.6, agoMin: 2, seed: 17, price: 136.8, trades: 28 }
];

const LATEST = [
  ['Eko Terminal', 'EKO', 1, null, 0, 'low', null], ['Tesla Doge', 'TDOGE', 2, 'TSLA', 0, 'high', ['TSLADOGE', 94]], ['Night Owl', 'NOCT', 4, null, 0, 'low', null],
  ['Hero Cat', 'HERO', 6, null, 0, 'medium', null], ['StrataLLM', 'STRATA', 7, null, 0, 'high', ['STRATA', 100]], ['Elon Fart', 'EF', 9, 'TSLA', 0, 'low', null],
  ['Aveno', 'AVENO', 12, null, 0, 'low', null], ['Chip Ban Frog', 'CBFROG', 15, 'NVDA', 0, 'high', ['CHIPFROG', 89]], ['Pond Life', 'POND', 18, null, 0, 'low', null],
  ['Red Rocket', 'RROCK', 21, 'TSLA', 0, 'medium', null], ['Moon Duck', 'MDUCK', 26, null, 0, 'low', null], ['Base Boy', 'BBOY', 31, 'COIN', 0, 'high', ['BASEBOY', 97]],
  ['Green Candle', 'GRN', 37, null, 0, 'low', null], ['Saylor Moon', 'SAYLR', 44, 'MSTR', 0, 'medium', null], ['Hood Frog', 'HFROG', 52, null, 0, 'low', null], ['Q3 Beat', 'BEAT', 58, 'TSLA', 0, 'low', null]
].map(([name, symbol, agoMin, ticker, , risk, copy]) => ({
  name, symbol, address: fakeAddr(symbol + 'L'), launchpad: 'Pons', at: ago(agoMin), ticker, afterMin: null,
  holders: null, volumeUsd: null, top10Pct: null, lifespanMin: null, deployerLaunches: risk === 'high' ? 6 : risk === 'medium' ? 2 : 1,
  copycat: copy ? { of: copy[0], score: copy[1] } : null, risk
}));

export function radar(rangeHours) {
  const spikes = EVENTS
    .filter((e) => e.agoMin <= rangeHours * 60)
    .map((e) => ({
      ticker: e.ticker, name: e.name, up: e.movePct >= 0, movePct: e.movePct, price: e.price, trades: 120, spike: true, trigger: e.trigger,
      at: ago(e.agoMin), spikePos: e.spikePos, series: series(e.price, e.movePct, e.spikePos, e.seed),
      launches: e.launches, firstAfterMin: Math.min(...e.tokens.map((t) => t.afterMin)), volumeUsd: e.volumeUsd, alivePct: e.alivePct,
      tokens: e.tokens.slice(0, config.RADAR_MAX_TOKENS)
    }));
  const quiet = QUIET.map((q) => ({
    ticker: q.ticker, name: q.name, up: q.movePct >= 0, movePct: q.movePct, price: q.price, trades: q.trades, spike: false,
    trigger: `${q.trades} trades in ${rangeHours}h`, at: ago(q.agoMin), spikePos: null, series: series(q.price, q.movePct, 0.5, q.seed),
    launches: 0, firstAfterMin: null, volumeUsd: null, alivePct: null, tokens: []
  }));
  return {
    source: 'sample',
    moves: [...spikes, ...quiet],
    events: spikes,
    latest: LATEST.map((l, i) => {
      const med = [4, 11, 26, 7, 48, 15][i % 6];
      const t = Date.parse(l.launchedAt || l.at || ago(5));
      return { ...l, death: { status: i === 3 ? 'overtime' : 'alive', medianLifeMin: med, expectedDeathAt: new Date((isNaN(t) ? Date.now() : t) + med * MIN).toISOString(), diedPct: [92, 81, 64, 88, 41, 70][i % 6] } };
    }),
    // last hour of launches for the launch tape (demo: 61 points)
    timeline: Array.from({ length: 61 }, (_, i) => {
      const l = LATEST[i % LATEST.length];
      return { address: l.address, symbol: l.symbol, at: ago(i * 0.97 + ((i * 37) % 10) / 20), risk: ['low', 'low', 'medium', 'low', 'high'][(i * 7) % 5] };
    }),
    stats: { windowHours: 24, launches: 1284, lastHour: 61, copycats: 217, deployers: 388, themed: 76 },
    hot: { source: 'sample', items: [['GME', 31], ['TSLA', 23], ['NVDA', 11], ['COIN', 7], ['AAPL', 4]].map(([ticker, count]) => ({ ticker, count })) },
    life: { source: 'sample', medianMin: 134, buckets: [{ label: '< 1h', pct: 38 }, { label: '1–6h', pct: 44 }, { label: '6–24h', pct: 11 }, { label: '> 24h', pct: 7 }] }
  };
}

const DEPLOYER = {
  address: '0x7ac1e2b04f9d3c18a6b5e70d2c9a4f8b31d0e93b',
  tokens30d: 14, deadWithin6h: 12, imagesReused: 9, medianLifespanMin: 108, pattern: 'farm',
  history: [['TSLADOGE', false, '3h'], ['CYDOGE', false, '1h'], ['NVPUP', false, '40m'], ['APLCAT', false, '2h'], ['GMEDOG', false, '5h'], ['AMZFROG', false, '58m'], ['METAPUP', true, '2d'], ['BTCDOGE', false, '4h']]
    .map(([symbol, alive, life]) => ({ symbol, alive, life }))
};

const COPY_TOKENS = [
  { name: 'Tesla Doge', symbol: 'TDOGE', address: '0x4f2a8c1d9e7b3a5f60c2d4e8b1a9f3c7d5e091c0', launchpad: 'Pons', launchedAt: ago(2),
    imageSimilarity: 0.94, nameSimilarity: 0.88, closest: { symbol: 'TSLADOGE', name: 'Tesla Doge (old)', diedAfter: '3 hours', launchedAgo: '6 days ago', sameDeployer: true },
    matches: [['Tesla Doge (old)', 'TSLADOGE', 94, 'same deployer', false, '3h'], ['Cyber Doge', 'CYDOGE', 81, 'recolored', false, '1h'], ['Doge Motors', 'DMOTOR', 67, 'same pose', false, '5h'], ['Rocket Pup', 'RPUP', 52, 'similar concept', true, '4d']] },
  { name: 'Base Boy', symbol: 'BBOY', address: '0x9c41e7a2b8d05f3c6e1a4d7b2f8c0e5a3d6b1f72', launchpad: 'Pons', launchedAt: ago(170),
    imageSimilarity: 0.97, nameSimilarity: 1, closest: { symbol: 'BASEBOY', name: 'Base Boy (old)', diedAfter: '50 minutes', launchedAgo: '9 days ago', sameDeployer: false },
    matches: [['Base Boy (old)', 'BASEBOY', 97, 'different deployer', false, '50m'], ['Blue Boy', 'BLUBOY', 72, 'recolored', false, '2h'], ['Coin Kid', 'CNKID', 58, 'similar concept', true, '11h']] }
];

function copyToken(t) {
  return {
    source: 'sample',
    token: { name: t.name, symbol: t.symbol, address: t.address, launchpad: t.launchpad, launchedAt: t.launchedAt, imageSimilarity: t.imageSimilarity, nameSimilarity: t.nameSimilarity, closest: t.closest, flagged: t.imageSimilarity >= config.COPYCAT_IMAGE_THRESHOLD || t.nameSimilarity >= config.COPYCAT_NAME_THRESHOLD },
    matches: t.matches.map(([name, symbol, score, note, alive, life]) => ({ name, symbol, address: fakeAddr(symbol + 'M'), score, note, alive, life })),
    scanned: 18402,
    deployer: DEPLOYER
  };
}

export function copycatLatest() { return copyToken(COPY_TOKENS[0]); }

export function copycatScan(address) {
  if (!isAddress(address)) return null;
  const t = COPY_TOKENS[hashString(address.toLowerCase()) % COPY_TOKENS.length];
  const out = copyToken({ ...t, address: address.toLowerCase() });
  out.note = 'Sample mode: this is demo data, not the token at this address.';
  return out;
}

export function clock() {
  const hours = [14, 11, 9, 8, 10, 13, 18, 22, 25, 12, 8, 7, 6, 7, 8, 9, 30, 34, 28, 24, 20, 19, 17, 15];
  return {
    source: 'sample',
    gaps: { source: 'sample', items: [['TSLA', 251.4, 3.0], ['GME', 27.85, 6.4], ['NVDA', 118.2, -2.1], ['COIN', 212.7, 1.2], ['AAPL', 228.1, -0.6]].map(([ticker, price, gapPct]) => ({ ticker, price, gapPct })) },
    hours: { source: 'sample', counts: hours.map((h) => h * 9), themed: hours, total: hours.reduce((a, b) => a + b, 0) * 9, hours: 720, days: 30 }
  };
}

const FAMILIES = {
  TSLA: [
    ['r', null, 'Tesla', 'TSLA', 'stock', true, '+8.2% · Q3 earnings', '', null],
    ['a', 'r', 'Tesla Doge (old)', 'TSLADOGE', 'original', false, '6d ago · died after 3h', '0x7ac1…e93b', null],
    ['b', 'r', 'Red Rocket', 'RROCK', 'original', true, '14m ago · 1,208 holders', '0x19fe…02aa', null],
    ['c', 'r', 'Q3 Beat', 'BEAT', 'original', true, '14m ago · 2,341 holders', '0x5b0d…7c11', null],
    ['d', 'a', 'Tesla Doge', 'TDOGE', 'clone', true, '2m ago', '0x7ac1…e93b', 94],
    ['e', 'a', 'Cyber Doge', 'CYDOGE', 'clone', false, 'died after 1h', '0x7ac1…e93b', 81],
    ['h', 'e', 'Cybertruck Cat', 'CYCAT', 'clone', true, '11m ago', '0x88d2…a6f3', 81],
    ['f', 'b', 'Red Rocket 2', 'RROCK2', 'clone', false, 'died after 40m', '0xc3a8…9d04', 76],
    ['g', 'c', 'Beat X', 'BEATX', 'clone', true, '6m ago', '0xe2f7…4b19', 68]
  ],
  NVDA: [
    ['r', null, 'Nvidia', 'NVDA', 'stock', true, '−5.1% · chip export news', '', null],
    ['a', 'r', 'Chip Frog', 'CHIPFROG', 'original', false, '3d ago · died after 5h', '0x41c9…0e7d', null],
    ['b', 'r', 'Leather Jacket', 'JACKET', 'original', true, '1h ago · 980 holders', '0x9a03…c5e2', null],
    ['c', 'a', 'Chip Ban Frog', 'CBFROG', 'clone', true, '55m ago', '0x41c9…0e7d', 89],
    ['d', 'a', 'Frog Ban', 'FROGBAN', 'clone', false, 'died after 2h', '0x6d1e…b830', 70],
    ['e', 'b', 'Leather Jacket 2', 'JACKET2', 'clone', false, 'died after 25m', '0x2f84…11ab', 77]
  ],
  GME: [
    ['r', null, 'GameStop', 'GME', 'stock', true, '+12.9% · social surge', '', null],
    ['a', 'r', 'Diamond Paws', 'DPAWS', 'original', true, '5h ago · 3,880 holders', '0x0c5a…f219', null],
    ['b', 'r', 'Short Squeeze', 'SQZ', 'original', true, '5h ago · 2,017 holders', '0xb71e…3d90', null],
    ['c', 'r', 'Stonk Cat', 'STONKCAT', 'original', false, '12d ago · died after 9h', '0x3e6f…a7c4', null],
    ['d', 'a', 'Diamond Paws 2', 'PAWS2', 'clone', false, 'died after 30m', '0xd90b…5e62', 88],
    ['e', 'c', 'GameStonk Cat', 'GSCAT', 'clone', true, '4h ago', '0x3e6f…a7c4', 92],
    ['g', 'e', 'GameStonk Cat X', 'GSCATX', 'clone', true, '40m ago', '0x3e6f…a7c4', 79],
    ['f', 'c', 'Stonk Cat 2', 'STONKCAT2', 'clone', false, 'died after 1h', '0x57a2…e04d', 85]
  ]
};

export function family(ticker) {
  const available = Object.keys(FAMILIES);
  const t = available.includes(ticker) ? ticker : available[0];
  return {
    source: 'sample',
    stocks: available,
    ticker: t,
    nodes: FAMILIES[t].map(([id, parent, name, symbol, kind, alive, note, deployer, similarity]) => ({ id, parent, name, symbol, kind, alive, note, deployer, similarity }))
  };
}

export function wallet(address) {
  const h = hashString(address.toLowerCase());
  const netEth = +(((h % 160) - 100) / 100).toFixed(2);
  const ethUsd = 2500, tslaUsd = 251.4;
  return {
    source: 'sample',
    address: address.toLowerCase(),
    days: 7,
    label: 'Meme result',
    netEth,
    netUsd: Math.round(netEth * ethUsd),
    tslaShares: +((netEth * ethUsd) / tslaUsd).toFixed(1),
    spyPct: 1.3,
    note: 'Sample mode: demo numbers, not this wallet’s real results.'
  };
}

const HOT = [
  ['Elon Fart', 'EF', 'TSLA', 9, 48200, 412, 131, 71, 38.4, 14, []],
  ['Eko Terminal', 'EKO', null, 1, 31800, 268, 97, 82, 112.0, 9, []],
  ['StrataLLM', 'STRATA', null, 7, 27400, 190, 12, 64, -22.5, 41, [['copy', 'Copy of $STRATA'], ['repeat', 'Deployer x6']]],
  ['Night Owl', 'NOCT', null, 4, 21900, 205, 88, 58, 17.3, 11, []],
  ['Tesla Doge', 'TDOGE', 'TSLA', 2, 18650, 151, 64, 55, 9.8, 19, [['copy', 'Copy of $TSLADOGE'], ['repeat', 'Deployer x14']]],
  ['Hero Cat', 'HERO', null, 6, 14300, 132, 49, 47, -6.1, 23, [['repeat', 'Deployer x2']]],
  ['Saylor Moon', 'SAYLR', 'MSTR', 44, 11200, 96, 41, 61, 4.4, 17, []],
  ['Pond Life', 'POND', null, 18, 9400, 88, 2, 50, 1.2, 52, [['whale', '1 wallet 52%'], ['wash', 'Few traders, many trades']]],
  ['Chip Ban Frog', 'CBFROG', 'NVDA', 15, 7900, 71, 30, 39, -14.8, 28, [['copy', 'Copy of $CHIPFROG']]],
  ['Green Candle', 'GRN', null, 37, 6100, 59, 27, 66, 21.6, 15, []],
  ['Moon Duck', 'MDUCK', null, 26, 4800, 44, 21, 52, -2.3, 22, []],
  ['Base Boy', 'BBOY', 'COIN', 31, 3900, 37, 9, 33, -31.0, 61, [['copy', 'Copy of $BASEBOY'], ['whale', '1 wallet 61%']]]
];

export function trending() {
  const rows = HOT.map(([name, symbol, ticker, ageMin, volumeUsd, trades, traders, buyPct, changePct, topWalletPct, flags], i) => {
    const rnd = seededRandom(hashString(symbol));
    const spark = [];
    let v = 1;
    for (let k = 0; k < 12; k++) { v *= 1 + (changePct / 100) / 12 + (rnd() - 0.5) * 0.05; spark.push(+v.toFixed(4)); }
    const f = flags.map(([k, label]) => ({ k, label }));
    return {
      address: fakeAddr(symbol + 'L'), name, symbol, launchedAt: ago(ageMin), ticker, volumeUsd, trades, traders, buyPct,
      buys: Math.round(trades * buyPct / 100), sells: trades - Math.round(trades * buyPct / 100),
      priceUsd: +(0.00002 * (i + 1) * (1 + changePct / 100)).toPrecision(4), changePct, spark, topWalletPct,
      copycat: f.find((x) => x.k === 'copy') ? { of: f.find((x) => x.k === 'copy').label.split('$')[1], score: 90 } : null,
      deployerLaunches: (f.find((x) => x.k === 'repeat') || { label: 'x1' }).label.split('x')[1] * 1,
      flags: f,
      risk: f.some((x) => x.k === 'copy' || x.k === 'wash') ? 'high' : f.length ? 'medium' : 'low'
    };
  });
  return { source: 'sample', windowMin: 45, totalTrades: 1840, rows };
}

// ── Cabal Eye demo: a small simulated market run through the real detector ──
let cabalWorld = null;
function world() {
  if (cabalWorld && Date.now() - cabalWorld.at < 10 * 60e3) return cabalWorld;
  const rnd = seededRandom(4663);
  const now = Date.now();
  const w = (tag, i) => fakeAddr(tag + i);
  const crews = [[0, 1, 2, 3, 4].map((i) => w('crewA', i)), [0, 1, 2, 3].map((i) => w('crewB', i)), [0, 1, 2].map((i) => w('crewC', i))];
  const retail = Array.from({ length: 60 }, (_, i) => w('retail', i));
  const names = [['Tesla Doge', 'TDOGE'], ['Night Owl', 'NOCT'], ['Hero Cat', 'HERO'], ['Moon Duck', 'MDUCK'], ['Elon Fart', 'EF'], ['Pond Life', 'POND'], ['Green Candle', 'GRN'], ['Chip Ban Frog', 'CBFROG'], ['Saylor Moon', 'SAYLR'], ['Base Boy', 'BBOY'], ['Q3 Beat', 'BEAT'], ['Red Rocket', 'RROCK'], ['Hood Frog', 'HFROG'], ['Aveno', 'AVENO'], ['Eko Terminal', 'EKO'], ['Stonk Cat', 'SCAT'], ['Gamma Dog', 'GDOG'], ['Cyber Pup', 'CPUP']];
  const launches = [], trades = [];
  let block = 92000000;
  names.forEach(([name, symbol], i) => {
    const t = now - (names.length - i) * 18 * 60e3 + 5 * 60e3;
    const creator = i % 4 === 0 ? w('farmer', 0) : w('dev', i);
    const address = fakeAddr(symbol + 'L');
    block += 9000;
    launches.push({ address, name, symbol, creator, t, at: new Date(t).toISOString(), block, image: null });
    let price = 2e-9;
    const push = (trader, side, sec, eth, sameBlock) => {
      const amount = eth / price;
      price *= side === 'buy' ? 1 + eth * 0.9 : 1 - eth * 0.8;
      trades.push({ t: t + sec * 1000, block: sameBlock || block + Math.round(sec * 10), token: address, side, eth, amount, priceEth: eth / amount, trader, tx: '0x' + hashString(trader + sec + symbol).toString(16) });
    };
    // crews snipe some launches together, often in one block
    crews.forEach((crew, ci) => {
      if ((i + ci) % (ci === 0 ? 2 : 3) !== 0) return;
      const b = block + 3 + ci;
      crew.forEach((m, k) => push(m, 'buy', 0.3 + ci * 0.2 + (k > 2 ? 2 : 0), 0.15 + rnd() * 0.3, k <= 2 ? b : null));
      if (i % 3 !== 2) crew.forEach((m, k) => push(m, 'sell', 400 + k * 30 + ci * 60, 0.2 + rnd() * 0.4));
    });
    if (creator === w('farmer', 0)) push(creator, 'buy', 1.2, 0.4);
    const n = 18 + Math.floor(rnd() * 25);
    for (let k = 0; k < n; k++) push(retail[Math.floor(rnd() * retail.length)], rnd() < 0.7 ? 'buy' : 'sell', 4 + rnd() * (300 + (i % 5) * 700), 0.01 + rnd() * 0.12);
  });
  trades.sort((a, b) => a.block - b.block || a.t - b.t);
  cabalWorld = { at: now, launches: launches.sort((a, b) => b.t - a.t), trades };
  cabalWorld.map = buildMap(cabalWorld.launches, trades);
  return cabalWorld;
}

export function cabalMap() {
  const W = world();
  const entries = W.map.crews.filter((c) => c.active).flatMap((c) => c.tokens.filter((t) => Date.now() - t.t < 3600e3).map((t) => ({ crew: c.id, members: t.members, ...t }))).slice(0, 12);
  return { source: 'sample', windowHours: 6, scannedLaunches: W.map.scannedLaunches, crews: W.map.crews, totalCrews: W.map.crews.length, entries };
}

export function cabalScan(address) {
  if (!isAddress(address)) return null;
  const W = world();
  const known = W.launches.find((l) => l.address === address.toLowerCase());
  const l = known || W.launches[hashString(address.toLowerCase()) % 3 === 0 ? 2 : 0];
  const r = scanToken(l.address, l, W.launches, W.trades, W.map);
  return { source: 'sample', note: known ? undefined : 'Sample mode: this is demo data, not the token at this address.',
    token: { address: l.address, name: l.name, symbol: l.symbol, hasImage: false, launchedAt: l.at, creator: l.creator }, ...r };
}

// ── Death Clock + Wallet X-Ray demo, on the same simulated market ─────────
function insightWorld() {
  const W = world();
  if (!W.model) W.model = buildModel(W.launches, W.trades, W.map.memberOf, W.at);
  return W;
}

export function xray(address) {
  if (!isAddress(address)) return null;
  const W = insightWorld();
  const a = address.toLowerCase();
  const note = 'Sample mode: this is demo data from a simulated market.';
  const known = W.launches.find((l) => l.address === a);
  const wallets = [...new Set(W.trades.map((x) => x.trader))];
  if (known || !wallets.includes(a)) {
    // tokens get their Death Clock; unknown addresses alternate between a token and a wallet demo
    if (known || hashString(a) % 2 === 0) {
      const l = known || W.launches[3];
      return { source: 'sample', kind: 'token', windowHours: 6, note: known ? undefined : note,
        token: { address: l.address, name: l.name, symbol: l.symbol, hasImage: false, launchedAt: l.at, creator: l.creator }, ...forecast(W.model, l.address) };
    }
    return { source: 'sample', kind: 'wallet', windowHours: 6, note, ...xrayWallet(W.model, W.map.crews[0] ? W.map.crews[0].members[0] : wallets[0], 2600) };
  }
  return { source: 'sample', kind: 'wallet', windowHours: 6, ...xrayWallet(W.model, a, 2600) };
}

export function xrayBoard() {
  const W = insightWorld();
  const m = W.model;
  const dead = [...m.tokens.values()].filter((x) => x.life.dead && x.lifeMin != null);
  const lives = dead.map((x) => x.lifeMin).sort((p, q) => p - q);
  return { source: 'sample', windowHours: 6, deathRow: deathRow(m), ...walletBoard(m),
    stats: { launches: m.tokens.size, dead: dead.length, deadPct: Math.round((dead.length / m.tokens.size) * 100), medianLifeMin: lives.length ? lives[Math.floor(lives.length / 2)] : null, learningFrom: m.resolved.length } };
}
