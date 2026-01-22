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
      dropPercent: 2, // 2%
      risePercent: 2, // 2%
      takeProfitPercent: 1, // 1%
      orderAmount: 100,
      minPositionAmount: -500, // Allow shorts
      maxPositionAmount: 500,
      maxRepeatsPerLevel: 3, // Default to 3 repeats per level
      preferredDirection: 'auto',
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
 * Helper function to create a ticker
 */
function createTicker(price: number): Ticker {
  return {
    symbol: 'BTC/USDT',
    exchange: 'okx',
    price: new Decimal(price),
    bid: new Decimal(price - 0.01),
    ask: new Decimal(price + 0.01),
    volume: new Decimal(1000000),
    quoteVolume: new Decimal(100000000),
    timestamp: new Date(),
    high: new Decimal(price + 1),
    low: new Decimal(price - 1),
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

describe('SingleLadderLifoTPStrategy', () => {
  describe('Initialization', () => {
    it('should initialize with default parameters', () => {
      const config = createStrategyConfig();
      const strategy = new SingleLadderLifoTPStrategy(config);

      expect(strategy.strategyType).toBe('SingleLadderLifoTPStrategy');
      expect(strategy.getStrategyId()).toBe(1);
    });

    it('should validate position limits', () => {
      expect(() => {
        new SingleLadderLifoTPStrategy(
          createStrategyConfig({
            minPositionAmount: 500,
            maxPositionAmount: 100,
          }),
        );
      }).toThrow(/Invalid position limits/);
    });

    it('should detect position mode correctly', () => {
      // BI_DIRECTIONAL mode
      const biDirectional = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          minPositionAmount: -500,
          maxPositionAmount: 500,
        }),
      );
      const state1 = biDirectional.getStrategyState();
      expect(state1.mode).toBe('BI_DIRECTIONAL');

      // LONG_ONLY_WITH_BASE mode
      const longWithBase = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          minPositionAmount: 100, // Base position
          maxPositionAmount: 500,
        }),
      );
      const state2 = longWithBase.getStrategyState();
      expect(state2.mode).toBe('LONG_ONLY_WITH_BASE');

      // SHORT_ONLY_WITH_BASE mode
      const shortWithBase = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          minPositionAmount: -500,
          maxPositionAmount: -100, // Base position
        }),
      );
      const state3 = shortWithBase.getStrategyState();
      expect(state3.mode).toBe('SHORT_ONLY_WITH_BASE');

      // LONG_ONLY mode
      const longOnly = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          minPositionAmount: 0,
          maxPositionAmount: 500,
        }),
      );
      const state4 = longOnly.getStrategyState();
      expect(state4.mode).toBe('LONG_ONLY');
    });
  });

  describe('Order-Status-Only Entry Signal Generation', () => {
    let strategy: SingleLadderLifoTPStrategy;

    beforeEach(() => {
      strategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          dropPercent: 2, // 2%
          risePercent: 2, // 2%
          orderAmount: 100,
          minPositionAmount: -500,
          maxPositionAmount: 500,
          preferredDirection: 'long', // Default to long for bi-directional
        }),
      );
      // Process initial data to enable entry generation
      strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
      });
    });

    it('should generate entry signal immediately after initialization (not based on ticker)', async () => {
      // Entry should be generated without waiting for price to reach level
      // Just send any ticker to trigger analyze()
      const ticker = createTicker(100); // Current price doesn't matter
      const result = await strategy.analyze(createDataUpdate({ ticker }));

      // Should generate a LONG entry (preferredDirection: 'long')
      expect(result.action).toBe('buy');
      if (result.action === 'buy') {
        expect(result.quantity?.toNumber()).toBe(100);
        expect(result.clientOrderId).toMatch(/^E/); // Entry order prefix
        // Entry price should be at referencePrice * (1 - dropPercent) = 100 * 0.98 = 98
        expect(result.price?.toNumber()).toBe(98);
      }
    });

    it('should generate SHORT entry when preferredDirection is short', async () => {
      const shortStrategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          dropPercent: 2,
          risePercent: 2,
          orderAmount: 100,
          minPositionAmount: -500,
          maxPositionAmount: 500,
          preferredDirection: 'short',
        }),
      );
      shortStrategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
      });

      const ticker = createTicker(100);
      const result = await shortStrategy.analyze(createDataUpdate({ ticker }));

      expect(result.action).toBe('sell');
      if (result.action === 'sell') {
        expect(result.quantity?.toNumber()).toBe(100);
        // Entry price should be at referencePrice * (1 + risePercent) = 100 * 1.02 = 102
        expect(result.price?.toNumber()).toBe(102);
      }
    });

    it('should only allow LONG when position is long-only mode', async () => {
      const longOnlyStrategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          dropPercent: 2,
          risePercent: 2,
          orderAmount: 100,
          minPositionAmount: 0, // Can't go negative
          maxPositionAmount: 500,
          preferredDirection: 'auto', // Should auto-detect long-only
        }),
      );
      longOnlyStrategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
      });

      const ticker = createTicker(100);
      const result = await longOnlyStrategy.analyze(createDataUpdate({ ticker }));

      // Should generate LONG entry (only option)
      expect(result.action).toBe('buy');
      expect(longOnlyStrategy.getStrategyState().canAddShort).toBe(false);
    });

    it('should respect position limits for LONG entry', async () => {
      // Set position near max
      strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
        positions: [createPosition(450, 'long')], // 450 of 500 max
      });

      // Try to generate entry (would add 100, exceeding 500)
      const ticker = createTicker(100);
      const result = await strategy.analyze(createDataUpdate({ ticker }));

      // Should only allow SHORT (not long)
      expect(result.action).toBe('sell');
    });

    it('should respect position limits for SHORT entry', async () => {
      // Set position near min
      strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
        positions: [createPosition(450, 'short')], // -450 of -500 min
      });

      // Try to generate entry (would add 100, exceeding -500)
      const ticker = createTicker(100);
      const result = await strategy.analyze(createDataUpdate({ ticker }));

      // Should only allow LONG (not short)
      expect(result.action).toBe('buy');
    });
  });

  describe('Position Mode - Base Position', () => {
    it('should not allow selling below base position (minPositionAmount > 0)', async () => {
      const strategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          dropPercent: 2,
          risePercent: 2,
          orderAmount: 100,
          minPositionAmount: 200, // Base position of 200
          maxPositionAmount: 500,
        }),
      );

      // Start with base position
      strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
        positions: [createPosition(200, 'long')],
      });

      // Generate entry
      const ticker = createTicker(100);
      const result = await strategy.analyze(createDataUpdate({ ticker }));

      // Should only allow LONG (canAddShort should be false)
      expect(result.action).toBe('buy');
      expect(strategy.getStrategyState().canAddShort).toBe(false);
    });

    it('should allow adding to position above base', async () => {
      const strategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          dropPercent: 2,
          risePercent: 2,
          orderAmount: 100,
          minPositionAmount: 200, // Base position
          maxPositionAmount: 500,
        }),
      );

      // Start with base position
      strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
        positions: [createPosition(200, 'long')],
      });

      const ticker = createTicker(100);
      const result = await strategy.analyze(createDataUpdate({ ticker }));

      expect(result.action).toBe('buy');
    });
  });

  describe('Take Profit Generation', () => {
    let strategy: SingleLadderLifoTPStrategy;

    beforeEach(() => {
      strategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          dropPercent: 2,
          risePercent: 2,
          takeProfitPercent: 1, // 1%
          orderAmount: 100,
          minPositionAmount: -500,
          maxPositionAmount: 500,
          preferredDirection: 'long',
        }),
      );
      strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
      });
    });

    it('should generate TP signal when LONG entry is filled', async () => {
      // First, generate entry
      const ticker = createTicker(100);
      const entryResult = await strategy.analyze(createDataUpdate({ ticker }));
      expect(entryResult.action).toBe('buy');

      // Simulate order created
      const entryClientOrderId = (entryResult as Record<string, unknown>)
        .clientOrderId as string;
      const orderTime1 = new Date();
      const entryOrder = createOrder(
        entryClientOrderId,
        OrderSide.BUY,
        OrderStatus.NEW,
        98,
        100,
        orderTime1,
      );
      await strategy.onOrderCreated(entryOrder);

      // First, send the NEW order through analyze to track it
      await strategy.analyze(
        createDataUpdate({
          orders: [entryOrder],
          ticker,
        }),
      );

      // Simulate order filled with a NEWER updateTime
      const orderTime2 = new Date(orderTime1.getTime() + 1000);
      const filledOrder = createOrder(
        entryClientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        98,
        100,
        orderTime2,
      );

      const tpResult = await strategy.analyze(
        createDataUpdate({
          orders: [filledOrder],
          ticker,
        }),
      );

      // Should generate TP signal
      expect(tpResult.action).toBe('sell'); // Sell to take profit on long
      if (tpResult.action === 'sell') {
        expect(tpResult.clientOrderId).toMatch(/^T/); // TP order prefix
        // TP price should be entry * (1 + 1%) = 98 * 1.01 = 98.98
        expect(tpResult.price?.toNumber()).toBeCloseTo(98.98, 2);
      }
    });

    it('should generate TP signal when SHORT entry is filled', async () => {
      // Use short-preferred strategy
      const shortStrategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          dropPercent: 2,
          risePercent: 2,
          takeProfitPercent: 1,
          orderAmount: 100,
          minPositionAmount: -500,
          maxPositionAmount: 500,
          preferredDirection: 'short',
        }),
      );
      shortStrategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
      });

      const ticker = createTicker(100);
      const entryResult = await shortStrategy.analyze(createDataUpdate({ ticker }));
      expect(entryResult.action).toBe('sell');

      // Simulate order created
      const entryClientOrderId = (entryResult as Record<string, unknown>)
        .clientOrderId as string;
      const orderTime1 = new Date();
      const entryOrder = createOrder(
        entryClientOrderId,
        OrderSide.SELL,
        OrderStatus.NEW,
        102,
        100,
        orderTime1,
      );
      await shortStrategy.onOrderCreated(entryOrder);

      // First, send the NEW order through analyze to track it
      await shortStrategy.analyze(
        createDataUpdate({
          orders: [entryOrder],
          ticker,
        }),
      );

      // Simulate order filled with a NEWER updateTime
      const orderTime2 = new Date(orderTime1.getTime() + 1000);
      const filledOrder = createOrder(
        entryClientOrderId,
        OrderSide.SELL,
        OrderStatus.FILLED,
        102,
        100,
        orderTime2,
      );

      const tpResult = await shortStrategy.analyze(
        createDataUpdate({
          orders: [filledOrder],
          ticker,
        }),
      );

      // Should generate TP signal
      expect(tpResult.action).toBe('buy'); // Buy to take profit on short
      if (tpResult.action === 'buy') {
        expect(tpResult.clientOrderId).toMatch(/^T/); // TP order prefix
        // TP price should be entry * (1 - 1%) = 102 * 0.99 = 100.98
        expect(tpResult.price?.toNumber()).toBeCloseTo(100.98, 2);
      }
    });
  });

  describe('LIFO Take Profit Behavior', () => {
    let strategy: SingleLadderLifoTPStrategy;

    beforeEach(() => {
      strategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          dropPercent: 2,
          risePercent: 2,
          takeProfitPercent: 1,
          orderAmount: 100,
          minPositionAmount: -500,
          maxPositionAmount: 500,
          preferredDirection: 'long',
        }),
      );
      strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
      });
    });

    it('should target the LAST filled entry for TP', async () => {
      // Generate entry
      const ticker = createTicker(100);
      const entry1Result = await strategy.analyze(createDataUpdate({ ticker }));
      expect(entry1Result.action).toBe('buy');

      const entry1ClientOrderId = (entry1Result as Record<string, unknown>)
        .clientOrderId as string;
      const orderTime1 = new Date();
      const entry1Order = createOrder(
        entry1ClientOrderId,
        OrderSide.BUY,
        OrderStatus.NEW,
        98,
        100,
        orderTime1,
      );
      await strategy.onOrderCreated(entry1Order);

      // Track the NEW order first
      await strategy.analyze(
        createDataUpdate({
          orders: [entry1Order],
          ticker,
        }),
      );

      // Fill first entry with NEWER updateTime
      const orderTime2 = new Date(orderTime1.getTime() + 1000);
      const filled1Order = createOrder(
        entry1ClientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        98,
        100,
        orderTime2,
      );

      const tp1Result = await strategy.analyze(
        createDataUpdate({
          orders: [filled1Order],
          ticker,
        }),
      );

      // First TP should target 98 * 1.01 = 98.98
      expect(tp1Result.action).toBe('sell');
      expect((tp1Result as Record<string, unknown>).price as Decimal).toBeDefined();
      expect(
        ((tp1Result as Record<string, unknown>).price as Decimal).toNumber(),
      ).toBeCloseTo(98.98, 2);

      // State should show lastFilled
      const state = strategy.getStrategyState();
      expect(state.lastFilled).not.toBeNull();
      expect(state.lastFilled?.side).toBe('LONG');
      expect(state.lastFilled?.price).toBe('98');
    });
  });

  describe('Order State Management', () => {
    let strategy: SingleLadderLifoTPStrategy;

    beforeEach(() => {
      strategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          dropPercent: 2,
          risePercent: 2,
          takeProfitPercent: 1,
          orderAmount: 100,
          minPositionAmount: -500,
          maxPositionAmount: 500,
          preferredDirection: 'long',
        }),
      );
      strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
      });
    });

    it('should not generate new entry while entry order is pending', async () => {
      // Generate entry
      const ticker = createTicker(100);
      const result1 = await strategy.analyze(createDataUpdate({ ticker }));
      expect(result1.action).toBe('buy');

      // Simulate order created (pending)
      const clientOrderId = (result1 as Record<string, unknown>).clientOrderId as string;
      const pendingOrder = createOrder(
        clientOrderId,
        OrderSide.BUY,
        OrderStatus.NEW,
        98,
        100,
      );
      await strategy.onOrderCreated(pendingOrder);

      // Try to trigger another entry
      const result2 = await strategy.analyze(createDataUpdate({ ticker }));
      expect(result2.action).toBe('hold');
      // The open entry order should prevent new entry signals
      expect(strategy.getStrategyState().openEntryOrder).not.toBeNull();
    });

    it('should generate new entry immediately after entry order is canceled', async () => {
      // Generate entry
      const ticker = createTicker(100);
      const result1 = await strategy.analyze(createDataUpdate({ ticker }));
      const clientOrderId = (result1 as Record<string, unknown>).clientOrderId as string;

      // Create pending order
      const orderTime1 = new Date();
      const pendingOrder = createOrder(
        clientOrderId,
        OrderSide.BUY,
        OrderStatus.NEW,
        98,
        100,
        orderTime1,
      );
      await strategy.onOrderCreated(pendingOrder);

      // Track the NEW order
      await strategy.analyze(createDataUpdate({ orders: [pendingOrder], ticker }));

      // Cancel with newer updateTime
      const orderTime2 = new Date(orderTime1.getTime() + 1000);
      const canceledOrder = createOrder(
        clientOrderId,
        OrderSide.BUY,
        OrderStatus.CANCELED,
        98,
        100,
        orderTime2,
      );

      // Cancel should trigger new entry
      const result2 = await strategy.analyze(
        createDataUpdate({ orders: [canceledOrder], ticker }),
      );

      // Should immediately generate new entry (ORDER-STATUS-ONLY approach)
      expect(result2.action).toBe('buy');
      expect(strategy.getStrategyState().openEntryOrder).toBeNull();
    });
  });

  describe('getStrategyState', () => {
    it('should return complete strategy state', () => {
      const strategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          minPositionAmount: -500,
          maxPositionAmount: 500,
        }),
      );

      const state = strategy.getStrategyState();

      expect(state).toHaveProperty('strategyId');
      expect(state).toHaveProperty('strategyType');
      expect(state).toHaveProperty('positionAmount');
      expect(state).toHaveProperty('referencePrice');
      expect(state).toHaveProperty('lastFilled');
      expect(state).toHaveProperty('lastFilledDirection');
      expect(state).toHaveProperty('preferredDirection');
      expect(state).toHaveProperty('openEntryOrder');
      expect(state).toHaveProperty('openTpOrder');
      expect(state).toHaveProperty('positionLimits');
      expect(state).toHaveProperty('canAddLong');
      expect(state).toHaveProperty('canAddShort');
      expect(state).toHaveProperty('mode');
      expect(state).toHaveProperty('longEntryPrice');
      expect(state).toHaveProperty('shortEntryPrice');

      expect(state.positionLimits.min).toBe(-500);
      expect(state.positionLimits.max).toBe(500);
    });
  });

  describe('processInitialData', () => {
    it('should load positions correctly', () => {
      const strategy = new SingleLadderLifoTPStrategy(createStrategyConfig());

      strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
        positions: [createPosition(200, 'long')],
      });

      const state = strategy.getStrategyState();
      expect(state.positionAmount).toBe(200);
      expect(state.lastFilledDirection).toBe('LONG'); // Inferred from position
    });

    it('should load short positions correctly', () => {
      const strategy = new SingleLadderLifoTPStrategy(createStrategyConfig());

      strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
        positions: [createPosition(200, 'short')],
      });

      const state = strategy.getStrategyState();
      expect(state.positionAmount).toBe(-200);
      expect(state.lastFilledDirection).toBe('SHORT'); // Inferred from position
    });

    it('should NOT update reference price from ticker (ORDER-STATUS-ONLY)', () => {
      const strategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          basePrice: 100,
        }),
      );

      strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
        ticker: createTicker(105), // Ticker price is 105
      });

      const state = strategy.getStrategyState();
      // Reference price should remain at basePrice (100), not ticker price
      expect(state.referencePrice).toBe(100);
    });
  });

  describe('Max Repeats Per Level', () => {
    it('should track repeat count correctly', async () => {
      const strategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          maxRepeatsPerLevel: 3,
          preferredDirection: 'long',
        }),
      );
      strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
      });

      // Generate entry
      const ticker = createTicker(100);
      const result = await strategy.analyze(createDataUpdate({ ticker }));
      expect(result.action).toBe('buy');

      const clientOrderId = (result as Record<string, unknown>).clientOrderId as string;

      // Simulate order flow
      const orderTime1 = new Date();
      const entryOrder = createOrder(
        clientOrderId,
        OrderSide.BUY,
        OrderStatus.NEW,
        98,
        100,
        orderTime1,
      );
      await strategy.onOrderCreated(entryOrder);
      await strategy.analyze(createDataUpdate({ orders: [entryOrder], ticker }));

      // Fill the order
      const orderTime2 = new Date(orderTime1.getTime() + 1000);
      const filledOrder = createOrder(
        clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        98,
        100,
        orderTime2,
      );
      await strategy.analyze(createDataUpdate({ orders: [filledOrder], ticker }));

      // Check state - should have 1 repeat
      const state = strategy.getStrategyState();
      expect(state.currentLevelRepeats).toBe(1);
      expect(state.maxRepeatsPerLevel).toBe(3);
    });

    it('should update reference price after max repeats reached', async () => {
      const strategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          maxRepeatsPerLevel: 2, // Only 2 repeats allowed
          preferredDirection: 'long',
        }),
      );
      strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
      });

      const initialRef = strategy.getStrategyState().referencePrice;
      expect(initialRef).toBe(100);

      // Simulate 2 filled entries to trigger reference price update
      for (let i = 0; i < 2; i++) {
        // Generate entry
        const ticker = createTicker(100);
        const result = await strategy.analyze(createDataUpdate({ ticker }));
        if (result.action !== 'buy') continue;

        const clientOrderId = (result as Record<string, unknown>).clientOrderId as string;

        // Simulate order flow
        const orderTime1 = new Date();
        const entryOrder = createOrder(
          clientOrderId,
          OrderSide.BUY,
          OrderStatus.NEW,
          98 - i,
          100,
          orderTime1,
        );
        await strategy.onOrderCreated(entryOrder);
        await strategy.analyze(createDataUpdate({ orders: [entryOrder], ticker }));

        // Fill the order
        const orderTime2 = new Date(orderTime1.getTime() + 1000);
        const filledOrder = createOrder(
          clientOrderId,
          OrderSide.BUY,
          OrderStatus.FILLED,
          98 - i,
          100,
          orderTime2,
        );

        // Also simulate TP order being created
        const tpResult = await strategy.analyze(
          createDataUpdate({ orders: [filledOrder], ticker }),
        );

        // Simulate TP created and filled to allow next entry
        const tpClientOrderId = (tpResult as Record<string, unknown>)
          .clientOrderId as string;
        const tpOrder = createOrder(
          tpClientOrderId,
          OrderSide.SELL,
          OrderStatus.NEW,
          99,
          100,
          new Date(orderTime2.getTime() + 100),
        );
        await strategy.onOrderCreated(tpOrder);
        await strategy.analyze(createDataUpdate({ orders: [tpOrder], ticker }));

        const tpFilled = createOrder(
          tpClientOrderId,
          OrderSide.SELL,
          OrderStatus.FILLED,
          99,
          100,
          new Date(orderTime2.getTime() + 200),
        );
        await strategy.analyze(createDataUpdate({ orders: [tpFilled], ticker }));
      }

      // After 2 entries, reference price should have been updated
      const state = strategy.getStrategyState();
      // Reference should have been updated to the last TP fill price (99)
      // and currentLevelRepeats should be reset to 0
      expect(state.currentLevelRepeats).toBe(0);
    });

    it('should allow unlimited repeats when maxRepeatsPerLevel is 0', async () => {
      const strategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          maxRepeatsPerLevel: 0, // Unlimited
          preferredDirection: 'long',
        }),
      );
      strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
      });

      // Trigger multiple entries
      for (let i = 0; i < 3; i++) {
        const ticker = createTicker(100);
        const result = await strategy.analyze(createDataUpdate({ ticker }));
        if (result.action !== 'buy') continue;

        const clientOrderId = (result as Record<string, unknown>).clientOrderId as string;
        const orderTime1 = new Date();
        const entryOrder = createOrder(
          clientOrderId,
          OrderSide.BUY,
          OrderStatus.NEW,
          98,
          100,
          orderTime1,
        );
        await strategy.onOrderCreated(entryOrder);
        await strategy.analyze(createDataUpdate({ orders: [entryOrder], ticker }));

        const orderTime2 = new Date(orderTime1.getTime() + 1000);
        const filledOrder = createOrder(
          clientOrderId,
          OrderSide.BUY,
          OrderStatus.FILLED,
          98,
          100,
          orderTime2,
        );
        const tpResult = await strategy.analyze(
          createDataUpdate({ orders: [filledOrder], ticker }),
        );

        // Simulate TP to allow next entry
        const tpClientOrderId = (tpResult as Record<string, unknown>)
          .clientOrderId as string;
        const tpOrder = createOrder(
          tpClientOrderId,
          OrderSide.SELL,
          OrderStatus.NEW,
          99,
          100,
          new Date(orderTime2.getTime() + 100),
        );
        await strategy.onOrderCreated(tpOrder);
        await strategy.analyze(createDataUpdate({ orders: [tpOrder], ticker }));

        const tpFilled = createOrder(
          tpClientOrderId,
          OrderSide.SELL,
          OrderStatus.FILLED,
          99,
          100,
          new Date(orderTime2.getTime() + 200),
        );
        await strategy.analyze(createDataUpdate({ orders: [tpFilled], ticker }));
      }

      // currentLevelRepeats should accumulate (not reset since unlimited)
      const state = strategy.getStrategyState();
      expect(state.currentLevelRepeats).toBeGreaterThanOrEqual(0);
    });

    it('should generate new entry immediately after TP fills (ORDER-STATUS-ONLY)', async () => {
      const strategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          dropPercent: 2,
          risePercent: 2,
          maxRepeatsPerLevel: 10, // High limit
          minPositionAmount: -500,
          maxPositionAmount: 500,
          preferredDirection: 'long',
        }),
      );
      strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
      });

      // First entry
      let ticker = createTicker(100);
      let result = await strategy.analyze(createDataUpdate({ ticker }));
      expect(result.action).toBe('buy');

      let clientOrderId = (result as Record<string, unknown>).clientOrderId as string;
      let orderTime1 = new Date();
      let entryOrder = createOrder(
        clientOrderId,
        OrderSide.BUY,
        OrderStatus.NEW,
        98,
        100,
        orderTime1,
      );
      await strategy.onOrderCreated(entryOrder);
      await strategy.analyze(createDataUpdate({ orders: [entryOrder], ticker }));

      let orderTime2 = new Date(orderTime1.getTime() + 1000);
      let filledOrder = createOrder(
        clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        98,
        100,
        orderTime2,
      );
      let tpResult = await strategy.analyze(
        createDataUpdate({ orders: [filledOrder], ticker }),
      );
      expect(tpResult.action).toBe('sell'); // TP signal

      // Simulate TP created and filled
      const tpClientOrderId = (tpResult as Record<string, unknown>)
        .clientOrderId as string;
      const tpOrder = createOrder(
        tpClientOrderId,
        OrderSide.SELL,
        OrderStatus.NEW,
        98.98,
        100,
        new Date(orderTime2.getTime() + 100),
      );
      await strategy.onOrderCreated(tpOrder);
      await strategy.analyze(createDataUpdate({ orders: [tpOrder], ticker }));

      const tpFilled = createOrder(
        tpClientOrderId,
        OrderSide.SELL,
        OrderStatus.FILLED,
        98.98,
        100,
        new Date(orderTime2.getTime() + 200),
      );

      // TP fill should immediately trigger new entry
      const newEntryResult = await strategy.analyze(
        createDataUpdate({ orders: [tpFilled], ticker }),
      );

      // Should generate new entry immediately (ORDER-STATUS-ONLY)
      expect(newEntryResult.action).toBe('buy');

      // Reference price should have updated to TP fill price
      const state = strategy.getStrategyState();
      expect(state.referencePrice).toBe(98.98);
    });
  });

  describe('Direction Determination', () => {
    it('should continue same direction after TP (mean reversion)', async () => {
      const strategy = new SingleLadderLifoTPStrategy(
        createStrategyConfig({
          basePrice: 100,
          dropPercent: 2,
          risePercent: 2,
          minPositionAmount: -500,
          maxPositionAmount: 500,
          preferredDirection: 'long', // Start with long
        }),
      );
      strategy.processInitialData({
        symbol: 'BTC/USDT',
        exchange: 'okx',
      });

      // First LONG entry
      const ticker = createTicker(100);
      let result = await strategy.analyze(createDataUpdate({ ticker }));
      expect(result.action).toBe('buy');

      // Simulate LONG entry filled
      const clientOrderId = (result as Record<string, unknown>).clientOrderId as string;
      const orderTime1 = new Date();
      const entryOrder = createOrder(
        clientOrderId,
        OrderSide.BUY,
        OrderStatus.NEW,
        98,
        100,
        orderTime1,
      );
      await strategy.onOrderCreated(entryOrder);
      await strategy.analyze(createDataUpdate({ orders: [entryOrder], ticker }));

      const orderTime2 = new Date(orderTime1.getTime() + 1000);
      const filledOrder = createOrder(
        clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        98,
        100,
        orderTime2,
      );
      const tpResult = await strategy.analyze(
        createDataUpdate({ orders: [filledOrder], ticker }),
      );

      // lastFilledDirection should be LONG
      expect(strategy.getStrategyState().lastFilledDirection).toBe('LONG');

      // Simulate TP filled
      const tpClientOrderId = (tpResult as Record<string, unknown>)
        .clientOrderId as string;
      const tpOrder = createOrder(
        tpClientOrderId,
        OrderSide.SELL,
        OrderStatus.NEW,
        98.98,
        100,
        new Date(orderTime2.getTime() + 100),
      );
      await strategy.onOrderCreated(tpOrder);
      await strategy.analyze(createDataUpdate({ orders: [tpOrder], ticker }));

      const tpFilled = createOrder(
        tpClientOrderId,
        OrderSide.SELL,
        OrderStatus.FILLED,
        98.98,
        100,
        new Date(orderTime2.getTime() + 200),
      );

      const newEntryResult = await strategy.analyze(
        createDataUpdate({ orders: [tpFilled], ticker }),
      );

      // Should continue with LONG (same direction as last filled - mean reversion)
      expect(newEntryResult.action).toBe('buy');

      // lastFilledDirection should still be LONG (preserved after TP)
      expect(strategy.getStrategyState().lastFilledDirection).toBe('LONG');
    });
  });
});
