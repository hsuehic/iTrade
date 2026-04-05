#!/usr/bin/env node
'use strict';
/**
 * iTrade — MA Crossover Backtest Runner
 * ──────────────────────────────────────
 * Usage:
 *   node run_backtest.js <config.json>
 *
 * All parameters (symbols, TP%, SL%, direction, data source, etc.) are read from the JSON file.
 * The script auto-compiles the strategy if needed (requires TypeScript in node_modules).
 *
 * Direction modes:
 *   "long"  — buys on bullish crossover only      (minPositionSize = 0)
 *   "short" — sells on bearish crossover only     (maxPositionSize = 0)
 *   "both"  — trades both directions              (minPositionSize = −maxPos)
 *
 * Data source (cfg.data.source):
 *   "api"   — fetch latest klines from Binance live API (default)
 *   "local" — read from {data.localDir}/{symbol.toLowerCase()}_{klineInterval}.json
 *
 * Binance API endpoints (cfg.data.exchange):
 *   "binance-futures" — https://fapi.binance.com  (USDⓈ-M perpetuals, default)
 *   "binance-spot"    — https://api.binance.com   (spot markets)
 *
 * Output:
 *   Individual HTML report per symbol  →  {outputDir}/{tag}_{sym}.html
 *   Combined comparison report         →  {outputDir}/{tag}_comparison.html
 */

const Module = require('node:module');
const nodePath = require('node:path');
const fs = require('node:fs');
const https = require('node:https');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Parse CLI + Config
// ─────────────────────────────────────────────────────────────────────────────

const configPath = process.argv[2];
if (!configPath) {
  console.error('Usage: node run_backtest.js <config.json>');
  process.exit(1);
}
const configFile = nodePath.resolve(configPath);
if (!fs.existsSync(configFile)) {
  console.error(`Config file not found: ${configFile}`);
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));

// ── Required fields ───────────────────────────────────────────────────────────
const FAST_PERIOD = cfg.strategy.fastPeriod;
const SLOW_PERIOD = cfg.strategy.slowPeriod;
const TP_PERCENT = cfg.strategy.takeProfitPercent;
const SL_PERCENT = cfg.strategy.stopLossPercent ?? 0;
const K_INTERVAL = cfg.strategy.klineInterval ?? '15m';
const DIRECTION = (cfg.strategy.direction ?? 'both').toLowerCase(); // 'long' | 'short' | 'both'

const INITIAL_BALANCE = cfg.account.initialBalance ?? 10000;
const COMMISSION_RATE = cfg.account.commissionRate ?? 0.0002;
const ENTRY_TTL_BARS = cfg.account.entryTtlBars ?? 16;

const SYMBOL_CONFIG = cfg.symbols; // [{ sym, orderAmount, maxPos }]

// ── Data source ───────────────────────────────────────────────────────────────
const DATA_SOURCE = (cfg.data?.source ?? 'api').toLowerCase(); // 'api' | 'local'
const DATA_EXCHANGE = (cfg.data?.exchange ?? 'binance-futures').toLowerCase();
const LOOKBACK_DAYS = cfg.data?.lookbackDays ?? 90;
const API_BASE_URL =
  cfg.data?.apiBaseUrl ??
  (DATA_EXCHANGE === 'binance-spot'
    ? 'https://api.binance.com'
    : 'https://fapi.binance.com');

// ── Paths ─────────────────────────────────────────────────────────────────────
const configDir = nodePath.dirname(configFile);
const resolve = (p) => nodePath.resolve(configDir, p);

// Local data dir: cfg.data.localDir takes precedence, falls back to cfg.paths.dataDir
const DATA_DIR = resolve(cfg.data?.localDir ?? cfg.paths?.dataDir ?? '.');
const OUT_DIR = resolve(cfg.paths?.outputDir ?? '.');

// Project root for compiling strategy (auto-detect if not specified)
const PROJECT_ROOT = cfg.paths.projectRoot
  ? resolve(cfg.paths.projectRoot)
  : detectProjectRoot(configDir);

// Output file tag (used for naming HTML reports)
const TAG = cfg.tag ?? autoTag();

