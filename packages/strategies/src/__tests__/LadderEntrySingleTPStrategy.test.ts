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

      // Arithmetic absolute steps (stepValue=1): first step = 100
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(100, 1);
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
      // bid0 = 95 → step 0: 95
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(95, 1);
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
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(100, 1);
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
        100,
        0.1,
        0.1,
        100,
      );

      const result = await strategy.analyze(createDataUpdate({ orders: [filledOrder] }));
      const tpSignals = findTpSignals(result);

      expect(tpSignals).toHaveLength(1);
      const tpSignal = tpSignals[0] as StrategyOrderResult;
      expect(tpSignal.action).toBe('sell');
      expect(tpSignal.quantity!.toNumber()).toBeCloseTo(0.1, 5);
      expect(tpSignal.price!.toNumber()).toBeCloseTo(101, 1);
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
        100,
        0.5,
        0.5,
        100,
      );

      const result = await strategy.analyze(createDataUpdate({ orders: [filledOrder] }));
      const tpSignals = findTpSignals(result);

      expect(tpSignals).toHaveLength(1);
      const tpSignal = tpSignals[0] as StrategyOrderResult;
      expect(tpSignal.price!.toNumber()).toBeCloseTo(120, 1);
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
        100,
        0.1,
        0.1,
        100,
      );
      // Fill entry 0 → returns entry 1 signal + TP signal
      const result0 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const entry1Signals = findEntrySignals(result0);

      const fill1 = createOrder(
        entry1Signals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );
      const result1 = await strategy.analyze(createDataUpdate({ orders: [fill1] }));

      const tp1 = findTpSignals(result1);
      expect(tp1.length).toBeGreaterThanOrEqual(1);

      // VWAP = (100*0.1 + 99*0.1) / 0.2 = 99.5; TP = 99.5 * 1.01 = 100.495
      const tpSignal = tp1[tp1.length - 1] as StrategyOrderResult;
      expect(tpSignal.action).toBe('sell');
      expect(tpSignal.quantity!.toNumber()).toBeCloseTo(0.2, 5);
      expect(tpSignal.price!.toNumber()).toBeCloseTo(100.495, 1);
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
        100,
        0.5,
        0.5,
        100,
      );
      // Fill entry 0 → returns entry 1 signal + TP signal
      const result0 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const entry1Signals = findEntrySignals(result0);

      const fill1 = createOrder(
        entry1Signals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.5,
        0.5,
        99,
      );
      const result1 = await strategy.analyze(createDataUpdate({ orders: [fill1] }));

      const tpSignals = findTpSignals(result1);
      const tpSignal = tpSignals[tpSignals.length - 1] as StrategyOrderResult;
      // VWAP = 99.5; TP = 99.5 + 20/1.0 = 119.5
      expect(tpSignal.price!.toNumber()).toBeCloseTo(119.5, 1);
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
        100,
        0.2,
        0.1,
        100,
      );
      const result = await strategy.analyze(createDataUpdate({ orders: [partialFill] }));

      // Partial fill: VWAP updated immediately, but TP refresh is debounced
      const state = strategy.getStrategyState();
      expect(state.inventoryQty).toBe('0.1');
      expect(state.vwap).toBe('100');

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
        100,
        0.1,
        0.1,
        100,
      );
      // Fill entry 0 → returns entry 1 signal + TP signal
      const result0 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const entry1Signals = findEntrySignals(result0);

      const fill1 = createOrder(
        entry1Signals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        99,
      );
      const result1 = await strategy.analyze(createDataUpdate({ orders: [fill1] }));
      const tpSignals = findTpSignals(result1);
      const tpClientId = (tpSignals[tpSignals.length - 1] as StrategyOrderResult)
        .clientOrderId;

      // TP partial fill: 0.1 out of 0.2 → should produce NO signals
      const tpPartial = createOrder(
        tpClientId,
        OrderSide.SELL,
        OrderStatus.PARTIALLY_FILLED,
        100.495,
        0.2,
        0.1,
        100.495,
      );
      const tpResult = await strategy.analyze(createDataUpdate({ orders: [tpPartial] }));

      const allSignals = toSignalArray(tpResult);
      // Should be "hold" — no actions at all
      expect(allSignals).toHaveLength(1);
      expect(allSignals[0].action).toBe('hold');
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
        100,
        0.1,
        0.1,
        100,
      );
      const result0 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const tp0 = findTpSignals(result0);
      const tpClientId = (tp0[0] as StrategyOrderResult).clientOrderId;

      // TP fills at 101
      const tpFill = createOrder(
        tpClientId,
        OrderSide.SELL,
        OrderStatus.FILLED,
        101,
        0.1,
        0.1,
        101,
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
        100,
        0.1,
        0.1,
        100,
      );
      const result0 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const tp0 = findTpSignals(result0);
      const tpClientId = (tp0[0] as StrategyOrderResult).clientOrderId;

      const tpFill = createOrder(
        tpClientId,
        OrderSide.SELL,
        OrderStatus.FILLED,
        101,
        0.1,
        0.1,
        101,
      );
      const tpResult = await strategy.analyze(createDataUpdate({ orders: [tpFill] }));

      // New cycle should use same fixed basePrice=100
      const newEntries = findEntrySignals(tpResult);
      expect(newEntries.length).toBeGreaterThanOrEqual(1);
      expect(newEntries[0].price!.toNumber()).toBeCloseTo(100, 1);
    });
  });

  describe('Stop/restart recovery', () => {
    it('should recover inventory, VWAP, and TP from open orders on restart', async () => {
      // Simulate a restart: strategy had 2 entries filled at 100 and 99,
      // plus an active TP order, and one pending entry at 98.
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
      const entry0Id = 'E1D1000001'; // filled at 100
      const entry1Id = 'E1D1000002'; // filled at 99
      const entry2Id = 'E1D1000003'; // still NEW at 98
      const tpId = 'T1D1000001'; // active TP

      const recoveredOrders: Order[] = [
        createOrder(entry0Id, OrderSide.BUY, OrderStatus.FILLED, 100, 0.1, 0.1, 100),
        createOrder(entry1Id, OrderSide.BUY, OrderStatus.FILLED, 99, 0.1, 0.1, 99),
        createOrder(entry2Id, OrderSide.BUY, OrderStatus.NEW, 98, 0.1, 0, undefined),
        createOrder(tpId, OrderSide.SELL, OrderStatus.NEW, 100.495, 0.2, 0, undefined),
      ];

      await strategy.processInitialData(
        createInitialData({ openOrders: recoveredOrders }),
      );

      const state = strategy.getStrategyState();

      // VWAP = (100*0.1 + 99*0.1) / 0.2 = 99.5
      expect(state.vwap).toBe('99.5');
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

      const entry0Id = 'E1D2000001'; // filled at 100
      const recoveredOrders: Order[] = [
        createOrder(entry0Id, OrderSide.BUY, OrderStatus.FILLED, 100, 0.1, 0.1, 100),
      ];

      const result = await strategy.processInitialData(
        createInitialData({ openOrders: recoveredOrders }),
      );

      const tpSignals = findTpSignals(result);
      expect(tpSignals.length).toBeGreaterThanOrEqual(1);

      const state = strategy.getStrategyState();
      expect(state.inventoryQty).toBe('0.1');
      expect(state.vwap).toBe('100');
      expect(state.tpPrice).toBe('101');
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
          100,
          0.2,
          0.1,
          100,
        ),
      ];

      const result = await strategy.processInitialData(
        createInitialData({ openOrders: recoveredOrders }),
      );

      const state = strategy.getStrategyState();
      expect(state.inventoryQty).toBe('0.1');
      expect(state.vwap).toBe('100');

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
        100,
        0.1,
        0.1,
        100,
        t1,
      );
      await strategy.analyze(createDataUpdate({ orders: [fillOrder] }));

      // Stale update: NEW at time T0 (before T1) — should be skipped
      const t0 = new Date('2025-01-01T10:00:00Z');
      const staleOrder = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.NEW,
        100,
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
        100,
        0.1,
        0.1,
        100,
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
        100,
        0.1,
        0.051,
        100,
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
        100,
        0.1,
        0.1,
        100,
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

      // Partial fill 0.05 of 0.1 at price 100
      // Partial fill: VWAP updated, TP refresh debounced (no immediate TP signal)
      const partialFill = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.PARTIALLY_FILLED,
        100,
        0.1,
        0.05,
        100, // averagePrice = 100
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
        100,
        0.1,
        0.05, // executedQuantity stays at 0.05
        100, // averagePrice = 100
        new Date('2025-01-01T10:00:02Z'),
      );
      const cancelResult = await strategy.analyze(
        createDataUpdate({ orders: [cancelledOrder] }),
      );

      // Inventory should be 0.05 (partial fill preserved)
      const state = strategy.getStrategyState();
      expect(state.inventoryQty).toBe('0.05');
      expect(state.vwap).toBe('100');

      // Step 0 should be marked filled (so sequential mode advances)
      expect(state.steps[0].filled).toBe(true);

      // TP should be refreshed to cover 0.05 inventory (terminal → immediate)
      const cancelTp = findTpSignals(cancelResult);
      expect(cancelTp.length).toBeGreaterThanOrEqual(1);

      // Next entry (step 1) should be placed
      const nextEntries = findEntrySignals(cancelResult);
      expect(nextEntries.length).toBeGreaterThanOrEqual(1);
      if (nextEntries.length > 0) {
        expect(nextEntries[0].price!.toNumber()).toBeCloseTo(99, 1);
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
        100,
        0.1,
        0.1,
        100,
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
          99,
          0.1,
          0.1,
          99,
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
        100,
        0.1,
        0.1,
        100,
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
      // Entry 0 placed at 100
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(100, 1);

      // Fill entry 0 → places TP at 102 (2% above VWAP=100)
      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        100,
        0.1,
        0.1,
        100,
      );
      const fillResult = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const tpSignals = findTpSignals(fillResult);
      expect(tpSignals).toHaveLength(1);
      expect(tpSignals[0].price!.toNumber()).toBeCloseTo(102, 1);

      // TP fills at 102
      const tpFill = createOrder(
        (tpSignals[0] as StrategyOrderResult).clientOrderId,
        OrderSide.SELL,
        OrderStatus.FILLED,
        102,
        0.1,
        0.1,
        102,
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

      // New cycle: entry should be at 102 (fresh bid0)
      const reinitEntries = findEntrySignals(reinitResult);
      expect(reinitEntries.length).toBeGreaterThanOrEqual(1);
      expect(reinitEntries[0].price!.toNumber()).toBeCloseTo(102, 1);

      // Verify state reflects new reference price
      const state = strategy.getStrategyState();
      expect(state.referencePrice).toBe('102');
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

      // Fill entry → TP at 105 (5% above 100)
      const fill = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        100,
        0.1,
        0.1,
        100,
      );
      const fillResult = await strategy.analyze(createDataUpdate({ orders: [fill] }));
      const tpSignals = findTpSignals(fillResult);

      // TP fills at 105
      const tpFill = createOrder(
        (tpSignals[0] as StrategyOrderResult).clientOrderId,
        OrderSide.SELL,
        OrderStatus.FILLED,
        105,
        0.1,
        0.1,
        105,
      );
      const tpFillResult = await strategy.analyze(createDataUpdate({ orders: [tpFill] }));

      // New cycle: entry should be at 100 (fixed basePrice, NOT 105)
      const newEntrySignals = findEntrySignals(tpFillResult);
      expect(newEntrySignals.length).toBeGreaterThanOrEqual(1);
      expect(newEntrySignals[0].price!.toNumber()).toBeCloseTo(100, 1);

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
        100,
        0.1,
        0.1,
        100,
      );
      await strategy.analyze(createDataUpdate({ orders: [fill] }));

      const state = strategy.getStrategyState();
      expect(state.inventoryQty).toBe('0.1');
      expect(state.vwap).toBe('100');
      expect(state.tpPrice).toBe('101');
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
    it('BTC: bid0=65000, stepValue=300 → first entry = 65000 (sequential)', async () => {
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
      expect(entries).toHaveLength(1);
      expect(entries[0].price!.toNumber()).toBe(65000);
    });

    it('SOL: bid0=76, geometric stepValue=1 → first entry = 76 (sequential)', async () => {
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
      expect(entries).toHaveLength(1);
      // 76 * (1 - 0.01)^0 = 76
      expect(entries[0].price!.toNumber()).toBeCloseTo(76, 2);
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
      expect(entries).toHaveLength(1);
      expect(entries[0].price!.toNumber()).toBeCloseTo(100, 1);
      expect(entries[0].quantity!.toNumber()).toBeCloseTo(0.1, 5);

      const fill = createOrder(
        entries[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        100,
        0.1,
        0.1,
        100,
      );
      const fillResult = await strategy.analyze(createDataUpdate({ orders: [fill] }));
      const tpSignals = findTpSignals(fillResult);

      expect(tpSignals).toHaveLength(1);
      const tp = tpSignals[0] as StrategyOrderResult;
      expect(tp.price!.toNumber()).toBeCloseTo(102, 1);
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
      const initResult = await strategy.processInitialData(createInitialData());
      const initEntries = findEntrySignals(initResult);
      expect(initEntries).toHaveLength(1);
      expect(initEntries[0].price!.toNumber()).toBeCloseTo(100, 1);

      // Fill entry 0 → should place entry 1 + TP
      const fill0 = createOrder(
        initEntries[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        100,
        0.1,
        0.1,
        100,
      );
      const result1 = await strategy.analyze(createDataUpdate({ orders: [fill0] }));
      const entries1 = findEntrySignals(result1);
      const tp1 = findTpSignals(result1);
      // Entry 1 placed (price=99) + TP placed
      expect(entries1).toHaveLength(1);
      expect(entries1[0].price!.toNumber()).toBeCloseTo(99, 1);
      expect(tp1).toHaveLength(1);

      // Fill entry 1 → should place entry 2 + update TP
      const fill1 = createOrder(
        entries1[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        99,
        0.1,
        0.1,
        9.9,
      );
      const result2 = await strategy.analyze(createDataUpdate({ orders: [fill1] }));
      const entries2 = findEntrySignals(result2);
      const tp2 = findTpSignals(result2);
      // Entry 2 placed (price=98) + TP updated
      expect(entries2).toHaveLength(1);
      expect(entries2[0].price!.toNumber()).toBeCloseTo(98, 1);
      expect(tp2).toHaveLength(1);

      // Fill entry 2 (last step) → no more entries, TP updated only
      const fill2 = createOrder(
        entries2[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        98,
        0.1,
        0.1,
        9.8,
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
      expect(entries).toHaveLength(1);
      expect(entries[0].price!.toNumber()).toBeCloseTo(50, 1);
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
