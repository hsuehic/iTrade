import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  LadderEntrySingleTPStrategy,
  LadderEntrySingleTPParameters,
  LadderEntrySingleTPStrategyRegistryConfig,
} from '../strategies/LadderEntrySingleTPStrategy';
import {
  StrategyConfig,
  Order,
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
  OrderBook,
  DataUpdate,
  InitialDataResult,
  StrategyAnalyzeResult,
  StrategyResult,
  StrategyOrderResult,
  SignalType,
  createEmptyPerformance,
  isUpdateOrderResult,
  StrategyUpdateOrderResult,
} from '@itrade/core';

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function createStrategyConfig(
  params: Partial<LadderEntrySingleTPParameters> = {},
): StrategyConfig<LadderEntrySingleTPParameters> {
  return {
    type: 'LadderEntrySingleTPStrategy',
    parameters: {
      basePrice: 100,
      ladderSteps: 5,
      stepType: 'arithmetic',
      stepValue: 1,
      qtyType: 'arithmetic',
      qtyPerStep: 0.1,
      qtyStepAdd: 0,
      qtyStepRatio: 1,
      tpType: 'percent',
      tpAbsoluteProfit: 100,
      tpPercent: 1,
      maxInvestment: 1000,
      maxPosition: 10,
      leverage: 10,
      ...params,
    },
    symbol: 'BTC/USDT',
    exchange: 'okx',
    strategyId: 1,
    strategyName: 'Test Ladder Entry Single TP',
    performance: createEmptyPerformance(
      'BTC/USDT',
      'okx',
      1,
      'Test Ladder Entry Single TP',
    ),
  };
}

function createOrder(
  clientOrderId: string,
  side: OrderSide,
  status: OrderStatus,
  price: number,
  quantity: number,
  executedQty?: number,
  avgPrice?: number,
  updateTime?: Date,
): Order {
  return {
    id: `order-${Date.now()}-${Math.random()}`,
    clientOrderId,
    symbol: 'BTC/USDT',
    exchange: 'okx',
    side,
    type: OrderType.LIMIT,
    status,
    price: new Decimal(price),
    quantity: new Decimal(quantity),
    executedQuantity: new Decimal(
      executedQty ?? (status === OrderStatus.FILLED ? quantity : 0),
    ),
    averagePrice: avgPrice
      ? new Decimal(avgPrice)
      : status === OrderStatus.FILLED
        ? new Decimal(price)
        : undefined,
    timeInForce: TimeInForce.GTC,
    timestamp: new Date(),
    updateTime: updateTime || new Date(),
  };
}

function createOrderBook(mid: number = 100, range: number = 5): OrderBook {
  const midPrice = new Decimal(mid);
  const step = new Decimal(range).div(5);
  const tick = new Decimal(0.01); // realistic 1-tick spread between bid0 and ask0
  const bids: Array<[Decimal, Decimal]> = [];
  const asks: Array<[Decimal, Decimal]> = [];
  for (let i = 0; i < 5; i += 1) {
    bids.push([midPrice.minus(step.mul(i)), new Decimal(1)]);
    // ask0 = mid + 1 tick (just above bid0 = mid) — realistic tight spread.
    // A wide spread (e.g. mid+step) would cause max(ask0, tpPrice) to floor
    // tpPrice up to ask0 in every test, defeating TP-price assertions.
    asks.push([midPrice.plus(tick).plus(step.mul(i)), new Decimal(1)]);
  }
  return {
    symbol: 'BTC/USDT',
    timestamp: new Date(),
    bids,
    asks,
    exchange: 'okx',
  };
}

function createInitialData(
  overrides: Partial<InitialDataResult> = {},
): InitialDataResult {
  return {
    symbol: 'BTC/USDT',
    exchange: 'okx',
    timestamp: new Date(),
    orderBook: createOrderBook(),
    ...overrides,
  };
}

function createDataUpdate(
  options: {
    orders?: Order[];
  } = {},
): DataUpdate {
  return {
    exchangeName: 'okx',
    symbol: 'BTC/USDT',
    orders: options.orders,
  };
}

function toSignalArray(result: StrategyAnalyzeResult): StrategyResult[] {
  return Array.isArray(result) ? result : [result];
}

function findEntrySignals(result: StrategyAnalyzeResult): StrategyOrderResult[] {
  return toSignalArray(result).filter(
    (s): s is StrategyOrderResult =>
      (s.action === 'buy' || s.action === 'sell') &&
      s.metadata?.signalType === SignalType.Entry,
  );
}

function findTpSignals(
  result: StrategyAnalyzeResult,
): Array<StrategyOrderResult | StrategyUpdateOrderResult> {
  return toSignalArray(result).filter((s) => {
    if (isUpdateOrderResult(s)) {
      return s.metadata?.signalType === SignalType.TakeProfit;
    }
    return (
      (s.action === 'buy' || s.action === 'sell') &&
      s.metadata?.signalType === SignalType.TakeProfit
    );
  }) as Array<StrategyOrderResult | StrategyUpdateOrderResult>;
}

function findCancelSignals(result: StrategyAnalyzeResult) {
  return toSignalArray(result).filter((s) => s.action === 'cancel');
}

// ──────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────

