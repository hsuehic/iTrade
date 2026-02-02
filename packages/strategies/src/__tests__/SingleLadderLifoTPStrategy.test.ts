import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import {
  SingleLadderLifoTPStrategy,
  SingleLadderLifoTPParameters,
} from '../strategies/SingleLadderLifoTPStrategy';
import {
  StrategyConfig,
  Order,
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
  Position,
  Ticker,
  DataUpdate,
  StrategyAnalyzeResult,
  StrategyResult,
  StrategyOrderResult,
  SignalType,
} from '@itrade/core';

/**
 * Helper function to create strategy config
 */
function createStrategyConfig(
  params: Partial<SingleLadderLifoTPParameters> = {},
): StrategyConfig<SingleLadderLifoTPParameters> {
  return {
    type: 'SingleLadderLifoTPStrategy',
    parameters: {
      basePrice: 100,
      stepPercent: 2, // 2%
      takeProfitPercent: 1.5, // 1.5% (must be >= step/2)
      orderAmount: 100,
      minSize: -500, // Allow shorts
      maxSize: 500,
      leverage: 10,
      ...params,
    },
    symbol: 'BTC/USDT',
    exchange: 'okx',
    strategyId: 1,
    strategyName: 'Test Single Ladder LIFO TP',
  };
}


/**
 * Helper function to create a position
 */
function createPosition(quantity: number, side: 'long' | 'short'): Position {
  return {
    symbol: 'BTC/USDT',
    side,
    quantity: new Decimal(Math.abs(quantity)),
    avgPrice: new Decimal(100),
    markPrice: new Decimal(100),
    unrealizedPnl: new Decimal(0),
    leverage: new Decimal(10),
    timestamp: new Date(),
  };
}

/**
 * Helper function to create an order
 */
function createOrder(
  clientOrderId: string,
  side: OrderSide,
  status: OrderStatus,
  price: number,
  quantity: number,
  updateTime?: Date,
): Order {
  return {
    id: `order-${Date.now()}`,
    clientOrderId,
    symbol: 'BTC/USDT',
    exchange: 'okx',
    side,
    type: OrderType.LIMIT,
    status,
    price: new Decimal(price),
    quantity: new Decimal(quantity),
    executedQuantity:
      status === OrderStatus.FILLED ? new Decimal(quantity) : new Decimal(0),
    averagePrice: status === OrderStatus.FILLED ? new Decimal(price) : undefined,
    timeInForce: TimeInForce.GTC,
    timestamp: new Date(),
    updateTime: updateTime || new Date(),
  };
}

/**
 * Helper function to create DataUpdate
 */
function createDataUpdate(
  options: {
    ticker?: Ticker;
    positions?: Position[];
    orders?: Order[];
  } = {},
): DataUpdate {
  return {
    exchangeName: 'okx',
    symbol: 'BTC/USDT',
    ticker: options.ticker,
    positions: options.positions,
    orders: options.orders,
  };
}

function toSignalArray(result: StrategyAnalyzeResult): StrategyResult[] {
  return Array.isArray(result) ? result : [result];
}

function findOrderSignalsByType(
  result: StrategyAnalyzeResult,
  type: SignalType,
): StrategyOrderResult[] {
  return toSignalArray(result).filter(
    (s): s is StrategyOrderResult =>
      (s.action === 'buy' || s.action === 'sell') && s.metadata?.signalType === type,
  );
}


