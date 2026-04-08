import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  MovingAverageStrategy,
  MovingAverageParameters,
  MovingAverageStrategyRegistryConfig,
} from '../strategies/MovingAverageStrategy';
import {
  SignalType,
  Order,
  OrderSide,
  OrderStatus,
  OrderType,
  StrategyAnalyzeResult,
  Kline,
  Ticker,
  TimeInForce,
} from '@itrade/core';

// ─────────────────────────────────────────────────────────────────────────────
// Test Constants & Helpers
// ─────────────────────────────────────────────────────────────────────────────

const STRATEGY_ID = 42;
const EXCHANGE = 'binance-futures';
const SYMBOL = 'BTCUSDT';

function makeConfig(overrides: Partial<MovingAverageParameters> = {}) {
  const params: MovingAverageParameters = {
    maType: 'sma' as const,
    fastPeriod: 3,
    slowPeriod: 5,
    klineInterval: '15m',
    takeProfitPercent: 2,
    stopLossPercent: 0,
    orderAmount: 100,
    maxPositionSize: 1000,
    minPositionSize: -1000,
    leverage: 1,
    ...overrides,
  };

  return {
    strategyId: STRATEGY_ID,
    exchangeNames: [EXCHANGE],
    symbol: SYMBOL,
    parameters: params,
    initialData: {
      klines: { '15m': [] },
      fetchPositions: true,
      fetchOpenOrders: true,
    },
    exchange: {} as any,
    performance: {} as any,
  } as any;
}

function makeKline(open: number, close: number, isClosed = true): Kline {
  return {
    symbol: SYMBOL,
    exchange: EXCHANGE,
    interval: '15m',
    openTime: new Date(),
    closeTime: new Date(),
    open: new Decimal(open),
    high: new Decimal(Math.max(open, close)),
    low: new Decimal(Math.min(open, close)),
    close: new Decimal(close),
    volume: new Decimal(100),
    quoteVolume: new Decimal(100),
    trades: 10,
    isClosed,
  };
}

function klineUpdate(open: number, close: number, isClosed = true) {
  return {
    exchangeName: EXCHANGE,
    symbol: SYMBOL,
    klines: [makeKline(open, close, isClosed)],
  };
}

function tickerUpdate(price: number) {
  return {
    exchangeName: EXCHANGE,
    symbol: SYMBOL,
    ticker: {
      symbol: SYMBOL,
      exchange: EXCHANGE,
      price: new Decimal(price),
      volume: new Decimal(100),
      timestamp: new Date(),
    } as Ticker,
  };
}

function makeOrder(
  cid: string,
  side: OrderSide,
  status: OrderStatus,
  price: number,
  qty: number,
  avgPrice?: number,
): Order {
  return {
    id: 'test-id',
    exchange: EXCHANGE,
    symbol: SYMBOL,
    clientOrderId: cid,
    side,
    type: OrderType.LIMIT,
    status,
    price: new Decimal(price),
    quantity: new Decimal(qty),
    averagePrice: avgPrice !== undefined ? new Decimal(avgPrice) : new Decimal(price),
    executedQuantity: status === OrderStatus.FILLED ? new Decimal(qty) : new Decimal(0),
    timestamp: new Date(),
    updateTime: new Date(),
    timeInForce: TimeInForce.GTC,
  } as Order;
}

function orderUpdate(orders: Order[]) {
  return {
    exchangeName: EXCHANGE,
    symbol: SYMBOL,
    orders,
  };
}

function makeInitialData(klines: Kline[] = [], orders: Order[] = []) {
  return {
    klines: { '15m': klines },
    openOrders: orders,
  } as any;
}

function findBySignalType(result: StrategyAnalyzeResult, type: SignalType) {
  if (!Array.isArray(result)) return [];
  return result.filter((r: any) => r.metadata?.signalType === type) as any[];
}

function findCancels(result: StrategyAnalyzeResult) {
  if (!Array.isArray(result)) return [];
  return result.filter((r: any) => r.action === 'cancel') as any[];
}

async function triggerBullishCrossover(
  strategy: MovingAverageStrategy,
  baseClose: number = 50,
  highClose: number = 200,
): Promise<StrategyAnalyzeResult> {
  const { fastPeriod, slowPeriod } = strategy.getStrategyState().parameters;
  // Warm up: fill both MA windows at a flat low price
  for (let i = 0; i < slowPeriod + 5; i++) {
    await strategy.analyze(klineUpdate(baseClose, baseClose));
  }
  // Push high-price bars until first crossover fires
  for (let i = 0; i < fastPeriod + 5; i++) {
    const result = await strategy.analyze(klineUpdate(highClose, highClose));
    if (findBySignalType(result, SignalType.Entry).length > 0) {
      return result;
    }
  }
  return { action: 'hold' };
}

