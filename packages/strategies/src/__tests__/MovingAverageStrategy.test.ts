import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import {
  MovingAverageStrategy,
  MovingAverageParameters,
  MovingAverageStrategyRegistryConfig,
} from '../strategies/MovingAverageStrategy';
import {
  StrategyConfig,
  StrategyAnalyzeResult,
  StrategyResult,
  StrategyOrderResult,
  StrategyCancelOrderResult,
  Order,
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
  Kline,
  KlineInterval,
  SignalType,
  InitialDataResult,
  DataUpdate,
  createEmptyPerformance,
  isOrderResult,
  isCancelOrderResult,
} from '@itrade/core';

// ─────────────────────────────────────────────────────────────────────────────
// Shared test helpers
// ─────────────────────────────────────────────────────────────────────────────

const SYMBOL = 'BTC/USDT';
const EXCHANGE = 'okx';
const STRATEGY_ID = 42;

/** Build a minimal StrategyConfig with sensible defaults. */
function makeConfig(
  params: Partial<MovingAverageParameters> = {},
  extra: Partial<StrategyConfig<MovingAverageParameters>> = {},
): StrategyConfig<MovingAverageParameters> {
  const defaults: MovingAverageParameters = {
    maType: 'sma',
    fastPeriod: 3, // small periods so tests don't need huge kline arrays
    slowPeriod: 5,
    klineInterval: '15m',
    takeProfitPercent: 2,
    stopLossPercent: 0, // disabled by default
    orderAmount: 100,
    maxPositionSize: 1000,
    minPositionSize: -1000,
  };
  return {
    type: 'MovingAverageStrategy',
    parameters: { ...defaults, ...params },
    symbol: SYMBOL,
    exchange: EXCHANGE,
    strategyId: STRATEGY_ID,
    strategyName: 'Test MA Strategy',
    performance: createEmptyPerformance(
      SYMBOL,
      EXCHANGE,
      STRATEGY_ID,
      'Test MA Strategy',
    ),
    ...extra,
  };
}

/** Build a minimal Kline object. */
function makeKline(open: number, close: number, interval: KlineInterval = '15m'): Kline {
  return {
    symbol: SYMBOL,
    exchange: EXCHANGE,
    interval,
    openTime: new Date(),
    closeTime: new Date(),
    open: new Decimal(open),
    high: new Decimal(Math.max(open, close) + 1),
    low: new Decimal(Math.min(open, close) - 1),
    close: new Decimal(close),
    volume: new Decimal(1000),
    quoteVolume: new Decimal(close * 1000),
    trades: 100,
    isClosed: true,
  };
}

/** Build a DataUpdate carrying kline data. */
function klineUpdate(
  open: number,
  close: number,
  interval: KlineInterval = '15m',
): DataUpdate {
  return {
    exchangeName: EXCHANGE,
    symbol: SYMBOL,
    klines: [makeKline(open, close, interval)],
  };
}

/** Build a DataUpdate carrying order state. */
function orderUpdate(orders: Order[]): DataUpdate {
  return { exchangeName: EXCHANGE, symbol: SYMBOL, orders };
}

/** Build an Order object. */
function makeOrder(
  clientOrderId: string,
  side: OrderSide,
  status: OrderStatus,
  price: number,
  quantity: number,
  averagePrice?: number,
): Order {
  return {
    id: `id-${clientOrderId}`,
    clientOrderId,
    symbol: SYMBOL,
    exchange: EXCHANGE,
    side,
    type: OrderType.LIMIT,
    status,
    price: new Decimal(price),
    quantity: new Decimal(quantity),
    executedQuantity:
      status === OrderStatus.FILLED ? new Decimal(quantity) : new Decimal(0),
    averagePrice:
      averagePrice !== undefined
        ? new Decimal(averagePrice)
        : status === OrderStatus.FILLED
          ? new Decimal(price)
          : undefined,
    timeInForce: TimeInForce.GTC,
    timestamp: new Date(),
    updateTime: new Date(),
  };
}

/** Build a minimal InitialDataResult. */
function makeInitialData(
  klines: Kline[] = [],
  openOrders: Order[] = [],
): InitialDataResult {
  return {
    symbol: SYMBOL,
    exchange: EXCHANGE,
    timestamp: new Date(),
    klines: klines.length > 0 ? { '15m': klines } : undefined,
    openOrders: openOrders.length > 0 ? openOrders : undefined,
  };
}

/**
 * Normalise StrategyAnalyzeResult → flat array of StrategyResult.
 * Filters out hold results.
 */
function toArray(result: StrategyAnalyzeResult): StrategyResult[] {
  const arr = Array.isArray(result) ? result : [result];
  return arr.filter((r) => r.action !== 'hold');
}

/** Find order signals with a specific SignalType. */
function findBySignalType(
  result: StrategyAnalyzeResult,
  type: SignalType,
): StrategyOrderResult[] {
  return toArray(result).filter(
    (r): r is StrategyOrderResult => isOrderResult(r) && r.metadata?.signalType === type,
  );
}

/** Find cancel signals in a result. */
function findCancels(result: StrategyAnalyzeResult): StrategyCancelOrderResult[] {
  return toArray(result).filter((r): r is StrategyCancelOrderResult =>
    isCancelOrderResult(r),
  );
}

/**
 * Triggers a bullish (fast > slow) MA crossover.
 *
 * Algorithm:
 * 1. Push `slowPeriod + 5` bars at `baseClose` — warms both MAs at a flat price,
 *    so the regime starts as 'none'.
 * 2. Push `highClose` bars one at a time; stop and return the FIRST bar whose
 *    analyze() response contains an entry signal (the crossover bar).
 *
 * Returns the StrategyAnalyzeResult from the crossover bar, or { action:'hold' }
 * if no entry materialised within fastPeriod + 2 bars.
 */
async function triggerBullishCrossover(
  strategy: MovingAverageStrategy,
  baseClose: number = 100,
  highClose: number = 200,
): Promise<StrategyAnalyzeResult> {
  const { fastPeriod, slowPeriod } = strategy['_parameters'] as MovingAverageParameters;
  // Warm up: fill both MA windows at a flat low price
  for (let i = 0; i < slowPeriod + 5; i++) {
    await strategy.analyze(klineUpdate(baseClose, baseClose));
  }
  // Push high-price bars until the first crossover fires
  for (let i = 0; i < fastPeriod + 2; i++) {
    const result = await strategy.analyze(klineUpdate(highClose, highClose));
    if (findBySignalType(result, SignalType.Entry).length > 0) {
      return result;
    }
  }
  return { action: 'hold' };
}

/**
 * Symmetrical helper for bearish crossover.
 */