function autoTag() {
  const dir = DIRECTION === 'both' ? 'LS' : DIRECTION === 'long' ? 'L' : 'S';
  return `MA${FAST_PERIOD}_${SLOW_PERIOD}_TP${TP_PERCENT}_SL${SL_PERCENT}_${dir}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Auto-detect project root
// ─────────────────────────────────────────────────────────────────────────────

function detectProjectRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(nodePath.join(dir, 'packages/strategies/src'))) return dir;
    const parent = nodePath.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir; // fallback — use config dir
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Auto-compile strategy to CJS if needed
// ─────────────────────────────────────────────────────────────────────────────

const CJS_STRATEGIES = '/tmp/itrade-backtest-cjs/strategies/src';
const CJS_CORE = '/tmp/itrade-backtest-cjs/core';

function ensureCompiled() {
  const stratSrc = nodePath.join(
    PROJECT_ROOT,
    'packages/strategies/src/strategies/MovingAverageStrategy.ts',
  );
  const coreSrc = nodePath.join(PROJECT_ROOT, 'packages/core/src/index.ts');
  const stratOut = nodePath.join(CJS_STRATEGIES, 'strategies/MovingAverageStrategy.js');
  const coreOut = nodePath.join(CJS_CORE, 'index.js');

  // If already compiled and fresh — skip
  const forceCompile = cfg.paths?.forceCompile === true;
  if (
    !forceCompile &&
    fs.existsSync(stratOut) &&
    fs.existsSync(coreOut) &&
    fs.existsSync(stratSrc) &&
    fs.statSync(stratSrc).mtimeMs <= fs.statSync(stratOut).mtimeMs
  ) {
    return; // up-to-date
  }

  // ── If there's an existing compiled core at /tmp/itrade-cjs/ (from dev), reuse it ──
  const legacyCoreOut = '/tmp/itrade-cjs/core/index.js';
  if (fs.existsSync(legacyCoreOut)) {
    // Just need to compile the strategy; core already exists
    fs.mkdirSync(nodePath.join(CJS_STRATEGIES, 'strategies'), { recursive: true });
    if (!fs.existsSync(coreOut)) {
      // Symlink or copy core
      fs.mkdirSync(nodePath.dirname(coreOut), { recursive: true });
      copyDir('/tmp/itrade-cjs/core', CJS_CORE);
    }
  } else if (!fs.existsSync(coreOut)) {
    // Need to compile core as well
    compileCore(coreSrc);
  }

  // Compile MovingAverageStrategy.ts
  compileStrategy(stratSrc, stratOut);

  // Also compile helper strategies (BaseStrategy is in core so not needed here)
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = nodePath.join(src, entry.name);
    const d = nodePath.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function findTypeScript() {
  const candidates = [
    nodePath.join(
      PROJECT_ROOT,
      'node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js',
    ),
    nodePath.join(PROJECT_ROOT, 'node_modules/typescript/lib/typescript.js'),
    'typescript',
  ];
  for (const c of candidates) {
    try {
      return require(c);
    } catch (ex) {
      console.error(ex);
    }
  }
  throw new Error('TypeScript not found. Install it with: npm install typescript');
}

function transpileFile(ts, srcPath) {
  const src = fs.readFileSync(srcPath, 'utf8');
  const result = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      experimentalDecorators: true,
    },
  });
  return result.outputText;
}

function compileStrategy(srcPath, outPath) {
  process.stdout.write(`  Compiling ${nodePath.basename(srcPath)}... `);
  const ts = findTypeScript();
  fs.mkdirSync(nodePath.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, transpileFile(ts, srcPath));
  console.log('done');
}

function compileCore(srcPath) {
  // Simplified core compilation — just the index barrel
  process.stdout.write('  Compiling @itrade/core... ');
  const ts = findTypeScript();
  const coreDir = nodePath.dirname(srcPath);

  // Walk and compile all .ts files in core/src
  function compileDir(dir, outBase) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = nodePath.join(dir, entry.name);
      if (entry.isDirectory()) {
        compileDir(full, nodePath.join(outBase, entry.name));
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        const outFile = nodePath.join(outBase, entry.name.replace(/\.ts$/, '.js'));
        fs.mkdirSync(nodePath.dirname(outFile), { recursive: true });
        fs.writeFileSync(outFile, transpileFile(ts, full));
      }
    }
  }
  compileDir(coreDir, CJS_CORE);
  // Copy decimal.js
  const decSrc = nodePath.join(
    PROJECT_ROOT,
    'node_modules/.pnpm/decimal.js@10.6.0/node_modules/decimal.js',
  );
  if (fs.existsSync(decSrc)) {
    copyDir(decSrc, nodePath.join(CJS_CORE, 'node_modules/decimal.js'));
  }
  console.log('done');
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Bootstrap module resolver
// ─────────────────────────────────────────────────────────────────────────────

// Reuse legacy /tmp/itrade-cjs if available; otherwise use our compiled output
const STRAT_ROOT = fs.existsSync(
  '/tmp/itrade-cjs/strategies/strategies/src/strategies/MovingAverageStrategy.js',
)
  ? '/tmp/itrade-cjs/strategies/strategies/src'
  : CJS_STRATEGIES;
const CORE_ROOT = fs.existsSync('/tmp/itrade-cjs/core/index.js')
  ? '/tmp/itrade-cjs/core'
  : CJS_CORE;

const _orig = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === '@itrade/core')
    return _orig.call(this, nodePath.join(CORE_ROOT, 'index.js'), parent, isMain);
  return _orig.call(this, req, parent, isMain);
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Load compiled modules
// ─────────────────────────────────────────────────────────────────────────────

// Make sure everything is compiled before loading
console.log(`\n🔧  Checking compiled strategy...`);
try {
  ensureCompiled();
  console.log('  ✅  Up-to-date');
} catch (e) {
  console.warn(
    '  ⚠️  Compile check failed:',
    e.message,
    '— will try to use existing build',
  );
}

const { OrderStatus, OrderSide, OrderType, TimeInForce } = require(
  nodePath.join(CORE_ROOT, 'index.js'),
);
const { MovingAverageStrategy } = require(
  nodePath.join(STRAT_ROOT, 'strategies/MovingAverageStrategy.js'),
);
const decimalPath = nodePath.join(CORE_ROOT, 'node_modules/decimal.js/index.js');
const Decimal = fs.existsSync(decimalPath)
  ? require(decimalPath).Decimal
  : require('/tmp/itrade-cjs/core/node_modules/decimal.js/index.js').Decimal;

// ─────────────────────────────────────────────────────────────────────────────
// 6. Kline loader  (API or local file)
// ─────────────────────────────────────────────────────────────────────────────

/** Interval string → milliseconds */
function intervalToMs(interval) {
  const map = {
    '1m': 60000,
    '3m': 180000,
    '5m': 300000,
    '15m': 900000,
    '30m': 1800000,
    '1h': 3600000,
    '2h': 7200000,
    '4h': 14400000,
    '6h': 21600000,
    '8h': 28800000,
    '12h': 43200000,
    '1d': 86400000,
    '3d': 259200000,
    '1w': 604800000,
    '1M': 2592000000,
  };
  return map[interval] ?? 900000;
}

/** Interval string → approximate trading bars per calendar day */
function intervalToBarsPerDay(interval) {
  return Math.round(86400000 / intervalToMs(interval));
}

/** Minimal https GET → parsed JSON */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(
              new Error(`HTTP ${res.statusCode} from ${url}: ${data.slice(0, 200)}`),
            );
          } else {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`JSON parse error from ${url}: ${e.message}`));
            }
          }
        });
      })
      .on('error', reject);
  });
}

/** Fetch all kline bars for a symbol from the Binance API (paginated). */
async function fetchKlinesFromAPI(sym) {
  const klineEndpoint =
    DATA_EXCHANGE === 'binance-spot'
      ? `${API_BASE_URL}/api/v3/klines`
      : `${API_BASE_URL}/fapi/v1/klines`;

  const limit = 1500;
  const intervalMs = intervalToMs(K_INTERVAL);
  const startTime = Date.now() - LOOKBACK_DAYS * 86400000;
  let cursor = startTime;
  const raw = [];

  process.stdout.write(
    `  Fetching ${sym} (${K_INTERVAL}, ${LOOKBACK_DAYS}d) from ${DATA_EXCHANGE}...`,
  );

  while (true) {
    const url = `${klineEndpoint}?symbol=${sym}&interval=${K_INTERVAL}&startTime=${cursor}&limit=${limit}`;
    const page = await httpsGet(url);

    if (!Array.isArray(page) || page.length === 0) break;
    raw.push(...page);

    if (page.length < limit) break; // last page
    cursor = page[page.length - 1][0] + intervalMs; // next page starts after last bar
    if (cursor > Date.now()) break;
  }

  // Drop the most-recent bar — it may be an incomplete (live) candle
  if (raw.length > 0) raw.pop();

  process.stdout.write(` ${raw.length} bars\n`);

  if (raw.length === 0) throw new Error(`No kline data returned for ${sym}`);
  return raw;
}

/** Parse a raw Binance kline array row into a structured bar object. */
function parseRawKline(r, sym) {
  return {
    timestamp: r[0],
    openTime: new Date(r[0]),
    open: new Decimal(r[1]),
    high: new Decimal(r[2]),
    low: new Decimal(r[3]),
    close: new Decimal(r[4]),
    volume: new Decimal(r[5]),
    quoteVolume: new Decimal(r[7] ?? r[5]),
    interval: K_INTERVAL,
    symbol: sym,
  };
}

/** Load klines from API or local file depending on config. */
async function loadKlines(sym) {
  if (DATA_SOURCE === 'local') {
    const file = nodePath.join(DATA_DIR, `${sym.toLowerCase()}_${K_INTERVAL}.json`);
    if (!fs.existsSync(file)) throw new Error(`Local data file not found: ${file}`);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return raw.map((r) => parseRawKline(r, sym));
  }

  // API fetch
  const raw = await fetchKlinesFromAPI(sym);
  return raw.map((r) => parseRawKline(r, sym));
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Strategy factory (respects direction)
// ─────────────────────────────────────────────────────────────────────────────

function makeStrategy(sym, orderAmount, maxPos) {
  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  // Direction controls min/max position bounds
  const maxPositionSize = DIRECTION === 'short' ? 0 : maxPos;
  const minPositionSize = DIRECTION === 'long' ? 0 : -maxPos;
  return new MovingAverageStrategy({
    type: 'MovingAverage',
    strategyId: '1',
    exchange: 'binance',
    symbol: sym,
    logger,
    parameters: {
      fastPeriod: FAST_PERIOD,
      slowPeriod: SLOW_PERIOD,
      klineInterval: K_INTERVAL,
      takeProfitPercent: TP_PERCENT,
      stopLossPercent: 0, // SL handled by backtest engine
      orderAmount,
      maxPositionSize,
      minPositionSize,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Order builder
// ─────────────────────────────────────────────────────────────────────────────

let _oid = 1;
function mkOrder(cid, side, price, qty, status = OrderStatus.FILLED) {
  return {
    id: String(_oid++),
    clientOrderId: cid,
    symbol: 'X',
    side: side === 'buy' ? OrderSide.BUY : OrderSide.SELL,
    type: OrderType.LIMIT,
    quantity: qty,
    price,
    averagePrice: price,
    executedQuantity: qty,
    status,
    timeInForce: TimeInForce.GTC,
    timestamp: new Date(),
    exchange: 'binance',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Signal helpers
// ─────────────────────────────────────────────────────────────────────────────

const norm = (r) =>
  !r
    ? []
    : Array.isArray(r)
      ? r.filter((x) => x?.action !== 'hold')
      : r.action === 'hold'
        ? []
        : [r];
const isLongEntry = (r) => r.action === 'buy' && r.metadata?.signalType === 'entry';
const isShortEntry = (r) => r.action === 'sell' && r.metadata?.signalType === 'entry';
const isLongTP = (r) => r.action === 'sell' && r.metadata?.signalType === 'take_profit';
const isShortTP = (r) => r.action === 'buy' && r.metadata?.signalType === 'take_profit';
const isCancel = (r) => r.action === 'cancel';

// ─────────────────────────────────────────────────────────────────────────────
// 10. Backtest engine
// ─────────────────────────────────────────────────────────────────────────────

async function runBacktest(sym, klines, orderAmount, maxPos) {
  const strategy = makeStrategy(sym, orderAmount, maxPos);
  const slFactor = SL_PERCENT > 0 ? new Decimal(1 - SL_PERCENT / 100) : null; // long SL   entry × (1-SL%)
  const sslFactor = SL_PERCENT > 0 ? new Decimal(1 + SL_PERCENT / 100) : null; // short SL  entry × (1+SL%)

  let cash = INITIAL_BALANCE;
  let totalComm = 0;

  // Pending entry orders:  cid → { price, qty, barIdx }
  const pendingLongEntry = new Map();
  const pendingShortEntry = new Map();

  // Active exit orders:  cid → { tpPrice, slPrice, entryPrice, qty }
  const activeLongTP = new Map(); // long positions waiting for TP or SL
  const activeShortTP = new Map(); // short positions waiting for TP or SL

  const trades = [];
  const equity = [];
  let maxEquity = INITIAL_BALANCE;
  let maxDrawdown = 0;
  let tpLong = 0,
    slLong = 0,
    tpShort = 0,
    slShort = 0;

  for (let i = 0; i < klines.length; i++) {
    const bar = klines[i];
    const bullish = bar.close.gte(bar.open);
    const fills = [];

    // ── Collect fills for this bar ─────────────────────────────────────────

    // Long entries: limit BUY fills when bar.low ≤ entryPrice
    for (const [cid, e] of pendingLongEntry) {
      if (i - e.barIdx > ENTRY_TTL_BARS) {
        pendingLongEntry.delete(cid);
        continue;
      }
      if (bar.low.lte(e.price)) {
        fills.push({ type: 'longEntry', cid, price: e.price, qty: e.qty });
        pendingLongEntry.delete(cid);
      }
    }

    // Short entries: limit SELL fills when bar.high ≥ entryPrice
    for (const [cid, e] of pendingShortEntry) {
      if (i - e.barIdx > ENTRY_TTL_BARS) {
        pendingShortEntry.delete(cid);
        continue;
      }
      if (bar.high.gte(e.price)) {
        fills.push({ type: 'shortEntry', cid, price: e.price, qty: e.qty });
        pendingShortEntry.delete(cid);
      }
    }

    // Long TP / SL
    for (const [cid, pos] of activeLongTP) {
      const tpHit = bar.high.gte(pos.tpPrice);
      const slHit = slFactor && bar.low.lte(pos.slPrice);
      if (tpHit && slHit) {
        fills.push(
          bullish
            ? {
                type: 'longTP',
                cid,
                price: pos.tpPrice,
                entryPrice: pos.entryPrice,
                qty: pos.qty,
              }
            : {
                type: 'longSL',
                cid,
                price: pos.slPrice,
                entryPrice: pos.entryPrice,
                qty: pos.qty,
              },
        );
        activeLongTP.delete(cid);
      } else if (tpHit) {
        fills.push({
          type: 'longTP',
          cid,
          price: pos.tpPrice,
          entryPrice: pos.entryPrice,
          qty: pos.qty,
        });
        activeLongTP.delete(cid);
      } else if (slHit) {
        fills.push({
          type: 'longSL',
          cid,
          price: pos.slPrice,
          entryPrice: pos.entryPrice,
          qty: pos.qty,
        });
        activeLongTP.delete(cid);
      }
    }

    // Short TP / SL
    for (const [cid, pos] of activeShortTP) {
      const tpHit = bar.low.lte(pos.tpPrice); // price fell to TP (good for short)
      const slHit = sslFactor && bar.high.gte(pos.slPrice); // price rose to SL (bad for short)
      if (tpHit && slHit) {
        fills.push(
          bullish
            ? {
                type: 'shortSL',
                cid,
                price: pos.slPrice,
                entryPrice: pos.entryPrice,
                qty: pos.qty,
              }
            : {
                type: 'shortTP',
                cid,
                price: pos.tpPrice,
                entryPrice: pos.entryPrice,
                qty: pos.qty,
              },
        );
        activeShortTP.delete(cid);
      } else if (tpHit) {
        fills.push({
          type: 'shortTP',
          cid,
          price: pos.tpPrice,
          entryPrice: pos.entryPrice,
          qty: pos.qty,
        });
        activeShortTP.delete(cid);
      } else if (slHit) {
        fills.push({
          type: 'shortSL',
          cid,
          price: pos.slPrice,
          entryPrice: pos.entryPrice,
          qty: pos.qty,
        });
        activeShortTP.delete(cid);
      }
    }

    // ── Process fills ───────────────────────────────────────────────────────

    for (const f of fills) {
      const comm = f.price.mul(f.qty).mul(COMMISSION_RATE);

      if (f.type === 'longEntry') {
        cash -= f.price.mul(f.qty).plus(comm).toNumber();
        totalComm += comm.toNumber();
        const sigs = norm(
          await strategy.analyze({
            exchangeName: 'binance',
            symbol: sym,
            orders: [mkOrder(f.cid, 'buy', f.price, f.qty)],
          }),
        );
        await strategy.onTradeExecuted({
          side: OrderSide.BUY,
          quantity: f.qty,
          price: f.price,
          symbol: sym,
          exchange: 'binance',
          timestamp: new Date(),
        });
        for (const s of sigs) {
          if (isLongTP(s)) {
            activeLongTP.set(s.clientOrderId, {
              tpPrice: s.price,
              slPrice: slFactor ? f.price.mul(slFactor) : new Decimal(-Infinity),
              entryPrice: f.price,
              qty: s.quantity,
            });
          }
        }
      } else if (f.type === 'shortEntry') {
        cash += f.price.mul(f.qty).minus(comm).toNumber(); // receive proceeds
        totalComm += comm.toNumber();
        const sigs = norm(
          await strategy.analyze({
            exchangeName: 'binance',
            symbol: sym,
            orders: [mkOrder(f.cid, 'sell', f.price, f.qty)],
          }),
        );
        await strategy.onTradeExecuted({
          side: OrderSide.SELL,
          quantity: f.qty,
          price: f.price,
          symbol: sym,
          exchange: 'binance',
          timestamp: new Date(),
        });
        for (const s of sigs) {
          if (isShortTP(s)) {
            activeShortTP.set(s.clientOrderId, {
              tpPrice: s.price,
              slPrice: sslFactor ? f.price.mul(sslFactor) : new Decimal(Infinity),
              entryPrice: f.price,
              qty: s.quantity,
            });
          }
        }
      } else if (f.type === 'longTP') {
        cash += f.price.mul(f.qty).minus(comm).toNumber();
        totalComm += comm.toNumber();
        const pnl = f.price.minus(f.entryPrice).mul(f.qty).toNumber();
        trades.push({
          result: 'tp',
          side: 'long',
          entry: f.entryPrice.toNumber(),
          exit: f.price.toNumber(),
          pnl,
        });
        tpLong++;
        const sigs = norm(
          await strategy.analyze({
            exchangeName: 'binance',
            symbol: sym,
            orders: [mkOrder(f.cid, 'sell', f.price, f.qty)],
          }),
        );
        await strategy.onTradeExecuted({
          side: OrderSide.SELL,
          quantity: f.qty,
          price: f.price,
          symbol: sym,
          exchange: 'binance',
          timestamp: new Date(),
        });
        for (const s of sigs) {
          if (isLongEntry(s))
            pendingLongEntry.set(s.clientOrderId, {
              price: s.price,
              qty: s.quantity,
              barIdx: i,
            });
          if (isShortEntry(s))
            pendingShortEntry.set(s.clientOrderId, {
              price: s.price,
              qty: s.quantity,
              barIdx: i,
            });
        }
      } else if (f.type === 'longSL') {
        cash += f.price.mul(f.qty).minus(comm).toNumber();
        totalComm += comm.toNumber();
        const pnl = f.price.minus(f.entryPrice).mul(f.qty).toNumber();
        trades.push({
          result: 'sl',
          side: 'long',
          entry: f.entryPrice.toNumber(),
          exit: f.price.toNumber(),
          pnl,
        });
        slLong++;
        await strategy.analyze({
          exchangeName: 'binance',
          symbol: sym,
          orders: [mkOrder(f.cid, 'sell', f.price, f.qty, OrderStatus.CANCELED)],
        });
        await strategy.onTradeExecuted({
          side: OrderSide.SELL,
          quantity: f.qty,
          price: f.price,
          symbol: sym,
          exchange: 'binance',
          timestamp: new Date(),
        });
      } else if (f.type === 'shortTP') {
        cash -= f.price.mul(f.qty).plus(comm).toNumber(); // pay to cover
        totalComm += comm.toNumber();
        const pnl = f.entryPrice.minus(f.price).mul(f.qty).toNumber();
        trades.push({
          result: 'tp',
          side: 'short',
          entry: f.entryPrice.toNumber(),
          exit: f.price.toNumber(),
          pnl,
        });
        tpShort++;
        const sigs = norm(
          await strategy.analyze({
            exchangeName: 'binance',
            symbol: sym,
            orders: [mkOrder(f.cid, 'buy', f.price, f.qty)],
          }),
        );
        await strategy.onTradeExecuted({
          side: OrderSide.BUY,
          quantity: f.qty,
          price: f.price,
          symbol: sym,
          exchange: 'binance',
          timestamp: new Date(),
        });
        for (const s of sigs) {
          if (isLongEntry(s))
            pendingLongEntry.set(s.clientOrderId, {
              price: s.price,
              qty: s.quantity,
              barIdx: i,
            });
          if (isShortEntry(s))
            pendingShortEntry.set(s.clientOrderId, {
              price: s.price,
              qty: s.quantity,
              barIdx: i,
            });
        }
      } else if (f.type === 'shortSL') {
        cash -= f.price.mul(f.qty).plus(comm).toNumber(); // pay to cover at loss
        totalComm += comm.toNumber();
        const pnl = f.entryPrice.minus(f.price).mul(f.qty).toNumber();
        trades.push({
          result: 'sl',
          side: 'short',
          entry: f.entryPrice.toNumber(),
          exit: f.price.toNumber(),
          pnl,
        });
        slShort++;
        await strategy.analyze({
          exchangeName: 'binance',
          symbol: sym,
          orders: [mkOrder(f.cid, 'buy', f.price, f.qty, OrderStatus.CANCELED)],
        });
        await strategy.onTradeExecuted({
          side: OrderSide.BUY,
          quantity: f.qty,
          price: f.price,
          symbol: sym,
          exchange: 'binance',
          timestamp: new Date(),
        });
      }
    }

    // ── Kline update → new entry signals ───────────────────────────────────
    const sigs = norm(
      await strategy.analyze({ exchangeName: 'binance', symbol: sym, klines: [bar] }),
    );
    for (const s of sigs) {
      if (isCancel(s)) {
        pendingLongEntry.delete(s.clientOrderId);
        pendingShortEntry.delete(s.clientOrderId);
      } else if (isLongEntry(s))
        pendingLongEntry.set(s.clientOrderId, {
          price: s.price,
          qty: s.quantity,
          barIdx: i,
        });
      else if (isShortEntry(s))
        pendingShortEntry.set(s.clientOrderId, {
          price: s.price,
          qty: s.quantity,
          barIdx: i,
        });
    }

    // ── MTM equity: cash + longValue − shortLiability ──────────────────────
    let mtm = cash;
    for (const [, p] of activeLongTP) mtm += bar.close.mul(p.qty).toNumber();
    for (const [, p] of activeShortTP) mtm -= bar.close.mul(p.qty).toNumber();
    equity.push(mtm);
    if (mtm > maxEquity) maxEquity = mtm;
    const dd = (maxEquity - mtm) / maxEquity;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // ── Close all open positions at last close ──────────────────────────────
  const lastClose = klines[klines.length - 1].close;
  for (const [, p] of activeLongTP) {
    const comm = lastClose.mul(p.qty).mul(COMMISSION_RATE);
    cash += lastClose.mul(p.qty).minus(comm).toNumber();
    trades.push({
      result: 'open_close',
      side: 'long',
      entry: p.entryPrice.toNumber(),
      exit: lastClose.toNumber(),
      pnl: lastClose.minus(p.entryPrice).mul(p.qty).toNumber(),
    });
  }
  for (const [, p] of activeShortTP) {
    const comm = lastClose.mul(p.qty).mul(COMMISSION_RATE);
    cash -= lastClose.mul(p.qty).plus(comm).toNumber();
    trades.push({
      result: 'open_close',
      side: 'short',
      entry: p.entryPrice.toNumber(),
      exit: lastClose.toNumber(),
      pnl: p.entryPrice.minus(lastClose).mul(p.qty).toNumber(),
    });
  }

  const finalEquity = cash;
  const totalReturn = (finalEquity - INITIAL_BALANCE) / INITIAL_BALANCE;
  const tpCount = tpLong + tpShort;
  const slCount = slLong + slShort;
  const winCount = trades.filter((t) => t.pnl > 0).length;
  const lossCount = trades.length - winCount;
  const winRate = trades.length ? winCount / trades.length : 0;
  const grossProfit = trades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = trades
    .filter((t) => t.pnl < 0)
    .reduce((s, t) => s + Math.abs(t.pnl), 0);
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : Infinity;
  const avgWin = winCount ? grossProfit / winCount : 0;
  const avgLoss = lossCount ? grossLoss / lossCount : 0;
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;

  // Annualised Sharpe from daily returns (interval-aware bars/day)
  const barsPerDay = intervalToBarsPerDay(K_INTERVAL);
  const daily = [];
  for (let d = 0; d < equity.length; d += barsPerDay) daily.push(equity[d]);
  daily.push(finalEquity);
  const dRets = [];
  for (let d = 1; d < daily.length; d++)
    dRets.push((daily[d] - daily[d - 1]) / daily[d - 1]);
  const meanR = dRets.reduce((s, r) => s + r, 0) / (dRets.length || 1);
  const stdR = Math.sqrt(
    dRets.reduce((s, r) => s + (r - meanR) ** 2, 0) / (dRets.length || 1),
  );
  const sharpe = stdR > 0 ? (meanR / stdR) * Math.sqrt(365) : 0;

  return {
    sym,
    klines,
    equity,
    trades,
    finalEquity,
    totalReturn,
    maxDrawdown,
    winRate,
    winCount,
    lossCount,
    totalTrades: trades.length,
    tpCount,
    slCount,
    tpLong,
    slLong,
    tpShort,
    slShort,
    grossProfit,
    grossLoss,
    profitFactor,
    avgWin,
    avgLoss,
    expectancy,
    totalComm,
    sharpe,
    startPrice: klines[0].open.toNumber(),
    finalPrice: lastClose.toNumber(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. HTML report builders
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n, d = 2) => Number(n).toFixed(d);
const fmtPct = (n) => (Number(n) * 100).toFixed(2) + '%';

const dirLabel =
  DIRECTION === 'long'
    ? 'Long Only'
    : DIRECTION === 'short'
      ? 'Short Only'
      : 'Long+Short';

function buildHTML(r) {
  const priceChange = (r.finalPrice - r.startPrice) / r.startPrice;
  const equityJSON = JSON.stringify(r.equity.filter((_, i) => i % 4 === 0));
  const ts0 = r.klines[0].timestamp;
  const ts1 = r.klines[r.klines.length - 1].timestamp;
  const dateRange = `${new Date(ts0).toISOString().slice(0, 10)} → ${new Date(ts1).toISOString().slice(0, 10)}`;
  const retColor = r.totalReturn >= 0 ? '#22c55e' : '#ef4444';
  const slRow =
    SL_PERCENT > 0
      ? `<div class="card"><div class="label">SL Hits</div><div class="value neg">${r.slCount}</div><div class="sub2">L:${r.slLong} / S:${r.slShort} · −${SL_PERCENT}%</div></div>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MA ${FAST_PERIOD}/${SLOW_PERIOD} ${dirLabel} — ${r.sym}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
  :root{--bg:#0f172a;--card:#1e293b;--border:#334155;--text:#e2e8f0;--muted:#94a3b8;--green:#22c55e;--red:#ef4444;--blue:#3b82f6}
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--bg);color:var(--text);font-family:'Segoe UI',sans-serif;padding:24px;min-height:100vh}
  h1{font-size:1.5rem;font-weight:700;margin-bottom:4px}
  .sub{color:var(--muted);font-size:.85rem;margin-bottom:24px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:14px;margin-bottom:24px}
  .card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px}
  .card .label{font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
  .card .value{font-size:1.6rem;font-weight:700}
  .card .sub2{font-size:.8rem;color:var(--muted);margin-top:4px}
  .chart-wrap{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:24px;height:340px}
  .section{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:24px}
  .section h2{font-size:1rem;font-weight:600;margin-bottom:14px;color:var(--muted)}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  table{width:100%;border-collapse:collapse;font-size:.85rem}
  th{text-align:left;padding:8px 12px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:500}
  td{padding:8px 12px;border-bottom:1px solid var(--border)}
  .pos{color:var(--green)}.neg{color:var(--red)}.neu{color:var(--muted)}
  footer{text-align:center;color:var(--muted);font-size:.75rem;margin-top:32px}
</style>
</head>
<body>
<h1>📊 MA ${FAST_PERIOD}/${SLOW_PERIOD} · TP ${TP_PERCENT}% · SL ${SL_PERCENT > 0 ? SL_PERCENT + '%' : 'off'} · ${dirLabel} — ${r.sym}</h1>
<div class="sub">Fast: ${FAST_PERIOD} · Slow: ${SLOW_PERIOD} · TP: ${TP_PERCENT}% · SL: ${SL_PERCENT > 0 ? SL_PERCENT + '%' : 'disabled'} · ${dirLabel} · ${dateRange}</div>
<div class="grid">
  <div class="card"><div class="label">Total Return</div><div class="value" style="color:${retColor}">${fmtPct(r.totalReturn)}</div><div class="sub2">$${INITIAL_BALANCE.toLocaleString()} → $${fmt(r.finalEquity)}</div></div>
  <div class="card"><div class="label">Max Drawdown</div><div class="value neg">${fmtPct(r.maxDrawdown)}</div><div class="sub2">From equity peak</div></div>
  <div class="card"><div class="label">TP Hits</div><div class="value pos">${r.tpCount}</div><div class="sub2">L:${r.tpLong} / S:${r.tpShort} · +${TP_PERCENT}%</div></div>
  ${slRow}
  <div class="card"><div class="label">Win Rate</div><div class="value">${fmtPct(r.winRate)}</div><div class="sub2">${r.winCount}W / ${r.lossCount}L / ${r.totalTrades} total</div></div>
  <div class="card"><div class="label">Profit Factor</div><div class="value">${isFinite(r.profitFactor) ? fmt(r.profitFactor) : '∞'}</div><div class="sub2">P:$${fmt(r.grossProfit)} · L:$${fmt(r.grossLoss)}</div></div>
  <div class="card"><div class="label">Expectancy</div><div class="value" style="color:${r.expectancy >= 0 ? 'var(--green)' : 'var(--red)'}">${r.expectancy >= 0 ? '+' : ''}$${fmt(r.expectancy)}</div><div class="sub2">Per-trade avg P&amp;L</div></div>
  <div class="card"><div class="label">Sharpe Ratio</div><div class="value">${fmt(r.sharpe, 3)}</div><div class="sub2">Annualised (daily)</div></div>
  <div class="card"><div class="label">Avg Win</div><div class="value pos">$${fmt(r.avgWin)}</div><div class="sub2">Avg Loss: $${fmt(r.avgLoss)}</div></div>
  <div class="card"><div class="label">Price Δ</div><div class="value" style="color:${priceChange >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtPct(priceChange)}</div><div class="sub2">$${fmt(r.startPrice, 4)} → $${fmt(r.finalPrice, 4)}</div></div>
</div>
<div class="chart-wrap"><canvas id="eqChart"></canvas></div>
<div class="two-col">
  <div class="section"><h2>Performance Summary</h2><table>
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Initial Balance</td><td>$${INITIAL_BALANCE.toLocaleString()}</td></tr>
    <tr><td>Final Equity</td><td class="${r.finalEquity >= INITIAL_BALANCE ? 'pos' : 'neg'}">$${fmt(r.finalEquity)}</td></tr>
    <tr><td>Net P&amp;L</td><td class="${r.finalEquity - INITIAL_BALANCE >= 0 ? 'pos' : 'neg'}">$${fmt(r.finalEquity - INITIAL_BALANCE)}</td></tr>
    <tr><td>Total Return</td><td class="${r.totalReturn >= 0 ? 'pos' : 'neg'}">${fmtPct(r.totalReturn)}</td></tr>
    <tr><td>Max Drawdown</td><td class="neg">${fmtPct(r.maxDrawdown)}</td></tr>
    <tr><td>Sharpe Ratio</td><td>${fmt(r.sharpe, 3)}</td></tr>
    <tr><td>Total Commission</td><td class="neg">$${fmt(r.totalComm)}</td></tr>
    <tr><td>Price Change</td><td class="${priceChange >= 0 ? 'pos' : 'neg'}">${fmtPct(priceChange)}</td></tr>
  </table></div>
  <div class="section"><h2>Trade Statistics</h2><table>
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Total Trades</td><td>${r.totalTrades}</td></tr>
    <tr><td>TP Hits (Long)</td><td class="pos">${r.tpLong}</td></tr>
    <tr><td>TP Hits (Short)</td><td class="pos">${r.tpShort}</td></tr>
    <tr><td>SL Hits (Long)</td><td class="neg">${r.slLong}</td></tr>
    <tr><td>SL Hits (Short)</td><td class="neg">${r.slShort}</td></tr>
    <tr><td>Open Close (EOD)</td><td class="neu">${r.totalTrades - r.tpCount - r.slCount}</td></tr>
    <tr><td>Win Rate</td><td>${fmtPct(r.winRate)}</td></tr>
    <tr><td>Avg Win</td><td class="pos">$${fmt(r.avgWin)}</td></tr>
    <tr><td>Avg Loss</td><td class="neg">$${fmt(r.avgLoss)}</td></tr>
    <tr><td>Win / Loss Ratio</td><td>${r.avgLoss > 0 ? fmt(r.avgWin / r.avgLoss) : '∞'}</td></tr>
    <tr><td>Profit Factor</td><td>${isFinite(r.profitFactor) ? fmt(r.profitFactor) : '∞'}</td></tr>
    <tr><td>Expectancy / trade</td><td class="${r.expectancy >= 0 ? 'pos' : 'neg'}">${r.expectancy >= 0 ? '+' : ''}$${fmt(r.expectancy)}</td></tr>
    <tr><td>Gross Profit</td><td class="pos">$${fmt(r.grossProfit)}</td></tr>
    <tr><td>Gross Loss</td><td class="neg">$${fmt(r.grossLoss)}</td></tr>
  </table></div>
</div>
<footer>Generated ${new Date().toISOString()} · ${cfg.name ?? TAG} · ${dirLabel} · Binance Perp</footer>
<script>
const eq = ${equityJSON};
new Chart(document.getElementById('eqChart'), {
  type: 'line',
  data: { labels: Array.from({length:eq.length},(_,i)=>i), datasets:[{ label:'Equity ($)', data:eq,
    borderColor:'${r.totalReturn >= 0 ? '#22c55e' : '#ef4444'}', borderWidth:1.5, pointRadius:0, fill:true,
    backgroundColor:'${r.totalReturn >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'}' }] },
  options:{ responsive:true, maintainAspectRatio:false, animation:false,
    plugins:{ legend:{labels:{color:'#94a3b8'}}, tooltip:{callbacks:{label:ctx=>'$'+ctx.raw.toFixed(2)}} },
    scales:{ x:{display:false}, y:{ticks:{color:'#94a3b8',callback:v=>'$'+v.toFixed(0)},grid:{color:'rgba(148,163,184,0.1)'}} }
  }
});
</script></body></html>`;
}

function buildComparison(results) {
  const rows = results
    .map((r) => {
      const pc = (r.finalPrice - r.startPrice) / r.startPrice;
      const rc = r.totalReturn >= 0 ? '#22c55e' : '#ef4444';
      return `<tr>
      <td><strong>${r.sym}</strong></td>
      <td style="color:${rc}">${fmtPct(r.totalReturn)}</td>
      <td class="${r.finalEquity - INITIAL_BALANCE >= 0 ? 'pos' : 'neg'}">$${fmt(r.finalEquity - INITIAL_BALANCE)}</td>
      <td class="neg">${fmtPct(r.maxDrawdown)}</td>
      <td>${fmtPct(r.winRate)}</td>
      <td class="pos">${r.tpCount} (L:${r.tpLong}/S:${r.tpShort})</td>
      <td class="neg">${r.slCount} (L:${r.slLong}/S:${r.slShort})</td>
      <td>${r.avgLoss > 0 ? fmt(r.avgWin / r.avgLoss) : '∞'}</td>
      <td>${isFinite(r.profitFactor) ? fmt(r.profitFactor) : '∞'}</td>
      <td>${fmt(r.sharpe, 3)}</td>
      <td style="color:${pc >= 0 ? '#22c55e' : '#ef4444'}">${fmtPct(pc)}</td>
    </tr>`;
    })
    .join('');

  const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6'];
  const datasets = results.map((r, idx) => {
    const eq = r.equity.filter((_, i) => i % 4 === 0);
    return `{label:'${r.sym}',data:${JSON.stringify(eq)},borderColor:'${colors[idx % colors.length]}',borderWidth:1.5,pointRadius:0,fill:false}`;
  });
  const maxLen = Math.max(...results.map((r) => Math.ceil(r.equity.length / 4)));
  const ts0 = results[0].klines[0].timestamp;
  const ts1 = results[0].klines[results[0].klines.length - 1].timestamp;
  const dateRange = `${new Date(ts0).toISOString().slice(0, 10)} → ${new Date(ts1).toISOString().slice(0, 10)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${cfg.name ?? TAG} — Comparison</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
  :root{--bg:#0f172a;--card:#1e293b;--border:#334155;--text:#e2e8f0;--muted:#94a3b8;--green:#22c55e;--red:#ef4444}
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--bg);color:var(--text);font-family:'Segoe UI',sans-serif;padding:24px;min-height:100vh}
  h1{font-size:1.6rem;font-weight:700;margin-bottom:4px}.sub{color:var(--muted);font-size:.85rem;margin-bottom:28px}
  .chart-wrap{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:28px;height:380px}
  .section{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:24px}
  .section h2{font-size:1rem;font-weight:600;margin-bottom:14px;color:var(--muted)}
  table{width:100%;border-collapse:collapse;font-size:.85rem}
  th{text-align:left;padding:10px 14px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:500}
  td{padding:10px 14px;border-bottom:1px solid var(--border)}
  .pos{color:var(--green)}.neg{color:var(--red)}
  footer{text-align:center;color:var(--muted);font-size:.75rem;margin-top:32px}
</style>
</head>
<body>
<h1>📊 ${cfg.name ?? `MA ${FAST_PERIOD}/${SLOW_PERIOD} · TP ${TP_PERCENT}% · SL ${SL_PERCENT > 0 ? SL_PERCENT + '%' : 'off'} · ${dirLabel}`}</h1>
<div class="sub">Fast:${FAST_PERIOD} · Slow:${SLOW_PERIOD} · TP:${TP_PERCENT}% · SL:${SL_PERCENT > 0 ? SL_PERCENT + '%' : 'off'} · ${dirLabel} · $${INITIAL_BALANCE.toLocaleString()} · ${dateRange}</div>
<div class="chart-wrap"><canvas id="cmpChart"></canvas></div>
<div class="section"><h2>Results Summary</h2><table>
  <thead><tr>
    <th>Symbol</th><th>Return%</th><th>Net P&amp;L</th><th>Max DD</th>
    <th>Win Rate</th><th>TP Hits</th><th>SL Hits</th>
    <th>W/L Ratio</th><th>Prof. Factor</th><th>Sharpe</th><th>Price Δ</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<div class="section"><h2>Parameters</h2><table>
  <tr><th>Parameter</th><th>Value</th></tr>
  <tr><td>Fast MA</td><td>${FAST_PERIOD}</td></tr>
  <tr><td>Slow MA</td><td>${SLOW_PERIOD}</td></tr>
  <tr><td>Kline Interval</td><td>${K_INTERVAL}</td></tr>
  <tr><td>Take Profit</td><td>${TP_PERCENT}%</td></tr>
  <tr><td>Stop Loss</td><td>${SL_PERCENT > 0 ? SL_PERCENT + '%' : 'Disabled'}</td></tr>
  <tr><td>Direction</td><td>${dirLabel}</td></tr>
  <tr><td>Initial Balance</td><td>$${INITIAL_BALANCE.toLocaleString()}</td></tr>
  <tr><td>Commission</td><td>${(COMMISSION_RATE * 100).toFixed(3)}% per fill</td></tr>
  <tr><td>Entry TTL</td><td>${ENTRY_TTL_BARS} bars</td></tr>
  <tr><td>TP/SL Conflict</td><td>Long: bullish→TP / bearish→SL · Short: bullish→SL / bearish→TP</td></tr>
  <tr><td>Config File</td><td>${nodePath.basename(configFile)}</td></tr>
</table></div>
<footer>Generated ${new Date().toISOString()} · ${cfg.name ?? TAG}</footer>
<script>
new Chart(document.getElementById('cmpChart'), {
  type: 'line',
  data:{ labels:Array.from({length:${maxLen}},(_,i)=>i), datasets:[${datasets.join(',')}] },
  options:{ responsive:true, maintainAspectRatio:false, animation:false,
    plugins:{ legend:{labels:{color:'#94a3b8'}}, tooltip:{callbacks:{label:ctx=>ctx.dataset.label+': $'+ctx.raw.toFixed(2)}} },
    scales:{ x:{display:false}, y:{ticks:{color:'#94a3b8',callback:v=>'$'+v.toFixed(0)},grid:{color:'rgba(148,163,184,0.1)'}} }
  }
});
</script></body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. Main
// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\n🚀  ${cfg.name ?? TAG}`);
  console.log(
    `    MA(${FAST_PERIOD}/${SLOW_PERIOD}) · TP ${TP_PERCENT}% · SL ${SL_PERCENT > 0 ? SL_PERCENT + '%' : 'off'} · ${dirLabel} · $${INITIAL_BALANCE} · Commission ${(COMMISSION_RATE * 100).toFixed(3)}%`,
  );
  const dataInfo =
    DATA_SOURCE === 'local'
      ? `Local: ${DATA_DIR}`
      : `${DATA_EXCHANGE} · ${LOOKBACK_DAYS}d lookback`;
  console.log(`    Data: ${dataInfo}  →  Output: ${OUT_DIR}\n`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const results = [];
  for (const { sym, orderAmount, maxPos } of SYMBOL_CONFIG) {
    const klines = await loadKlines(sym);
    process.stdout.write(`  ${sym.padEnd(10)} `);
    const r = await runBacktest(sym, klines, orderAmount, maxPos);
    results.push(r);
    console.log(
      `Return: ${fmtPct(r.totalReturn).padEnd(9)}  ` +
        `Trades: ${String(r.totalTrades).padEnd(4)} (TP:${r.tpCount}/SL:${r.slCount})  ` +
        `WR: ${fmtPct(r.winRate).padEnd(8)}  MaxDD: ${fmtPct(r.maxDrawdown).padEnd(8)}  ` +
        `PF: ${(isFinite(r.profitFactor) ? fmt(r.profitFactor) : '∞').padEnd(6)}  Sharpe: ${fmt(r.sharpe, 3)}`,
    );
  }

  // Write per-symbol reports
  console.log('');
  for (const r of results) {
    const outFile = nodePath.join(OUT_DIR, `${TAG}_${r.sym}.html`);
    fs.writeFileSync(outFile, buildHTML(r), 'utf8');
    console.log(`  ✅  ${outFile}`);
  }

  // Write comparison report
  const cmpFile = nodePath.join(OUT_DIR, `${TAG}_comparison.html`);
  fs.writeFileSync(cmpFile, buildComparison(results), 'utf8');
  console.log(`  ✅  ${cmpFile}`);

  // Console summary table
  console.log('\n' + '═'.repeat(112));
  console.log(`  ${cfg.name ?? TAG}`);
  console.log('═'.repeat(112));
  console.log(
    `  ${'Symbol'.padEnd(10)} ${'Return%'.padEnd(10)} ${'Net P&L'.padEnd(12)} ${'MaxDD%'.padEnd(9)} ${'WinRate'.padEnd(9)} ${'TP'.padEnd(5)} ${'SL'.padEnd(5)} ${'PF'.padEnd(7)} ${'Sharpe'.padEnd(9)} ${'PriceΔ'}`,
  );
  console.log('  ' + '─'.repeat(90));
  for (const r of results) {
    const pc = (r.finalPrice - r.startPrice) / r.startPrice;
    console.log(
      `  ${r.sym.padEnd(10)} ${fmtPct(r.totalReturn).padEnd(10)} ${('$' + fmt(r.finalEquity - INITIAL_BALANCE)).padEnd(12)} ` +
        `${fmtPct(r.maxDrawdown).padEnd(9)} ${fmtPct(r.winRate).padEnd(9)} ${String(r.tpCount).padEnd(5)} ${String(r.slCount).padEnd(5)} ` +
        `${(isFinite(r.profitFactor) ? fmt(r.profitFactor) : '∞').padEnd(7)} ${fmt(r.sharpe, 3).padEnd(9)} ${fmtPct(pc)}`,
    );
  }
  console.log('═'.repeat(112));
})().catch((e) => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});