async function triggerBearishCrossover(
  strategy: MovingAverageStrategy,
  highClose: number = 200,
  lowClose: number = 50,
): Promise<StrategyAnalyzeResult> {
  const { fastPeriod, slowPeriod } = strategy.getStrategyState().parameters;
  // Warm up: high price
  for (let i = 0; i < slowPeriod + 5; i++) {
    await strategy.analyze(klineUpdate(highClose, highClose));
  }
  // Push low-price bars until crossover
  for (let i = 0; i < fastPeriod + 5; i++) {
    const result = await strategy.analyze(klineUpdate(lowClose, lowClose));
    if (findBySignalType(result, SignalType.Entry).length > 0) {
      return result;
    }
  }
  return { action: 'hold' };
}

function updateStrategyPosition(strategy: MovingAverageStrategy, quantity: number) {
  (strategy as any)._currentPosition = new Decimal(quantity);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
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

    it('parameterDefinitions cover all 9 parameters', () => {
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
      expect(names).toContain('leverage');
    });
  });

  it('instantiates correctly with valid parameters', () => {
    const strategy = new MovingAverageStrategy(makeConfig());
    expect(strategy).toBeDefined();
    expect(strategy.getStrategyId()).toBe(STRATEGY_ID);
  });

  it('throws an error if fastPeriod >= slowPeriod', () => {
    expect(() => {
      new MovingAverageStrategy(makeConfig({ fastPeriod: 10, slowPeriod: 10 }));
    }).toThrow(/must be < /);
  });

  describe('getSubscriptionConfig()', () => {
    it('requests klines with the correct interval from parameters', () => {
      const strategy = new MovingAverageStrategy(makeConfig({ klineInterval: '1h' }));
      const cfg = strategy.getSubscriptionConfig();
      expect(cfg.klines.enabled).toBe(true);
      expect(cfg.klines.intervals).toContain('1h');
    });

    it('requests ticker subscription', () => {
      const strategy = new MovingAverageStrategy(makeConfig());
      const cfg = strategy.getSubscriptionConfig();
      expect(cfg.ticker).toBe(true);
    });
  });

  describe('Crossover Signal Generation (SMA)', () => {
    it('fires a BUY entry signal on bullish crossover', async () => {
      const strategy = new MovingAverageStrategy(
        makeConfig({ fastPeriod: 2, slowPeriod: 3 }),
      );
      const result = await triggerBullishCrossover(strategy, 100, 200);

      const entries = findBySignalType(result, SignalType.Entry);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('buy');
    });

    it('fires a SELL entry signal on bearish crossover', async () => {
      const strategy = new MovingAverageStrategy(
        makeConfig({ fastPeriod: 2, slowPeriod: 3, minPositionSize: -500 }),
      );
      const result = await triggerBearishCrossover(strategy, 200, 100);

      const entries = findBySignalType(result, SignalType.Entry);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('sell');
    });

  });

  describe('Order Processing & Exit Generation', () => {
    it('emits a TakeProfit signal when an Entry order fills', async () => {
      const strategy = new MovingAverageStrategy(
        makeConfig({ fastPeriod: 2, slowPeriod: 3 }),
      );
      const crossResult = await triggerBullishCrossover(strategy, 100, 200);
      const entryCid = findBySignalType(crossResult, SignalType.Entry)[0].clientOrderId;

      const filledOrder = makeOrder(
        entryCid,
        OrderSide.BUY,
        OrderStatus.FILLED,
        190,
        100,
      );
      const result = await strategy.analyze(orderUpdate([filledOrder]));

      const tpSignals = findBySignalType(result, SignalType.TakeProfit);
      expect(tpSignals).toHaveLength(1);
      expect(tpSignals[0].price.toNumber()).toBe(190 * 1.02);
    });
  });

  describe('Position Limits', () => {
    it('respects maxPositionSize (long)', async () => {
      const strategy = new MovingAverageStrategy(
        makeConfig({
          fastPeriod: 2,
          slowPeriod: 3,
          orderAmount: 300,
          maxPositionSize: 500,
        }),
      );
      const r1 = await triggerBullishCrossover(strategy, 100, 200);
      const cid1 = findBySignalType(r1, SignalType.Entry)[0].clientOrderId;
      await strategy.analyze(
        orderUpdate([makeOrder(cid1, OrderSide.BUY, OrderStatus.FILLED, 190, 300)]),
      );
      updateStrategyPosition(strategy, 300);

      await triggerBearishCrossover(strategy, 200, 50);
      const r2 = await triggerBullishCrossover(strategy, 50, 200);
      expect(findBySignalType(r2, SignalType.Entry)).toHaveLength(0);
    });
  });

  describe('onCleanup()', () => {
    it('resets internal state', async () => {
      const s = new MovingAverageStrategy(makeConfig());
      await triggerBullishCrossover(s, 50, 200);
      await (s as any).onCleanup();
      expect(s.getFastMA().toNumber()).toBe(0);
    });
  });

  describe('Stop Loss (Manual)', () => {
    async function setupLongWithSL(slPct = 1) {
      const s = new MovingAverageStrategy(makeConfig({ stopLossPercent: slPct }));
      const r1 = await triggerBullishCrossover(s, 100, 200);
      const entryCid = findBySignalType(r1, SignalType.Entry)[0].clientOrderId;
      await s.analyze(
        orderUpdate([makeOrder(entryCid, OrderSide.BUY, OrderStatus.FILLED, 180, 100)]),
      );
      const state = s.getStrategyState();
      const pos = state.activePositions[0];
      return { strategy: s, slPrice: new Decimal(pos.slPrice!) };
    }

    it('triggers MARKET EXIT when price hits manual active SL', async () => {
      const { strategy, slPrice } = await setupLongWithSL(1);
      const result = await strategy.analyze(tickerUpdate(slPrice.toNumber()));
      expect(findBySignalType(result, SignalType.StopLoss)).toHaveLength(1);
    });
  });

  describe('EMA mode', () => {
    it('calculates EMAs correctly and detects crossovers', async () => {
      const s = new MovingAverageStrategy(
        makeConfig({ maType: 'ema', fastPeriod: 2, slowPeriod: 3 }),
      );
      const bars = [100, 100, 100, 100, 100];
      await s.processInitialData(makeInitialData(bars.map((b) => makeKline(b, b))));

      let up = false;
      for (let i = 0; i < 5; i++) {
        const res = await s.analyze(klineUpdate(200, 200));
        if (findBySignalType(res, SignalType.Entry).length > 0) {
          up = true;
          break;
        }
      }
      expect(up).toBe(true);

      let down = false;
      for (let i = 0; i < 5; i++) {
        const res = await s.analyze(klineUpdate(50, 50));
        if (findBySignalType(res, SignalType.Entry).length > 0) {
          down = true;
          break;
        }
      }
      expect(down).toBe(true);
    });
  });

  describe('Leverage (perpetual futures support)', () => {
    it('registry config defaults leverage to 1', () => {
      expect(MovingAverageStrategyRegistryConfig.defaultParameters.leverage).toBe(1);
    });

    it('throws when leverage < 1', () => {
      expect(() => new MovingAverageStrategy(makeConfig({ leverage: 0 }))).toThrow(
        'leverage must be ≥ 1',
      );
    });

    it('entry signal carries the configured leverage and ISOLATED tradeMode', async () => {
      const strategy = new MovingAverageStrategy(makeConfig({ leverage: 10 }));
      const result = await triggerBullishCrossover(strategy, 50, 200);
      const entries = findBySignalType(result, SignalType.Entry);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].leverage).toBe(10);
      expect(entries[0].tradeMode).toBe('isolated');
    });

    it('TP signal carries the same leverage and tradeMode as entry', async () => {
      const strategy = new MovingAverageStrategy(
        makeConfig({ leverage: 5, takeProfitPercent: 2 }),
      );
      const crossoverResult = await triggerBullishCrossover(strategy, 50, 200);
      const entries = findBySignalType(crossoverResult, SignalType.Entry);
      const entryCid = entries[0].clientOrderId;

      const filledEntry = makeOrder(
        entryCid,
        OrderSide.BUY,
        OrderStatus.FILLED,
        180,
        100,
        182,
      );
      const exitResult = await strategy.analyze(orderUpdate([filledEntry]));
      const tpSignals = findBySignalType(exitResult, SignalType.TakeProfit);

      expect(tpSignals[0].leverage).toBe(5);
      expect(tpSignals[0].tradeMode).toBe('isolated');
    });
  });
});