describe('LadderEntrySingleTPStrategy', () => {
  describe('Initialization', () => {
    it('should initialize with default parameters', () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      expect(strategy.strategyType).toBe('LadderEntrySingleTPStrategy');
      expect(strategy.getStrategyId()).toBe(1);
    });

    it('should reject invalid maxInvestment', () => {
      expect(() => {
        new LadderEntrySingleTPStrategy(createStrategyConfig({ maxInvestment: 0 }));
      }).toThrow(/Invalid maxInvestment/);
    });

    it('should reject invalid maxPosition', () => {
      expect(() => {
        new LadderEntrySingleTPStrategy(createStrategyConfig({ maxPosition: 0 }));
      }).toThrow(/Invalid maxPosition/);
    });

    it('should reject invalid ladderSteps', () => {
      expect(() => {
        new LadderEntrySingleTPStrategy(createStrategyConfig({ ladderSteps: 0 }));
      }).toThrow(/Invalid ladderSteps/);
    });

    it('should reject invalid stepValue', () => {
      expect(() => {
        new LadderEntrySingleTPStrategy(createStrategyConfig({ stepValue: 0 }));
      }).toThrow(/Invalid stepValue/);
    });

    it('should reject geometric qty with qtyStepRatio=0', () => {
      expect(() => {
        new LadderEntrySingleTPStrategy(
          createStrategyConfig({ qtyType: 'geometric', qtyStepRatio: 0 }),
        );
      }).toThrow(/Invalid qtyStepRatio/);
    });
  });

  describe('processInitialData - ladder placement', () => {
    it('should place only the first ladder BUY entry order on init (sequential mode)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 5,
          stepValue: 1,
          qtyPerStep: 0.1,
          maxInvestment: 10000,
          maxPosition: 100,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(result);

      // Sequential mode: only ONE entry order placed at a time
      expect(entrySignals).toHaveLength(1);
      expect(entrySignals[0].action).toBe('buy');

      // Arithmetic absolute steps (stepValue=1): entry 0 = referencePrice - stepValue * (0+1) = 99
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(99, 1);
      expect(entrySignals[0].quantity!.toNumber()).toBeCloseTo(0.1, 5);
    });

    it('should use REST orderbook bid0 as reference when basePrice=0', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0,
          ladderSteps: 3,
          stepValue: 1,
          qtyPerStep: 0.1,
        }),
      );

      const ob = createOrderBook(95);
      const result = await strategy.processInitialData(
        createInitialData({ orderBook: ob }),
      );
      const entrySignals = findEntrySignals(result);

      // Sequential mode: only ONE entry order placed on init
      expect(entrySignals).toHaveLength(1);
      // bid0 = 95 → entry 0 = 95 - 1*(0+1) = 94
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(94, 1);
    });

    it('should place geometric step prices correctly', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 3,
          stepType: 'geometric',
          stepValue: 2,
          qtyPerStep: 0.1,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(result);

      // Sequential mode: only ONE entry order placed on init
      expect(entrySignals).toHaveLength(1);
      // Geometric stepValue=2: entry 0 = 100 * (1 - 0.02)^1 = 98
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(98, 1);
    });

    it('should place geometric qty progression correctly', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 3,
          qtyType: 'geometric',
          qtyPerStep: 0.1,
          qtyStepRatio: 2,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(result);

      // Sequential mode: only ONE entry order placed on init
      expect(entrySignals).toHaveLength(1);
      expect(entrySignals[0].quantity!.toNumber()).toBeCloseTo(0.1, 5);
    });

    it('should place arithmetic qty progression correctly', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 3,
          qtyType: 'arithmetic',
          qtyPerStep: 0.1,
          qtyStepAdd: 0.05,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(result);

      // Sequential mode: only ONE entry order placed on init
      expect(entrySignals).toHaveLength(1);
      expect(entrySignals[0].quantity!.toNumber()).toBeCloseTo(0.1, 5);
    });

    it('should skip steps that exceed maxPosition', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 5,
          qtyPerStep: 0.5,
          maxPosition: 1.5,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(result);
      // Sequential mode: only one entry placed at a time, maxPosition allows it
      expect(entrySignals).toHaveLength(1);
    });

    it('should skip steps that exceed maxInvestment', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 10,
          basePrice: 100,
          qtyPerStep: 1,
          maxInvestment: 25,
          leverage: 10,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(result);
      // Sequential mode: only one entry placed at a time, maxInvestment allows it
      expect(entrySignals).toHaveLength(1);
    });
  });

  describe('Entry fill → TP creation', () => {
    it('should create exactly one TP SELL order when first entry fills', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 3,
          tpType: 'percent',
          tpPercent: 2,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      const filledOrder = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );

      const result = await strategy.analyze(createDataUpdate({ orders: [filledOrder] }));
      const tpSignals = findTpSignals(result);

      expect(tpSignals).toHaveLength(1);
      const tpSignal = tpSignals[0] as StrategyOrderResult;
      expect(tpSignal.action).toBe('sell');
      expect(tpSignal.quantity!.toNumber()).toBeCloseTo(0.1, 5);
      // VWAP=99, TP = 99 * 1.02 = 100.98 (above ask0=100.01, so no floor)
      expect(tpSignal.price!.toNumber()).toBeCloseTo(100.98, 1);
    });

    it('should compute TP price from absolute profit correctly', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 1,
          qtyPerStep: 0.5,
          tpType: 'absolute',
          tpAbsoluteProfit: 10,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      const filledOrder = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.5,
        0.5,
        99,
      );

      const result = await strategy.analyze(createDataUpdate({ orders: [filledOrder] }));
      const tpSignals = findTpSignals(result);

      expect(tpSignals).toHaveLength(1);
      const tpSignal = tpSignals[0] as StrategyOrderResult;
      // VWAP=99, TP = 99 + 10/0.5 = 119
      expect(tpSignal.price!.toNumber()).toBeCloseTo(119, 1);
      expect(tpSignal.quantity!.toNumber()).toBeCloseTo(0.5, 5);
    });

    it('should update TP when second entry fills (new VWAP)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 3,
          tpType: 'percent',
          tpPercent: 2,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      // Sequential mode: only entry 0 placed on init
      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );
      // Fill entry 0 → returns entry 1 signal + TP signal
      const result0 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const entry1Signals = findEntrySignals(result0);

      const fill1 = createOrder(
        entry1Signals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        98,
        0.1,
        0.1,
        98,
      );
      const result1 = await strategy.analyze(createDataUpdate({ orders: [fill1] }));

      const tp1 = findTpSignals(result1);
      expect(tp1.length).toBeGreaterThanOrEqual(1);

      // VWAP = (99*0.1 + 98*0.1) / 0.2 = 98.5; TP = 98.5 * 1.02 = 100.47 (above ask0=100.01)
      const tpSignal = tp1[tp1.length - 1] as StrategyOrderResult;
      expect(tpSignal.action).toBe('sell');
      expect(tpSignal.quantity!.toNumber()).toBeCloseTo(0.2, 5);
      expect(tpSignal.price!.toNumber()).toBeCloseTo(100.47, 1);
    });

    it('should compute absolute TP with multiple fills (VWAP-based)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 2,
          qtyPerStep: 0.5,
          tpType: 'absolute',
          tpAbsoluteProfit: 20,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      // Sequential mode: only entry 0 placed on init
      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.5,
        0.5,
        99,
      );
      // Fill entry 0 → returns entry 1 signal + TP signal
      const result0 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const entry1Signals = findEntrySignals(result0);

      const fill1 = createOrder(
        entry1Signals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        98,
        0.5,
        0.5,
        98,
      );
      const result1 = await strategy.analyze(createDataUpdate({ orders: [fill1] }));

      const tpSignals = findTpSignals(result1);
      const tpSignal = tpSignals[tpSignals.length - 1] as StrategyOrderResult;
      // VWAP = (99*0.5 + 98*0.5) / 1.0 = 98.5; TP = 98.5 + 20/1.0 = 118.5
      expect(tpSignal.price!.toNumber()).toBeCloseTo(118.5, 1);
      expect(tpSignal.quantity!.toNumber()).toBeCloseTo(1.0, 5);
    });
  });

  describe('Entry partial fill → TP update', () => {
    it('should update VWAP and defer TP refresh on entry partial fill (debounced)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 1,
          qtyPerStep: 0.2,
          tpType: 'percent',
          tpPercent: 2,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      const partialFill = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.PARTIALLY_FILLED,
        99,
        0.2,
        0.1,
        99,
      );
      const result = await strategy.analyze(createDataUpdate({ orders: [partialFill] }));

      // Partial fill: VWAP updated immediately, but TP refresh is debounced
      const state = strategy.getStrategyState();
      expect(state.inventoryQty).toBe('0.1');
      expect(state.vwap).toBe('99');

      // TP signal not returned yet (debounced)
      const tpSignalsImmediate = findTpSignals(result);
      expect(tpSignalsImmediate).toHaveLength(0);

      // Wait for debounce window to elapse, then call analyze again
      await new Promise((resolve) => setTimeout(resolve, 2100));
      const deferredResult = await strategy.analyze(createDataUpdate({ orders: [] }));

      // Now TP refresh should execute
      const tpSignalsDeferred = findTpSignals(deferredResult);
      expect(tpSignalsDeferred.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('TP partial fill → no action', () => {
    it('should NOT take any action on TP partial fill (no signals)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 2,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      // Sequential mode: fill entry 0 first
      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );
      // Fill entry 0 → returns entry 1 signal + TP signal
      const result0 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const entry1Signals = findEntrySignals(result0);

      const fill1 = createOrder(
        entry1Signals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        98,
        0.1,
        0.1,
        98,
      );
      const result1 = await strategy.analyze(createDataUpdate({ orders: [fill1] }));
      const tpSignals = findTpSignals(result1);
      const tpClientId = (tpSignals[tpSignals.length - 1] as StrategyOrderResult)
        .clientOrderId;

      // TP partial fill: 0.1 out of 0.2 → should produce NO signals
      // VWAP=(99+98)/2=98.5, TP=98.5*1.01=99.385
      const tpPartial = createOrder(
        tpClientId,
        OrderSide.SELL,
        OrderStatus.PARTIALLY_FILLED,
        99.385,
        0.2,
        0.1,
        99.385,
      );
      const tpResult = await strategy.analyze(createDataUpdate({ orders: [tpPartial] }));

      const allSignals = toSignalArray(tpResult);
      // Should be "hold" — no actions at all
      expect(allSignals).toHaveLength(1);
      expect(allSignals[0].action).toBe('hold');
    });

    it('should reduce TP sell quantity after partial TP fill + new entry fill', async () => {
      // CRITICAL: TP partial fill sells some inventory. When a new entry
      // subsequently fills, the refreshed TP must sell inventoryQty - tpFilledQty,
      // NOT the full inventoryQty. Otherwise the TP oversells the position.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 3,
          stepValue: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 5,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      // Fill entry 0 → TP placed
      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );
      const result0 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const entry1Signals = findEntrySignals(result0);
      const tpSignals0 = findTpSignals(result0);
      const tpClientId = (tpSignals0[tpSignals0.length - 1] as StrategyOrderResult)
        .clientOrderId;

      // TP partial fill: 0.05 out of 0.1 sold → tpFilledQty=0.05
      const tpPartial = createOrder(
        tpClientId,
        OrderSide.SELL,
        OrderStatus.PARTIALLY_FILLED,
        103.95,
        0.1,
        0.05,
        103.95,
      );
      await strategy.analyze(createDataUpdate({ orders: [tpPartial] }));

      // Now fill entry 1 → recalculateVWAP → inventoryQty=0.2, but tpFilledQty=0.05
      // TP should sell 0.2 - 0.05 = 0.15, NOT 0.2
      const fill1 = createOrder(
        entry1Signals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        98,
        0.1,
        0.1,
        98,
      );
      const result1 = await strategy.analyze(createDataUpdate({ orders: [fill1] }));
      const tpSignals1 = findTpSignals(result1);

      // Should have a TP signal (update existing or new)
      expect(tpSignals1.length).toBeGreaterThanOrEqual(1);

      // CRITICAL: TP quantity must be 0.15 (0.2 - 0.05), NOT 0.2
      const tpSignal = tpSignals1[tpSignals1.length - 1] as StrategyOrderResult;
      expect(tpSignal.quantity?.toNumber()).toBeCloseTo(0.15, 5);
    });
  });

  describe('TP full fill → cycle reset', () => {
    it('should cancel all remaining entries and reset on TP FILLED', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepValue: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );
      const result0 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const tp0 = findTpSignals(result0);
      const tpClientId = (tp0[0] as StrategyOrderResult).clientOrderId;

      // TP fills at 99.99 (VWAP=99, TP=99*1.01=99.99)
      const tpFill = createOrder(
        tpClientId,
        OrderSide.SELL,
        OrderStatus.FILLED,
        99.99,
        0.1,
        0.1,
        99.99,
      );
      const tpResult = await strategy.analyze(createDataUpdate({ orders: [tpFill] }));

      // Sequential mode: entry 0 was filled, then entry 1 was placed (pending).
      // TP filled → cancel entry 1 (the only pending entry order).
      const cancelSignals = findCancelSignals(tpResult);
      expect(cancelSignals.length).toBe(1);

      // Should place new cycle's first entry
      const newEntries = findEntrySignals(tpResult);
      expect(newEntries.length).toBeGreaterThanOrEqual(1);

      const state = strategy.getStrategyState();
      expect(state.inventoryQty).toBe('0');
      expect(state.vwap).toBe('0');
    });

    it('should rebuild ladder with fixed basePrice after TP fill', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 2,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );
      const result0 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const tp0 = findTpSignals(result0);
      const tpClientId = (tp0[0] as StrategyOrderResult).clientOrderId;

      // TP fills at 99.99 (VWAP=99, TP=99*1.01=99.99)
      const tpFill = createOrder(
        tpClientId,
        OrderSide.SELL,
        OrderStatus.FILLED,
        99.99,
        0.1,
        0.1,
        99.99,
      );
      const tpResult = await strategy.analyze(createDataUpdate({ orders: [tpFill] }));

      // New cycle should use same fixed basePrice=100
      // entry 0 = 100 - 1*(0+1) = 99
      const newEntries = findEntrySignals(tpResult);
      expect(newEntries.length).toBeGreaterThanOrEqual(1);
      expect(newEntries[0].price!.toNumber()).toBeCloseTo(99, 1);
    });

    it('should not place duplicate entry when delayed CANCELED push arrives after TP fill', async () => {
      // Strategy 467 bug: after TP FILLED, handleTpFilled generated cancel
      // signals for pending entry orders. cancelAllEntryOrders deleted pending
      // orders from pendingClientOrderIds before resetLadder ran, so the
      // pending order IDs were NOT blacklisted. A delayed WS CANCELED push
      // for the pending entry was then re-processed via ensureRecoveredMetadata
      // → shouldRefreshLadder → placeLadderEntries → DUPLICATE entry order.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepValue: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      // Fill entry 0 → entry 1 placed + TP placed
      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );
      const result0 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const entry1Signals = findEntrySignals(result0);
      const tp0 = findTpSignals(result0);
      const tpClientId = (tp0[0] as StrategyOrderResult).clientOrderId;
      const entry1ClientId = entry1Signals[0].clientOrderId;

      // TP fills → entry 1 gets cancelled
      const tpFill = createOrder(
        tpClientId,
        OrderSide.SELL,
        OrderStatus.FILLED,
        99.99,
        0.1,
        0.1,
        99.99,
      );
      const tpResult = await strategy.analyze(createDataUpdate({ orders: [tpFill] }));

      // TP fill should produce: 1 cancel (entry 1) + 1 new entry (new cycle)
      const cancelSignals = findCancelSignals(tpResult);
      const newEntrySignals = findEntrySignals(tpResult);
      expect(cancelSignals.length).toBe(1); // cancel entry 1
      expect(newEntrySignals.length).toBe(1); // new cycle entry 0

      // CRITICAL: Now simulate the delayed WS CANCELED push for entry 1
      // This should be blacklisted and NOT produce any new entry signals
      const entry1Cancel = createOrder(
        entry1ClientId,
        OrderSide.BUY,
        OrderStatus.CANCELED,
        98,
        0.1,
        0,
        undefined,
      );
      const delayedResult = await strategy.analyze(
        createDataUpdate({ orders: [entry1Cancel] }),
      );

      const delayedSignals = toSignalArray(delayedResult);
      // Should be "hold" — no duplicate entry placed
      expect(delayedSignals).toHaveLength(1);
      expect(delayedSignals[0].action).toBe('hold');
    });

    it('should not place duplicate entry when entry was cancelled before TP fill (DeepSeek-pro C1)', async () => {
      // Scenario: entry step 1 was CANCELED (no fill) before TP filled.
      // The terminal handler deletes it from this.orders, orderMetadataMap,
      // and pendingClientOrderIds. It remains ONLY in processedTerminalIds.
      // When TP fills, handleTpFilled must blacklist it from
      // processedTerminalIds too, otherwise a delayed CANCELED push would
      // be resurrected via ensureRecoveredMetadata → placeLadderEntries.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepValue: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      // Fill entry 0 → entry 1 placed + TP placed
      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );
      const result0 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const entry1Signals = findEntrySignals(result0);
      const tp0 = findTpSignals(result0);
      const tpClientId = (tp0[0] as StrategyOrderResult).clientOrderId;
      const entry1ClientId = entry1Signals[0].clientOrderId;

      // Entry 1 gets CANCELED (no fill) — terminal handler removes it from
      // this.orders, orderMetadataMap, pendingClientOrderIds.
      // It remains only in processedTerminalIds.
      // shouldRefreshLadder=true → places entry 1 again (new clientOrderId)
      const entry1Cancel = createOrder(
        entry1ClientId,
        OrderSide.BUY,
        OrderStatus.CANCELED,
        98,
        0.1,
        0,
        undefined,
      );
      const cancelResult = await strategy.analyze(
        createDataUpdate({ orders: [entry1Cancel] }),
      );
      // Entry 1 re-placed after cancel (sequential mode: step 1 not filled)
      const reEntrySignals = findEntrySignals(cancelResult);
      expect(reEntrySignals.length).toBe(1);
      const entry1ReClientId = reEntrySignals[0].clientOrderId;

      // Now TP fills → cancel entry1ReClientId
      const tpFill = createOrder(
        tpClientId,
        OrderSide.SELL,
        OrderStatus.FILLED,
        99.99,
        0.1,
        0.1,
        99.99,
      );
      const tpResult = await strategy.analyze(createDataUpdate({ orders: [tpFill] }));

      // TP fill should produce: 1 cancel (re-placed entry 1) + 1 new entry (new cycle)
      const cancelSignals = findCancelSignals(tpResult);
      const newEntrySignals = findEntrySignals(tpResult);
      expect(cancelSignals.length).toBe(1);
      expect(newEntrySignals.length).toBe(1);

      // CRITICAL: Simulate delayed WS CANCELED push for the original entry1ClientId
      // (the one that was cancelled before TP fill).
      // It's NOT in previousCycleOrderIds from this.orders/orderMetadataMap/pendingClientOrderIds
      // because the terminal handler already deleted it. It's ONLY in processedTerminalIds.
      // If handleTpFilled doesn't blacklist from processedTerminalIds, this push
      // would be resurrected and trigger a duplicate entry.
      const delayedCancel = createOrder(
        entry1ClientId,
        OrderSide.BUY,
        OrderStatus.CANCELED,
        98,
        0.1,
        0,
        undefined,
      );
      const delayedResult = await strategy.analyze(
        createDataUpdate({ orders: [delayedCancel] }),
      );
      const delayedSignals = toSignalArray(delayedResult);
      expect(delayedSignals).toHaveLength(1);
      expect(delayedSignals[0].action).toBe('hold');

      // Also verify the re-placed entry's CANCELED push is blacklisted
      const delayedReCancel = createOrder(
        entry1ReClientId,
        OrderSide.BUY,
        OrderStatus.CANCELED,
        98,
        0.1,
        0,
        undefined,
      );
      const delayedReResult = await strategy.analyze(
        createDataUpdate({ orders: [delayedReCancel] }),
      );
      const delayedReSignals = toSignalArray(delayedReResult);
      expect(delayedReSignals).toHaveLength(1);
      expect(delayedReSignals[0].action).toBe('hold');
    });
  });

  describe('Stop/restart recovery', () => {
    it('should recover inventory, VWAP, and TP from open orders on restart', async () => {
      // Simulate a restart: strategy had 2 entries filled at 99 and 98,
      // plus an active TP order, and one pending entry at 97.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      // We need to create clientOrderIds that match the strategy's ID pattern
      // Strategy ID = 1, so entry orders start with E1D, TP with T1D
      const entry0Id = 'E1D1000001'; // filled at 99
      const entry1Id = 'E1D1000002'; // filled at 98
      const entry2Id = 'E1D1000003'; // still NEW at 97
      const tpId = 'T1D1000001'; // active TP

      const recoveredOrders: Order[] = [
        createOrder(entry0Id, OrderSide.BUY, OrderStatus.FILLED, 99, 0.1, 0.1, 99),
        createOrder(entry1Id, OrderSide.BUY, OrderStatus.FILLED, 98, 0.1, 0.1, 98),
        createOrder(entry2Id, OrderSide.BUY, OrderStatus.NEW, 97, 0.1, 0, undefined),
        createOrder(tpId, OrderSide.SELL, OrderStatus.NEW, 99.385, 0.2, 0, undefined),
      ];

      await strategy.processInitialData(
        createInitialData({ openOrders: recoveredOrders }),
      );

      const state = strategy.getStrategyState();

      // VWAP = (99*0.1 + 98*0.1) / 0.2 = 98.5
      expect(state.vwap).toBe('98.5');
      expect(state.inventoryQty).toBe('0.2');
      // TP recovered
      expect(state.tpClientOrderId).toBe(tpId);
      // Step 0 and 1 should be filled
      expect(state.steps[0].filled).toBe(true);
      expect(state.steps[1].filled).toBe(true);
      // Step 2 should have entryClientOrderId
      expect(state.steps[2].entryClientOrderId).toBe(entry2Id);
      expect(state.steps[2].filled).toBe(false);
    });

    it('should create TP if inventory exists but no TP on restart', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 2,
        }),
      );

      const entry0Id = 'E1D2000001'; // filled at 99
      const recoveredOrders: Order[] = [
        createOrder(entry0Id, OrderSide.BUY, OrderStatus.FILLED, 99, 0.1, 0.1, 99),
      ];

      const result = await strategy.processInitialData(
        createInitialData({ openOrders: recoveredOrders }),
      );

      const tpSignals = findTpSignals(result);
      expect(tpSignals.length).toBeGreaterThanOrEqual(1);

      const state = strategy.getStrategyState();
      expect(state.inventoryQty).toBe('0.1');
      expect(state.vwap).toBe('99');
      // TP = 99 * 1.02 = 100.98 (above ask0=100.01, so no floor)
      expect(state.tpPrice).toBe('100.98');
    });

    it('should handle partial fills on restart (recovered VWAP)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          qtyPerStep: 0.2,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      // One entry partially filled (0.1 out of 0.2)
      const entry0Id = 'E1D3000001';
      const recoveredOrders: Order[] = [
        createOrder(
          entry0Id,
          OrderSide.BUY,
          OrderStatus.PARTIALLY_FILLED,
          99,
          0.2,
          0.1,
          99,
        ),
      ];

      const result = await strategy.processInitialData(
        createInitialData({ openOrders: recoveredOrders }),
      );

      const state = strategy.getStrategyState();
      expect(state.inventoryQty).toBe('0.1');
      expect(state.vwap).toBe('99');

      // Should create TP for the partial inventory
      const tpSignals = findTpSignals(result);
      expect(tpSignals.length).toBeGreaterThanOrEqual(1);
    });

    it('should place remaining ladder entries on restart with empty state', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          qtyPerStep: 0.1,
        }),
      );

      // No open orders — fresh start
      const result = await strategy.processInitialData(
        createInitialData({ openOrders: [] }),
      );
      const entrySignals = findEntrySignals(result);
      // Sequential mode: only one entry placed on init
      expect(entrySignals).toHaveLength(1);
    });

    it('should NOT duplicate entries on restart when FILLED orders are in orderHistory (not openOrders)', async () => {
      // Real-world restart scenario: entry 0 was FILLED (not in openOrders),
      // entry 1 is NEW (in openOrders), TP is NEW (in openOrders).
      // The strategy must recover entry 0 from orderHistory and NOT re-place it.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      const entry0Id = 'E1D5000001'; // FILLED at 99 — in orderHistory only
      const entry1Id = 'E1D5000002'; // NEW at 98 — in openOrders
      const tpId = 'T1D5000001'; // NEW — in openOrders

      // TP price = VWAP * (1 + tpPercent/100) = 99 * 1.01 = 99.99
      // (only entry 0 filled → VWAP = 99)
      const openOrders: Order[] = [
        createOrder(entry1Id, OrderSide.BUY, OrderStatus.NEW, 98, 0.1, 0, undefined),
        createOrder(tpId, OrderSide.SELL, OrderStatus.NEW, 99.99, 0.1, 0, undefined),
      ];

      const orderHistory: Order[] = [
        // entry 0 was FILLED — only in orderHistory
        createOrder(entry0Id, OrderSide.BUY, OrderStatus.FILLED, 99, 0.1, 0.1, 99),
      ];

      const result = await strategy.processInitialData(
        createInitialData({ openOrders, orderHistory }),
      );

      const entrySignals = findEntrySignals(result);

      // Key assertion: NO duplicate entry 0 should be placed.
      // entry 1 is already active (NEW in openOrders), so no new entry needed.
      expect(entrySignals).toHaveLength(0);

      const state = strategy.getStrategyState();

      // Step 0 should be recovered as filled
      expect(state.steps[0].filled).toBe(true);
      expect(state.steps[0].entryClientOrderId).toBe(entry0Id);

      // Step 1 should be recovered as active (NEW)
      expect(state.steps[1].filled).toBe(false);
      expect(state.steps[1].entryClientOrderId).toBe(entry1Id);

      // Inventory = 0.1, VWAP = 99 (only entry 0 filled)
      expect(state.inventoryQty).toBe('0.1');
      expect(state.vwap).toBe('99');

      // TP recovered
      expect(state.tpClientOrderId).toBe(tpId);
    });

    // Strategy 471 bug: when all TP orders were CANCELED (not active in openOrders),
    // tpClientOrderId is null → TP-qty inference (Step 4a-b) is skipped.
    // recoverStepIndex (price matching, 0.1% tolerance) fails when bid0 drifted
    // between original ladder placement and restart → old filled entry prices don't
    // match fresh ladder prices → steps not marked filled → placeLadderEntries
    // places step 0 instead of the correct next step.
    // Fix: inventory-qty inference (Step 4d) uses inventoryQty to infer filled steps.
    it('should infer filled steps from inventoryQty when all TPs were CANCELED and prices do not match fresh ladder (Strategy 471 bug)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0, // dynamic bid0 → ladder prices change with bid0
          ladderSteps: 5,
          stepType: 'geometric',
          stepValue: 0.62,
          qtyType: 'arithmetic',
          qtyPerStep: 2000,
          qtyStepAdd: 500,
          tpType: 'percent',
          tpPercent: 5,
          maxInvestment: 100000,
          maxPosition: 100000,
        }),
      );

      // Original bid0 was ~0.3450. Entries placed at:
      // Step 0: 0.3450 * (1-0.0062)^1 = 0.34286, qty=2000, FILLED
      // Step 1: 0.3450 * (1-0.0062)^2 = 0.34073, qty=2500, FILLED
      // Step 0+1 total qty = 4500
      // TP was placed but CANCELED.
      const entry0Id = 'E1D7000001';
      const entry1Id = 'E1D7000002';
      const canceledTpId = 'T1D7000001';

      // Fresh bid0 on restart = 0.3420 (drifted from original 0.3450)
      // Fresh ladder step prices: 0.33988, 0.33777, ...
      // Old filled entry prices (0.34286, 0.34073) do NOT match fresh ladder
      const freshOrderBook = createOrderBook(0.342, 0.01);

      const openOrders: Order[] = []; // no active orders — both TPs CANCELED, both entries FILLED

      const orderHistory: Order[] = [
        createOrder(
          entry0Id,
          OrderSide.BUY,
          OrderStatus.FILLED,
          0.34286,
          2000,
          2000,
          0.34286,
        ),
        createOrder(
          entry1Id,
          OrderSide.BUY,
          OrderStatus.FILLED,
          0.34073,
          2500,
          2500,
          0.34073,
        ),
        createOrder(
          canceledTpId,
          OrderSide.SELL,
          OrderStatus.CANCELED,
          0.35061,
          4500,
          0,
          undefined,
        ),
      ];

      const result = await strategy.processInitialData(
        createInitialData({
          openOrders,
          orderHistory,
          orderBook: freshOrderBook,
          strategyNetPosition: new Decimal(4500),
        }),
      );

      const state = strategy.getStrategyState();

      // VWAP = (2000*0.34286 + 2500*0.34073) / 4500 = 0.341677
      expect(state.inventoryQty).toBe('4500');
      expect(state.vwap).toBe('0.34167666666666666667');

      // Steps 0 and 1 should be inferred as filled from inventoryQty=4500
      // (cumulative: step0=2000, step1=4500 → 4500>=4500 → both filled)
      expect(state.steps[0].filled).toBe(true);
      expect(state.steps[1].filled).toBe(true);
      expect(state.steps[2].filled).toBe(false);

      // A TP should be placed (inventory > 0, no active TP)
      const tpSignals = findTpSignals(result);
      expect(tpSignals.length).toBeGreaterThanOrEqual(1);

      // The next entry should be at step 2 (qty=3000), NOT step 0 (qty=2000)
      const entrySignals = findEntrySignals(result);
      expect(entrySignals).toHaveLength(1);
      expect(entrySignals[0]!.quantity.toString()).toBe('3000');
    });
  });

  describe('Restart recovery - orderHistory (real-world scenarios)', () => {
    it('should NOT duplicate entries when FILLED order price does not match new ladder (formula version mismatch)', async () => {
      // Scenario: strategy was running with old code where entry 0 = bid0
      // (formula i). After code update to formula i+1, entry 0 = bid0 - step.
      // On restart, the old FILLED entry 0 price no longer matches the new
      // ladder step 0 price. The fallback inference must still mark step 0
      // as filled to prevent a duplicate entry.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      // New code: entry 0 = 100 - 1*(0+1) = 99, entry 1 = 100 - 1*(1+1) = 98
      // Old code: entry 0 = 100 (bid0), entry 1 = 99
      // Simulate: old entry 0 FILLED at price=100 (old formula i)
      //           new entry 1 NEW at price=98 (matches new formula i+1)
      const entry0OldId = 'E1D6000001'; // FILLED at 100 (old formula — price mismatch)
      const entry1Id = 'E1D6000002'; // NEW at 98 (new formula — price matches)
      const tpId = 'T1D6000001'; // NEW TP

      const openOrders: Order[] = [
        createOrder(entry1Id, OrderSide.BUY, OrderStatus.NEW, 98, 0.1, 0, undefined),
        createOrder(tpId, OrderSide.SELL, OrderStatus.NEW, 99.99, 0.1, 0, undefined),
      ];

      const orderHistory: Order[] = [
        // Old entry 0 FILLED at price=100 — does NOT match new step 0 (99)
        createOrder(entry0OldId, OrderSide.BUY, OrderStatus.FILLED, 100, 0.1, 0.1, 100),
      ];

      const result = await strategy.processInitialData(
        createInitialData({ openOrders, orderHistory }),
      );

      const entrySignals = findEntrySignals(result);
      // No new entry should be placed — step 0 is filled, step 1 is active
      expect(entrySignals).toHaveLength(0);

      const state = strategy.getStrategyState();
      // Step 0 must be marked as filled (fallback inference)
      expect(state.steps[0].filled).toBe(true);
      // Step 1 is active (NEW)
      expect(state.steps[1].entryClientOrderId).toBe(entry1Id);
      expect(state.steps[1].filled).toBe(false);
      // Inventory and VWAP recovered from orderHistory
      expect(state.inventoryQty).toBe('0.1');
      expect(state.vwap).toBe('100');
    });

    it('should infer filled step count from TP quantity (strategy 465 real-world scenario)', async () => {
      // Real-world scenario from strategy 465:
      // basePrice=0, stepType=geometric, stepValue=0.62, qtyType=arithmetic,
      // qtyPerStep=3000, qtyStepAdd=1500, ladderSteps=5, tpType=absolute, tpAbsoluteProfit=15
      // After cycle 2: entry 0 FILLED at 0.3367 (old formula: entry 0 = bid0),
      //   TP NEW at 0.3417 qty=3000, entry 1 NEW at 0.3346
      // On restart: TP qty=3000, step 0 qty=3000 → cumulative=3000 >= 3000 → 1 step filled
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0,
          ladderSteps: 5,
          stepType: 'geometric',
          stepValue: 0.62,
          qtyType: 'arithmetic',
          qtyPerStep: 3000,
          qtyStepAdd: 1500,
          tpType: 'absolute',
          tpAbsoluteProfit: 15,
          maxInvestment: 1200,
          maxPosition: 30000,
          leverage: 10,
        }),
      );

      const entry1Id = 'E1D7000002';
      const tpId = 'T1D7000001';
      const entry0OldId = 'E1D7000001';

      // Use fresh orderbook with bid0 = 0.3367 (same as pre-restart)
      const openOrders: Order[] = [
        createOrder(entry1Id, OrderSide.BUY, OrderStatus.NEW, 0.3346, 4500, 0, undefined),
        createOrder(tpId, OrderSide.SELL, OrderStatus.NEW, 0.3417, 3000, 0, undefined),
      ];

      const orderHistory: Order[] = [
        createOrder(
          entry0OldId,
          OrderSide.BUY,
          OrderStatus.FILLED,
          0.3367,
          3000,
          3000,
          0.3367,
        ),
      ];

      const result = await strategy.processInitialData(
        createInitialData({
          openOrders,
          orderHistory,
          orderBook: {
            symbol: 'BTC/USDT',
            timestamp: new Date(),
            exchange: 'okx',
            bids: [[new Decimal(0.3367), new Decimal(1)]],
            asks: [[new Decimal(0.3377), new Decimal(1)]],
          },
        }),
      );

      const entrySignals = findEntrySignals(result);
      // No duplicate entry — step 0 filled (inferred from TP qty=3000 = step 0 qty),
      // step 1 is active (NEW in openOrders)
      expect(entrySignals).toHaveLength(0);

      const state = strategy.getStrategyState();
      // Step 0 must be marked as filled (TP qty=3000 = cumulative step 0 qty)
      expect(state.steps[0].filled).toBe(true);
      // Step 1 is active (NEW in openOrders)
      expect(state.steps[1].entryClientOrderId).toBe(entry1Id);
      expect(state.steps[1].filled).toBe(false);
      // TP recovered
      expect(state.tpClientOrderId).toBe(tpId);
    });

    it('should place next entry when TP exists but no active entry (entry was cancelled)', async () => {
      // Scenario: entry 0 FILLED, entry 1 was NEW but got CANCELLED (e.g. by
      // exchange or manually). On restart: openOrders has only TP (NEW),
      // orderHistory has entry 0 FILLED.
      // TP qty = 0.1 (step 0 qty) → 1 step filled → place step 1 entry.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      const entry0FilledId = 'E1D8000001';
      const tpId = 'T1D8000001';

      // openOrders: only TP (no active entry)
      const openOrders: Order[] = [
        createOrder(tpId, OrderSide.SELL, OrderStatus.NEW, 99.99, 0.1, 0, undefined),
      ];

      // orderHistory: entry 0 FILLED at price=99 (matches new formula i+1)
      const orderHistory: Order[] = [
        createOrder(entry0FilledId, OrderSide.BUY, OrderStatus.FILLED, 99, 0.1, 0.1, 99),
      ];

      const result = await strategy.processInitialData(
        createInitialData({ openOrders, orderHistory }),
      );

      const entrySignals = findEntrySignals(result);
      // Should place entry 1 (step 1) since step 0 is filled, no active entry
      expect(entrySignals).toHaveLength(1);
      // entry 1 = 100 - 1*(1+1) = 98
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(98, 1);

      const state = strategy.getStrategyState();
      // Step 0 filled (from TP qty inference)
      expect(state.steps[0].filled).toBe(true);
      // Step 1 should now have a new entry order placed
      expect(state.steps[1].entryClientOrderId).toBeTruthy();
      expect(state.steps[1].filled).toBe(false);
    });

    it('should NOT place entry when all steps filled + TP active (waiting for TP fill)', async () => {
      // Scenario: ladderSteps=1, entry 0 FILLED, TP NEW.
      // All steps filled → no entry to place, just waiting for TP.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 1,
          stepType: 'arithmetic',
          stepValue: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      const entry0FilledId = 'E1D9000001';
      const tpId = 'T1D9000001';

      const openOrders: Order[] = [
        createOrder(tpId, OrderSide.SELL, OrderStatus.NEW, 99.99, 0.1, 0, undefined),
      ];

      const orderHistory: Order[] = [
        createOrder(entry0FilledId, OrderSide.BUY, OrderStatus.FILLED, 99, 0.1, 0.1, 99),
      ];

      const result = await strategy.processInitialData(
        createInitialData({ openOrders, orderHistory }),
      );

      const entrySignals = findEntrySignals(result);
      // All steps filled → no entry needed
      expect(entrySignals).toHaveLength(0);

      const state = strategy.getStrategyState();
      expect(state.steps[0].filled).toBe(true);
      expect(state.tpClientOrderId).toBe(tpId);
    });

    it('should reverse-engineer referencePrice from TP (strategy 465 real params)', async () => {
      // Strategy 465: geometric stepValue=0.62, qtyPerStep=3000, qtyStepAdd=1500,
      //               ladderSteps=5, tpType=absolute, tpAbsoluteProfit=15
      // After entry 0 FILLED: VWAP=0.3367, TP price = 0.3367 + 15/3000 = 0.3417
      // TP qty=3000 → 1 filled step
      // reverseEngineer: VWAP=0.3417-15/3000=0.3367, ref=0.3367/0.9938=0.33880...
      // Rebuilt step 0 = 0.33880*0.9938 = 0.33670 (matches FILLED entry 0)
      // Rebuilt step 1 = 0.33880*0.9938^2 = 0.33461 (matches openOrders entry 1)
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0,
          ladderSteps: 5,
          stepType: 'geometric',
          stepValue: 0.62,
          qtyType: 'arithmetic',
          qtyPerStep: 3000,
          qtyStepAdd: 1500,
          tpType: 'absolute',
          tpAbsoluteProfit: 15,
          maxInvestment: 1200,
          maxPosition: 30000,
          leverage: 10,
        }),
      );

      const entry1Id = 'E1DA000002';
      const tpId = 'T1DA000001';
      const entry0FilledId = 'E1DA000001';

      const openOrders: Order[] = [
        createOrder(entry1Id, OrderSide.BUY, OrderStatus.NEW, 0.3346, 4500, 0, undefined),
        createOrder(tpId, OrderSide.SELL, OrderStatus.NEW, 0.3417, 3000, 0, undefined),
      ];

      const orderHistory: Order[] = [
        createOrder(
          entry0FilledId,
          OrderSide.BUY,
          OrderStatus.FILLED,
          0.3367,
          3000,
          3000,
          0.3367,
        ),
      ];

      // Orderbook bid0 is different from original — but we should NOT use it
      // because TP reverse-engineering takes priority.
      const result = await strategy.processInitialData(
        createInitialData({
          openOrders,
          orderHistory,
          orderBook: {
            symbol: 'BTC/USDT',
            timestamp: new Date(),
            exchange: 'okx',
            bids: [[new Decimal(0.35), new Decimal(1)]], // different bid0
            asks: [[new Decimal(0.36), new Decimal(1)]],
          },
        }),
      );

      const state = strategy.getStrategyState();
      // referencePrice should be reverse-engineered, not 0.3500 (bid0)
      // ref = 0.3367 / 0.9938 = 0.33880...
      const expectedRef = parseFloat(
        new Decimal(0.3367)
          .div(new Decimal(1).minus(new Decimal(0.62).div(100)))
          .toString(),
      );
      expect(parseFloat(state.referencePrice)).toBeCloseTo(expectedRef, 4);

      // Step 0 price should match entry 0 FILLED price (0.3367)
      expect(parseFloat(state.steps[0].price)).toBeCloseTo(0.3367, 4);
      // Step 1 price should match entry 1 NEW price (0.3346)
      expect(parseFloat(state.steps[1].price)).toBeCloseTo(0.3346, 3);

      // No duplicate entries
      const entrySignals = findEntrySignals(result);
      expect(entrySignals).toHaveLength(0);
    });

    it('should NOT duplicate entry when bid0 changed after restart (no TP, active entry only)', async () => {
      // Strategy 466 real-world scenario:
      // - geometric stepValue=0.72, qtyPerStep=3000
      // - Entry 0 placed at bid0~0.3347 → price = 0.3347*0.9928 = 0.3323
      // - Service restarts, new bid0~0.3358
      // - Without fix: buildLadder with new bid0 → step0=0.3334, old entry (0.3322) not matched → duplicate!
      // - With fix: reverse-engineer refPrice from entry order price → step0 matches → no duplicate
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0, // use orderbid
          ladderSteps: 5,
          stepType: 'geometric',
          stepValue: 0.72,
          qtyType: 'arithmetic',
          qtyPerStep: 3000,
          qtyStepAdd: 1500,
          tpType: 'absolute',
          tpAbsoluteProfit: 10,
        }),
      );

      // Entry 0 was placed at price 0.3322 (from old bid0 ~0.3347)
      const entry0Id = 'E1D1D1700000000';
      const entry0Price = new Decimal('0.3322');

      // Restart: new bid0 is 0.3358 (different from original 0.3347)
      const newBid0 = new Decimal('0.3358');

      const openOrders: Order[] = [
        createOrder(
          entry0Id,
          OrderSide.BUY,
          OrderStatus.NEW,
          parseFloat(entry0Price.toString()),
          3000,
          0,
          undefined,
        ),
      ];

      const result = await strategy.processInitialData(
        createInitialData({
          openOrders,
          orderBook: {
            symbol: 'TEST/USDC:USDC',
            bids: [[newBid0, new Decimal(100)]],
            asks: [[newBid0.plus(0.0001), new Decimal(100)]],
            timestamp: new Date(),
          },
        }),
      );

      // Critical: NO duplicate entry should be placed
      const entrySignals = findEntrySignals(result);
      expect(entrySignals).toHaveLength(0);

      const state = strategy.getStrategyState();

      // referencePrice should be reverse-engineered from entry order, not new bid0
      // ref = 0.3322 / (1-0.0072)^1 = 0.3322 / 0.9928 = 0.33462...
      const expectedRef = parseFloat(
        new Decimal('0.3322')
          .div(new Decimal(1).minus(new Decimal(0.72).div(100)))
          .toString(),
      );
      expect(parseFloat(state.referencePrice)).toBeCloseTo(expectedRef, 4);

      // Step 0 price should match the existing entry order price (0.3322)
      expect(parseFloat(state.steps[0].price)).toBeCloseTo(0.3322, 4);

      // Step 0 should have the existing entry order's clientOrderId
      expect(state.steps[0].entryClientOrderId).toBe(entry0Id);
    });

    it('should NOT duplicate entry when bid0 changed after restart (arithmetic, no TP)', async () => {
      // Same test but with arithmetic stepType
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0,
          ladderSteps: 5,
          stepType: 'arithmetic',
          stepValue: 300, // absolute: 300 USDT per step
          qtyType: 'arithmetic',
          qtyPerStep: 0.1,
          qtyStepAdd: 0.05,
          tpType: 'absolute',
          tpAbsoluteProfit: 1,
        }),
      );

      // Entry 0 placed at price 64700 (from old bid0 65000)
      const entry0Id = 'E1D1D1700000000';
      const entry0Price = new Decimal('64700');

      // Restart: new bid0 is 65500 (different from original 65000)
      const newBid0 = new Decimal('65500');

      const openOrders: Order[] = [
        createOrder(
          entry0Id,
          OrderSide.BUY,
          OrderStatus.NEW,
          parseFloat(entry0Price.toString()),
          0.1,
          0,
          undefined,
        ),
      ];

      const result = await strategy.processInitialData(
        createInitialData({
          openOrders,
          orderBook: {
            symbol: 'TEST/USDC:USDC',
            bids: [[newBid0, new Decimal(100)]],
            asks: [[newBid0.plus(1), new Decimal(100)]],
            timestamp: new Date(),
          },
        }),
      );

      // Critical: NO duplicate entry
      const entrySignals = findEntrySignals(result);
      expect(entrySignals).toHaveLength(0);

      const state = strategy.getStrategyState();

      // ref = 64700 + 300*1 = 65000 (original bid0, not new 65500)
      expect(parseFloat(state.referencePrice)).toBeCloseTo(65000, 1);

      // Step 0 price should match existing entry (64700)
      expect(parseFloat(state.steps[0].price)).toBeCloseTo(64700, 1);
      expect(state.steps[0].entryClientOrderId).toBe(entry0Id);
    });
  });

  describe('Out-of-order / delayed order pushes', () => {
    it('should skip stale order updates (older updateTime)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      // First update: FILLED at time T1
      const t1 = new Date('2025-01-01T10:00:01Z');
      const fillOrder = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
        t1,
      );
      await strategy.analyze(createDataUpdate({ orders: [fillOrder] }));

      // Stale update: NEW at time T0 (before T1) — should be skipped
      const t0 = new Date('2025-01-01T10:00:00Z');
      const staleOrder = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.NEW,
        99,
        0.1,
        0,
        undefined,
        t0,
      );
      const result = await strategy.analyze(createDataUpdate({ orders: [staleOrder] }));

      // Should not produce any signals (stale update skipped)
      expect(toSignalArray(result)).toHaveLength(1);
      expect(toSignalArray(result)[0].action).toBe('hold');

      // State should still reflect the filled order
      const state = strategy.getStrategyState();
      expect(state.inventoryQty).toBe('0.1');
    });

    it('should be idempotent when receiving duplicate FILLED notifications', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 2,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      // Fill step 0
      const fillOrder = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
        new Date('2025-01-01T10:00:01Z'),
      );
      const result1 = await strategy.analyze(createDataUpdate({ orders: [fillOrder] }));
      const tp1 = findTpSignals(result1);
      expect(tp1).toHaveLength(1);

      // Duplicate FILLED notification (same updateTime)
      const result2 = await strategy.analyze(createDataUpdate({ orders: [fillOrder] }));
      // Should be "hold" — already processed
      const allSignals = toSignalArray(result2);
      expect(allSignals).toHaveLength(1);
      expect(allSignals[0].action).toBe('hold');
    });
  });

  describe('PARTIAL fill → FULL fill with same updateTime', () => {
    it('should process FILLED update even when updateTime equals PARTIAL_FILL updateTime', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 2,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      const sameTime = new Date('2025-01-01T10:00:01.000Z');

      // First push: PARTIAL_FILL — executed 0.051 of 0.1
      // Partial fill: VWAP updated, TP refresh debounced (no immediate TP signal)
      const partialOrder = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.PARTIALLY_FILLED,
        99,
        0.1,
        0.051,
        99,
        sameTime,
      );
      const partialResult = await strategy.analyze(
        createDataUpdate({ orders: [partialOrder] }),
      );
      // No immediate TP signal (debounced)
      const partialTp = findTpSignals(partialResult);
      expect(partialTp).toHaveLength(0);
      // But inventory is updated
      expect(strategy.getStrategyState().inventoryQty).toBe('0.051');

      // Second push: FILLED — executed 0.1 of 0.1 (same updateTime!)
      // FILLED bypasses debounce — TP refreshed immediately
      const filledOrder = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
        sameTime,
      );
      const filledResult = await strategy.analyze(
        createDataUpdate({ orders: [filledOrder] }),
      );

      // TP should be refreshed immediately (FILLED bypasses debounce)
      const filledTp = findTpSignals(filledResult);
      expect(filledTp.length).toBeGreaterThanOrEqual(1);
      const finalTp = filledTp[filledTp.length - 1] as StrategyOrderResult;
      expect(finalTp.quantity!.toNumber()).toBeCloseTo(0.1, 5);

      // Verify inventory is correct
      const state = strategy.getStrategyState();
      expect(state.inventoryQty).toBe('0.1');
    });
  });

  describe('Entry partial fill → cancel', () => {
    it('should preserve partial-fill inventory and refresh TP when entry is cancelled after partial fill', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      // Partial fill 0.05 of 0.1 at price 99
      // Partial fill: VWAP updated, TP refresh debounced (no immediate TP signal)
      const partialFill = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.PARTIALLY_FILLED,
        99,
        0.1,
        0.05,
        99, // averagePrice = 99
        new Date('2025-01-01T10:00:01Z'),
      );
      const partialResult = await strategy.analyze(
        createDataUpdate({ orders: [partialFill] }),
      );
      // No immediate TP signal (debounced)
      const partialTp = findTpSignals(partialResult);
      expect(partialTp).toHaveLength(0);
      // But inventory is updated
      expect(strategy.getStrategyState().inventoryQty).toBe('0.05');

      // Then order gets cancelled (partial fill → cancel)
      // Cancel is a terminal action — TP refresh is NOT debounced here
      const cancelledOrder = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.CANCELED,
        99,
        0.1,
        0.05, // executedQuantity stays at 0.05
        99, // averagePrice = 99
        new Date('2025-01-01T10:00:02Z'),
      );
      const cancelResult = await strategy.analyze(
        createDataUpdate({ orders: [cancelledOrder] }),
      );

      // Inventory should be 0.05 (partial fill preserved)
      const state = strategy.getStrategyState();
      expect(state.inventoryQty).toBe('0.05');
      expect(state.vwap).toBe('99');

      // Step 0 should be marked filled (so sequential mode advances)
      expect(state.steps[0].filled).toBe(true);

      // TP should be refreshed to cover 0.05 inventory (terminal → immediate)
      const cancelTp = findTpSignals(cancelResult);
      expect(cancelTp.length).toBeGreaterThanOrEqual(1);

      // Next entry (step 1) should be placed
      // entry 1 = 100 - 1*(1+1) = 98
      const nextEntries = findEntrySignals(cancelResult);
      expect(nextEntries.length).toBeGreaterThanOrEqual(1);
      if (nextEntries.length > 0) {
        expect(nextEntries[0].price!.toNumber()).toBeCloseTo(98, 1);
      }
    });
  });

  describe('Partial-filled entry → TP filled → ladder MUST re-init', () => {
    it('should reset the cycle when the TP of a partially-filled entry fills after a restart (live orders must not be blacklisted by orderHistory)', async () => {
      // REGRESSION: getOrderHistory uses the exchange "all orders" endpoint
      // (Binance /allOrders), which ALSO returns orders that are still OPEN.
      // When history contains a FILLED TP from a previous cycle, the strategy
      // blacklisted every history order id — including the CURRENT cycle's
      // live entry + live TP recovered from openOrders. Every later WS push for
      // them was then silently dropped, so the TP FILLED never reached
      // handleTpFilled → the cycle was never reset and the ladder was never
      // re-initialized (strategy stuck forever).
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      // Previous, completed cycle (entry FILLED + TP FILLED).
      const oldEntry = createOrder(
        'E1D1D1700000000',
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
        new Date('2025-01-01T09:00:00Z'),
      );
      oldEntry.timestamp = new Date('2025-01-01T09:00:00Z');
      const oldTp = createOrder(
        'T1D2D1700000001',
        OrderSide.SELL,
        OrderStatus.FILLED,
        99.99,
        0.1,
        0.1,
        99.99,
        new Date('2025-01-01T09:30:00Z'),
      );
      oldTp.timestamp = new Date('2025-01-01T09:30:00Z');

      // Current cycle: entry 0 is PARTIALLY filled and still live, with a live
      // TP covering the filled portion.
      const liveEntry = createOrder(
        'E1D3D1700000002',
        OrderSide.BUY,
        OrderStatus.PARTIALLY_FILLED,
        99,
        0.1,
        0.05,
        99,
        new Date('2025-01-01T10:00:00Z'),
      );
      liveEntry.timestamp = new Date('2025-01-01T10:00:00Z');
      const liveTp = createOrder(
        'T1D4D1700000003',
        OrderSide.SELL,
        OrderStatus.NEW,
        99.99,
        0.05,
        0,
        undefined,
        new Date('2025-01-01T10:00:05Z'),
      );
      liveTp.timestamp = new Date('2025-01-01T10:00:05Z');

      await strategy.processInitialData(
        createInitialData({
          openOrders: [liveEntry, liveTp],
          // "all orders" also returns the two still-open orders
          orderHistory: [oldEntry, oldTp, liveEntry, liveTp],
          strategyNetPosition: new Decimal(0.05),
        }),
      );

      const recovered = strategy.getStrategyState();
      expect(recovered.inventoryQty).toBe('0.05');
      expect(recovered.tpClientOrderId).toBe('T1D4D1700000003');

      // The live TP now fills.
      const tpFilled = createOrder(
        'T1D4D1700000003',
        OrderSide.SELL,
        OrderStatus.FILLED,
        99.99,
        0.05,
        0.05,
        99.99,
        new Date('2025-01-01T10:05:00Z'),
      );
      const result = await strategy.analyze(createDataUpdate({ orders: [tpFilled] }));

      // Cycle must be reset: the partially-filled entry is cancelled ...
      const cancels = findCancelSignals(result);
      expect(cancels.some((c) => c.clientOrderId === 'E1D3D1700000002')).toBe(true);

      // ... and a fresh ladder is started (basePrice is fixed → immediate rebuild).
      const entries = findEntrySignals(result);
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries[0].price!.toNumber()).toBeCloseTo(99, 6);

      const after = strategy.getStrategyState();
      expect(parseFloat(after.inventoryQty)).toBe(0);
      expect(after.tpClientOrderId).toBeNull();
    });

    it('should keep partial-fill inventory when CANCELED is the first push seen for the entry', async () => {
      // REGRESSION: a CANCELED/EXPIRED push can be the FIRST push for a
      // partially filled entry (no preceding PARTIALLY_FILLED push). The order
      // is then removed from this.orders, so recalculateVWAP relies on
      // processedQuantityMap — which was never written → the filled portion
      // silently vanished from inventory on the next recalculation, leaving an
      // uncovered position (TP undersells).
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entry0 = findEntrySignals(initResult)[0];

      // First and only push for entry 0: CANCELED with a partial fill.
      const cancelResult = await strategy.analyze(
        createDataUpdate({
          orders: [
            createOrder(
              entry0.clientOrderId,
              OrderSide.BUY,
              OrderStatus.CANCELED,
              99,
              0.1,
              0.05,
              99,
              new Date('2025-01-01T10:00:02Z'),
            ),
          ],
        }),
      );
      expect(strategy.getStrategyState().inventoryQty).toBe('0.05');

      // Step 1 is placed; when it fills, the recalculation must still include
      // the 0.05 from the cancelled step 0.
      const entry1 = findEntrySignals(cancelResult)[0];
      expect(entry1.price!.toNumber()).toBeCloseTo(98, 6);

      await strategy.analyze(
        createDataUpdate({
          orders: [
            createOrder(
              entry1.clientOrderId,
              OrderSide.BUY,
              OrderStatus.FILLED,
              98,
              0.1,
              0.1,
              98,
              new Date('2025-01-01T10:00:10Z'),
            ),
          ],
        }),
      );

      const state = strategy.getStrategyState();
      expect(parseFloat(state.inventoryQty)).toBeCloseTo(0.15, 10);
      // VWAP = (0.05*99 + 0.1*98) / 0.15
      expect(parseFloat(state.vwap)).toBeCloseTo(98.3333333, 6);
    });

    it('should rebuild the ladder locally when the engine never performs the requested reinitialization', async () => {
      // REGRESSION: after a TP fill with basePrice=0 the strategy cancels every
      // order and waits for the engine to call processInitialData again. If that
      // never happens (the engine only checks on the account-update path and its
      // REST fetch can throw), no order is left to generate a push, so nothing
      // ever re-triggers the reinit → the strategy silently stops trading.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      const initResult = await strategy.processInitialData(
        createInitialData({ orderBook: createOrderBook(100) }),
      );
      const entry0 = findEntrySignals(initResult)[0];

      const fillResult = await strategy.analyze(
        createDataUpdate({
          orders: [
            createOrder(
              entry0.clientOrderId,
              OrderSide.BUY,
              OrderStatus.FILLED,
              99,
              0.1,
              0.1,
              99,
              new Date('2025-01-01T10:00:01Z'),
            ),
          ],
        }),
      );
      const tpSignal = findTpSignals(fillResult)[0] as StrategyOrderResult;

      await strategy.analyze(
        createDataUpdate({
          orders: [
            createOrder(
              tpSignal.clientOrderId!,
              OrderSide.SELL,
              OrderStatus.FILLED,
              99.99,
              0.1,
              0.1,
              99.99,
              new Date('2025-01-01T10:00:05Z'),
            ),
          ],
        }),
      );
      expect(strategy.requiresReinitialization()).toBe(true);

      // Engine never calls processInitialData. Simulate the stall window.
      (strategy as unknown as { _needsReinitTime: number })._needsReinitTime =
        Date.now() - 31_000;

      // Only an orderbook push arrives (bid0 moved to 110).
      const healed = await strategy.analyze({
        exchangeName: 'okx',
        symbol: 'BTC/USDT',
        orderbook: createOrderBook(110),
      });

      const entries = findEntrySignals(healed);
      expect(entries).toHaveLength(1);
      // Fresh bid0 = 110 → entry 0 = 110 - stepValue(1) = 109
      expect(entries[0].price!.toNumber()).toBeCloseTo(109, 6);
      expect(strategy.requiresReinitialization()).toBe(false);
    });
  });

  describe('maxEntryPrice (upward-wick protection)', () => {
    it('should anchor the ladder at maxEntryPrice when bid0 spikes above it', async () => {
      // bid0 = 200 (an upward wick), cap = 100. Without the cap entry 0 would be
      // at 199 and the whole position would be accumulated at the top.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0, // dynamic: anchor on bid0
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 1,
          qtyPerStep: 0.1,
          maxEntryPrice: 100,
        }),
      );

      const result = await strategy.processInitialData(
        createInitialData({ orderBook: createOrderBook(200) }),
      );

      const entries = findEntrySignals(result);
      expect(entries).toHaveLength(1);
      // Anchored at the cap, not at bid0 - entryGap (= 199)
      expect(entries[0].price!.toNumber()).toBeCloseTo(100, 6);

      // Whole ladder shifted down with the anchor; nothing above the cap.
      const steps = strategy.getStrategyState().steps;
      expect(steps.map((s) => parseFloat(s.price))).toEqual([100, 99, 98]);
      steps.forEach((s) => expect(parseFloat(s.price)).toBeLessThanOrEqual(100));
    });

    it('should leave the ladder untouched when bid0 is below maxEntryPrice', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 1,
          qtyPerStep: 0.1,
          maxEntryPrice: 1000, // far above the market
        }),
      );

      const result = await strategy.processInitialData(
        createInitialData({ orderBook: createOrderBook(100) }),
      );

      // bid0 = 100 → entry 0 = 100 - stepValue(1) = 99, cap not involved
      expect(findEntrySignals(result)[0].price!.toNumber()).toBeCloseTo(99, 6);
      expect(strategy.getStrategyState().steps.map((s) => parseFloat(s.price))).toEqual([
        99, 98, 97,
      ]);
    });

    it('should behave identically to before when maxEntryPrice is 0 or absent', async () => {
      const withZero = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0,
          ladderSteps: 3,
          stepValue: 1,
          qtyPerStep: 0.1,
          maxEntryPrice: 0,
        }),
      );
      // Old configs loaded from the DB have no maxEntryPrice key at all.
      const configWithoutKey = createStrategyConfig({
        basePrice: 0,
        ladderSteps: 3,
        stepValue: 1,
        qtyPerStep: 0.1,
      });
      delete (configWithoutKey.parameters as Partial<LadderEntrySingleTPParameters>)
        .maxEntryPrice;
      const withoutKey = new LadderEntrySingleTPStrategy(configWithoutKey);

      const a = await withZero.processInitialData(
        createInitialData({ orderBook: createOrderBook(200) }),
      );
      const b = await withoutKey.processInitialData(
        createInitialData({ orderBook: createOrderBook(200) }),
      );

      // No cap → anchored on bid0 as before: 200 - 1 = 199
      expect(findEntrySignals(a)[0].price!.toNumber()).toBeCloseTo(199, 6);
      expect(findEntrySignals(b)[0].price!.toNumber()).toBeCloseTo(199, 6);
    });

    it('should still respect the cap when the ladder is rebuilt after a TP fill', async () => {
      // The dangerous moment: TP fills, the engine re-fetches the orderbook, and
      // bid0 has spiked. The new cycle must not chase the spike.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
          maxEntryPrice: 100,
        }),
      );

      const init = await strategy.processInitialData(
        createInitialData({ orderBook: createOrderBook(100) }),
      );
      const entry0 = findEntrySignals(init)[0];
      expect(entry0.price!.toNumber()).toBeCloseTo(99, 6);

      const filled = await strategy.analyze(
        createDataUpdate({
          orders: [
            createOrder(
              entry0.clientOrderId,
              OrderSide.BUY,
              OrderStatus.FILLED,
              99,
              0.1,
              0.1,
              99,
              new Date('2025-01-01T10:00:01Z'),
            ),
          ],
        }),
      );
      const tp = findTpSignals(filled)[0] as StrategyOrderResult;

      await strategy.analyze(
        createDataUpdate({
          orders: [
            createOrder(
              tp.clientOrderId!,
              OrderSide.SELL,
              OrderStatus.FILLED,
              99.99,
              0.1,
              0.1,
              99.99,
              new Date('2025-01-01T10:00:05Z'),
            ),
          ],
        }),
      );
      expect(strategy.requiresReinitialization()).toBe(true);

      // Engine reinit with a spiked bid0 = 500
      const reinit = await strategy.processInitialData(
        createInitialData({ orderBook: createOrderBook(500) }),
      );

      const entries = findEntrySignals(reinit);
      expect(entries).toHaveLength(1);
      expect(entries[0].price!.toNumber()).toBeCloseTo(100, 6);
      strategy
        .getStrategyState()
        .steps.forEach((s) => expect(parseFloat(s.price)).toBeLessThanOrEqual(100));
    });

    it('should refuse to place an entry when an in-memory step price is above the cap', async () => {
      // Guards the restart path: a ladder recovered/reverse-engineered from old
      // orders can sit above a cap that was added afterwards. Buying must be
      // refused rather than filling at the old high price.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0,
          ladderSteps: 3,
          stepValue: 1,
          qtyPerStep: 0.1,
          maxEntryPrice: 100,
        }),
      );
      await strategy.processInitialData(
        createInitialData({ orderBook: createOrderBook(100) }),
      );

      // Force a stale, too-high ladder and clear the placed order.
      const internals = strategy as unknown as {
        steps: Array<{
          index: number;
          price: Decimal;
          quantity: Decimal;
          entryClientOrderId: string | null;
          filled: boolean;
        }>;
        pendingClientOrderIds: Set<string>;
        placeLadderEntries: () => StrategyResult[];
      };
      internals.steps.forEach((s, i) => {
        s.price = new Decimal(300 - i);
        s.entryClientOrderId = null;
        s.filled = false;
      });
      internals.pendingClientOrderIds.clear();

      const signals = internals.placeLadderEntries();
      expect(signals).toHaveLength(0);
    });
  });

  describe('Parameter definition / persisted value type consistency', () => {
    // The dynamic form renders `type: 'enum'` as a Select and persists the raw
    // option STRING, while `type: 'number'` persists e.target.valueAsNumber.
    // A numeric parameter declared as an enum therefore lands in the DB as a
    // string and silently relies on JS coercion (that is exactly what happened
    // to resetInterval). Keep enums string-valued and numbers numeric.
    it('should not declare any numeric parameter as an enum', () => {
      const numericEnums = LadderEntrySingleTPStrategyRegistryConfig.parameterDefinitions
        .filter((p) => p.type === 'enum')
        .filter((p) =>
          (p.validation?.options ?? []).every((o) => /^-?\d+(\.\d+)?$/.test(o)),
        )
        .map((p) => p.name);
      expect(numericEnums).toEqual([]);
    });

    it('should declare every enum option as a non-numeric string', () => {
      const enums = LadderEntrySingleTPStrategyRegistryConfig.parameterDefinitions.filter(
        (p) => p.type === 'enum',
      );
      // stepType / qtyType / entryGapType / tpType — all genuinely categorical
      expect(enums.map((p) => p.name).sort()).toEqual([
        'entryGapType',
        'qtyType',
        'stepType',
        'tpType',
      ]);
      enums.forEach((p) => {
        (p.validation?.options ?? []).forEach((o) => {
          expect(Number.isNaN(Number(o))).toBe(true);
        });
      });
    });

    it('should give resetInterval a numeric definition with a usable range', () => {
      const def = LadderEntrySingleTPStrategyRegistryConfig.parameterDefinitions.find(
        (p) => p.name === 'resetInterval',
      );
      expect(def?.type).toBe('number');
      expect(def?.validation?.options).toBeUndefined();
      expect(def?.defaultValue).toBe(0);
      expect(def?.min).toBe(0);
      expect(def?.max).toBe(1440);
    });

    it('should default every numeric parameter definition to a number, never a string', () => {
      LadderEntrySingleTPStrategyRegistryConfig.parameterDefinitions
        .filter((p) => p.type === 'number' && p.defaultValue !== undefined)
        .forEach((p) => {
          expect(typeof p.defaultValue).toBe('number');
        });
    });
  });

  describe('maxEntryPrice backward compatibility with persisted configs', () => {
    // Verbatim `parameters` JSON from the two shapes that exist in the
    // production DB today (2026-08-16: 6 LadderEntrySingleTPStrategy rows, none
    // of them has a maxEntryPrice key). Note resetInterval is persisted as a
    // STRING — the parameter form stores enum-typed fields that way — so these
    // objects also guard against over-strict parsing.
    const PROD_PARAMS_WITH_ENTRY_GAP = {
      tpType: 'absolute',
      qtyType: 'arithmetic',
      leverage: 10,
      stepType: 'geometric',
      basePrice: 0,
      stepValue: 0.25,
      tpPercent: 1,
      qtyPerStep: 30,
      qtyStepAdd: 5,
      ladderSteps: 5,
      maxPosition: 200,
      entryGapType: 'arithmetic',
      qtyStepRatio: 1,
      entryGapValue: 0.1,
      maxInvestment: 1600,
      resetInterval: '15',
      tpAbsoluteProfit: 5,
    } as unknown as LadderEntrySingleTPParameters;

    const PROD_PARAMS_LEGACY = {
      tpType: 'absolute',
      qtyType: 'arithmetic',
      leverage: 10,
      stepType: 'geometric',
      basePrice: 0,
      stepValue: 0.25,
      tpPercent: 1,
      qtyPerStep: 30,
      qtyStepAdd: 5,
      ladderSteps: 5,
      maxPosition: 200,
      qtyStepRatio: 1,
      maxInvestment: 1600,
      resetInterval: '15',
      tpAbsoluteProfit: 5,
    } as unknown as LadderEntrySingleTPParameters;

    const buildFromProdParams = (params: LadderEntrySingleTPParameters) =>
      new LadderEntrySingleTPStrategy({
        type: 'LadderEntrySingleTPStrategy',
        parameters: params,
        symbol: 'BTC/USDT',
        exchange: 'okx',
        strategyId: 1,
        strategyName: 'prod-replay',
        performance: createEmptyPerformance('BTC/USDT', 'okx', 1, 'prod-replay'),
      });

    it('should coerce the string resetInterval written by the old enum field to a number', () => {
      // resetInterval is now declared `type: 'number'`, but rows written while it
      // was an `enum` hold the option STRING (`"resetInterval": "15"`). Those
      // rows must keep working, and the state must not leak the string.
      const strategy = buildFromProdParams(PROD_PARAMS_WITH_ENTRY_GAP);
      const { resetInterval } = strategy.getStrategyState();
      expect(resetInterval).toBe(15);
      expect(typeof resetInterval).toBe('number');
    });

    it('should treat an unparseable resetInterval as disabled instead of failing to start', () => {
      const strategy = buildFromProdParams({
        ...PROD_PARAMS_WITH_ENTRY_GAP,
        resetInterval: 'not-a-number',
      } as unknown as LadderEntrySingleTPParameters);
      expect(strategy.getStrategyState().resetInterval).toBe(0);
    });

    it('should start and place unchanged entries for a persisted config with entryGap (no maxEntryPrice key)', async () => {
      const strategy = buildFromProdParams(PROD_PARAMS_WITH_ENTRY_GAP);
      expect(strategy.getStrategyState().maxEntryPrice).toBe('0');

      const result = await strategy.processInitialData(
        createInitialData({ orderBook: createOrderBook(100) }),
      );

      // bid0=100, arithmetic gap 0.1 → entryBase = 99.9; geometric steps 0.25%
      const entries = findEntrySignals(result);
      expect(entries).toHaveLength(1);
      expect(entries[0].price!.toNumber()).toBeCloseTo(99.9, 10);
      expect(entries[0].quantity!.toNumber()).toBe(30);

      const prices = strategy
        .getStrategyState()
        .steps.map((s) => parseFloat(parseFloat(s.price).toFixed(6)));
      // 99.9 * 0.9975^i
      expect(prices).toEqual([99.9, 99.65025, 99.401124, 99.152622, 98.90474]);
    });

    it('should start and place unchanged entries for the legacy config (no entryGap, no maxEntryPrice)', async () => {
      const strategy = buildFromProdParams(PROD_PARAMS_LEGACY);
      expect(strategy.getStrategyState().maxEntryPrice).toBe('0');

      const result = await strategy.processInitialData(
        createInitialData({ orderBook: createOrderBook(100) }),
      );

      // No entryGap keys → gap falls back to stepValue (geometric 0.25%)
      const entries = findEntrySignals(result);
      expect(entries).toHaveLength(1);
      expect(entries[0].price!.toNumber()).toBeCloseTo(99.75, 10);
    });

    it('should treat null and empty string as "no cap"', () => {
      for (const raw of [null, '']) {
        const strategy = buildFromProdParams({
          ...PROD_PARAMS_WITH_ENTRY_GAP,
          maxEntryPrice: raw,
        } as unknown as LadderEntrySingleTPParameters);
        expect(strategy.getStrategyState().maxEntryPrice).toBe('0');
      }
    });

    it('should accept a numeric string (the form persists enum fields as strings)', () => {
      const strategy = buildFromProdParams({
        ...PROD_PARAMS_WITH_ENTRY_GAP,
        maxEntryPrice: '100',
      } as unknown as LadderEntrySingleTPParameters);
      expect(strategy.getStrategyState().maxEntryPrice).toBe('100');
    });

    it('should refuse to start on an unparseable or negative maxEntryPrice', () => {
      for (const raw of ['abc', NaN, -1]) {
        expect(() =>
          buildFromProdParams({
            ...PROD_PARAMS_WITH_ENTRY_GAP,
            maxEntryPrice: raw,
          } as unknown as LadderEntrySingleTPParameters),
        ).toThrow(/maxEntryPrice/);
      }
    });
  });

  describe('Risk limits', () => {
    it('should not place more entries than maxPosition allows', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 10,
          qtyPerStep: 1,
          maxPosition: 3,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(result);
      // Sequential mode: only one entry placed at a time
      expect(entrySignals).toHaveLength(1);
    });

    it('should respect tight buying power', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 10,
          basePrice: 100,
          qtyPerStep: 1,
          maxInvestment: 25,
          leverage: 10,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(result);
      // Sequential mode: only one entry placed at a time, buying power allows it
      expect(entrySignals).toHaveLength(1);
    });
  });

  describe('TP placement safety (anti-storm)', () => {
    it('should NOT create duplicate TP signals when refreshTakeProfit is called multiple times before exchange confirms', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 2,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      // Fill entry 0 → should place one TP signal
      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );
      const result1 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const tp1 = findTpSignals(result1);
      expect(tp1).toHaveLength(1);
      const tpClientId = (tp1[0] as StrategyOrderResult).clientOrderId;
      expect(tpClientId).toBeDefined();

      // Simulate another fill event arriving before exchange confirms the TP
      // (e.g., next entry fill). This should NOT create a second TP signal.
      // Fill entry 1 via analyze
      const entry1Signals = findEntrySignals(result1);
      if (entry1Signals.length > 0) {
        const fill1 = createOrder(
          entry1Signals[0].clientOrderId,
          OrderSide.BUY,
          OrderStatus.FILLED,
          98,
          0.1,
          0.1,
          98,
        );
        const result2 = await strategy.analyze(createDataUpdate({ orders: [fill1] }));

        // Should have update TP signal (cancel old + place new), NOT a duplicate
        const tp2 = findTpSignals(result2);
        // Update signal = 1 signal (action=update), or cancel+sell = 2 signals
        // Either way, should NOT have 2+ new sell signals
        const newSellSignals = tp2.filter((s) => {
          const r = s as StrategyOrderResult;
          return r.action === 'sell';
        });
        expect(newSellSignals.length).toBeLessThanOrEqual(1);
      }

      // State should have exactly one tpClientOrderId
      const state = strategy.getStrategyState();
      expect(state.tpClientOrderId).toBeTruthy();
    });

    it('should skip TP placement when pending TP matches current target (pending dedup)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      // Fill entry → place TP
      const fill = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );
      const result1 = await strategy.analyze(createDataUpdate({ orders: [fill] }));
      const tp1 = findTpSignals(result1);
      expect(tp1).toHaveLength(1);

      // Now trigger another analyze with no new orders — TP should NOT be re-placed
      const result2 = await strategy.analyze(createDataUpdate({ orders: [] }));
      const tp2 = findTpSignals(result2);
      expect(tp2).toHaveLength(0);
    });
  });

  describe('TP filled → new cycle reference price', () => {
    it('should request reinitialization after TP fill when basePrice=0 (dynamic mode)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0, // dynamic — uses orderbook bid0
          ladderSteps: 2,
          stepType: 'arithmetic',
          stepValue: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 2,
        }),
      );

      // Simulate init with orderbook bid0 = 100 (default createOrderBook)
      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);
      // Entry 0 = 100 - 1*(0+1) = 99
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(99, 1);

      // Fill entry 0 → places TP at 99*1.02 = 100.98 (2% above VWAP=99)
      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );
      const fillResult = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const tpSignals = findTpSignals(fillResult);
      expect(tpSignals).toHaveLength(1);
      expect(tpSignals[0].price!.toNumber()).toBeCloseTo(100.98, 1);

      // TP fills at 100.98
      const tpFill = createOrder(
        (tpSignals[0] as StrategyOrderResult).clientOrderId,
        OrderSide.SELL,
        OrderStatus.FILLED,
        100.98,
        0.1,
        0.1,
        100.98,
      );
      const tpFillResult = await strategy.analyze(createDataUpdate({ orders: [tpFill] }));

      // After TP fill with basePrice=0, strategy should NOT immediately place
      // new entries — it requests reinitialization instead.
      expect(strategy.requiresReinitialization()).toBe(true);
      const newEntrySignals = findEntrySignals(tpFillResult);
      expect(newEntrySignals).toHaveLength(0);

      // Simulate engine re-fetching orderbook with new bid0 = 102 and calling
      // processInitialData again
      const reinitResult = await strategy.processInitialData(
        createInitialData({
          orderBook: {
            bids: [[new Decimal(102), new Decimal(1)]],
            asks: [[new Decimal(102.1), new Decimal(1)]],
            timestamp: new Date(),
            symbol: 'BTC/USDT',
            exchange: 'okx',
          },
        }),
      );
      // Strategy no longer needs reinit
      expect(strategy.requiresReinitialization()).toBe(false);

      // New cycle: entry should be at 101 (fresh bid0=102, entry 0 = 102 - 1*(0+1) = 101)
      const reinitEntries = findEntrySignals(reinitResult);
      expect(reinitEntries.length).toBeGreaterThanOrEqual(1);
      expect(reinitEntries[0].price!.toNumber()).toBeCloseTo(101, 1);

      // Verify state reflects new reference price
      const state = strategy.getStrategyState();
      expect(state.referencePrice).toBe('102');
    });

    it('should NOT recover stale inventory from orderHistory during reinit (TP storm prevention)', async () => {
      // CRITICAL regression test: After TP fills and reinit is triggered,
      // processInitialData must NOT recover FILLED entries from orderHistory.
      // orderHistory contains entries from the PREVIOUS cycle. Recovering them
      // rebuilds stale inventory/VWAP → TP placed at old price → immediate fill
      // → TP storm → financial loss.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0, // dynamic — uses orderbook bid0
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 2,
        }),
      );

      // Initial cycle: bid0=100, entry 0 at 99
      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(99, 1);

      // Fill entry 0 → TP at 99*1.02=100.98
      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );
      const fillResult = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const tpSignals = findTpSignals(fillResult);
      expect(tpSignals).toHaveLength(1);

      // TP fills
      const tpFill = createOrder(
        (tpSignals[0] as StrategyOrderResult).clientOrderId,
        OrderSide.SELL,
        OrderStatus.FILLED,
        100.98,
        0.1,
        0.1,
        100.98,
      );
      await strategy.analyze(createDataUpdate({ orders: [tpFill] }));
      expect(strategy.requiresReinitialization()).toBe(true);

      // Reinit with FRESH orderbook AND orderHistory containing PREVIOUS cycle's FILLED entries.
      // The strategy MUST NOT recover these stale entries.
      const reinitResult = await strategy.processInitialData(
        createInitialData({
          orderBook: {
            bids: [[new Decimal(102), new Decimal(1)]],
            asks: [[new Decimal(102.1), new Decimal(1)]],
            timestamp: new Date(),
            symbol: 'BTC/USDT',
            exchange: 'okx',
          },
          orderHistory: [
            // Previous cycle's FILLED entry — MUST NOT be recovered
            createOrder(
              entrySignals[0].clientOrderId,
              OrderSide.BUY,
              OrderStatus.FILLED,
              99,
              0.1,
              0.1,
              99,
            ),
            // Previous cycle's FILLED TP — MUST NOT be recovered
            createOrder(
              (tpSignals[0] as StrategyOrderResult).clientOrderId,
              OrderSide.SELL,
              OrderStatus.FILLED,
              100.98,
              0.1,
              0.1,
              100.98,
            ),
          ],
        }),
      );

      const state = strategy.getStrategyState();

      // CRITICAL: inventory must be 0 (fresh cycle), NOT 0.1 (stale from previous cycle)
      expect(parseFloat(state.inventoryQty)).toBe(0);

      // VWAP must be 0 (fresh cycle), NOT 99 (stale)
      expect(parseFloat(state.vwap)).toBe(0);

      // No TP should be placed (no inventory → no TP)
      const newTpSignals = findTpSignals(reinitResult);
      expect(newTpSignals).toHaveLength(0);

      // New entry 0 should be at fresh price: 102 - 1 = 101
      const newEntries = findEntrySignals(reinitResult);
      expect(newEntries.length).toBeGreaterThanOrEqual(1);
      expect(newEntries[0].price!.toNumber()).toBeCloseTo(101, 1);
    });

    it('should NOT process delayed WS push of old-cycle FILLED entry as new fill (TP storm prevention)', async () => {
      // CRITICAL: After TP fills and resetLadder clears all tracking maps,
      // a delayed WS push of an old-cycle FILLED entry order must NOT be
      // re-processed as a new fill. Without previousCycleOrderIds blacklist,
      // ensureRecoveredMetadata would create fresh metadata, handleEntryFilled
      // would call recalculateVWAP → stale inventory → TP at old price → storm.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100, // fixed — no reinit needed, tests resetLadder directly
          ladderSteps: 2,
          stepType: 'arithmetic',
          stepValue: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 2,
        }),
      );

      // Initial: entry 0 at 99
      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      // Fill entry 0 → TP at 99*1.02 = 100.98
      const entry0Id = entrySignals[0].clientOrderId;
      const fill0 = createOrder(
        entry0Id,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );
      const fillResult = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const tpSignals = findTpSignals(fillResult);
      expect(tpSignals).toHaveLength(1);
      const tpId = (tpSignals[0] as StrategyOrderResult).clientOrderId;

      // TP fills → resetLadder + rebuild (basePrice>0, so immediate rebuild)
      const tpFill = createOrder(
        tpId,
        OrderSide.SELL,
        OrderStatus.FILLED,
        100.98,
        0.1,
        0.1,
        100.98,
      );
      await strategy.analyze(createDataUpdate({ orders: [tpFill] }));

      // After TP fill: inventory=0, VWAP=0, new entry 0 placed (basePrice=100 → entry at 99)
      const stateAfterTp = strategy.getStrategyState();
      expect(parseFloat(stateAfterTp.inventoryQty)).toBe(0);
      expect(parseFloat(stateAfterTp.vwap)).toBe(0);

      // Now simulate a DELAYED WS push of the OLD cycle's FILLED entry 0
      // This must NOT be processed as a new fill!
      const delayedOldFill = createOrder(
        entry0Id,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );
      const delayedResult = await strategy.analyze(
        createDataUpdate({ orders: [delayedOldFill] }),
      );

      // Inventory/VWAP must remain 0 — old fill must be ignored
      const stateAfterDelayed = strategy.getStrategyState();
      expect(parseFloat(stateAfterDelayed.inventoryQty)).toBe(0);
      expect(parseFloat(stateAfterDelayed.vwap)).toBe(0);

      // No TP should be placed (no inventory)
      const delayedTpSignals = findTpSignals(delayedResult);
      expect(delayedTpSignals).toHaveLength(0);
    });

    it('should NOT recover stale inventory when orderHistory contains FILLED TP (restart after TP storm)', async () => {
      // CRITICAL: When strategy is restarted after a TP storm, orderHistory
      // contains FILLED TP orders AND FILLED entry orders from the completed
      // cycle(s). The strategy must detect the FILLED TP and skip ALL
      // orderHistory entry recovery — otherwise it rebuilds stale inventory/VWAP
      // → places TP at old price → immediate fill → new TP storm.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 1,
          qtyPerStep: 100,
          qtyStepAdd: 50,
          tpType: 'absolute',
          tpAbsoluteProfit: 10,
          maxPosition: 1000,
          maxInvestment: 10000,
        }),
      );

      // Simulate orderHistory containing orders from a COMPLETED cycle:
      // - 3 FILLED BUY entries (E1D1, E1D2, E1D3) — total qty = 100+150+200 = 450
      // - 1 FILLED SELL TP (T1D1) — qty = 450 (the full inventory was sold)
      const filledEntry1 = createOrder(
        'E1D1D1700000000',
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        100,
        100,
        99,
      );
      const filledEntry2 = createOrder(
        'E1D2D1700000001',
        OrderSide.BUY,
        OrderStatus.FILLED,
        98,
        150,
        150,
        98,
      );
      const filledEntry3 = createOrder(
        'E1D3D1700000002',
        OrderSide.BUY,
        OrderStatus.FILLED,
        97,
        200,
        200,
        97,
      );
      const filledTp = createOrder(
        'T1D1D1700000003',
        OrderSide.SELL,
        OrderStatus.FILLED,
        99.5,
        450,
        450,
        99.5,
      );

      const result = await strategy.processInitialData(
        createInitialData({
          // No openOrders — all orders are already FILLED (in history)
          openOrders: [],
          orderHistory: [filledEntry1, filledEntry2, filledEntry3, filledTp],
        }),
      );

      // CRITICAL: inventory must be 0 — previous cycle completed (TP FILLED)
      const state = strategy.getStrategyState();
      expect(parseFloat(state.inventoryQty)).toBe(0);
      expect(parseFloat(state.vwap)).toBe(0);

      // No TP should be placed (no inventory)
      const tpSignals = findTpSignals(result);
      expect(tpSignals).toHaveLength(0);

      // Should place fresh entry 0 for the new cycle
      const entrySignals = findEntrySignals(result);
      expect(entrySignals.length).toBeGreaterThanOrEqual(1);
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(99, 1); // 100 - 1
    });

    it('should NOT place TP when strategyNetPosition <= 0 (stale inventory safety)', async () => {
      // SAFETY: strategyNetPosition is DB-derived (BUY FILLED - SELL FILLED,
      // filtered by strategyId). If <= 0 while inventoryQty > 0, the inventory
      // was recovered from stale orderHistory after all position was sold.
      // Placing a TP would sell non-existent position → TP storm.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 1,
          qtyPerStep: 100,
          qtyStepAdd: 50,
          tpType: 'absolute',
          tpAbsoluteProfit: 10,
          maxPosition: 1000,
          maxInvestment: 10000,
        }),
      );

      // orderHistory with FILLED entries but NO FILLED TP (Step 4a recovers them)
      const filledEntry1 = createOrder(
        'E1D1D1700000000',
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        100,
        100,
        99,
      );
      const filledEntry2 = createOrder(
        'E1D2D1700000001',
        OrderSide.BUY,
        OrderStatus.FILLED,
        98,
        150,
        150,
        98,
      );

      const result = await strategy.processInitialData(
        createInitialData({
          openOrders: [],
          orderHistory: [filledEntry1, filledEntry2],
          // DB reports net position = -1000 (e.g., SELL FILLED > BUY FILLED from TP storm)
          strategyNetPosition: new Decimal(-1000),
        }),
      );

      // CRITICAL: inventory must be reset to 0
      const state = strategy.getStrategyState();
      expect(parseFloat(state.inventoryQty)).toBe(0);
      expect(parseFloat(state.vwap)).toBe(0);

      // No TP should be placed
      const tpSignals = findTpSignals(result);
      expect(tpSignals).toHaveLength(0);

      // Should still place fresh entry 0
      const entrySignals = findEntrySignals(result);
      expect(entrySignals.length).toBeGreaterThanOrEqual(1);
    });

    it('should keep fixed basePrice unchanged after TP fill', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100, // fixed
          ladderSteps: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 5,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(initResult);

      // Fill entry → TP at 99*1.05 = 103.95 (5% above VWAP=99)
      const fill = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );
      const fillResult = await strategy.analyze(createDataUpdate({ orders: [fill] }));
      const tpSignals = findTpSignals(fillResult);

      // TP fills at 103.95
      const tpFill = createOrder(
        (tpSignals[0] as StrategyOrderResult).clientOrderId,
        OrderSide.SELL,
        OrderStatus.FILLED,
        103.95,
        0.1,
        0.1,
        103.95,
      );
      const tpFillResult = await strategy.analyze(createDataUpdate({ orders: [tpFill] }));

      // New cycle: entry should be at 99 (fixed basePrice=100, entry 0 = 100 - 1*(0+1) = 99, NOT 103.95)
      const newEntrySignals = findEntrySignals(tpFillResult);
      expect(newEntrySignals.length).toBeGreaterThanOrEqual(1);
      expect(newEntrySignals[0].price!.toNumber()).toBeCloseTo(99, 1);

      const state = strategy.getStrategyState();
      expect(state.referencePrice).toBe('100');
    });
  });

  describe('Strategy state', () => {
    it('should expose correct state after init', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({ ladderSteps: 3 }),
      );

      await strategy.processInitialData(createInitialData());
      const state = strategy.getStrategyState();

      expect(state.steps).toHaveLength(3);
      expect(state.inventoryQty).toBe('0');
      expect(state.vwap).toBe('0');
      expect(state.tpClientOrderId).toBeNull();
      expect(state.tpPrice).toBeNull();
    });

    it('should expose VWAP and TP price after entry fill', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 2,
          tpType: 'percent',
          tpPercent: 2,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entries = findEntrySignals(initResult);

      const fill = createOrder(
        entries[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );
      await strategy.analyze(createDataUpdate({ orders: [fill] }));

      const state = strategy.getStrategyState();
      expect(state.inventoryQty).toBe('0.1');
      expect(state.vwap).toBe('99');
      // TP = 99 * 1.02 = 100.98 (above ask0=100.01, so no floor)
      expect(state.tpPrice).toBe('100.98');
    });
  });

  describe('Single TP invariant', () => {
    it('should never have more than one new TP order at a time', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 5,
          stepValue: 2,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entries = findEntrySignals(initResult);

      for (let i = 0; i < entries.length; i++) {
        const price = entries[i].price!.toNumber();
        const fill = createOrder(
          entries[i].clientOrderId,
          OrderSide.BUY,
          OrderStatus.FILLED,
          price,
          0.1,
          0.1,
          price,
        );
        const result = await strategy.analyze(createDataUpdate({ orders: [fill] }));
        const tpSignals = findTpSignals(result);
        const newTps = tpSignals.filter(
          (s): s is StrategyOrderResult => s.action === 'buy' || s.action === 'sell',
        );
        // At most 1 new TP + possibly some cancels of stale pending
        expect(newTps.length).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('Arithmetic absolute price difference (real-world scenarios)', () => {
    it('BTC: bid0=65000, stepValue=300 → first entry = 64700 (sequential)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 65000,
          ladderSteps: 5,
          stepType: 'arithmetic',
          stepValue: 300,
          qtyPerStep: 0.001,
          maxInvestment: 100000,
          maxPosition: 1,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entries = findEntrySignals(result);

      // Sequential mode: only first entry placed on init
      // entry 0 = 65000 - 300 * (0+1) = 64700
      expect(entries).toHaveLength(1);
      expect(entries[0].price!.toNumber()).toBe(64700);
    });

    it('SOL: bid0=76, geometric stepValue=1 → first entry = 75.24 (sequential)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 76,
          ladderSteps: 3,
          stepType: 'geometric',
          stepValue: 1,
          qtyPerStep: 0.1,
          maxInvestment: 5000,
          maxPosition: 10,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entries = findEntrySignals(result);

      // Sequential mode: only first entry placed on init
      // 76 * (1 - 0.01)^(0+1) = 76 * 0.99 = 75.24
      expect(entries).toHaveLength(1);
      expect(entries[0].price!.toNumber()).toBeCloseTo(75.24, 2);
    });
  });

  describe('Geometric + arithmetic combination', () => {
    it('should handle geometric price + arithmetic qty (sequential mode)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          ladderSteps: 3,
          stepType: 'geometric',
          stepValue: 5,
          qtyType: 'arithmetic',
          qtyPerStep: 0.1,
          qtyStepAdd: 0.05,
          tpType: 'percent',
          tpPercent: 6,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entries = findEntrySignals(result);

      // Sequential mode: only first entry placed on init
      // entry 0 = 100 * (1 - 0.05)^1 = 95
      expect(entries).toHaveLength(1);
      expect(entries[0].price!.toNumber()).toBeCloseTo(95, 1);
      expect(entries[0].quantity!.toNumber()).toBeCloseTo(0.1, 5);

      const fill = createOrder(
        entries[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        95,
        0.1,
        0.1,
        95,
      );
      const fillResult = await strategy.analyze(createDataUpdate({ orders: [fill] }));
      const tpSignals = findTpSignals(fillResult);

      expect(tpSignals).toHaveLength(1);
      const tp = tpSignals[0] as StrategyOrderResult;
      // VWAP=95, TP = 95 * 1.06 = 100.7 (above ask0=100.01, so no floor)
      expect(tp.price!.toNumber()).toBeCloseTo(100.7, 1);
      expect(tp.quantity!.toNumber()).toBeCloseTo(0.1, 5);
    });
  });

  describe('Sequential entry progression', () => {
    it('should place next entry only after previous entry fills', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 1,
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      // Init → only entry 0 placed
      // entry 0 = 100 - 1*(0+1) = 99
      const initResult = await strategy.processInitialData(createInitialData());
      const initEntries = findEntrySignals(initResult);
      expect(initEntries).toHaveLength(1);
      expect(initEntries[0].price!.toNumber()).toBeCloseTo(99, 1);

      // Fill entry 0 → should place entry 1 + TP
      const fill0 = createOrder(
        initEntries[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );
      const result1 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const entries1 = findEntrySignals(result1);
      const tp1 = findTpSignals(result1);
      // Entry 1 placed (price=98) + TP placed
      // entry 1 = 100 - 1*(1+1) = 98, VWAP=99, TP=99*1.01=99.99
      expect(entries1).toHaveLength(1);
      expect(entries1[0].price!.toNumber()).toBeCloseTo(98, 1);
      expect(tp1).toHaveLength(1);

      // Fill entry 1 → should place entry 2 + update TP
      const fill1 = createOrder(
        entries1[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        98,
        0.1,
        0.1,
        98,
      );
      const result2 = await strategy.analyze(createDataUpdate({ orders: [fill1] }));
      const entries2 = findEntrySignals(result2);
      const tp2 = findTpSignals(result2);
      // Entry 2 placed (price=97) + TP updated
      // entry 2 = 100 - 1*(2+1) = 97
      expect(entries2).toHaveLength(1);
      expect(entries2[0].price!.toNumber()).toBeCloseTo(97, 1);
      expect(tp2).toHaveLength(1);

      // Fill entry 2 (last step) → no more entries, TP updated only
      const fill2 = createOrder(
        entries2[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        97,
        0.1,
        0.1,
        97,
      );
      const result3 = await strategy.analyze(createDataUpdate({ orders: [fill2] }));
      const entries3 = findEntrySignals(result3);
      const tp3 = findTpSignals(result3);
      expect(entries3).toHaveLength(0);
      expect(tp3).toHaveLength(1);
    });
  });

  describe('No orderbook subscription', () => {
    it('should not require klineInterval or orderbook subscription', () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({ basePrice: 100 }),
      );
      const state = strategy.getStrategyState();
      expect(state.referencePrice).toBe('100');
    });

    it('should work with basePrice=0 + REST orderbook (no subscription)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({ basePrice: 0, ladderSteps: 2 }),
      );

      const result = await strategy.processInitialData(
        createInitialData({ orderBook: createOrderBook(50) }),
      );
      const entries = findEntrySignals(result);
      // Sequential mode: only one entry placed on init
      // entry 0 = 50 - 1*(0+1) = 49
      expect(entries).toHaveLength(1);
      expect(entries[0].price!.toNumber()).toBeCloseTo(49, 1);
    });

    it('analyze should only process order updates, ignore orderbook in DataUpdate', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({ basePrice: 100, ladderSteps: 1 }),
      );

      await strategy.processInitialData(createInitialData());

      // DataUpdate with no orders → should be 'hold'
      const result = await strategy.analyze(createDataUpdate({ orders: undefined }));
      expect(toSignalArray(result)).toHaveLength(1);
      expect(toSignalArray(result)[0].action).toBe('hold');
    });
  });

  describe('Ghost order cleanup on reinit (Strategy 468 bug)', () => {
    it('should cancel stale ghost BUY orders from previous cycle during reinit and place fresh step 0', async () => {
      // Simulate: TP filled → reinit → ghost entry (step 2, qty 4000) still NEW on exchange
      // Strategy 468: qtyPerStep=3000, qtyStepAdd=500, basePrice=0, stepType=geometric, stepValue=0.62
      // After TP fill, resetLadder clears internal state but exchange still has E468D5 (BUY 4000)
      // Reinit should: cancel ghost + place fresh step 0 (qty 3000)
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0,
          ladderSteps: 5,
          qtyType: 'arithmetic',
          qtyPerStep: 3000,
          qtyStepAdd: 500,
          stepType: 'geometric',
          stepValue: 0.62,
          tpType: 'absolute',
          tpAbsoluteProfit: 10,
          maxPosition: 30000,
          maxInvestment: 1200,
          resetInterval: 60,
        }),
      );

      // Simulate: strategy had step 0 + step 1 filled, step 2 placed, then TP filled
      // First, initialize to set up internal state
      const initResult = await strategy.processInitialData(
        createInitialData({ orderBook: createOrderBook(0.3409) }),
      );
      // Place step 0 entry
      const initEntries = findEntrySignals(initResult);
      expect(initEntries.length).toBe(1);

      // Simulate step 0 filled + step 1 filled + step 2 placed + TP filled
      // by directly setting _needsReinit and calling processInitialData with ghost order
      const ghostEntryId = 'E1D5000003'; // step 2's entry order
      const ghostEntry = createOrder(
        ghostEntryId,
        OrderSide.BUY,
        OrderStatus.NEW,
        0.3347,
        4000, // step 2 qty = 3000 + 500*2 = 4000
        0,
      );

      // Trigger reinit: set _needsReinit via internal state
      // (Normally set by handleTpFilled when basePrice=0)
      (strategy as unknown as { _needsReinit: boolean })._needsReinit = true;

      const reinitResult = await strategy.processInitialData(
        createInitialData({
          orderBook: createOrderBook(0.3409),
          openOrders: [ghostEntry], // ghost order from previous cycle
        }),
      );
      const signals = toSignalArray(reinitResult);

      // Should have: 1 cancel (ghost) + 1 entry (step 0, qty 3000)
      const cancelSignals = signals.filter((s) => s.action === 'cancel');
      const entrySignals = findEntrySignals(reinitResult);

      expect(cancelSignals.length).toBe(1);
      expect(cancelSignals[0].clientOrderId).toBe(ghostEntryId);
      expect(entrySignals.length).toBe(1);
      expect(entrySignals[0].quantity!.toNumber()).toBe(3000); // step 0 qty, not 4000
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // resetInterval proximity guard tests (entry0 closer-to-bid check)
  // ──────────────────────────────────────────────────────────────────────────

  describe('resetInterval proximity guard (entry0 closer-to-bid)', () => {
    it('should NOT reset entry0 when the new price would be further from bid0', async () => {
      // entryGapValue=2 (arithmetic), maxEntryPrice=88.
      // Init bid0=100 -> uncapped entry0 = 98, capped to 88. |88-100|=12.
      // bid0 rises to 102 via WS. New entry0 = 102-2=100, capped to 88. |88-102|=14 > 12.
      // Guard should SKIP reset (new distance 14 >= origin distance 12).
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 5,
          entryGapType: 'arithmetic',
          entryGapValue: 2,
          qtyPerStep: 0.1,
          maxEntryPrice: 88,
          resetInterval: 1,
        }),
      );

      // Init with bid0=100 -> uncapped = 98, capped to 88
      const initResult = await strategy.processInitialData(
        createInitialData({ orderBook: createOrderBook(100) }),
      );
      const initEntries = findEntrySignals(initResult);
      expect(initEntries).toHaveLength(1);
      expect(initEntries[0].price!.toNumber()).toBeCloseTo(88, 1);

      // Simulate order ack
      const entry0Coid = initEntries[0].clientOrderId!;
      await strategy.analyze(
        createDataUpdate({
          orders: [createOrder(entry0Coid, OrderSide.BUY, OrderStatus.NEW, 88, 0.1)],
        }),
      );

      // Push orderbook update: bid0 rises to 102
      // New entry0 = 102-2=100, capped to 88. |88-102|=14 > |88-100|=12 -> guard SKIPS.
      await strategy.analyze({
        exchangeName: 'okx',
        symbol: 'BTC/USDT',
        orderbook: createOrderBook(102),
      });

      // Advance time past resetInterval (1 minute)
      const oldNow = Date.now;
      Date.now = () => oldNow() + 2 * 60 * 1000;

      const result = await strategy.analyze({
        exchangeName: 'okx',
        symbol: 'BTC/USDT',
        orderbook: createOrderBook(102),
      });
      Date.now = oldNow;

      const signals = toSignalArray(result);
      const cancels = signals.filter((s) => s.action === 'cancel');
      expect(cancels).toHaveLength(0);
    });

    it('should reset entry0 when the new price would be closer to bid0', async () => {
      // entryGapValue=2 (arithmetic), maxEntryPrice=88.
      // Init bid0=100 -> uncapped entry0 = 98, capped to 88. |88-100|=12.
      // bid0 drops to 85 via WS. New entry0 = 85-2=83 (uncapped, 83 < 88). |83-85|=2.
      // 2 < 12 -> guard ALLOWS reset.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 5,
          entryGapType: 'arithmetic',
          entryGapValue: 2,
          qtyPerStep: 0.1,
          maxEntryPrice: 88,
          resetInterval: 1,
        }),
      );

      const initResult = await strategy.processInitialData(
        createInitialData({ orderBook: createOrderBook(100) }),
      );
      const initEntries = findEntrySignals(initResult);
      expect(initEntries).toHaveLength(1);
      expect(initEntries[0].price!.toNumber()).toBeCloseTo(88, 1); // capped (98 > 88)

      // Simulate order ack
      const entry0Coid = initEntries[0].clientOrderId!;
      await strategy.analyze(
        createDataUpdate({
          orders: [createOrder(entry0Coid, OrderSide.BUY, OrderStatus.NEW, 88, 0.1)],
        }),
      );

      // Push orderbook: bid0 drops to 85
      // New entry0 = 85-2=83 (uncapped, 83 < 88). |83-85|=2 < |88-100|=12 -> guard ALLOWS.
      await strategy.analyze({
        exchangeName: 'okx',
        symbol: 'BTC/USDT',
        orderbook: createOrderBook(85),
      });

      // Advance time past resetInterval
      const oldNow = Date.now;
      Date.now = () => oldNow() + 2 * 60 * 1000;

      const result = await strategy.analyze({
        exchangeName: 'okx',
        symbol: 'BTC/USDT',
        orderbook: createOrderBook(85),
      });
      Date.now = oldNow;

      const signals = toSignalArray(result);
      const cancels = signals.filter((s) => s.action === 'cancel');
      expect(cancels).toHaveLength(1); // entry0 cancelled for reset
    });

    it('should skip proximity guard when bid0 is unknown (allow reset)', async () => {
      // When _currentBid0 is 0 (no orderbook received), the guard condition
      // `this._currentBid0.gt(0)` is false → guard skipped → reset proceeds.
      // We simulate this by manually clearing _currentBid0 after init.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 5,
          entryGapType: 'arithmetic',
          entryGapValue: 10,
          qtyPerStep: 0.1,
          resetInterval: 1,
        }),
      );

      // Init with bid0=100 -> entry0 = 90
      const initResult = await strategy.processInitialData(
        createInitialData({ orderBook: createOrderBook(100) }),
      );
      const initEntries = findEntrySignals(initResult);

      // Simulate order ack
      const entry0Coid = initEntries[0].clientOrderId!;
      await strategy.analyze(
        createDataUpdate({
          orders: [createOrder(entry0Coid, OrderSide.BUY, OrderStatus.NEW, 90, 0.1)],
        }),
      );

      // Manually clear _currentBid0 to simulate "bid0 unknown" state.
      // This triggers the guard's fallback: skip guard → allow reset.
      (strategy as unknown as { _currentBid0: Decimal })._currentBid0 = new Decimal(0);

      // Advance time past resetInterval.
      const oldNow = Date.now;
      Date.now = () => oldNow() + 2 * 60 * 1000;

      const result = await strategy.analyze(createDataUpdate({}));
      Date.now = oldNow;

      const signals = toSignalArray(result);
      const cancels = signals.filter((s) => s.action === 'cancel');
      // Guard skipped because _currentBid0 == 0 → reset proceeds normally.
      expect(cancels).toHaveLength(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Entry Gap feature tests (entryGapType / entryGapValue)
  // ──────────────────────────────────────────────────────────────────────────

  describe('Entry Gap feature (entryGapType / entryGapValue)', () => {
    it('should place entry 0 at referencePrice when entryGapValue=0 (no gap)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 5,
          entryGapType: 'arithmetic',
          entryGapValue: 0,
          qtyPerStep: 0.1,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(result);

      // entryGapValue=0 → entryBase = referencePrice = 100 → entry 0 = entryBase - stepValue*0 = 100
      expect(entrySignals).toHaveLength(1);
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(100, 1);
    });

    it('should place entry 0 at referencePrice when geometric entryGapValue=0', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepType: 'geometric',
          stepValue: 2,
          entryGapType: 'geometric',
          entryGapValue: 0,
          qtyPerStep: 0.1,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(result);

      // entryGapValue=0 → entryBase = referencePrice = 100 → entry 0 = 100 * (1-0.02)^0 = 100
      expect(entrySignals).toHaveLength(1);
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(100, 1);
    });

    it('should use arithmetic entryGap different from stepValue', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 5,
          stepType: 'arithmetic',
          stepValue: 5, // inter-level gap = 5 USDT
          entryGapType: 'arithmetic',
          entryGapValue: 20, // gap from ref to entry 0 = 20 USDT (different from stepValue)
          qtyPerStep: 0.1,
          maxInvestment: 10000,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(result);

      // entryBase = 100 - 20 = 80 → entry 0 = 80 - 5*0 = 80
      expect(entrySignals).toHaveLength(1);
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(80, 1);

      // Fill entry 0 → should place entry 1 at entryBase - stepValue*1 = 80 - 5 = 75
      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        80,
        0.1,
        0.1,
        80,
      );
      const result1 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const entries1 = findEntrySignals(result1);
      expect(entries1).toHaveLength(1);
      expect(entries1[0].price!.toNumber()).toBeCloseTo(75, 1);
    });

    it('should use geometric entryGap different from stepValue', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepType: 'geometric',
          stepValue: 2, // inter-level gap = 2% per step
          entryGapType: 'geometric',
          entryGapValue: 5, // gap from ref to entry 0 = 5% (different from stepValue)
          qtyPerStep: 0.1,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(result);

      // entryBase = 100 * (1 - 0.05) = 95 → entry 0 = 95 * (1-0.02)^0 = 95
      expect(entrySignals).toHaveLength(1);
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(95, 1);

      // Fill entry 0 → entry 1 = 95 * (1-0.02)^1 = 95 * 0.98 = 93.1
      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        95,
        0.1,
        0.1,
        95,
      );
      const result1 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const entries1 = findEntrySignals(result1);
      expect(entries1).toHaveLength(1);
      expect(entries1[0].price!.toNumber()).toBeCloseTo(93.1, 1);
    });

    it('should support mixed gap types: arithmetic gap + geometric steps', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepType: 'geometric',
          stepValue: 2, // geometric inter-level gap: 2% per step
          entryGapType: 'arithmetic',
          entryGapValue: 10, // arithmetic gap: 10 USDT absolute drop
          qtyPerStep: 0.1,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(result);

      // entryBase = 100 - 10 = 90 (arithmetic gap) → entry 0 = 90 * (1-0.02)^0 = 90
      expect(entrySignals).toHaveLength(1);
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(90, 1);

      // Fill entry 0 → entry 1 = 90 * (1-0.02)^1 = 88.2
      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        90,
        0.1,
        0.1,
        90,
      );
      const result1 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const entries1 = findEntrySignals(result1);
      expect(entries1).toHaveLength(1);
      expect(entries1[0].price!.toNumber()).toBeCloseTo(88.2, 1);
    });

    it('should support mixed gap types: geometric gap + arithmetic steps', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 5, // arithmetic inter-level gap: 5 USDT per step
          entryGapType: 'geometric',
          entryGapValue: 3, // geometric gap: 3% drop
          qtyPerStep: 0.1,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(result);

      // entryBase = 100 * (1 - 0.03) = 97 → entry 0 = 97 - 5*0 = 97
      expect(entrySignals).toHaveLength(1);
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(97, 1);

      // Fill entry 0 → entry 1 = 97 - 5*1 = 92
      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        97,
        0.1,
        0.1,
        97,
      );
      const result1 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const entries1 = findEntrySignals(result1);
      expect(entries1).toHaveLength(1);
      expect(entries1[0].price!.toNumber()).toBeCloseTo(92, 1);
    });

    it('should be backward compatible when entryGapValue is not specified (defaults to stepValue)', async () => {
      // Old config: no entryGapType/entryGapValue → defaults to stepType/stepValue
      // This should produce the SAME prices as the old formula: price[i] = ref - stepValue * (i+1)
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 5,
          qtyPerStep: 0.1,
          // entryGapType and entryGapValue NOT specified
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(result);

      // Old formula: entry 0 = 100 - 5*(0+1) = 95
      // New formula with defaults: entryBase = 100 - 5 = 95, entry 0 = 95 - 5*0 = 95 ✓
      expect(entrySignals).toHaveLength(1);
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(95, 1);

      // Fill entry 0 → entry 1 = 95 - 5*1 = 90 (old: 100 - 5*(1+1) = 90 ✓)
      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        95,
        0.1,
        0.1,
        95,
      );
      const result1 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const entries1 = findEntrySignals(result1);
      expect(entries1).toHaveLength(1);
      expect(entries1[0].price!.toNumber()).toBeCloseTo(90, 1);
    });

    it('should be backward compatible for geometric when entryGapValue is not specified', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepType: 'geometric',
          stepValue: 2,
          qtyPerStep: 0.1,
          // entryGapType and entryGapValue NOT specified
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(result);

      // Old formula: entry 0 = 100 * (1-0.02)^(0+1) = 98
      // New with defaults: entryBase = 100 * (1-0.02) = 98, entry 0 = 98 * (1-0.02)^0 = 98 ✓
      expect(entrySignals).toHaveLength(1);
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(98, 1);
    });

    it('should reverse-engineer referencePrice correctly with entryGap on restart (arithmetic)', async () => {
      // Strategy with arithmetic gap=20, stepValue=5
      // referencePrice=100 → entryBase=80 → entry 0=80, entry 1=75
      // After restart with only entry 0 active (no TP), reverse-engineer ref from entry 0 price
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0,
          ladderSteps: 5,
          stepType: 'arithmetic',
          stepValue: 5,
          entryGapType: 'arithmetic',
          entryGapValue: 20,
          qtyType: 'arithmetic',
          qtyPerStep: 0.1,
          tpType: 'absolute',
          tpAbsoluteProfit: 1,
        }),
      );

      // Entry 0 was placed at price 80 (from old referencePrice=100)
      const entry0Id = 'E1D1D1700000000';
      const entry0Price = new Decimal('80');

      // Restart: new bid0 is 105 (different from original 100)
      const newBid0 = new Decimal('105');

      const openOrders: Order[] = [
        createOrder(
          entry0Id,
          OrderSide.BUY,
          OrderStatus.NEW,
          parseFloat(entry0Price.toString()),
          0.1,
          0,
          undefined,
        ),
      ];

      const result = await strategy.processInitialData(
        createInitialData({
          openOrders,
          orderBook: {
            symbol: 'TEST/USDC:USDC',
            bids: [[newBid0, new Decimal(100)]],
            asks: [[newBid0.plus(0.01), new Decimal(100)]],
            timestamp: new Date(),
          },
        }),
      );

      // NO duplicate entry
      const entrySignals = findEntrySignals(result);
      expect(entrySignals).toHaveLength(0);

      const state = strategy.getStrategyState();

      // ref = entryBase + entryGapValue = 80 + 20 = 100 (original, not new bid0=105)
      expect(parseFloat(state.referencePrice)).toBeCloseTo(100, 1);
      // Step 0 price should match existing entry (80)
      expect(parseFloat(state.steps[0].price)).toBeCloseTo(80, 1);
      expect(state.steps[0].entryClientOrderId).toBe(entry0Id);
    });

    it('should reverse-engineer referencePrice correctly with geometric entryGap on restart', async () => {
      // Strategy with geometric gap=5%, stepValue=2% (geometric)
      // referencePrice=100 → entryBase=95 → entry 0=95
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0,
          ladderSteps: 5,
          stepType: 'geometric',
          stepValue: 2,
          entryGapType: 'geometric',
          entryGapValue: 5,
          qtyType: 'arithmetic',
          qtyPerStep: 0.1,
          tpType: 'absolute',
          tpAbsoluteProfit: 1,
        }),
      );

      // Entry 0 was placed at price 95 (from old referencePrice=100)
      const entry0Id = 'E1D1D1700000000';
      const entry0Price = new Decimal('95');

      // Restart: new bid0 is 110 (different from original 100)
      const newBid0 = new Decimal('110');

      const openOrders: Order[] = [
        createOrder(
          entry0Id,
          OrderSide.BUY,
          OrderStatus.NEW,
          parseFloat(entry0Price.toString()),
          0.1,
          0,
          undefined,
        ),
      ];

      const result = await strategy.processInitialData(
        createInitialData({
          openOrders,
          orderBook: {
            symbol: 'TEST/USDC:USDC',
            bids: [[newBid0, new Decimal(100)]],
            asks: [[newBid0.plus(0.01), new Decimal(100)]],
            timestamp: new Date(),
          },
        }),
      );

      const entrySignals = findEntrySignals(result);
      expect(entrySignals).toHaveLength(0);

      const state = strategy.getStrategyState();

      // ref = entryBase / (1 - entryGapValue/100) = 95 / 0.95 = 100
      expect(parseFloat(state.referencePrice)).toBeCloseTo(100, 1);
      expect(parseFloat(state.steps[0].price)).toBeCloseTo(95, 1);
    });

    it('should reverse-engineer referencePrice from TP with entryGap (arithmetic gap)', async () => {
      // Strategy: arithmetic gap=10, stepValue=5, qty=0.1 each
      // referencePrice=100 → entryBase=90 → entry 0=90, entry 1=85
      // After entry 0 fills: VWAP=90, TP(percent=2%) = 90*1.02 = 91.8
      // Restart: TP qty=0.1 → 1 filled step
      // reverseEngineer: VWAP from TP = 91.8/1.02 = 90
      // entryBase = VWAP + stepValue * (0*qty[0])/totalQty = 90 + 0 = 90 (i=0, so weightedSum=0)
      // referencePrice = entryBase + entryGapValue = 90 + 10 = 100
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0,
          ladderSteps: 5,
          stepType: 'arithmetic',
          stepValue: 5,
          entryGapType: 'arithmetic',
          entryGapValue: 10,
          qtyType: 'arithmetic',
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 2,
          maxInvestment: 10000,
          maxPosition: 100,
        }),
      );

      const entry1Id = 'E1DA000002';
      const tpId = 'T1DA000001';

      // Open orders: entry 1 (NEW at price 85) + TP (NEW at 91.8, qty=0.1)
      const openOrders: Order[] = [
        createOrder(entry1Id, OrderSide.BUY, OrderStatus.NEW, 85, 0.1, 0, undefined),
        createOrder(tpId, OrderSide.SELL, OrderStatus.NEW, 91.8, 0.1, 0, undefined),
      ];

      const result = await strategy.processInitialData(
        createInitialData({
          openOrders,
          orderBook: {
            symbol: 'BTC/USDT',
            timestamp: new Date(),
            exchange: 'okx',
            bids: [[new Decimal(0.95), new Decimal(1)]], // different bid0
            asks: [[new Decimal(0.96), new Decimal(1)]],
          },
        }),
      );

      const state = strategy.getStrategyState();

      // referencePrice should be reverse-engineered to 100, not 0.95
      expect(parseFloat(state.referencePrice)).toBeCloseTo(100, 1);
      // Step 0 = 90, Step 1 = 85
      expect(parseFloat(state.steps[0].price)).toBeCloseTo(90, 1);
      expect(parseFloat(state.steps[1].price)).toBeCloseTo(85, 1);

      // No duplicate entries
      const entrySignals = findEntrySignals(result);
      expect(entrySignals).toHaveLength(0);
    });

    it('should reverse-engineer referencePrice from TP with geometric entryGap', async () => {
      // Strategy: geometric gap=5%, geometric stepValue=2%, qty=0.1 each
      // referencePrice=100 → entryBase=95 → entry 0=95
      // After entry 0 fills: VWAP=95, TP(percent=2%) = 95*1.02 = 96.9
      // Restart: TP qty=0.1 → 1 filled step
      // reverseEngineer: VWAP from TP = 96.9/1.02 = 95
      // entryBase = VWAP * totalQty / Σ(r^i * qty[i]) = 95 * 0.1 / (r^0 * 0.1) = 95 / 1 = 95 (i=0, r^0=1)
      // referencePrice = entryBase / (1 - entryGapValue/100) = 95 / 0.95 = 100
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0,
          ladderSteps: 5,
          stepType: 'geometric',
          stepValue: 2,
          entryGapType: 'geometric',
          entryGapValue: 5,
          qtyType: 'arithmetic',
          qtyPerStep: 0.1,
          tpType: 'percent',
          tpPercent: 2,
          maxInvestment: 10000,
          maxPosition: 100,
        }),
      );

      const entry1Id = 'E1DA000002';
      const tpId = 'T1DA000001';

      // Open orders: entry 1 (NEW at price 93.1) + TP (NEW at 96.9, qty=0.1)
      // entry 1 = 95 * (1-0.02)^1 = 93.1
      const openOrders: Order[] = [
        createOrder(entry1Id, OrderSide.BUY, OrderStatus.NEW, 93.1, 0.1, 0, undefined),
        createOrder(tpId, OrderSide.SELL, OrderStatus.NEW, 96.9, 0.1, 0, undefined),
      ];

      const result = await strategy.processInitialData(
        createInitialData({
          openOrders,
          orderBook: {
            symbol: 'BTC/USDT',
            timestamp: new Date(),
            exchange: 'okx',
            bids: [[new Decimal(0.95), new Decimal(1)]],
            asks: [[new Decimal(0.96), new Decimal(1)]],
          },
        }),
      );

      const state = strategy.getStrategyState();

      // referencePrice = 95 / 0.95 = 100
      expect(parseFloat(state.referencePrice)).toBeCloseTo(100, 1);
      // Step 0 = 95, Step 1 = 93.1
      expect(parseFloat(state.steps[0].price)).toBeCloseTo(95, 1);
      expect(parseFloat(state.steps[1].price)).toBeCloseTo(93.1, 1);

      const entrySignals = findEntrySignals(result);
      expect(entrySignals).toHaveLength(0);
    });

    it('should handle entryGap=0 with bid0 (dynamic mode)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 0,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 2,
          entryGapType: 'arithmetic',
          entryGapValue: 0,
          qtyPerStep: 0.1,
        }),
      );

      const ob = createOrderBook(50);
      const result = await strategy.processInitialData(
        createInitialData({ orderBook: ob }),
      );
      const entrySignals = findEntrySignals(result);

      // bid0=50, entryGapValue=0 → entryBase=50 → entry 0 = 50 - 2*0 = 50
      expect(entrySignals).toHaveLength(1);
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(50, 1);
    });

    it('should not build any steps when arithmetic entryGapValue > referencePrice (negative entryBase)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepType: 'arithmetic',
          stepValue: 5,
          entryGapType: 'arithmetic',
          entryGapValue: 150, // > referencePrice → entryBase = 100 - 150 = -50
          qtyPerStep: 0.1,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(result);

      // entryBase = -50 ≤ 0 → buildLadder returns [] → no entries placed
      expect(entrySignals).toHaveLength(0);
    });

    it('should not build any steps when geometric entryGapValue >= 100 (zero/negative entryBase)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 3,
          stepType: 'geometric',
          stepValue: 2,
          entryGapType: 'geometric',
          entryGapValue: 100, // 100% drop → entryBase = 100 * 0 = 0
          qtyPerStep: 0.1,
        }),
      );

      const result = await strategy.processInitialData(createInitialData());
      const entrySignals = findEntrySignals(result);

      // entryBase = 0 ≤ 0 → buildLadder returns [] → no entries placed
      expect(entrySignals).toHaveLength(0);
    });

    it('should produce identical prices to pre-refactor when entryGapValue not in config (full ladder walk)', async () => {
      // Simulate an old DB config: no entryGapType/entryGapValue keys at all.
      // Pre-refactor formula: price[i] = ref - stepValue * (i+1) (arithmetic)
      // With ref=100, stepValue=5, 5 steps: 95, 90, 85, 80, 75
      // New formula with constructor fallback (entryGapValue ?? stepValue = 5):
      //   entryBase = 100 - 5 = 95, price[i] = 95 - 5*i → 95, 90, 85, 80, 75 ✓

      // We need to test via the constructor directly (not the factory)
      // because the factory would spread defaultParameters which now omits entryGapValue.
      const config = createStrategyConfig({
        basePrice: 100,
        ladderSteps: 5,
        stepType: 'arithmetic',
        stepValue: 5,
        qtyPerStep: 0.1,
        maxInvestment: 10000,
        maxPosition: 100,
        tpType: 'percent',
        tpPercent: 2,
      });
      // Simulate old DB config: delete entryGap keys if somehow present
      delete (config.parameters as Record<string, unknown>).entryGapType;
      delete (config.parameters as Record<string, unknown>).entryGapValue;

      const strategy = new LadderEntrySingleTPStrategy(config);
      const result = await strategy.processInitialData(createInitialData());

      // Walk the full ladder by filling each entry
      const expectedPrices = [95, 90, 85, 80, 75];
      let lastResult = result;
      for (let i = 0; i < expectedPrices.length; i++) {
        const entries = findEntrySignals(lastResult);
        if (i === 0) {
          expect(entries).toHaveLength(1);
          expect(entries[0].price!.toNumber()).toBeCloseTo(expectedPrices[i], 1);
        }

        if (i < expectedPrices.length - 1) {
          // Fill current entry → next entry should be placed
          const fill = createOrder(
            entries[0].clientOrderId,
            OrderSide.BUY,
            OrderStatus.FILLED,
            expectedPrices[i],
            0.1,
            0.1,
            expectedPrices[i],
          );
          lastResult = await strategy.analyze(createDataUpdate({ orders: [fill] }));
          const nextEntries = findEntrySignals(lastResult);
          expect(nextEntries).toHaveLength(1);
          expect(nextEntries[0].price!.toNumber()).toBeCloseTo(expectedPrices[i + 1], 1);
        }
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Strategy 473 oversell regression — partial-fill debounce TP vs full-fill
  // TP race: debounce TP refresh ran BEFORE handleOrderUpdates, placing a
  // stale-qty TP that raced with the full-fill's cancel+replace TP.
  // ────────────────────────────────────────────────────────────────────────
  describe('Strategy 473 oversell regression: double-TP race prevention', () => {
    it('should NOT place stale TP when partial-fill debounce fires then full-fill arrives', async () => {
      // This test reproduces Strategy 473: entry partially fills → debounce
      // TP refresh fires (stale qty) → then full fill arrives in a later
      // analyze() call. Old code: debounce TP ran BEFORE handleOrderUpdates
      // in the same cycle, placing a stale-qty TP, then full-fill triggered
      // cancel+replace → two TPs on exchange simultaneously → oversell.
      // Fix: debounce TP refresh moved AFTER handleOrderUpdates + _tpRefreshedThisCycle flag.
      const strategy = new LadderEntrySingleTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          ladderSteps: 2,
          stepType: 'arithmetic',
          stepValue: 2,
          qtyType: 'arithmetic',
          qtyPerStep: 10,
          tpType: 'percent',
          tpPercent: 1,
        }),
      );

      const initResult = await strategy.processInitialData(createInitialData());
      const entries = findEntrySignals(initResult);
      expect(entries).toHaveLength(1);

      const entryId = entries[0].clientOrderId;
      const now = new Date();

      // Step 1: partial fill (3 of 10) → arms debounce TP refresh
      const partialFill = createOrder(
        entryId,
        OrderSide.BUY,
        OrderStatus.PARTIALLY_FILLED,
        98,
        10,
        3,
        98,
        now,
      );
      const resultPartial = await strategy.analyze(
        createDataUpdate({ orders: [partialFill] }),
      );
      // No TP yet — debounced
      const tpImmediate = findTpSignals(resultPartial);
      expect(tpImmediate.length).toBe(0);

      // Step 2: wait for debounce window to elapse (TP_DEBOUNCE_MS = 2000ms)
      await new Promise((resolve) => setTimeout(resolve, 2100));

      // Step 3: full fill (10 of 10) arrives in a new analyze() call
      // OLD (buggy) code: debounce TP refresh ran BEFORE handleOrderUpdates
      //   → placed stale TP (qty=3), then full-fill triggered cancel+replace
      //   → 2 TP signals (stale new + update/cancel+replace) = oversell
      // NEW (fixed) code: handleOrderUpdates runs first, clears tpRefreshPending,
      //   refreshes TP with full-fill qty → debounce TP refresh skipped
      //   → 1 TP signal (qty=10)
      const fullFill = createOrder(
        entryId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        98,
        10,
        10,
        98,
        new Date(now.getTime() + 2100),
      );
      const resultFull = await strategy.analyze(createDataUpdate({ orders: [fullFill] }));

      // Count ALL TP signals: new sell/buy + update (cancel+replace)
      const allTpSignals = findTpSignals(resultFull);

      // Under the old buggy code, we'd see:
      //   1. sell TP (qty=3) from stale debounce refresh
      //   2. update (cancel stale + place new qty=10) from full-fill
      // Under the fixed code, we should see only:
      //   1. sell TP (qty=10) from full-fill refreshTakeProfit
      // Assert: no more than 1 new TP (sell/buy action)
      const newTpSignals = allTpSignals.filter(
        (s): s is StrategyOrderResult =>
          (s.action === 'sell' || s.action === 'buy') && !isUpdateOrderResult(s),
      );
      expect(newTpSignals.length).toBe(1);

      // The TP qty MUST reflect the FULL fill (10), not partial (3)
      expect(newTpSignals[0].quantity!.toNumber()).toBe(10);
    });
  });
});
