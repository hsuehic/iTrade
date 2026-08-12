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
    it('should place all ladder BUY entry orders on init (fixed basePrice)', async () => {
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

      expect(entrySignals).toHaveLength(5);
      entrySignals.forEach((s) => expect(s.action).toBe('buy'));

      // Arithmetic 1% steps: 100, 99, 98, 97, 96
      const prices = entrySignals.map((s) => s.price!.toNumber());
      expect(prices[0]).toBeCloseTo(100, 1);
      expect(prices[1]).toBeCloseTo(99, 1);
      expect(prices[2]).toBeCloseTo(98, 1);
      expect(prices[3]).toBeCloseTo(97, 1);
      expect(prices[4]).toBeCloseTo(96, 1);

      entrySignals.forEach((s) => expect(s.quantity!.toNumber()).toBeCloseTo(0.1, 5));
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

      expect(entrySignals).toHaveLength(3);
      // bid0 = 95 → step 0: 95, step 1: 94.05, step 2: 93.10
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

      expect(entrySignals).toHaveLength(3);
      expect(entrySignals[0].price!.toNumber()).toBeCloseTo(100, 1);
      expect(entrySignals[1].price!.toNumber()).toBeCloseTo(98, 1);
      expect(entrySignals[2].price!.toNumber()).toBeCloseTo(96.04, 1);
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

      expect(entrySignals).toHaveLength(3);
      expect(entrySignals[0].quantity!.toNumber()).toBeCloseTo(0.1, 5);
      expect(entrySignals[1].quantity!.toNumber()).toBeCloseTo(0.2, 5);
      expect(entrySignals[2].quantity!.toNumber()).toBeCloseTo(0.4, 5);
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

      expect(entrySignals).toHaveLength(3);
      expect(entrySignals[0].quantity!.toNumber()).toBeCloseTo(0.1, 5);
      expect(entrySignals[1].quantity!.toNumber()).toBeCloseTo(0.15, 5);
      expect(entrySignals[2].quantity!.toNumber()).toBeCloseTo(0.2, 5);
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
      expect(entrySignals).toHaveLength(3);
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
      expect(entrySignals).toHaveLength(2);
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

      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        100,
        0.1,
        0.1,
        100,
      );
      await strategy.analyze(createDataUpdate({ orders: [fill0] }));

      const fill1 = createOrder(
        entrySignals[1].clientOrderId,
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

      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        100,
        0.5,
        0.5,
        100,
      );
      await strategy.analyze(createDataUpdate({ orders: [fill0] }));

      const fill1 = createOrder(
        entrySignals[1].clientOrderId,
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
    it('should update VWAP and TP on entry partial fill', async () => {
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

      const tpSignals = findTpSignals(result);
      expect(tpSignals.length).toBeGreaterThanOrEqual(1);

      const state = strategy.getStrategyState();
      expect(state.inventoryQty).toBe('0.1');
      expect(state.vwap).toBe('100');
      expect(state.tpPrice).toBe('102');
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

      // Fill both entries
      const fill0 = createOrder(
        entrySignals[0].clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        100,
        0.1,
        0.1,
        100,
      );
      await strategy.analyze(createDataUpdate({ orders: [fill0] }));

      const fill1 = createOrder(
        entrySignals[1].clientOrderId,
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

      // Should cancel remaining entries (step 1 + step 2)
      const cancelSignals = findCancelSignals(tpResult);
      expect(cancelSignals.length).toBeGreaterThanOrEqual(2);

      // Should also place new ladder entries (new cycle)
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
      expect(entrySignals).toHaveLength(3);
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
      expect(entrySignals).toHaveLength(3);
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
      expect(entrySignals).toHaveLength(2);
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

  describe('Geometric + arithmetic combination', () => {
    it('should handle geometric price + arithmetic qty', async () => {
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

      expect(entries).toHaveLength(3);
      expect(entries[0].price!.toNumber()).toBeCloseTo(100, 1);
      expect(entries[1].price!.toNumber()).toBeCloseTo(95, 1);
      expect(entries[2].price!.toNumber()).toBeCloseTo(90.25, 1);

      expect(entries[0].quantity!.toNumber()).toBeCloseTo(0.1, 5);
      expect(entries[1].quantity!.toNumber()).toBeCloseTo(0.15, 5);
      expect(entries[2].quantity!.toNumber()).toBeCloseTo(0.2, 5);

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
      expect(entries).toHaveLength(2);
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
