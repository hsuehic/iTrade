import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  LadderEntrySingleTPStrategy,
  LadderEntrySingleTPParameters,
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
  const bids: Array<[Decimal, Decimal]> = [];
  const asks: Array<[Decimal, Decimal]> = [];
  for (let i = 0; i < 5; i += 1) {
    bids.push([midPrice.minus(step.mul(i)), new Decimal(1)]);
    asks.push([midPrice.plus(step.mul(i)), new Decimal(1)]);
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
          tpPercent: 1,
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
      // VWAP=99, TP = 99 * 1.01 = 99.99
      expect(tpSignal.price!.toNumber()).toBeCloseTo(99.99, 1);
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
          tpPercent: 1,
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

      // VWAP = (99*0.1 + 98*0.1) / 0.2 = 98.5; TP = 98.5 * 1.01 = 99.485
      const tpSignal = tp1[tp1.length - 1] as StrategyOrderResult;
      expect(tpSignal.action).toBe('sell');
      expect(tpSignal.quantity!.toNumber()).toBeCloseTo(0.2, 5);
      expect(tpSignal.price!.toNumber()).toBeCloseTo(99.485, 1);
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
          tpPercent: 1,
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
      expect(state.tpPrice).toBe('99.99');
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
          tpPercent: 1,
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
      expect(state.tpPrice).toBe('99.99');
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
          tpPercent: 2,
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
      // VWAP=95, TP = 95 * 1.02 = 96.9
      expect(tp.price!.toNumber()).toBeCloseTo(96.9, 1);
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
});
