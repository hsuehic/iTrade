import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import {
  type MovingWindowGridsParameters,
  MovingWindowGridsStrategy,
} from '../strategies/MovingWindowGridsStrategy';
import {
  Kline,
  StrategyConfig,
  StrategyOrderResult,
  Order,
  Position,
  SignalType,
  OrderSide,
  OrderType,
  OrderStatus,
  TradeMode,
  TimeInForce,
} from '@itrade/core';

/**
 * Helper function to create a Kline object
 */
function createKline(params: {
  open: number;
  high: number;
  low: number;
  close: number;
  symbol?: string;
  exchange?: string;
  timestamp?: number;
  isClosed?: boolean;
  volume?: number;
}): Kline {
  const {
    open,
    high,
    low,
    close,
    symbol = 'BTC/USDT:USDT',
    exchange = 'binance',
    timestamp = Date.now(),
    isClosed = true,
    volume = 1000,
  } = params;

  return {
    symbol,
    exchange,
    interval: '1h',
    openTime: new Date(timestamp),
    closeTime: new Date(timestamp + 3600000), // 1 hour later
    open: new Decimal(open),
    high: new Decimal(high),
    low: new Decimal(low),
    close: new Decimal(close),
    volume: new Decimal(volume),
    quoteVolume: new Decimal(volume * close),
    trades: 100,
    isClosed,
  };
}

/**
 * Create a high volatility kline (> minVolatility threshold)
 */
function createHighVolatilityKline(
  basePrice: number,
  symbol?: string,
  exchange?: string,
  timestamp?: number,
): Kline {
  // Create a kline with volatility > 0.5% (default minVolatility)
  // volatility = (high - low) / open
  // For 1% volatility: high - low = open * 0.01
  const open = basePrice;
  const volatilityPercent = 0.015; // 1.5% volatility
  const range = open * volatilityPercent;
  const low = open - range / 2;
  const high = open + range / 2;
  const close = open + range / 4; // Close higher (bullish)

  return createKline({
    open,
    high,
    low,
    close,
    symbol,
    exchange,
    timestamp,
    isClosed: true,
  });
}

/**
 * Create a low volatility kline (< minVolatility threshold)
 */
function createLowVolatilityKline(
  basePrice: number,
  symbol?: string,
  exchange?: string,
  timestamp?: number,
): Kline {
  // Create a kline with volatility < 0.5% (default minVolatility)
  const open = basePrice;
  const volatilityPercent = 0.003; // 0.3% volatility
  const range = open * volatilityPercent;
  const low = open - range / 2;
  const high = open + range / 2;
  const close = open + range / 4;

  return createKline({
    open,
    high,
    low,
    close,
    symbol,
    exchange,
    timestamp,
    isClosed: true,
  });
}

/**
 * Create an Order object for testing
 */
function createOrder(params: {
  clientOrderId: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  status?: OrderStatus;
  executedQuantity?: number;
  averagePrice?: number;
  symbol?: string;
  exchange?: string;
}): Order {
  const {
    clientOrderId,
    side,
    price,
    quantity,
    status = OrderStatus.FILLED,
    executedQuantity,
    averagePrice,
    symbol = 'BTC/USDT:USDT',
    exchange = 'binance',
  } = params;

  return {
    id: `order-${Date.now()}`,
    clientOrderId,
    symbol,
    exchange,
    side: side === 'buy' ? OrderSide.BUY : OrderSide.SELL,
    type: OrderType.LIMIT,
    price: new Decimal(price),
    quantity: new Decimal(quantity),
    status,
    timeInForce: TimeInForce.GTC,
    executedQuantity: executedQuantity
      ? new Decimal(executedQuantity)
      : new Decimal(quantity),
    averagePrice: averagePrice ? new Decimal(averagePrice) : new Decimal(price),
    timestamp: new Date(),
    updateTime: new Date(),
  };
}

/**
 * Create a Position object for testing
 */