describe('SingleLadderLifoTPStrategy', () => {
  describe('Initialization', () => {
    it('should initialize with default parameters', async () => {
      const config = createStrategyConfig();
      const strategy = new SingleLadderLifoTPStrategy(config);

      expect(strategy.strategyType).toBe('SingleLadderLifoTPStrategy');
      expect(strategy.getStrategyId()).toBe(1);
    });

    it('should validate size limits', async () => {
      expect(() => {
        new SingleLadderLifoTPStrategy(
          createStrategyConfig({
            minSize: 500,
            maxSize: 100,
          }),
        );
      }).toThrow(/Invalid size limits/);
    });

    it('should validate takeProfitPercent >= stepPercent / 2', async () => {
      expect(() => {
        new SingleLadderLifoTPStrategy(
          createStrategyConfig({
            stepPercent: 2,
            takeProfitPercent: 0.5, // 0.5 < 2/2
          }),
        );
      }).toThrow(/Invalid Take Profit/);
    });

    it('should detect position mode correctly', async () => {
      // BI_DIRECTIONAL mode
      const biDirectional = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          minSize: -500,
          maxSize: 500,
        }),
      );
      const state1 = biDirectional.getStrategyState();
      expect(state1.mode).toBe('BI_DIRECTIONAL');

      // LONG_ONLY_WITH_BASE mode
      const longWithBase = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          minSize: 100, // Base position
          maxSize: 500,
        }),
      );
      const state2 = longWithBase.getStrategyState();
      expect(state2.mode).toBe('LONG_ONLY_WITH_BASE');

      // SHORT_ONLY_WITH_BASE mode
      const shortWithBase = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          minSize: -500,
          maxSize: -100, // Base position
        }),
      );
      const state3 = shortWithBase.getStrategyState();
      expect(state3.mode).toBe('SHORT_ONLY_WITH_BASE');

      // LONG_ONLY mode
      const longOnly = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          minSize: 0,
          maxSize: 500,
        }),
      );
      const state4 = longOnly.getStrategyState();
      expect(state4.mode).toBe('LONG_ONLY');
    });
  });

  describe('Order-Status-Only Entry Signal Generation', () => {
    let strategy: SingleLadderLifoTPStrategy;

    beforeEach(async () => {
      strategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          stepPercent: 2, // 2%
          takeProfitPercent: 1.5,
          orderAmount: 100,
          minSize: -500,
          maxSize: 500,
        }),
      );
    });

    it('should generate two entry signals immediately after processInitialData (Case 1)', async () => {
      const result = await strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
        timestamp: new Date(),
      });

      // Case 1: 2 entries (Buy Entry and Sell Entry)
      const entries = findOrderSignalsByType(result, SignalType.Entry);
      expect(entries).toHaveLength(2);

      const buyEntry = entries.find((e) => e.action === 'buy');
      const sellEntry = entries.find((e) => e.action === 'sell');

      expect(buyEntry?.price?.toNumber()).toBe(98); // 100 * (1 - 0.02)
      expect(sellEntry?.price?.toNumber()).toBe(102); // 100 * (1 + 0.02)
    });

    it('should respect size limits for entries', async () => {
      const longOnlyStrategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          minSize: 0,
          maxSize: 500,
        }),
      );

      const result = await longOnlyStrategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
        timestamp: new Date(),
      });

      const entries = findOrderSignalsByType(result, SignalType.Entry);
      // Should ONLY have Buy entry because minSize is 0 (can't add short)
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('buy');
    });
  });

  describe('Requirement 1: Traded Size Tracking', () => {
    it('should NOT sync tradedSize with exchange positions', async () => {
      const strategy = new SingleLadderLifoTPStrategy(createStrategyConfig());

      await strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
        positions: [createPosition(200, 'long')], // Exchange has 200
        timestamp: new Date(),
      });

      const state = strategy.getStrategyState();
      // Requirement 1: tradedSize should remain 0 as it's only for strategy orders
      expect(state.tradedSize.toNumber()).toBe(0);
    });

    it('should update tradedSize when strategy orders fill', async () => {
      const strategy = new SingleLadderLifoTPStrategy(createStrategyConfig({ basePrice: 100 }));
      const initResult = await strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
        timestamp: new Date(),
      });

      const buyEntrySignal = findOrderSignalsByType(initResult, SignalType.Entry).find(s => s.action === 'buy')!;
      
      // 1. Create order as NEW
      const orderNew = createOrder(buyEntrySignal.clientOrderId!, OrderSide.BUY, OrderStatus.NEW, 98, 100);
      await strategy.onOrderCreated(orderNew);
      
      // 2. Simulate FILL update with a later timestamp
      const orderFilled = createOrder(
        buyEntrySignal.clientOrderId!, 
        OrderSide.BUY, 
        OrderStatus.FILLED, 
        98, 
        100,
        new Date(orderNew.timestamp.getTime() + 1000)
      );
      await strategy.analyze(createDataUpdate({ orders: [orderFilled] }));

      expect(strategy.getStrategyState().tradedSize.toNumber()).toBe(100);
    });
  });

  describe('Requirement 5: Maximum 2 Orders (Cases 1-4)', () => {
    let strategy: SingleLadderLifoTPStrategy;

    beforeEach(async () => {
      strategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          stepPercent: 2,
          takeProfitPercent: 1.5,
          orderAmount: 100,
          minSize: 0, // Long only for simpler testing
          maxSize: 100, // Small range to trigger Case 4
        }),
      );
    });

    it('Case 1: 0 position -> 2 entry signals (if limits allow, here 1 as it is long only)', async () => {
      const result = await strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
        timestamp: new Date(),
      });
      const entries = findOrderSignalsByType(result, SignalType.Entry);
      expect(entries).toHaveLength(1); // Long entry only due to minSize=0
      expect(entries[0].action).toBe('buy');
    });

    it('Case 2: 1 entry fills -> 1 TP + 1 Entry', async () => {
      const initResult = await strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
        timestamp: new Date(),
      });
      const buySign = findOrderSignalsByType(initResult, SignalType.Entry).find(s => s.action === 'buy')!;
      
      // NEW
      const orderNew = createOrder(buySign.clientOrderId!, OrderSide.BUY, OrderStatus.NEW, 98, 100);
      await strategy.onOrderCreated(orderNew);
      
      // FILLED
      const orderFilled = createOrder(
        buySign.clientOrderId!, 
        OrderSide.BUY, 
        OrderStatus.FILLED, 
        98, 
        100,
        new Date(orderNew.timestamp.getTime() + 1000)
      );
      
      // analyze should return TP for the 100 filled, and no new entry because maxSize is 100
      const followUp = await strategy.analyze(createDataUpdate({ orders: [orderFilled] }));
      
      const tp = findOrderSignalsByType(followUp, SignalType.TakeProfit);
      expect(tp).toHaveLength(1);
      expect(tp[0].action).toBe('sell');
      expect(tp[0].price?.toNumber()).toBeCloseTo(98 * 1.015, 2);

      // Entries should be 0 because tradedSize is now 100 and maxSize is 100
      const entries = findOrderSignalsByType(followUp, SignalType.Entry);
      expect(entries).toHaveLength(0);
    });
  });

  describe('LIFO Take Profit Behavior', () => {
    it('should target the LAST filled entry for TP', async () => {
      const strategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({ basePrice: 100, maxSize: 1000, minSize: 0 }),
      );
      const initResult = await strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
        timestamp: new Date(),
      });

      // 1. Get Buy Entry signal from init
      const buySign1 = findOrderSignalsByType(initResult, SignalType.Entry).find(s => s.action === 'buy')!;
      
      // NEW
      const order1New = createOrder(buySign1.clientOrderId!, OrderSide.BUY, OrderStatus.NEW, 98, 100);
      await strategy.onOrderCreated(order1New);
      // FILLED
      const order1Filled = createOrder(buySign1.clientOrderId!, OrderSide.BUY, OrderStatus.FILLED, 98, 100, new Date(order1New.timestamp.getTime() + 1000));
      const fill1Result = await strategy.analyze(createDataUpdate({ orders: [order1Filled] }));

      // 2. Get next Buy Entry signal and TP signal from fill1Result
      const fill1Signals = toSignalArray(fill1Result);
      const buySign2 = findOrderSignalsByType(fill1Signals, SignalType.Entry).find(s => s.action === 'buy')!;
      const tpSign1 = findOrderSignalsByType(fill1Signals, SignalType.TakeProfit)[0];
      
      // We must acknowledge the TP signal so it's not "pending" anymore
      if (tpSign1) {
        await strategy.onOrderCreated(createOrder(tpSign1.clientOrderId!, OrderSide.SELL, OrderStatus.NEW, tpSign1.price!.toNumber(), 100));
      }

      // NEW for Entry 2
      const order2New = createOrder(buySign2.clientOrderId!, OrderSide.BUY, OrderStatus.NEW, 96.04, 100);
      await strategy.onOrderCreated(order2New);
      // FILLED for Entry 2
      const order2Filled = createOrder(buySign2.clientOrderId!, OrderSide.BUY, OrderStatus.FILLED, 96.04, 100, new Date(order2New.timestamp.getTime() + 1000));
      const result = await strategy.analyze(createDataUpdate({ orders: [order2Filled] }));

      // TP should target 96.04 (the last filled)
      const tpSignals = findOrderSignalsByType(result, SignalType.TakeProfit);
      expect(tpSignals).toHaveLength(1);
      const tp = tpSignals[0];
      expect(tp.action).toBe('sell');
      expect(tp.price?.toNumber()).toBeCloseTo(96.04 * 1.015, 2);
    });
  });

  describe('getStrategyState', () => {
    it('should return complete strategy state', async () => {
      const strategy = new SingleLadderLifoTPStrategy(createStrategyConfig());
      const state = strategy.getStrategyState();

      expect(state).toHaveProperty('tradedSize');
      expect(state).toHaveProperty('referencePrice');
      expect(state).toHaveProperty('sizeLimits');
      expect(state).toHaveProperty('buyPrice');
      expect(state).toHaveProperty('sellPrice');
    });
  });
});