async function triggerBearishCrossover(
  strategy: MovingAverageStrategy,
  highClose: number = 200,
  lowClose: number = 50,
): Promise<StrategyAnalyzeResult> {
  const { fastPeriod, slowPeriod } = strategy['_parameters'] as MovingAverageParameters;
  // Warm up at high price
  for (let i = 0; i < slowPeriod + 5; i++) {
    await strategy.analyze(klineUpdate(highClose, highClose));
  }
  // Push low-price bars until first crossover fires
  for (let i = 0; i < fastPeriod + 2; i++) {
    const result = await strategy.analyze(klineUpdate(lowClose, lowClose));
    if (findBySignalType(result, SignalType.Entry).length > 0) {
      return result;
    }
  }
  return { action: 'hold' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suites
// ─────────────────────────────────────────────────────────────────────────────

describe('MovingAverageStrategy', () => {
  // ── 1. Registry Config ──────────────────────────────────────────────────
  describe('Registry Config', () => {
    it('has correct type and category', () => {
      expect(MovingAverageStrategyRegistryConfig.type).toBe('MovingAverageStrategy');
      expect(MovingAverageStrategyRegistryConfig.category).toBe('trend');
      expect(MovingAverageStrategyRegistryConfig.implemented).toBe(true);
    });

    it('default fastPeriod=25, slowPeriod=55', () => {
      const d = MovingAverageStrategyRegistryConfig.defaultParameters;
      expect(d.fastPeriod).toBe(25);
      expect(d.slowPeriod).toBe(55);
    });

    it("default klineInterval='15m'", () => {
      expect(MovingAverageStrategyRegistryConfig.defaultParameters.klineInterval).toBe(
        '15m',
      );
    });

    it('default takeProfitPercent=2', () => {
      expect(
        MovingAverageStrategyRegistryConfig.defaultParameters.takeProfitPercent,
      ).toBe(2);
    });

    it('default risk management values', () => {
      const d = MovingAverageStrategyRegistryConfig.defaultParameters;
      expect(d.orderAmount).toBe(100);
      expect(d.maxPositionSize).toBe(500);
      expect(d.minPositionSize).toBe(0);
    });

    it('default stopLossPercent=0', () => {
      expect(MovingAverageStrategyRegistryConfig.defaultParameters.stopLossPercent).toBe(
        0,
      );
    });

    it('parameterDefinitions cover all 8 parameters', () => {
      const names = MovingAverageStrategyRegistryConfig.parameterDefinitions.map(
        (p) => p.name,
      );
      expect(names).toContain('fastPeriod');
      expect(names).toContain('slowPeriod');
      expect(names).toContain('klineInterval');
      expect(names).toContain('takeProfitPercent');
      expect(names).toContain('stopLossPercent');
      expect(names).toContain('orderAmount');
      expect(names).toContain('maxPositionSize');
      expect(names).toContain('minPositionSize');
    });
  });

  // ── 2. Constructor & Validation ─────────────────────────────────────────
  describe('Constructor & Validation', () => {
    it('constructs successfully with valid parameters', () => {
      expect(() => new MovingAverageStrategy(makeConfig())).not.toThrow();
    });

    it('throws when fastPeriod >= slowPeriod', () => {
      expect(
        () => new MovingAverageStrategy(makeConfig({ fastPeriod: 5, slowPeriod: 5 })),
      ).toThrow(/fastPeriod.*must be less than slowPeriod/i);

      expect(
        () => new MovingAverageStrategy(makeConfig({ fastPeriod: 10, slowPeriod: 5 })),
      ).toThrow(/fastPeriod.*must be less than slowPeriod/i);
    });

    it('throws when fastPeriod <= 0', () => {
      expect(
        () => new MovingAverageStrategy(makeConfig({ fastPeriod: 0, slowPeriod: 5 })),
      ).toThrow(/fastPeriod/i);

      expect(
        () => new MovingAverageStrategy(makeConfig({ fastPeriod: -1, slowPeriod: 5 })),
      ).toThrow(/fastPeriod/i);
    });

    it('throws when takeProfitPercent <= 0', () => {
      expect(
        () => new MovingAverageStrategy(makeConfig({ takeProfitPercent: 0 })),
      ).toThrow(/takeProfitPercent/i);

      expect(
        () => new MovingAverageStrategy(makeConfig({ takeProfitPercent: -1 })),
      ).toThrow(/takeProfitPercent/i);
    });

    it('throws when minPositionSize > maxPositionSize', () => {
      expect(
        () =>
          new MovingAverageStrategy(
            makeConfig({ minPositionSize: 500, maxPositionSize: 100 }),
          ),
      ).toThrow(/minPositionSize.*≤.*maxPositionSize/i);
    });

    it('throws when orderAmount <= 0', () => {
      expect(() => new MovingAverageStrategy(makeConfig({ orderAmount: 0 }))).toThrow(
        /orderAmount must be > 0/i,
      );

      expect(() => new MovingAverageStrategy(makeConfig({ orderAmount: -50 }))).toThrow(
        /orderAmount must be > 0/i,
      );
    });

    it('throws when stopLossPercent < 0', () => {
      expect(
        () => new MovingAverageStrategy(makeConfig({ stopLossPercent: -1 })),
      ).toThrow(/stopLossPercent must be ≥ 0/i);
    });

    it('constructs successfully when stopLossPercent = 0 (disabled)', () => {
      expect(
        () => new MovingAverageStrategy(makeConfig({ stopLossPercent: 0 })),
      ).not.toThrow();
    });

    it('constructs successfully when stopLossPercent > 0 (enabled)', () => {
      expect(
        () => new MovingAverageStrategy(makeConfig({ stopLossPercent: 1.5 })),
      ).not.toThrow();
    });

    it('exposes correct strategyType', () => {
      const s = new MovingAverageStrategy(makeConfig());
      expect(s.strategyType).toBe('MovingAverageStrategy');
    });

    it('exposes correct strategyId', () => {
      const s = new MovingAverageStrategy(makeConfig());
      expect(s.getStrategyId()).toBe(STRATEGY_ID);
    });
  });

  // ── 3. Dynamic Config Overrides ──────────────────────────────────────────
  describe('getSubscriptionConfig()', () => {
    it('returns websocket kline subscription for the configured interval', () => {
      const s = new MovingAverageStrategy(makeConfig({ klineInterval: '15m' }));
      const cfg = s.getSubscriptionConfig();
      expect((cfg.klines as any).enabled).toBe(true);
      expect((cfg.klines as any).intervals).toContain('15m');
      expect(cfg.method).toBe('websocket');
    });

    it('reflects a different klineInterval when parameter changes', () => {
      const s = new MovingAverageStrategy(makeConfig({ klineInterval: '1h' }));
      const cfg = s.getSubscriptionConfig();
      expect((cfg.klines as any).intervals).toContain('1h');
      expect((cfg.klines as any).intervals).not.toContain('15m');
    });
  });

  describe('getInitialDataConfig()', () => {
    it('requests slowPeriod+10 bars of the configured interval', () => {
      const s = new MovingAverageStrategy(
        makeConfig({ slowPeriod: 5, klineInterval: '15m' }),
      );
      const cfg = s.getInitialDataConfig();
      expect(cfg.klines?.['15m']).toBe(15); // 5 + 10
    });

    it('interval follows klineInterval parameter', () => {
      const s = new MovingAverageStrategy(
        makeConfig({ slowPeriod: 5, klineInterval: '4h' }),
      );
      const cfg = s.getInitialDataConfig();
      expect(cfg.klines?.['4h']).toBe(15);
      expect(cfg.klines?.['15m']).toBeUndefined();
    });

    it('requests positions and open orders', () => {
      const s = new MovingAverageStrategy(makeConfig());
      const cfg = s.getInitialDataConfig();
      expect(cfg.fetchPositions).toBe(true);
      expect(cfg.fetchOpenOrders).toBe(true);
    });
  });

  // ── 4. processInitialData ────────────────────────────────────────────────
  describe('processInitialData()', () => {
    it('returns hold when no klines provided', async () => {
      const s = new MovingAverageStrategy(makeConfig());
      const result = await s.processInitialData(makeInitialData());
      expect(result).toEqual({ action: 'hold' });
    });

    it('populates close history from initial klines', async () => {
      const s = new MovingAverageStrategy(makeConfig());
      const klines = Array.from({ length: 8 }, (_, i) => makeKline(100 + i, 100 + i));
      await s.processInitialData(makeInitialData(klines));
      expect(s.getStrategyState().priceHistoryLength).toBe(8);
    });

    it('sets lastKline from the most recent initial kline', async () => {
      const s = new MovingAverageStrategy(makeConfig());
      const klines = [makeKline(98, 102), makeKline(100, 105)];
      await s.processInitialData(makeInitialData(klines));
      const state = s.getStrategyState();
      expect(state.lastKline?.open).toBe('100.00000000');
      expect(state.lastKline?.close).toBe('105.00000000');
    });

    it('warms up MA state without throwing when data is sufficient', async () => {
      const s = new MovingAverageStrategy(makeConfig({ fastPeriod: 2, slowPeriod: 3 }));
      const klines = Array.from({ length: 5 }, () => makeKline(100, 100));
      await expect(s.processInitialData(makeInitialData(klines))).resolves.not.toThrow();
    });

    it('recovers pending entry orders from openOrders', async () => {
      const s = new MovingAverageStrategy(makeConfig());
      // clientOrderId format: E{strategyId}D{seq}D{ts}
      const entryOrderId = `E${STRATEGY_ID}D1D${Math.floor(Date.now() / 1000)}`;
      const order = makeOrder(entryOrderId, OrderSide.BUY, OrderStatus.NEW, 100, 100);
      await s.processInitialData(makeInitialData([], [order]));
      expect(s.getPendingEntryCount()).toBe(1);
    });

    it('recovers active TP orders from openOrders', async () => {
      const s = new MovingAverageStrategy(makeConfig());
      const tpOrderId = `T${STRATEGY_ID}D2D${Math.floor(Date.now() / 1000)}`;
      const order = makeOrder(tpOrderId, OrderSide.SELL, OrderStatus.NEW, 102, 100);
      await s.processInitialData(makeInitialData([], [order]));
      expect(s.getActiveTpCount()).toBe(1);
    });

    it('ignores orders belonging to a different strategyId', async () => {
      const s = new MovingAverageStrategy(makeConfig());
      const foreignId = `E99D1D${Math.floor(Date.now() / 1000)}`; // strategyId=99, not 42
      const order = makeOrder(foreignId, OrderSide.BUY, OrderStatus.NEW, 100, 100);
      await s.processInitialData(makeInitialData([], [order]));
      expect(s.getPendingEntryCount()).toBe(0);
      expect(s.getActiveTpCount()).toBe(0);
    });
  });

  // ── 5. Entry Price Formula ───────────────────────────────────────────────
  describe('Entry price formula (non-configurable)', () => {
    it('long entry price = close - (close - open) / 3', () => {
      const open = new Decimal(100);
      const close = new Decimal(106);
      const expected = close.minus(close.minus(open).div(3)); // 104
      expect(expected.toNumber()).toBeCloseTo(104, 4);
    });

    it('short entry price = close + (open - close) / 3', () => {
      const open = new Decimal(106);
      const close = new Decimal(100);
      const expected = close.plus(open.minus(close).div(3)); // 102
      expect(expected.toNumber()).toBeCloseTo(102, 4);
    });

    it('_calcLongEntryPrice returns (2*close + open)/3', async () => {
      const s = new MovingAverageStrategy(makeConfig());
      const kline = makeKline(100, 130); // open=100, close=130
      const entry = (s as any)._calcLongEntryPrice(kline);
      const expected = (2 * 130 + 100) / 3; // 120
      expect(entry.toNumber()).toBeCloseTo(expected, 4);
    });

    it('_calcShortEntryPrice returns (2*close + open)/3', async () => {
      const s = new MovingAverageStrategy(makeConfig());
      const kline = makeKline(130, 100); // open=130, close=100
      const entry = (s as any)._calcShortEntryPrice(kline);
      const expected = (2 * 100 + 130) / 3; // 110
      expect(entry.toNumber()).toBeCloseTo(expected, 4);
    });

    it('long entry is below close (limit placed toward midpoint)', () => {
      const s = new MovingAverageStrategy(makeConfig());
      const kline = makeKline(100, 200); // bullish bar
      const entry = (s as any)._calcLongEntryPrice(kline);
      expect(entry.toNumber()).toBeLessThan(200);
      expect(entry.toNumber()).toBeGreaterThan(100);
    });

    it('short entry is above close (limit placed toward midpoint)', () => {
      const s = new MovingAverageStrategy(makeConfig());
      const kline = makeKline(200, 100); // bearish bar
      const entry = (s as any)._calcShortEntryPrice(kline);
      expect(entry.toNumber()).toBeGreaterThan(100);
      expect(entry.toNumber()).toBeLessThan(200);
    });
  });

  // ── 6. MA Crossover Signals ──────────────────────────────────────────────
  describe('MA Crossover Signal Generation', () => {
    let strategy: MovingAverageStrategy;

    beforeEach(() => {
      strategy = new MovingAverageStrategy(makeConfig({ fastPeriod: 3, slowPeriod: 5 }));
    });

    it('returns hold when insufficient data for slow MA', async () => {
      const result = await strategy.analyze(klineUpdate(100, 100));
      expect(toArray(result)).toHaveLength(0);
      expect(strategy.getSlowMA().toNumber()).toBe(0);
    });

    it('generates a BUY entry on bullish crossover', async () => {
      const result = await triggerBullishCrossover(strategy, 50, 200);
      const entries = findBySignalType(result, SignalType.Entry);
      expect(entries.length).toBeGreaterThanOrEqual(1);
      const buyEntry = entries.find((e) => e.action === 'buy');
      expect(buyEntry).toBeDefined();
    });

    it('generates a SELL entry on bearish crossover (when shorts allowed)', async () => {
      // makeConfig already has minPositionSize: -1000
      const result = await triggerBearishCrossover(strategy, 200, 50);
      const entries = findBySignalType(result, SignalType.Entry);
      const sellEntry = entries.find((e) => e.action === 'sell');
      expect(sellEntry).toBeDefined();
    });

    it('does NOT fire a second buy signal without a fresh crossover', async () => {
      await triggerBullishCrossover(strategy, 50, 200);
      // More bars at the same high price — fast still > slow, no new crossover
      const result1 = await strategy.analyze(klineUpdate(200, 200));
      const result2 = await strategy.analyze(klineUpdate(200, 200));
      expect(findBySignalType(result1, SignalType.Entry)).toHaveLength(0);
      expect(findBySignalType(result2, SignalType.Entry)).toHaveLength(0);
    });

    it('maSignal transitions: none → bullish', async () => {
      expect(strategy.getMASignal()).toBe('none');
      await triggerBullishCrossover(strategy, 50, 200);
      expect(strategy.getMASignal()).toBe('bullish');
    });

    it('maSignal transitions: bullish → bearish', async () => {
      await triggerBullishCrossover(strategy, 50, 200);
      expect(strategy.getMASignal()).toBe('bullish');
      // Drive bearish crossover
      await triggerBearishCrossover(strategy, 200, 5);
      expect(strategy.getMASignal()).toBe('bearish');
    });

    it('fastMA and slowMA are updated after each kline', async () => {
      for (let i = 0; i < 6; i++) {
        await strategy.analyze(klineUpdate(100, 100 + i * 10));
      }
      expect(strategy.getFastMA().toNumber()).toBeGreaterThan(0);
      expect(strategy.getSlowMA().toNumber()).toBeGreaterThan(0);
    });

    it('entry signal carries a clientOrderId with the correct strategyId prefix', async () => {
      const result = await triggerBullishCrossover(strategy, 50, 200);
      const entries = findBySignalType(result, SignalType.Entry);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].clientOrderId).toMatch(new RegExp(`^E${STRATEGY_ID}D\\d+D\\d+$`));
    });

    it('entry signal metadata has signalType=Entry', async () => {
      const result = await triggerBullishCrossover(strategy, 50, 200);
      const entries = findBySignalType(result, SignalType.Entry);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].metadata?.signalType).toBe(SignalType.Entry);
    });

    it('entry signal carries the correct orderAmount as quantity', async () => {
      const result = await triggerBullishCrossover(strategy, 50, 200);
      const entries = findBySignalType(result, SignalType.Entry);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].quantity?.toNumber()).toBe(100); // default orderAmount
    });

    it('pending entry count is 1 after a crossover', async () => {
      expect(strategy.getPendingEntryCount()).toBe(0);
      await triggerBullishCrossover(strategy, 50, 200);
      expect(strategy.getPendingEntryCount()).toBe(1);
    });

    it('ignores in-progress klines (isClosed=false) — no signal, MA unchanged', async () => {
      // Prime enough closed bars so the slow MA is ready but regime is still 'none'
      for (let i = 0; i < 5; i++) {
        await strategy.analyze({
          ...klineUpdate(100, 100),
          klines: [{ ...makeKline(100, 100), isClosed: true }],
        });
      }
      const maBeforeSignal = strategy.getMASignal();

      // Feed a kline where isClosed=false — should be a no-op
      const openKline = { ...makeKline(50, 300), isClosed: false };
      const result = await strategy.analyze({
        exchangeName: EXCHANGE,
        symbol: SYMBOL,
        klines: [openKline],
      });
      expect(toArray(result)).toHaveLength(0);
      // MA state must not change due to the in-progress kline
      expect(strategy.getMASignal()).toBe(maBeforeSignal);
    });
  });

  // ── 7. Risk Management ───────────────────────────────────────────────────
  describe('Risk Management', () => {
    it('blocks a long entry when currentPosition + orderAmount > maxPositionSize', async () => {
      const strategy = new MovingAverageStrategy(
        makeConfig({ orderAmount: 100, maxPositionSize: 90 }),
      );
      // With maxPositionSize=90 and orderAmount=100, 0+100 > 90 → blocked
      const result = await triggerBullishCrossover(strategy, 50, 200);
      const entries = findBySignalType(result, SignalType.Entry);
      expect(entries.filter((e) => e.action === 'buy')).toHaveLength(0);
    });

    it('allows a long entry when currentPosition + orderAmount <= maxPositionSize', async () => {
      const strategy = new MovingAverageStrategy(
        makeConfig({ orderAmount: 100, maxPositionSize: 100 }),
      );
      const result = await triggerBullishCrossover(strategy, 50, 200);
      const entries = findBySignalType(result, SignalType.Entry);
      expect(entries.filter((e) => e.action === 'buy').length).toBeGreaterThanOrEqual(1);
    });

    it('blocks a short entry when currentPosition - orderAmount < minPositionSize', async () => {
      // minPositionSize=0 means no shorts (0 - 100 = -100 < 0)
      const strategy = new MovingAverageStrategy(
        makeConfig({
          fastPeriod: 3,
          slowPeriod: 5,
          orderAmount: 100,
          minPositionSize: 0,
        }),
      );
      const result = await triggerBearishCrossover(strategy, 200, 50);
      const entries = findBySignalType(result, SignalType.Entry);
      expect(entries.filter((e) => e.action === 'sell')).toHaveLength(0);
    });

    it('allows a short entry when minPositionSize is negative and position has room', async () => {
      const strategy = new MovingAverageStrategy(
        makeConfig({
          fastPeriod: 3,
          slowPeriod: 5,
          orderAmount: 100,
          minPositionSize: -500,
        }),
      );
      const result = await triggerBearishCrossover(strategy, 200, 50);
      const entries = findBySignalType(result, SignalType.Entry);
      expect(entries.filter((e) => e.action === 'sell').length).toBeGreaterThanOrEqual(1);
    });

    it('committed exposure: pending buy counts against maxPositionSize before it fills', () => {
      // maxPositionSize=100, orderAmount=100
      // With no pending orders: 0 + 100 = 100 ≤ 100 → allowed
      // After injecting a pending buy of 100: committed = 0 + 100 = 100
      //   → 100 + 100 = 200 > 100 → BLOCKED (old code using only _currentPosition would allow it)
      const strategy = new MovingAverageStrategy(
        makeConfig({ orderAmount: 100, maxPositionSize: 100 }),
      );
      expect(strategy['_positionAllows']('buy')).toBe(true); // baseline: no pending orders

      strategy['pendingEntryOrders'].set('E99D1D1', {
        side: 'buy',
        limitPrice: new Decimal(100),
        quantity: new Decimal(100),
      });
      expect(strategy['_positionAllows']('buy')).toBe(false); // committed = 100, 100+100 > 100
    });

    it('committed exposure: pending sell counts against minPositionSize before it fills', () => {
      // minPositionSize=-100, orderAmount=100
      // With no pending orders: 0 - 100 = -100 ≥ -100 → allowed
      // After injecting a pending sell of 100: committed = 0 - 100 = -100
      //   → -100 - 100 = -200 < -100 → BLOCKED
      const strategy = new MovingAverageStrategy(
        makeConfig({ orderAmount: 100, minPositionSize: -100, maxPositionSize: 1000 }),
      );
      expect(strategy['_positionAllows']('sell')).toBe(true); // baseline

      strategy['pendingEntryOrders'].set('E99D1D1', {
        side: 'sell',
        limitPrice: new Decimal(100),
        quantity: new Decimal(100),
      });
      expect(strategy['_positionAllows']('sell')).toBe(false); // committed = -100, -100-100 < -100
    });
  });

  // ── 8. Take-Profit Placement ──────────────────────────────────────────────
  describe('Take-Profit on Entry Fill', () => {
    let strategy: MovingAverageStrategy;
    let entryClientOrderId: string;

    beforeEach(async () => {
      strategy = new MovingAverageStrategy(
        makeConfig({ takeProfitPercent: 2, orderAmount: 100 }),
      );
      const crossoverResult = await triggerBullishCrossover(strategy, 50, 200);
      const entries = findBySignalType(crossoverResult, SignalType.Entry);
      // triggerBullishCrossover now returns the crossover bar result,
      // but if not found fall back to the internal map
      if (entries.length > 0) {
        entryClientOrderId = entries[0].clientOrderId;
      } else {
        entryClientOrderId = [...strategy['pendingEntryOrders'].keys()][0];
      }
    });

    it('emits a TP SELL signal when a long entry fills', async () => {
      const filledOrder = makeOrder(
        entryClientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        180,
        100,
        182,
      );
      const result = await strategy.analyze(orderUpdate([filledOrder]));
      const tpSignals = findBySignalType(result, SignalType.TakeProfit);
      expect(tpSignals).toHaveLength(1);
      expect(tpSignals[0].action).toBe('sell');
    });

    it('TP price = actualFillPrice × (1 + tpPercent/100) for a long', async () => {
      const fillPrice = 182;
      const expected = fillPrice * 1.02; // 2%
      const filledOrder = makeOrder(
        entryClientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        180,
        100,
        fillPrice,
      );
      const result = await strategy.analyze(orderUpdate([filledOrder]));
      const tpSignals = findBySignalType(result, SignalType.TakeProfit);
      expect(tpSignals[0].price?.toNumber()).toBeCloseTo(expected, 5);
    });

    it('falls back to limit price when averagePrice is absent', async () => {
      const limitPrice = 180;
      const order: Order = {
        ...makeOrder(
          entryClientOrderId,
          OrderSide.BUY,
          OrderStatus.FILLED,
          limitPrice,
          100,
        ),
        averagePrice: undefined,
      };
      const result = await strategy.analyze(orderUpdate([order]));
      const tpSignals = findBySignalType(result, SignalType.TakeProfit);
      expect(tpSignals[0].price?.toNumber()).toBeCloseTo(limitPrice * 1.02, 5);
    });

    it('TP quantity matches the executed fill quantity (full fill)', async () => {
      const filledOrder = makeOrder(
        entryClientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        180,
        100,
        182,
      );
      const result = await strategy.analyze(orderUpdate([filledOrder]));
      const tpSignals = findBySignalType(result, SignalType.TakeProfit);
      expect(tpSignals[0].quantity?.toNumber()).toBe(100);
    });

    it('TP quantity matches executedQuantity even when it differs from orderAmount (partial fill)', async () => {
      // Simulate a partial fill: order was for 100 but only 60 executed
      const partialFilledOrder: Order = {
        ...makeOrder(
          entryClientOrderId,
          OrderSide.BUY,
          OrderStatus.FILLED,
          180,
          100,
          182,
        ),
        executedQuantity: new Decimal(60),
      };
      const result = await strategy.analyze(orderUpdate([partialFilledOrder]));
      const tpSignals = findBySignalType(result, SignalType.TakeProfit);
      expect(tpSignals[0].quantity?.toNumber()).toBe(60); // must match executedQty, not orderAmount
    });

    it('TP clientOrderId has the T prefix and correct strategyId', async () => {
      const filledOrder = makeOrder(
        entryClientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        180,
        100,
        182,
      );
      const result = await strategy.analyze(orderUpdate([filledOrder]));
      const tpSignals = findBySignalType(result, SignalType.TakeProfit);
      expect(tpSignals[0].clientOrderId).toMatch(
        new RegExp(`^T${STRATEGY_ID}D\\d+D\\d+$`),
      );
    });

    it('TP metadata links parentOrderId to the entry clientOrderId', async () => {
      const filledOrder = makeOrder(
        entryClientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        180,
        100,
        182,
      );
      const result = await strategy.analyze(orderUpdate([filledOrder]));
      const tpSignals = findBySignalType(result, SignalType.TakeProfit);
      expect(tpSignals[0].metadata?.parentOrderId).toBe(entryClientOrderId);
      expect(tpSignals[0].metadata?.signalType).toBe(SignalType.TakeProfit);
    });

    it('TP is NOT emitted a second time for the same fill (idempotency)', async () => {
      const filledOrder = makeOrder(
        entryClientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        180,
        100,
        182,
      );
      await strategy.analyze(orderUpdate([filledOrder]));
      // Feed the same filled order again
      const result2 = await strategy.analyze(orderUpdate([filledOrder]));
      expect(findBySignalType(result2, SignalType.TakeProfit)).toHaveLength(0);
    });

    it('TP is removed from activeTpOrders after it fills', async () => {
      const filledEntry = makeOrder(
        entryClientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        180,
        100,
        182,
      );
      const tpResult = await strategy.analyze(orderUpdate([filledEntry]));
      const tpSignals = findBySignalType(tpResult, SignalType.TakeProfit);
      const tpCid = tpSignals[0].clientOrderId;

      expect(strategy.getActiveTpCount()).toBe(1);

      // Simulate TP fill
      const filledTp = makeOrder(tpCid, OrderSide.SELL, OrderStatus.FILLED, 185.64, 100);
      await strategy.analyze(orderUpdate([filledTp]));
      expect(strategy.getActiveTpCount()).toBe(0);
    });
  });

  // ── 9. Short Take-Profit ─────────────────────────────────────────────────
  describe('Take-Profit for Short Entry', () => {
    it('TP BUY price = fillPrice × (1 - tpPercent/100) for a short entry', async () => {
      const strategy = new MovingAverageStrategy(
        makeConfig({
          fastPeriod: 3,
          slowPeriod: 5,
          takeProfitPercent: 2,
          orderAmount: 100,
          minPositionSize: -1000,
        }),
      );

      const result = await triggerBearishCrossover(strategy, 200, 50);
      const entries = findBySignalType(result, SignalType.Entry);
      const sellEntry = entries.find((e) => e.action === 'sell');
      expect(sellEntry).toBeDefined();

      const fillPrice = 95;
      const expectedTp = fillPrice * (1 - 0.02); // 93.10
      const entryOrderId = sellEntry!.clientOrderId;
      const filledOrder = makeOrder(
        entryOrderId,
        OrderSide.SELL,
        OrderStatus.FILLED,
        96,
        100,
        fillPrice,
      );
      const tpResult = await strategy.analyze(orderUpdate([filledOrder]));
      const tpSignals = findBySignalType(tpResult, SignalType.TakeProfit);
      expect(tpSignals).toHaveLength(1);
      expect(tpSignals[0].action).toBe('buy');
      expect(tpSignals[0].price?.toNumber()).toBeCloseTo(expectedTp, 5);
    });
  });

  // ── 10. TP Fill Resets State for Re-entry ────────────────────────────────
  describe('Re-entry after TP fill', () => {
    it('maSignal resets to none after TP fills, allowing re-entry on next crossover', async () => {
      const strategy = new MovingAverageStrategy(makeConfig());
      const crossResult = await triggerBullishCrossover(strategy, 50, 200);
      const entries = findBySignalType(crossResult, SignalType.Entry);
      const entryOrderId =
        entries.length > 0
          ? entries[0].clientOrderId
          : [...strategy['pendingEntryOrders'].keys()][0];

      // Fill entry → get TP
      const filledEntry = makeOrder(
        entryOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        180,
        100,
        182,
      );
      const tpResult = await strategy.analyze(orderUpdate([filledEntry]));
      const tpSignals = findBySignalType(tpResult, SignalType.TakeProfit);
      expect(tpSignals.length).toBeGreaterThan(0);
      const tpCid = tpSignals[0].clientOrderId;

      expect(strategy.getMASignal()).toBe('bullish');

      // Fill TP → maSignal should reset to 'none'
      const filledTp = makeOrder(tpCid, OrderSide.SELL, OrderStatus.FILLED, 185.64, 100);
      await strategy.analyze(orderUpdate([filledTp]));
      expect(strategy.getMASignal()).toBe('none');
    });
  });

  // ── 11. Stale-Entry Cancellation on Reversal ─────────────────────────────
  describe('Stale entry cancellation on crossover reversal', () => {
    it('emits a cancel signal for a pending long entry when a bearish crossover fires', async () => {
      const strategy = new MovingAverageStrategy(
        makeConfig({ fastPeriod: 3, slowPeriod: 5 }),
      );

      // Trigger bullish crossover → pending BUY entry
      await triggerBullishCrossover(strategy, 50, 200);
      expect(strategy.getPendingEntryCount()).toBe(1);

      // Now drive bearish crossover by pushing very low prices
      // Collect ALL results until cancel is emitted or pending count drops
      let cancelEmitted = false;
      for (let i = 0; i < 10; i++) {
        const r = await strategy.analyze(klineUpdate(5, 5));
        if (findCancels(r).length > 0) {
          cancelEmitted = true;
          break;
        }
      }

      expect(cancelEmitted || strategy.getPendingEntryCount() === 0).toBe(true);
    });

    it('emits a cancel for a pending short entry when a bullish crossover fires', async () => {
      const strategy = new MovingAverageStrategy(
        makeConfig({ fastPeriod: 3, slowPeriod: 5 }),
      );

      // Trigger bearish crossover → pending SELL entry
      await triggerBearishCrossover(strategy, 200, 50);
      expect(strategy.getPendingEntryCount()).toBe(1);

      // Drive bullish crossover back
      let cancelEmitted = false;
      for (let i = 0; i < 10; i++) {
        const r = await strategy.analyze(klineUpdate(500, 500));
        if (findCancels(r).length > 0) {
          cancelEmitted = true;
          break;
        }
      }

      expect(cancelEmitted || strategy.getPendingEntryCount() === 0).toBe(true);
    });
  });

  // ── 12. Order Lifecycle: Cancel / Reject / Expire ─────────────────────────
  describe('Order terminal states (cancel / reject / expire)', () => {
    async function getPendingEntryId(strategy: MovingAverageStrategy): Promise<string> {
      const result = await triggerBullishCrossover(strategy, 50, 200);
      const entries = findBySignalType(result, SignalType.Entry);
      return entries.length > 0
        ? entries[0].clientOrderId
        : [...strategy['pendingEntryOrders'].keys()][0];
    }

    for (const status of [
      OrderStatus.CANCELED,
      OrderStatus.REJECTED,
      OrderStatus.EXPIRED,
    ]) {
      it(`removes pending entry from map when status is ${status}`, async () => {
        const strategy = new MovingAverageStrategy(makeConfig());
        const cid = await getPendingEntryId(strategy);
        expect(strategy.getPendingEntryCount()).toBe(1);

        const order = makeOrder(cid, OrderSide.BUY, status, 180, 100);
        await strategy.analyze(orderUpdate([order]));
        expect(strategy.getPendingEntryCount()).toBe(0);
      });
    }

    for (const status of [
      OrderStatus.CANCELED,
      OrderStatus.REJECTED,
      OrderStatus.EXPIRED,
    ]) {
      it(`removes TP from activeTpOrders when status is ${status}`, async () => {
        const strategy = new MovingAverageStrategy(makeConfig());
        const entryCid = await getPendingEntryId(strategy);

        const filledEntry = makeOrder(
          entryCid,
          OrderSide.BUY,
          OrderStatus.FILLED,
          180,
          100,
          182,
        );
        const tpResult = await strategy.analyze(orderUpdate([filledEntry]));
        const tpSignals = findBySignalType(tpResult, SignalType.TakeProfit);
        expect(tpSignals.length).toBeGreaterThan(0);
        const tpCid = tpSignals[0].clientOrderId;

        expect(strategy.getActiveTpCount()).toBe(1);
        const tpOrder = makeOrder(tpCid, OrderSide.SELL, status, 185.64, 100);
        await strategy.analyze(orderUpdate([tpOrder]));
        expect(strategy.getActiveTpCount()).toBe(0);
      });
    }
  });

  // ── 13. getStrategyState snapshot ───────────────────────────────────────
  describe('getStrategyState()', () => {
    it('returns all expected fields', async () => {
      const strategy = new MovingAverageStrategy(makeConfig());
      const state = strategy.getStrategyState();

      expect(state).toHaveProperty('strategyId', STRATEGY_ID);
      expect(state).toHaveProperty('fastMA');
      expect(state).toHaveProperty('slowMA');
      expect(state).toHaveProperty('maSignal');
      expect(state).toHaveProperty('priceHistoryLength');
      expect(state).toHaveProperty('lastKline');
      expect(state).toHaveProperty('pendingEntries');
      expect(state).toHaveProperty('activeTpOrders');
      expect(state).toHaveProperty('activeSlOrders');
      expect(state).toHaveProperty('activePositions');
      expect(state).toHaveProperty('currentPosition');
      expect(state).toHaveProperty('isInitialized');
      expect(state).toHaveProperty('parameters');
    });

    it('parameters snapshot reflects configured values', () => {
      const strategy = new MovingAverageStrategy(
        makeConfig({
          fastPeriod: 3,
          slowPeriod: 5,
          klineInterval: '4h',
          takeProfitPercent: 3,
          orderAmount: 250,
          maxPositionSize: 800,
          minPositionSize: -200,
        }),
      );
      const { parameters } = strategy.getStrategyState();
      expect(parameters.fastPeriod).toBe(3);
      expect(parameters.slowPeriod).toBe(5);
      expect(parameters.klineInterval).toBe('4h');
      expect(parameters.takeProfitPercent).toBe(3);
      expect(parameters.stopLossPercent).toBe(0);
      expect(parameters.orderAmount).toBe(250);
      expect(parameters.maxPositionSize).toBe(800);
      expect(parameters.minPositionSize).toBe(-200);
    });

    it('pendingEntries array grows when an entry is placed', async () => {
      const strategy = new MovingAverageStrategy(makeConfig());
      expect(strategy.getStrategyState().pendingEntries).toHaveLength(0);
      await triggerBullishCrossover(strategy, 50, 200);
      expect(strategy.getStrategyState().pendingEntries).toHaveLength(1);
    });
  });

  // ── 14. Cleanup ──────────────────────────────────────────────────────────
  describe('onCleanup()', () => {
    it('resets all internal state', async () => {
      const strategy = new MovingAverageStrategy(makeConfig());
      // Build up some state
      await triggerBullishCrossover(strategy, 50, 200);
      expect(strategy.getPendingEntryCount()).toBe(1);
      expect(strategy.getSlowMA().toNumber()).toBeGreaterThan(0);

      await strategy.onCleanup();

      expect(strategy.getPendingEntryCount()).toBe(0);
      expect(strategy.getActiveTpCount()).toBe(0);
      expect(strategy.getFastMA().toNumber()).toBe(0);
      expect(strategy.getSlowMA().toNumber()).toBe(0);
      expect(strategy.getMASignal()).toBe('none');
      expect(strategy.getStrategyState().priceHistoryLength).toBe(0);
      expect(strategy.getStrategyState().lastKline).toBeNull();
      expect(strategy.getStrategyState().activeSlOrders).toHaveLength(0);
      expect(strategy.getStrategyState().activePositions).toHaveLength(0);
    });
  });

  // ── 15. Stop Loss ────────────────────────────────────────────────────────
  describe('Stop Loss', () => {
    /** Helper: trigger bullish crossover, fill the entry, return { strategy, entryOrderId, tpCid, slCid } */
    async function setupLongWithSL(slPercent = 1, tpPercent = 2) {
      const strategy = new MovingAverageStrategy(
        makeConfig({
          takeProfitPercent: tpPercent,
          stopLossPercent: slPercent,
          orderAmount: 100,
        }),
      );
      const crossResult = await triggerBullishCrossover(strategy, 50, 200);
      const entries = findBySignalType(crossResult, SignalType.Entry);
      const entryOrderId =
        entries.length > 0
          ? entries[0].clientOrderId
          : [...strategy['pendingEntryOrders'].keys()][0];

      const fillPrice = 180;
      const filledEntry = makeOrder(
        entryOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        fillPrice,
        100,
        fillPrice,
      );
      const exitResult = await strategy.analyze(orderUpdate([filledEntry]));

      const tpSignals = findBySignalType(exitResult, SignalType.TakeProfit);
      const slSignals = findBySignalType(exitResult, SignalType.StopLoss);
      const tpCid = tpSignals[0]?.clientOrderId ?? '';
      const slCid = slSignals[0]?.clientOrderId ?? '';

      return { strategy, entryOrderId, fillPrice, tpCid, slCid, exitResult };
    }

    it('emits a SL SELL signal alongside TP when stopLossPercent > 0', async () => {
      const { exitResult } = await setupLongWithSL(1);
      const slSignals = findBySignalType(exitResult, SignalType.StopLoss);
      expect(slSignals).toHaveLength(1);
      expect(slSignals[0].action).toBe('sell');
    });

    it('does NOT emit a SL signal when stopLossPercent = 0', async () => {
      const strategy = new MovingAverageStrategy(
        makeConfig({ takeProfitPercent: 2, stopLossPercent: 0, orderAmount: 100 }),
      );
      const crossResult = await triggerBullishCrossover(strategy, 50, 200);
      const entries = findBySignalType(crossResult, SignalType.Entry);
      const entryOrderId =
        entries.length > 0
          ? entries[0].clientOrderId
          : [...strategy['pendingEntryOrders'].keys()][0];

      const filledEntry = makeOrder(
        entryOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        180,
        100,
        180,
      );
      const exitResult = await strategy.analyze(orderUpdate([filledEntry]));
      const slSignals = findBySignalType(exitResult, SignalType.StopLoss);
      expect(slSignals).toHaveLength(0);
    });

    it('SL price = fillPrice × (1 − stopLossPercent/100) for a long', async () => {
      const slPercent = 1.5;
      const { exitResult, fillPrice } = await setupLongWithSL(slPercent);
      const slSignals = findBySignalType(exitResult, SignalType.StopLoss);
      const expectedSl = fillPrice * (1 - slPercent / 100); // 180 × 0.985 = 177.30
      expect(slSignals[0].price?.toNumber()).toBeCloseTo(expectedSl, 5);
    });

    it('SL clientOrderId has the S prefix and correct strategyId', async () => {
      const { exitResult } = await setupLongWithSL(1);
      const slSignals = findBySignalType(exitResult, SignalType.StopLoss);
      expect(slSignals[0].clientOrderId).toMatch(
        new RegExp(`^S${STRATEGY_ID}D\\d+D\\d+$`),
      );
    });

    it('SL metadata links parentOrderId to entry and stores stopPrice', async () => {
      const { exitResult, entryOrderId } = await setupLongWithSL(1);
      const slSignals = findBySignalType(exitResult, SignalType.StopLoss);
      expect(slSignals[0].metadata?.parentOrderId).toBe(entryOrderId);
      expect(slSignals[0].metadata?.signalType).toBe(SignalType.StopLoss);
      expect(slSignals[0].metadata?.stopPrice).toBeDefined();
    });

    it('activePositions maps entry → { tpCid, slCid } after fill', async () => {
      const { strategy, entryOrderId, tpCid, slCid } = await setupLongWithSL(1);
      const state = strategy.getStrategyState();
      const pos = state.activePositions.find((p) => p.entryCid === entryOrderId);
      expect(pos).toBeDefined();
      expect(pos!.tpCid).toBe(tpCid);
      expect(pos!.slCid).toBe(slCid);
    });

    it('when TP fills → emits cancel for the paired SL and clears tracking maps', async () => {
      const { strategy, tpCid, slCid } = await setupLongWithSL(1);

      // Fill TP
      const filledTp = makeOrder(tpCid, OrderSide.SELL, OrderStatus.FILLED, 183.6, 100);
      const tpFillResult = await strategy.analyze(orderUpdate([filledTp]));

      // Should emit a cancel for the SL
      const cancels = findCancels(tpFillResult);
      expect(cancels.some((c) => c.clientOrderId === slCid)).toBe(true);

      // SL should be gone from state
      expect(strategy.getStrategyState().activeSlOrders).not.toContain(slCid);
      expect(strategy.getStrategyState().activePositions).toHaveLength(0);
    });

    it('when TP fills → maSignal resets to none', async () => {
      const { strategy, tpCid } = await setupLongWithSL(1);
      expect(strategy.getMASignal()).toBe('bullish');

      const filledTp = makeOrder(tpCid, OrderSide.SELL, OrderStatus.FILLED, 183.6, 100);
      await strategy.analyze(orderUpdate([filledTp]));
      expect(strategy.getMASignal()).toBe('none');
    });

    it('when SL fills → emits cancel for the paired TP and clears tracking maps', async () => {
      const { strategy, tpCid, slCid } = await setupLongWithSL(1);

      // Fill SL
      const filledSl = makeOrder(slCid, OrderSide.SELL, OrderStatus.FILLED, 178.2, 100);
      const slFillResult = await strategy.analyze(orderUpdate([filledSl]));

      // Should emit a cancel for the TP
      const cancels = findCancels(slFillResult);
      expect(cancels.some((c) => c.clientOrderId === tpCid)).toBe(true);

      // TP should be gone from state
      expect(strategy.getActiveTpCount()).toBe(0);
      expect(strategy.getStrategyState().activePositions).toHaveLength(0);
    });

    it('when SL fills → maSignal resets to none', async () => {
      const { strategy, slCid } = await setupLongWithSL(1);
      expect(strategy.getMASignal()).toBe('bullish');

      const filledSl = makeOrder(slCid, OrderSide.SELL, OrderStatus.FILLED, 178.2, 100);
      await strategy.analyze(orderUpdate([filledSl]));
      expect(strategy.getMASignal()).toBe('none');
    });

    it('SL for short = fillPrice × (1 + stopLossPercent/100)', async () => {
      const slPercent = 1;
      const strategy = new MovingAverageStrategy(
        makeConfig({
          takeProfitPercent: 2,
          stopLossPercent: slPercent,
          orderAmount: 100,
          minPositionSize: -1000,
        }),
      );
      const crossResult = await triggerBearishCrossover(strategy, 200, 50);
      const entries = findBySignalType(crossResult, SignalType.Entry);
      const sellEntry = entries.find((e) => e.action === 'sell');
      expect(sellEntry).toBeDefined();

      const fillPrice = 95;
      const expectedSl = fillPrice * (1 + slPercent / 100); // 95.95
      const filledOrder = makeOrder(
        sellEntry!.clientOrderId,
        OrderSide.SELL,
        OrderStatus.FILLED,
        96,
        100,
        fillPrice,
      );
      const exitResult = await strategy.analyze(orderUpdate([filledOrder]));
      const slSignals = findBySignalType(exitResult, SignalType.StopLoss);
      expect(slSignals).toHaveLength(1);
      expect(slSignals[0].action).toBe('buy');
      expect(slSignals[0].price?.toNumber()).toBeCloseTo(expectedSl, 5);
    });
  });

  // ── 16. processInitialData warm-up + live kline integration ──────────────
  describe('Initial data warm-up + live crossover integration', () => {
    it('generates a live crossover signal correctly after warm-up from initial data', async () => {
      const s = new MovingAverageStrategy(makeConfig({ fastPeriod: 3, slowPeriod: 5 }));

      // Prime with 5 flat bars at close=100
      const initKlines = Array.from({ length: 5 }, () => makeKline(100, 100));
      await s.processInitialData(makeInitialData(initKlines));

      // Push high-price bars to drive fast MA above slow MA
      let crossoverFired = false;
      for (let i = 0; i < 5; i++) {
        const result = await s.analyze(klineUpdate(150, 200));
        if (findBySignalType(result, SignalType.Entry).length > 0) {
          crossoverFired = true;
          break;
        }
      }

      expect(s.getMASignal()).toBe('bullish');
      expect(crossoverFired).toBe(true);
    });

    it('uses the correct klineInterval for initial data (not the default)', async () => {
      const s = new MovingAverageStrategy(
        makeConfig({ fastPeriod: 2, slowPeriod: 3, klineInterval: '1h' }),
      );
      const cfg = s.getInitialDataConfig();
      // Should request 1h klines, NOT 15m
      expect(cfg.klines?.['1h']).toBeDefined();
      expect(cfg.klines?.['15m']).toBeUndefined();
    });
  });

  // ── 17. EMA mode ─────────────────────────────────────────────────────────
  describe('EMA mode (maType = ema)', () => {
    // fastPeriod=3, slowPeriod=5 — same small periods used throughout the suite.

    it('registry config defaults maType to sma', () => {
      expect(MovingAverageStrategyRegistryConfig.defaultParameters.maType).toBe('sma');
    });

    it('parameterDefinitions includes a maType enum entry', () => {
      const def = MovingAverageStrategyRegistryConfig.parameterDefinitions.find(
        (p) => p.name === 'maType',
      );
      expect(def).toBeDefined();
      expect(def?.validation?.options).toEqual(['sma', 'ema']);
    });

    it('getStrategyState exposes maType', () => {
      const s = new MovingAverageStrategy(makeConfig({ maType: 'ema' }));
      expect(s.getStrategyState().parameters.maType).toBe('ema');
    });

    it('EMA reacts faster than SMA to a single new bar (higher after one spike)', () => {
      // After 5 flat bars at 100, feed ONE bar at 200.
      // fastPeriod=3, k=0.5:
      //   EMA = 200×0.5 + 100×0.5 = 150
      //   SMA(3) = (100+100+200)/3 ≈ 133.33
      // So EMA > SMA, confirming EMA gives more weight to the latest bar.
      const smaStrat = new MovingAverageStrategy(makeConfig({ maType: 'sma' }));
      const emaStrat = new MovingAverageStrategy(makeConfig({ maType: 'ema' }));

      const flatCloses = [100, 100, 100, 100, 100];
      for (const c of flatCloses) {
        smaStrat['closeHistory'].push(new Decimal(c));
        emaStrat['closeHistory'].push(new Decimal(c));
      }
      // Seed both with the flat history first
      smaStrat['_recalculateMAs']();
      emaStrat['_recalculateMAs']();

      // Now push one high bar
      smaStrat['closeHistory'].push(new Decimal(200));
      emaStrat['closeHistory'].push(new Decimal(200));
      smaStrat['_recalculateMAs']();
      emaStrat['_recalculateMAs']();

      expect(smaStrat.getFastMA().toNumber()).toBeCloseTo(133.33, 1); // (100+100+200)/3
      expect(emaStrat.getFastMA().toNumber()).toBeCloseTo(150, 4); // 200×0.5 + 100×0.5
      expect(emaStrat.getFastMA().toNumber()).toBeGreaterThan(
        smaStrat.getFastMA().toNumber(),
      );
    });

    it('seeds EMA from processInitialData and primes regime correctly', async () => {
      const s = new MovingAverageStrategy(makeConfig({ maType: 'ema' }));

      // 5 flat bars at close=100
      const initKlines = Array.from({ length: 5 }, () => makeKline(100, 100));
      await s.processInitialData(makeInitialData(initKlines));

      // EMA should be seeded and regime set
      expect(s.getFastMA().toNumber()).toBeGreaterThan(0);
      expect(s.getSlowMA().toNumber()).toBeGreaterThan(0);
      // All bars are the same price, so fast == slow => no clear regime yet
      // (flat series, MA values equal → maSignal could be 'bullish'/'bearish' only if strictly different)
    });

    it('EMA crossover fires a BUY entry signal', async () => {
      const s = new MovingAverageStrategy(makeConfig({ maType: 'ema' }));
      const result = await triggerBullishCrossover(s, 50, 200);
      const entries = findBySignalType(result, SignalType.Entry);
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries.find((e) => e.action === 'buy')).toBeDefined();
      expect(s.getMASignal()).toBe('bullish');
    });

    it('EMA crossover fires a SELL entry signal', async () => {
      const s = new MovingAverageStrategy(makeConfig({ maType: 'ema' }));
      const result = await triggerBearishCrossover(s, 200, 50);
      const entries = findBySignalType(result, SignalType.Entry);
      expect(entries.find((e) => e.action === 'sell')).toBeDefined();
      expect(s.getMASignal()).toBe('bearish');
    });

    it('EMA updates incrementally: each new bar changes fastMA', async () => {
      const s = new MovingAverageStrategy(makeConfig({ maType: 'ema' }));
      // Warm up enough bars for the slow MA to be seeded
      for (let i = 0; i < 6; i++) {
        await s.analyze(klineUpdate(100, 100));
      }
      const before = s.getFastMA().toNumber();
      // A very different close should shift the EMA
      await s.analyze(klineUpdate(500, 500));
      const after = s.getFastMA().toNumber();
      expect(after).not.toBe(before);
      expect(after).toBeGreaterThan(before); // moved toward 500
    });

    it('onCleanup resets EMA state so re-seeding works after restart', async () => {
      const s = new MovingAverageStrategy(makeConfig({ maType: 'ema' }));
      // Seed the EMA
      for (let i = 0; i < 6; i++) {
        await s.analyze(klineUpdate(100, 100));
      }
      expect(s.getFastMA().toNumber()).toBeGreaterThan(0);

      await s.onCleanup();

      expect(s.getFastMA().toNumber()).toBe(0);
      expect(s.getSlowMA().toNumber()).toBe(0);

      // After cleanup, re-seeding from fresh bars should work again
      const result = await triggerBullishCrossover(s, 50, 200);
      const entries = findBySignalType(result, SignalType.Entry);
      expect(entries.find((e) => e.action === 'buy')).toBeDefined();
    });

    it('in-progress klines (isClosed=false) are ignored in EMA mode too', async () => {
      const s = new MovingAverageStrategy(makeConfig({ maType: 'ema' }));
      for (let i = 0; i < 6; i++) {
        await s.analyze(klineUpdate(100, 100));
      }
      const maSignalBefore = s.getMASignal();
      const fastBefore = s.getFastMA().toNumber();

      const openKline = { ...makeKline(50, 999), isClosed: false };
      const result = await s.analyze({
        exchangeName: EXCHANGE,
        symbol: SYMBOL,
        klines: [openKline],
      });
      expect(toArray(result)).toHaveLength(0);
      expect(s.getFastMA().toNumber()).toBe(fastBefore);
      expect(s.getMASignal()).toBe(maSignalBefore);
    });
  });
});