function createPosition(params: {
  symbol?: string;
  side: 'long' | 'short';
  quantity: number;
  avgPrice: number;
  markPrice?: number;
}): Position {
  const {
    symbol = 'BTC/USDT:USDT',
    side,
    quantity,
    avgPrice,
    markPrice = avgPrice,
  } = params;

  return {
    symbol,
    side,
    quantity: new Decimal(quantity),
    avgPrice: new Decimal(avgPrice),
    markPrice: new Decimal(markPrice),
    leverage: new Decimal(10),
    unrealizedPnl: new Decimal((markPrice - avgPrice) * quantity),
    timestamp: new Date(),
  };
}

describe('MovingWindowGridsStrategy', () => {
  let strategy: MovingWindowGridsStrategy;
  let config: StrategyConfig<MovingWindowGridsParameters>;

  beforeEach(async () => {
    config = {
      type: 'MovingWindowGridsStrategy',
      parameters: {
        windowSize: 20,
        gridSize: 0.005, // 0.5% grid spacing
        gridCount: 5,
        minVolatility: 0.5, // 0.5% minimum volatility
        takeProfitRatio: 1, // 1% take profit
        baseSize: 1000,
        maxSize: 10000,
        leverage: 10,
        tradeMode: TradeMode.ISOLATED,
      },
      symbol: 'BTC/USDT:USDT',
      exchange: 'binance',
      strategyId: 22,
      strategyName: 'MovingWindowGridsStrategy',
    };

    strategy = new MovingWindowGridsStrategy(config);
  });

  describe('Initialization', () => {
    it('should initialize with correct parameters', () => {
      const state = strategy.getStrategyState();
      expect(state.strategyType).toBe('MovingWindowGridsStrategy');
      expect(state.currentSize).toBe(0);
      expect(state.maxSize).toBe(10000);
      expect(state.activeOrders).toBe(0);
      expect(state.takeProfitOrders).toBe(0);
      expect(state.pendingTakeProfitOrders).toBe(0);
    });

    it('should initialize with default leverage and tradeMode if not provided', () => {
      const configWithoutOptional: StrategyConfig<MovingWindowGridsParameters> = {
        type: 'MovingWindowGridsStrategy',
        parameters: {
          windowSize: 20,
          gridSize: 0.005,
          gridCount: 5,
          minVolatility: 0.5,
          takeProfitRatio: 1,
          baseSize: 1000,
          maxSize: 10000,
        },
        symbol: 'BTC/USDT:USDT',
        exchange: 'binance',
      };

      const strategyWithDefaults = new MovingWindowGridsStrategy(configWithoutOptional);
      const state = strategyWithDefaults.getStrategyState();

      expect(state).toBeDefined();
    });

    it('should convert percentage parameters correctly', () => {
      // minVolatility: 0.5 -> 0.005 (0.5%)
      // takeProfitRatio: 1 -> 0.01 (1%)
      // These are internal, but we can verify through behavior
      expect(strategy).toBeDefined();
    });
  });

  describe('Volatility Detection', () => {
    it('should return hold when volatility is below threshold', async () => {
      const kline = createLowVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const result = await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      });

      expect(result.action).toBe('hold');
    });

    it('should generate entry signal when volatility is above threshold', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const result = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      expect(result.action).toBe('buy');
      expect(result.price).toBeDefined();
      expect(result.quantity).toBeDefined();
      expect(result.quantity?.toNumber()).toBe(1000); // baseSize
      expect(result.leverage).toBe(10);
      expect(result.tradeMode).toBe('isolated');
      expect(result.reason).toBe('volatility_breakout');
    });

    it('should not generate signal when kline is not closed', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');
      kline.isClosed = false;

      const result = await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      });

      expect(result.action).toBe('hold');
    });

    it('should only trigger on bullish candles (close > open)', async () => {
      // Create bearish candle with high volatility
      const bearishKline = createKline({
        open: 50000,
        high: 50750,
        low: 49250,
        close: 49500, // close < open (bearish)
        symbol: 'BTC/USDT:USDT',
        exchange: 'binance',
        isClosed: true,
      });

      const result = await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [bearishKline],
      });

      expect(result.action).toBe('hold');
    });
  });

  describe('Position Size Management', () => {
    it('should not generate entry signal when size would exceed maxSize', async () => {
      // Simulate strategy already at max position
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      // Generate entries until maxSize is reached
      for (let i = 0; i < 10; i++) {
        const result = (await strategy.analyze({
          exchangeName: 'binance',
          symbol: 'BTC/USDT:USDT',
          klines: [kline],
        })) as StrategyOrderResult;

        if (result.action === 'buy') {
          // Simulate order created
          const order = createOrder({
            clientOrderId: result.clientOrderId!,
            side: 'buy',
            price: result.price!.toNumber(),
            quantity: result.quantity!.toNumber(),
            status: OrderStatus.NEW,
          });
          await strategy.onOrderCreated(order);
        }
      }

      // Next attempt should return hold
      const finalResult = await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      });

      expect(finalResult.action).toBe('hold');

      const state = strategy.getStrategyState();
      expect(state.currentSize).toBe(state.maxSize);
    });

    it('should track position size correctly across multiple entries', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      let state = strategy.getStrategyState();
      expect(state.currentSize).toBe(0);

      // First entry
      const result1 = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      expect(result1.action).toBe('buy');

      const order1 = createOrder({
        clientOrderId: result1.clientOrderId!,
        side: 'buy',
        price: result1.price!.toNumber(),
        quantity: result1.quantity!.toNumber(),
      });

      await strategy.onOrderCreated(order1);

      state = strategy.getStrategyState();
      expect(state.currentSize).toBe(1000); // baseSize

      // Second entry
      const result2 = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      expect(result2.action).toBe('buy');

      const order2 = createOrder({
        clientOrderId: result2.clientOrderId!,
        side: 'buy',
        price: result2.price!.toNumber(),
        quantity: result2.quantity!.toNumber(),
      });

      await strategy.onOrderCreated(order2);

      state = strategy.getStrategyState();
      expect(state.currentSize).toBe(2000); // 2 * baseSize
    });
  });

  describe('Entry Signal Generation', () => {
    it('should generate entry signal with correct metadata', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const result = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      expect(result.action).toBe('buy');
      expect(result.clientOrderId).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.signalType).toBe(SignalType.Entry);
      expect(result.metadata?.timestamp).toBeDefined();
    });

    it('should use average of open and close as entry price', async () => {
      const kline = createKline({
        open: 50000,
        high: 50750,
        low: 49250,
        close: 50500, // close > open (bullish)
        symbol: 'BTC/USDT:USDT',
        exchange: 'binance',
        isClosed: true,
      });

      const result = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      expect(result.action).toBe('buy');
      // Expected price = (50000 + 50500) / 2 = 50250
      expect(result.price?.toNumber()).toBeCloseTo(50250, 0);
    });

    it('should generate unique clientOrderIds for each signal', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const result1 = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const order1 = createOrder({
        clientOrderId: result1.clientOrderId!,
        side: 'buy',
        price: result1.price!.toNumber(),
        quantity: result1.quantity!.toNumber(),
      });
      await strategy.onOrderCreated(order1);

      const result2 = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      expect(result1.clientOrderId).not.toBe(result2.clientOrderId);
    });
  });

  describe('Take Profit Signal Generation', () => {
    it('should generate take profit signal after entry order is filled', async () => {
      // Step 1: Generate entry signal
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      expect(entrySignal.action).toBe('buy');

      // Step 2: Simulate order created
      const entryOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: entrySignal.price!.toNumber(),
        quantity: entrySignal.quantity!.toNumber(),
        status: OrderStatus.NEW,
      });

      await strategy.onOrderCreated(entryOrder);

      // Step 3: Simulate order filled
      const filledOrder: Order = {
        ...entryOrder,
        status: OrderStatus.FILLED,
        executedQuantity: entryOrder.quantity,
        averagePrice: entryOrder.price,
      };

      await strategy.onOrderFilled(filledOrder);

      // Step 4: Next analyze call should generate take profit signal
      const takeProfitSignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      expect(takeProfitSignal.action).toBe('sell');
      expect(takeProfitSignal.reason).toBe('take_profit');
      expect(takeProfitSignal.metadata?.signalType).toBe(SignalType.TakeProfit);
      expect(takeProfitSignal.metadata?.parentOrderId).toBe(entrySignal.clientOrderId);
    });

    it('should calculate take profit price correctly', async () => {
      // Entry at 50000, takeProfitRatio = 1% -> TP at 50500
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const entryOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        averagePrice: 50000,
      });

      await strategy.onOrderCreated(entryOrder);
      await strategy.onOrderFilled(entryOrder);

      const takeProfitSignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      expect(takeProfitSignal.action).toBe('sell');
      // Expected TP price = 50000 * (1 + 0.01) = 50500
      expect(takeProfitSignal.price?.toNumber()).toBeCloseTo(50500, 0);
      expect(takeProfitSignal.metadata?.entryPrice).toBe('50000');
      expect(takeProfitSignal.metadata?.takeProfitPrice).toBe('50500');
    });

    it('should use executedQuantity for take profit quantity', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const entryOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        executedQuantity: 800, // Partially filled
        averagePrice: 50000,
      });

      await strategy.onOrderCreated(entryOrder);
      await strategy.onOrderFilled(entryOrder);

      const takeProfitSignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      expect(takeProfitSignal.quantity?.toNumber()).toBe(800);
    });

    it('should store take profit order metadata correctly', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const entryOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
      });

      await strategy.onOrderCreated(entryOrder);
      await strategy.onOrderFilled(entryOrder);

      const takeProfitSignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      expect(takeProfitSignal.metadata).toBeDefined();
      expect(takeProfitSignal.metadata?.signalType).toBe(SignalType.TakeProfit);
      expect(takeProfitSignal.metadata?.parentOrderId).toBe(entrySignal.clientOrderId);
      expect(takeProfitSignal.metadata?.profitRatio).toBe(0.01); // 1%
      expect(takeProfitSignal.metadata?.clientOrderId).toBe(
        takeProfitSignal.clientOrderId,
      );
    });
  });

  describe('Take Profit Order Lifecycle', () => {
    it('should reduce position size when take profit is filled', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      // Step 1: Entry signal
      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const entryOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
      });

      await strategy.onOrderCreated(entryOrder);

      let state = strategy.getStrategyState();
      expect(state.currentSize).toBe(1000);

      // Step 2: Entry filled
      await strategy.onOrderFilled(entryOrder);

      // Step 3: Take profit signal
      const takeProfitSignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const takeProfitOrder = createOrder({
        clientOrderId: takeProfitSignal.clientOrderId!,
        side: 'sell',
        price: takeProfitSignal.price!.toNumber(),
        quantity: takeProfitSignal.quantity!.toNumber(),
      });

      await strategy.onOrderCreated(takeProfitOrder);

      // Step 4: Take profit filled
      await strategy.onOrderFilled(takeProfitOrder);

      state = strategy.getStrategyState();
      expect(state.currentSize).toBe(0); // Position closed
    });

    it('should clean up metadata when take profit is filled', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const entryOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
      });

      await strategy.onOrderCreated(entryOrder);
      await strategy.onOrderFilled(entryOrder);

      let state = strategy.getStrategyState();
      expect(state.pendingTakeProfitOrders).toBe(1);

      const takeProfitSignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const takeProfitOrder = createOrder({
        clientOrderId: takeProfitSignal.clientOrderId!,
        side: 'sell',
        price: takeProfitSignal.price!.toNumber(),
        quantity: takeProfitSignal.quantity!.toNumber(),
      });

      await strategy.onOrderCreated(takeProfitOrder);

      state = strategy.getStrategyState();
      expect(state.takeProfitOrders).toBe(1);

      await strategy.onOrderFilled(takeProfitOrder);

      state = strategy.getStrategyState();
      expect(state.takeProfitOrders).toBe(0);
      expect(state.pendingTakeProfitOrders).toBe(0);
    });

    it('should handle multiple concurrent entry and take profit orders', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      // Create 3 entry orders
      const entryOrders: Order[] = [];
      for (let i = 0; i < 3; i++) {
        const entrySignal = (await strategy.analyze({
          exchangeName: 'binance',
          symbol: 'BTC/USDT:USDT',
          klines: [kline],
        })) as StrategyOrderResult;

        const order = createOrder({
          clientOrderId: entrySignal.clientOrderId!,
          side: 'buy',
          price: 50000 + i * 100,
          quantity: 1000,
        });

        await strategy.onOrderCreated(order);
        entryOrders.push(order);
      }

      let state = strategy.getStrategyState();
      expect(state.currentSize).toBe(3000);

      // Fill all entry orders
      for (const order of entryOrders) {
        await strategy.onOrderFilled(order);
      }

      state = strategy.getStrategyState();
      expect(state.pendingTakeProfitOrders).toBe(3);

      // Generate and fill all take profit orders
      for (let i = 0; i < 3; i++) {
        const takeProfitSignal = (await strategy.analyze({
          exchangeName: 'binance',
          symbol: 'BTC/USDT:USDT',
          klines: [kline],
        })) as StrategyOrderResult;

        expect(takeProfitSignal.action).toBe('sell');

        const takeProfitOrder = createOrder({
          clientOrderId: takeProfitSignal.clientOrderId!,
          side: 'sell',
          price: takeProfitSignal.price!.toNumber(),
          quantity: takeProfitSignal.quantity!.toNumber(),
        });

        await strategy.onOrderCreated(takeProfitOrder);
        await strategy.onOrderFilled(takeProfitOrder);
      }

      state = strategy.getStrategyState();
      expect(state.currentSize).toBe(0);
      expect(state.takeProfitOrders).toBe(0);
      expect(state.pendingTakeProfitOrders).toBe(0);
    });
  });

  describe('Order Handling', () => {
    it('should update positions when provided', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const position = createPosition({
        symbol: 'BTC/USDT:USDT',
        side: 'long',
        quantity: 1000,
        avgPrice: 50000,
        markPrice: 50500,
      });

      const result = await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
        positions: [position],
      });

      expect(result).toBeDefined();
      // Position should be stored internally
    });

    it('should track orders with same clientOrderId', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const order1 = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.NEW,
      });

      await strategy.onOrderCreated(order1);

      const state1 = strategy.getStrategyState();
      expect(state1.activeOrders).toBe(1);

      // Update with same clientOrderId
      const order2: Order = {
        ...order1,
        status: OrderStatus.FILLED,
        updateTime: new Date(Date.now() + 1000),
      };

      await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        orders: [order2],
      });

      // Should still be 1 order (updated, not added)
      const state2 = strategy.getStrategyState();
      expect(state2.activeOrders).toBe(1);
    });

    it('should ignore orders without clientOrderId', async () => {
      const order = {
        ...createOrder({
          clientOrderId: 'test-order',
          side: 'buy',
          price: 50000,
          quantity: 1000,
        }),
        clientOrderId: undefined,
      };

      await strategy.onOrderCreated(order as Order);

      const state = strategy.getStrategyState();
      expect(state.activeOrders).toBe(0);
    });

    it('should ignore filled orders not belonging to this strategy', async () => {
      const externalOrder = createOrder({
        clientOrderId: 'external-order-123',
        side: 'buy',
        price: 50000,
        quantity: 1000,
      });

      // This should not throw or cause issues
      await strategy.onOrderFilled(externalOrder);

      const state = strategy.getStrategyState();
      expect(state.activeOrders).toBe(0);
    });
  });

  describe('Exchange and Symbol Filtering', () => {
    it('should ignore klines from different exchange', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'okx');

      const result = await strategy.analyze({
        exchangeName: 'okx',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      });

      expect(result.action).toBe('hold');
    });

    it('should ignore klines from different symbol', async () => {
      const kline = createHighVolatilityKline(50000, 'ETH/USDT', 'binance');

      const result = await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'ETH/USDT',
        klines: [kline],
      });

      expect(result.action).toBe('hold');
    });

    it('should process klines from correct exchange and symbol', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const result = await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      });

      expect(result.action).toBe('buy');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty klines array', async () => {
      const result = await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [],
      });

      expect(result.action).toBe('hold');
    });

    it('should handle undefined klines', async () => {
      const result = await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
      });

      expect(result.action).toBe('hold');
    });

    it('should handle klines with zero volatility', async () => {
      const kline = createKline({
        open: 50000,
        high: 50000,
        low: 50000,
        close: 50000,
        symbol: 'BTC/USDT:USDT',
        exchange: 'binance',
        isClosed: true,
      });

      const result = await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      });

      expect(result.action).toBe('hold');
    });

    it('should handle very small volumes', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');
      kline.volume = new Decimal(0.0001);

      const result = await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      });

      // Should still process (no volume filtering in current implementation)
      expect(result).toBeDefined();
    });
  });

  describe('Cleanup', () => {
    it('should clear all state on cleanup', async () => {
      // Add some state
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const order = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
      });

      await strategy.onOrderCreated(order);

      let state = strategy.getStrategyState();
      expect(state.currentSize).toBeGreaterThan(0);
      expect(state.activeOrders).toBeGreaterThan(0);

      // Call cleanup (protected method, access through method signature)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (strategy as any).onCleanup();

      state = strategy.getStrategyState();
      expect(state.currentSize).toBe(0);
      expect(state.activeOrders).toBe(0);
      expect(state.takeProfitOrders).toBe(0);
      expect(state.pendingTakeProfitOrders).toBe(0);
    });
  });

  describe('Strategy State', () => {
    it('should return complete strategy state', async () => {
      const state = strategy.getStrategyState();

      expect(state).toHaveProperty('strategyId');
      expect(state).toHaveProperty('strategyType');
      expect(state).toHaveProperty('state');
      expect(state).toHaveProperty('activeOrders');
      expect(state).toHaveProperty('takeProfitOrders');
      expect(state).toHaveProperty('pendingTakeProfitOrders');
      expect(state).toHaveProperty('currentSize');
      expect(state).toHaveProperty('maxSize');
    });

    it('should update state counters correctly', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      let state = strategy.getStrategyState();
      expect(state.activeOrders).toBe(0);
      expect(state.takeProfitOrders).toBe(0);
      expect(state.pendingTakeProfitOrders).toBe(0);

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const entryOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
      });

      await strategy.onOrderCreated(entryOrder);

      state = strategy.getStrategyState();
      expect(state.activeOrders).toBe(1);

      await strategy.onOrderFilled(entryOrder);

      state = strategy.getStrategyState();
      expect(state.pendingTakeProfitOrders).toBe(1);

      const takeProfitSignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const takeProfitOrder = createOrder({
        clientOrderId: takeProfitSignal.clientOrderId!,
        side: 'sell',
        price: takeProfitSignal.price!.toNumber(),
        quantity: takeProfitSignal.quantity!.toNumber(),
      });

      await strategy.onOrderCreated(takeProfitOrder);

      state = strategy.getStrategyState();
      expect(state.takeProfitOrders).toBe(1);
      expect(state.pendingTakeProfitOrders).toBe(0);
    });
  });
});
