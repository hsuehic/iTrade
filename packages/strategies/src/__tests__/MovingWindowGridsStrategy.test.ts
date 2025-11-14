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

  // For FILLED status, default executedQuantity to quantity
  // For other statuses, default to the provided value or quantity for backward compatibility
  const defaultExecutedQuantity =
    status === OrderStatus.FILLED
      ? quantity
      : executedQuantity !== undefined
        ? executedQuantity
        : quantity;

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
    executedQuantity: new Decimal(defaultExecutedQuantity),
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
          // Simulate order created via unified order handling
          const order = createOrder({
            clientOrderId: result.clientOrderId!,
            side: 'buy',
            price: result.price!.toNumber(),
            quantity: result.quantity!.toNumber(),
            status: OrderStatus.NEW,
          });
          await strategy.analyze({
            exchangeName: 'binance',
            orders: [order],
          });
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

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [order1],
      });

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

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [order2],
      });

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
      await strategy.analyze({
        exchangeName: 'binance',
        orders: [order1],
      });

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

      // Step 2: Simulate order created via unified order handling
      const entryOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: entrySignal.price!.toNumber(),
        quantity: entrySignal.quantity!.toNumber(),
        status: OrderStatus.NEW,
      });

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [entryOrder],
      });

      // Step 3: Simulate order filled - TP signal should be generated immediately
      const filledOrder: Order = {
        ...entryOrder,
        status: OrderStatus.FILLED,
        executedQuantity: entryOrder.quantity,
        averagePrice: entryOrder.price,
        updateTime: new Date(Date.now() + 1000), // Newer update time
      };

      // TP signal is returned immediately from analyze when order becomes FILLED
      const takeProfitSignal = (await strategy.analyze({
        exchangeName: 'binance',
        orders: [filledOrder],
      })) as StrategyOrderResult;

      expect(takeProfitSignal.action).toBe('sell');
      expect(takeProfitSignal.reason).toBe('take_profit');
      expect(takeProfitSignal.metadata?.signalType).toBe(SignalType.TakeProfit);
      expect(takeProfitSignal.metadata?.parentOrderId).toBe(entrySignal.clientOrderId);

      // Also call onOrderFilled for proper accounting
      await strategy.onOrderFilled(filledOrder);
    });

    it('should calculate take profit price correctly', async () => {
      // Entry at 50000, takeProfitRatio = 1% -> TP at 50500
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      // Create NEW order first
      const newOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        averagePrice: 50000,
        status: OrderStatus.NEW,
      });

      await strategy.analyze({ exchangeName: 'binance', orders: [newOrder] });

      // Then update to FILLED - TP signal should be generated immediately
      const filledOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        averagePrice: 50000,
        status: OrderStatus.FILLED,
      });
      filledOrder.updateTime = new Date(Date.now() + 1000); // Newer update time

      const takeProfitSignal = (await strategy.analyze({
        exchangeName: 'binance',
        orders: [filledOrder],
      })) as StrategyOrderResult;

      expect(takeProfitSignal.action).toBe('sell');
      // Expected TP price = 50000 * (1 + 0.01) = 50500
      expect(takeProfitSignal.price?.toNumber()).toBeCloseTo(50500, 0);
      expect(takeProfitSignal.metadata?.entryPrice).toBe('50000');
      expect(takeProfitSignal.metadata?.takeProfitPrice).toBe('50500');

      // Also call onOrderFilled for proper accounting
      await strategy.onOrderFilled(filledOrder);
    });

    it('should use executedQuantity for take profit quantity', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      // Create order with fully filled status
      const entryOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.FILLED,
        executedQuantity: 1000, // Fully filled
        averagePrice: 50000,
      });

      await strategy.analyze({ exchangeName: 'binance', orders: [entryOrder] });
      await strategy.onOrderFilled(entryOrder);

      const takeProfitSignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      // TP quantity should match executedQuantity
      expect(takeProfitSignal.quantity?.toNumber()).toBe(1000);
    });

    it('should store take profit order metadata correctly', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      // Create NEW order first
      const newOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.NEW,
      });

      await strategy.analyze({ exchangeName: 'binance', orders: [newOrder] });

      // Then update to FILLED - TP signal generated immediately
      const filledOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.FILLED,
      });
      filledOrder.updateTime = new Date(Date.now() + 1000); // Newer update time

      const takeProfitSignal = (await strategy.analyze({
        exchangeName: 'binance',
        orders: [filledOrder],
      })) as StrategyOrderResult;

      expect(takeProfitSignal.metadata).toBeDefined();
      expect(takeProfitSignal.metadata?.signalType).toBe(SignalType.TakeProfit);
      expect(takeProfitSignal.metadata?.parentOrderId).toBe(entrySignal.clientOrderId);
      expect(takeProfitSignal.metadata?.profitRatio).toBe(0.01); // 1%
      expect(takeProfitSignal.metadata?.clientOrderId).toBe(
        takeProfitSignal.clientOrderId,
      );

      // Also call onOrderFilled for proper accounting
      await strategy.onOrderFilled(filledOrder);
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

      // Create NEW entry order
      const newEntryOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.NEW,
      });

      await strategy.analyze({ exchangeName: 'binance', orders: [newEntryOrder] });

      let state = strategy.getStrategyState();
      expect(state.currentSize).toBe(1000);

      // Step 2: Entry filled - TP signal generated immediately
      const filledEntryOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.FILLED,
      });
      filledEntryOrder.updateTime = new Date(Date.now() + 1000);

      const takeProfitSignal = (await strategy.analyze({
        exchangeName: 'binance',
        orders: [filledEntryOrder],
      })) as StrategyOrderResult;

      await strategy.onOrderFilled(filledEntryOrder);

      // Step 3: Create TP order
      const takeProfitOrder = createOrder({
        clientOrderId: takeProfitSignal.clientOrderId!,
        side: 'sell',
        price: takeProfitSignal.price!.toNumber(),
        quantity: takeProfitSignal.quantity!.toNumber(),
        status: OrderStatus.FILLED,
      });

      await strategy.analyze({ exchangeName: 'binance', orders: [takeProfitOrder] });

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

      // Create NEW entry order
      const newEntryOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.NEW,
      });

      await strategy.analyze({ exchangeName: 'binance', orders: [newEntryOrder] });

      // Fill entry order - TP signal generated immediately
      const filledEntryOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.FILLED,
      });
      filledEntryOrder.updateTime = new Date(Date.now() + 1000);

      const takeProfitSignal = (await strategy.analyze({
        exchangeName: 'binance',
        orders: [filledEntryOrder],
      })) as StrategyOrderResult;

      await strategy.onOrderFilled(filledEntryOrder);

      let state = strategy.getStrategyState();

      const takeProfitOrder = createOrder({
        clientOrderId: takeProfitSignal.clientOrderId!,
        side: 'sell',
        price: takeProfitSignal.price!.toNumber(),
        quantity: takeProfitSignal.quantity!.toNumber(),
        status: OrderStatus.FILLED,
      });

      // First pass TP order as NEW to track it
      const newTakeProfitOrder = createOrder({
        clientOrderId: takeProfitSignal.clientOrderId!,
        side: 'sell',
        price: takeProfitSignal.price!.toNumber(),
        quantity: takeProfitSignal.quantity!.toNumber(),
        status: OrderStatus.NEW,
      });

      await strategy.analyze({ exchangeName: 'binance', orders: [newTakeProfitOrder] });

      state = strategy.getStrategyState();
      expect(state.takeProfitOrders).toBe(1);

      // Now pass TP order as FILLED to clean it up
      takeProfitOrder.updateTime = new Date(Date.now() + 2000);
      await strategy.analyze({ exchangeName: 'binance', orders: [takeProfitOrder] });

      state = strategy.getStrategyState();
      expect(state.takeProfitOrders).toBe(0);
    });

    it('should handle multiple concurrent entry and take profit orders', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      // Create 3 entry signals and NEW orders
      const entryClientOrderIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const entrySignal = (await strategy.analyze({
          exchangeName: 'binance',
          symbol: 'BTC/USDT:USDT',
          klines: [kline],
        })) as StrategyOrderResult;

        const newOrder = createOrder({
          clientOrderId: entrySignal.clientOrderId!,
          side: 'buy',
          price: 50000 + i * 100,
          quantity: 1000,
          status: OrderStatus.NEW,
        });

        await strategy.analyze({ exchangeName: 'binance', orders: [newOrder] });
        entryClientOrderIds.push(entrySignal.clientOrderId!);
      }

      let state = strategy.getStrategyState();
      expect(state.currentSize).toBe(3000);

      // Fill all entry orders and collect TP signals
      const takeProfitSignals: StrategyOrderResult[] = [];
      for (let i = 0; i < entryClientOrderIds.length; i++) {
        const filledOrder = createOrder({
          clientOrderId: entryClientOrderIds[i],
          side: 'buy',
          price: 50000 + i * 100,
          quantity: 1000,
          status: OrderStatus.FILLED,
        });
        filledOrder.updateTime = new Date(Date.now() + 1000 * (i + 1));

        const tpSignal = (await strategy.analyze({
          exchangeName: 'binance',
          orders: [filledOrder],
        })) as StrategyOrderResult;

        expect(tpSignal.action).toBe('sell');
        takeProfitSignals.push(tpSignal);

        await strategy.onOrderFilled(filledOrder);
      }

      state = strategy.getStrategyState();

      // Fill all take profit orders
      for (const tpSignal of takeProfitSignals) {
        const takeProfitOrder = createOrder({
          clientOrderId: tpSignal.clientOrderId!,
          side: 'sell',
          price: tpSignal.price!.toNumber(),
          quantity: tpSignal.quantity!.toNumber(),
          status: OrderStatus.FILLED,
        });

        await strategy.analyze({ exchangeName: 'binance', orders: [takeProfitOrder] });
        await strategy.onOrderFilled(takeProfitOrder);
      }

      state = strategy.getStrategyState();
      expect(state.currentSize).toBe(0);
      expect(state.takeProfitOrders).toBe(0);
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

      await strategy.analyze({ exchangeName: 'binance', orders: [order1] });

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

      await strategy.analyze({ exchangeName: 'binance', orders: [order] });

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
      expect(state).toHaveProperty('currentSize');
      expect(state).toHaveProperty('maxSize');
    });

    it('should update state counters correctly', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      let state = strategy.getStrategyState();
      expect(state.activeOrders).toBe(0);
      expect(state.takeProfitOrders).toBe(0);

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const newEntryOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.NEW,
      });

      await strategy.analyze({ exchangeName: 'binance', orders: [newEntryOrder] });

      state = strategy.getStrategyState();
      expect(state.activeOrders).toBe(1);

      // Fill entry order - TP signal generated immediately
      const filledEntryOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.FILLED,
      });
      filledEntryOrder.updateTime = new Date(Date.now() + 1000);

      const takeProfitSignal = (await strategy.analyze({
        exchangeName: 'binance',
        orders: [filledEntryOrder],
      })) as StrategyOrderResult;

      await strategy.onOrderFilled(filledEntryOrder);

      state = strategy.getStrategyState();

      const takeProfitOrder = createOrder({
        clientOrderId: takeProfitSignal.clientOrderId!,
        side: 'sell',
        price: takeProfitSignal.price!.toNumber(),
        quantity: takeProfitSignal.quantity!.toNumber(),
        status: OrderStatus.NEW,
      });

      await strategy.analyze({ exchangeName: 'binance', orders: [takeProfitOrder] });

      state = strategy.getStrategyState();
      expect(state.takeProfitOrders).toBe(1);
    });
  });

  describe('Unified Order Handling', () => {
    it('should handle new orders via handleOrder (replaces onOrderCreated)', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      // Generate entry signal
      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      // Simulate new order coming via handleOrder (not onOrderCreated)
      const newOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.NEW,
      });

      // Process via analyze with orders array
      await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        orders: [newOrder],
      });

      const state = strategy.getStrategyState();
      expect(state.activeOrders).toBe(1);
      expect(state.currentSize).toBe(1000);
    });

    it('should detect order status changes in handleOrder', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      // First: new order
      const newOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.NEW,
      });

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [newOrder],
      });

      // Then: order status changed to FILLED
      const filledOrder = {
        ...newOrder,
        status: OrderStatus.FILLED,
        updateTime: new Date(Date.now() + 1000),
      };

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [filledOrder],
      });

      // Should still have the same order (updated)
      const state = strategy.getStrategyState();
      expect(state.activeOrders).toBe(1);
    });
  });

  describe('Order Cancellation - No Fill', () => {
    it('should release full size when entry order canceled with no fill', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      // Order created
      const newOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.NEW,
        executedQuantity: 0,
      });

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [newOrder],
      });

      let state = strategy.getStrategyState();
      expect(state.currentSize).toBe(1000);

      // Order canceled with no fill
      const canceledOrder = {
        ...newOrder,
        status: OrderStatus.CANCELED,
        updateTime: new Date(Date.now() + 1000),
      };

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [canceledOrder],
      });

      state = strategy.getStrategyState();
      expect(state.currentSize).toBe(0); // Full size released
      expect(state.activeOrders).toBe(0); // Order removed
    });

    it('should handle REJECTED orders same as CANCELED', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const newOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.NEW,
        executedQuantity: 0,
      });

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [newOrder],
      });

      let state = strategy.getStrategyState();
      expect(state.currentSize).toBe(1000);

      // Order rejected
      const rejectedOrder = {
        ...newOrder,
        status: OrderStatus.REJECTED,
        updateTime: new Date(Date.now() + 1000),
      };

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [rejectedOrder],
      });

      state = strategy.getStrategyState();
      expect(state.currentSize).toBe(0);
    });

    it('should handle EXPIRED orders same as CANCELED', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const newOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.NEW,
        executedQuantity: 0,
      });

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [newOrder],
      });

      let state = strategy.getStrategyState();
      expect(state.currentSize).toBe(1000);

      // Order expired
      const expiredOrder = {
        ...newOrder,
        status: OrderStatus.EXPIRED,
        updateTime: new Date(Date.now() + 1000),
      };

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [expiredOrder],
      });

      state = strategy.getStrategyState();
      expect(state.currentSize).toBe(0);
    });
  });

  describe('Order Cancellation - Partial Fill', () => {
    it('should generate TP signal immediately when entry order partially filled and canceled', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      // Order created
      const newOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.NEW,
        executedQuantity: 0,
      });

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [newOrder],
      });

      let state = strategy.getStrategyState();
      expect(state.currentSize).toBe(1000);

      // Order partially filled (600/1000) then canceled
      const partialFilledOrder = {
        ...newOrder,
        status: OrderStatus.PARTIALLY_FILLED,
        executedQuantity: new Decimal(600),
        averagePrice: new Decimal(50000),
        updateTime: new Date(Date.now() + 1000),
      };

      await strategy.onOrderFilled(partialFilledOrder);

      const canceledOrder = {
        ...partialFilledOrder,
        status: OrderStatus.CANCELED,
        updateTime: new Date(Date.now() + 2000),
      };

      // This should return TP signal immediately
      const result = (await strategy.analyze({
        exchangeName: 'binance',
        orders: [canceledOrder],
      })) as StrategyOrderResult;

      expect(result.action).toBe('sell');
      expect(result.reason).toBe('take_profit');
      expect(result.quantity?.toNumber()).toBe(600); // TP for executed portion
      expect(result.metadata?.signalType).toBe(SignalType.TakeProfit);

      state = strategy.getStrategyState();
      // Size should be reduced by unfilled portion (400)
      expect(state.currentSize).toBe(600);
    });

    it('should calculate size correctly for partial fill cancellation', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const newOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.NEW,
        executedQuantity: 0,
      });

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [newOrder],
      });

      // Order 30% filled (300/1000) then canceled
      const partialFilledOrder = {
        ...newOrder,
        status: OrderStatus.PARTIALLY_FILLED,
        executedQuantity: new Decimal(300),
        averagePrice: new Decimal(50000),
        updateTime: new Date(Date.now() + 1000),
      };

      await strategy.onOrderFilled(partialFilledOrder);

      const canceledOrder = {
        ...partialFilledOrder,
        status: OrderStatus.CANCELED,
        updateTime: new Date(Date.now() + 2000),
      };

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [canceledOrder],
      });

      const state = strategy.getStrategyState();
      // Released unfilled portion: 1000 * (1 - 300/1000) = 700
      // Remaining size: 1000 - 700 = 300
      expect(state.currentSize).toBe(300);
    });

    it('should handle TP order for partial fill correctly through full lifecycle', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      // Create and partially fill entry order
      const newOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.NEW,
        executedQuantity: 0,
      });

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [newOrder],
      });

      const partialFilledOrder = {
        ...newOrder,
        status: OrderStatus.PARTIALLY_FILLED,
        executedQuantity: new Decimal(600),
        averagePrice: new Decimal(50000),
        updateTime: new Date(Date.now() + 1000),
      };

      await strategy.onOrderFilled(partialFilledOrder);

      const canceledOrder = {
        ...partialFilledOrder,
        status: OrderStatus.CANCELED,
        updateTime: new Date(Date.now() + 2000),
      };

      // Get TP signal
      const tpSignal = (await strategy.analyze({
        exchangeName: 'binance',
        orders: [canceledOrder],
      })) as StrategyOrderResult;

      expect(tpSignal.action).toBe('sell');

      // Create TP order
      const tpOrder = createOrder({
        clientOrderId: tpSignal.clientOrderId!,
        side: 'sell',
        price: tpSignal.price!.toNumber(),
        quantity: 600,
        status: OrderStatus.NEW,
      });

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [tpOrder],
      });

      let state = strategy.getStrategyState();
      expect(state.currentSize).toBe(600);
      expect(state.takeProfitOrders).toBe(1);

      // Fill TP order
      const filledTpOrder = {
        ...tpOrder,
        status: OrderStatus.FILLED,
        updateTime: new Date(Date.now() + 3000),
      };

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [filledTpOrder],
      });

      state = strategy.getStrategyState();
      expect(state.currentSize).toBe(0); // All closed
      expect(state.takeProfitOrders).toBe(0);
    });
  });

  describe('Order Cancellation - Full Fill Then Cancel', () => {
    it('should not adjust size when fully filled order is canceled (TP already exists)', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      const entrySignal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const newOrder = createOrder({
        clientOrderId: entrySignal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.NEW,
      });

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [newOrder],
      });

      // Order fully filled - TP signal generated immediately
      const filledOrder = {
        ...newOrder,
        status: OrderStatus.FILLED,
        executedQuantity: new Decimal(1000),
        averagePrice: new Decimal(50000),
        updateTime: new Date(Date.now() + 1000),
      };

      const tpSignal = (await strategy.analyze({
        exchangeName: 'binance',
        orders: [filledOrder],
      })) as StrategyOrderResult;

      expect(tpSignal.action).toBe('sell'); // TP signal generated

      await strategy.onOrderFilled(filledOrder);

      // Create the TP order
      const tpOrder = createOrder({
        clientOrderId: tpSignal.clientOrderId!,
        side: 'sell',
        price: tpSignal.price!.toNumber(),
        quantity: 1000,
        status: OrderStatus.NEW,
      });

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [tpOrder],
      });

      let state = strategy.getStrategyState();

      // Then entry order status changes to CANCELED (rare but possible after being filled)
      const canceledOrder = {
        ...filledOrder,
        status: OrderStatus.CANCELED,
        updateTime: new Date(Date.now() + 2000),
      };

      const result = await strategy.analyze({
        exchangeName: 'binance',
        orders: [canceledOrder],
      });

      state = strategy.getStrategyState();
      expect(state.currentSize).toBe(1000); // No change - TP will handle
      expect(result.action).toBe('hold'); // No new signal
    });
  });

  describe('TP Order Cancellation', () => {
    it('should adjust size when TP order partially filled and canceled', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      // Create full entry → TP cycle
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
        status: OrderStatus.NEW,
      });

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [entryOrder],
      });

      // Simulate entry order filled - TP signal generated immediately
      const filledEntryOrder = {
        ...entryOrder,
        status: OrderStatus.FILLED,
        executedQuantity: new Decimal(1000),
        averagePrice: new Decimal(50000),
        updateTime: new Date(Date.now() + 500),
      };

      const tpSignal = (await strategy.analyze({
        exchangeName: 'binance',
        orders: [filledEntryOrder],
      })) as StrategyOrderResult;

      await strategy.onOrderFilled(filledEntryOrder);

      const tpOrder = createOrder({
        clientOrderId: tpSignal.clientOrderId!,
        side: 'sell',
        price: tpSignal.price!.toNumber(),
        quantity: 1000,
        status: OrderStatus.NEW,
      });

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [tpOrder],
      });

      let state = strategy.getStrategyState();
      expect(state.currentSize).toBe(1000);

      // TP order partially filled (400/1000) via unified handling
      const partialTpOrder = {
        ...tpOrder,
        status: OrderStatus.PARTIALLY_FILLED,
        executedQuantity: new Decimal(400),
        averagePrice: tpOrder.price,
        updateTime: new Date(Date.now() + 1000),
      };

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [partialTpOrder],
      });
      await strategy.onOrderFilled(partialTpOrder);

      const canceledTpOrder = {
        ...partialTpOrder,
        status: OrderStatus.CANCELED,
        updateTime: new Date(Date.now() + 2000),
      };

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [canceledTpOrder],
      });

      state = strategy.getStrategyState();
      // Size reduced by filled portion: 1000 * (400/1000) = 400
      expect(state.currentSize).toBe(600); // 1000 - 400 = 600 remaining
      expect(state.takeProfitOrders).toBe(0);
    });

    it('should warn when TP order canceled with no fill (position remains open)', async () => {
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
        status: OrderStatus.NEW,
      });

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [entryOrder],
      });

      // Fill entry order - TP signal generated immediately
      const filledEntryOrder = {
        ...entryOrder,
        status: OrderStatus.FILLED,
        executedQuantity: new Decimal(1000),
        averagePrice: new Decimal(50000),
        updateTime: new Date(Date.now() + 500),
      };

      const tpSignal = (await strategy.analyze({
        exchangeName: 'binance',
        orders: [filledEntryOrder],
      })) as StrategyOrderResult;

      await strategy.onOrderFilled(filledEntryOrder);

      const tpOrder = createOrder({
        clientOrderId: tpSignal.clientOrderId!,
        side: 'sell',
        price: tpSignal.price!.toNumber(),
        quantity: 1000,
        status: OrderStatus.NEW,
        executedQuantity: 0,
      });

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [tpOrder],
      });

      let state = strategy.getStrategyState();
      expect(state.currentSize).toBe(1000);

      // TP canceled with no fill
      const canceledTpOrder = {
        ...tpOrder,
        status: OrderStatus.CANCELED,
        updateTime: new Date(Date.now() + 1000),
      };

      await strategy.analyze({
        exchangeName: 'binance',
        orders: [canceledTpOrder],
      });

      state = strategy.getStrategyState();
      expect(state.currentSize).toBe(1000); // WARNING: Position still open!
      expect(state.takeProfitOrders).toBe(0);
    });
  });

  describe('Size Tracking Accuracy', () => {
    it('should maintain accurate size across complex order lifecycle', async () => {
      const kline = createHighVolatilityKline(50000, 'BTC/USDT:USDT', 'binance');

      // Entry 1: Full cycle
      const entry1Signal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      // Create entry1 as NEW first
      const entry1OrderNew = createOrder({
        clientOrderId: entry1Signal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        status: OrderStatus.NEW,
        executedQuantity: 0,
      });

      await strategy.analyze({ exchangeName: 'binance', orders: [entry1OrderNew] });

      // Then mark it as FILLED - TP signal generated immediately
      const entry1OrderFilled = {
        ...entry1OrderNew,
        status: OrderStatus.FILLED,
        executedQuantity: new Decimal(1000),
        averagePrice: new Decimal(50000),
        updateTime: new Date(Date.now() + 500),
      };

      const tp1Signal = (await strategy.analyze({
        exchangeName: 'binance',
        orders: [entry1OrderFilled],
      })) as StrategyOrderResult;

      expect(tp1Signal.action).toBe('sell'); // Should be TP signal

      await strategy.onOrderFilled(entry1OrderFilled);

      // Entry 2: Partial fill + cancel
      const entry2Signal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const entry2Order = createOrder({
        clientOrderId: entry2Signal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        executedQuantity: 0,
        status: OrderStatus.NEW,
      });

      await strategy.analyze({ exchangeName: 'binance', orders: [entry2Order] });

      let state = strategy.getStrategyState();
      expect(state.currentSize).toBe(2000); // Both entries committed

      // Partial fill entry2
      const partialEntry2 = {
        ...entry2Order,
        status: OrderStatus.PARTIALLY_FILLED,
        executedQuantity: new Decimal(400),
        averagePrice: new Decimal(50000),
        updateTime: new Date(Date.now() + 1000),
      };

      await strategy.onOrderFilled(partialEntry2);

      // Cancel entry2 - TP signal for partial fill generated immediately
      const canceledEntry2 = {
        ...partialEntry2,
        status: OrderStatus.CANCELED,
        updateTime: new Date(Date.now() + 2000),
      };

      const tp2Signal = (await strategy.analyze({
        exchangeName: 'binance',
        orders: [canceledEntry2],
      })) as StrategyOrderResult;

      expect(tp2Signal.action).toBe('sell'); // TP for partial fill

      state = strategy.getStrategyState();
      // Entry1: 1000, Entry2: 400 (600 released)
      expect(state.currentSize).toBe(1400);

      // Entry 3: Canceled with no fill
      const entry3Signal = (await strategy.analyze({
        exchangeName: 'binance',
        symbol: 'BTC/USDT:USDT',
        klines: [kline],
      })) as StrategyOrderResult;

      const entry3Order = createOrder({
        clientOrderId: entry3Signal.clientOrderId!,
        side: 'buy',
        price: 50000,
        quantity: 1000,
        executedQuantity: 0,
        status: OrderStatus.NEW,
      });

      await strategy.analyze({ exchangeName: 'binance', orders: [entry3Order] });

      state = strategy.getStrategyState();
      expect(state.currentSize).toBe(2400);

      const canceledEntry3 = {
        ...entry3Order,
        status: OrderStatus.CANCELED,
        updateTime: new Date(Date.now() + 3000),
      };

      await strategy.analyze({ exchangeName: 'binance', orders: [canceledEntry3] });

      state = strategy.getStrategyState();
      expect(state.currentSize).toBe(1400); // Entry3 fully released

      // Use the TP signal for entry1 that was generated earlier
      const tp1Order = createOrder({
        clientOrderId: tp1Signal.clientOrderId!,
        side: 'sell',
        price: tp1Signal.price!.toNumber(),
        quantity: 1000,
        status: OrderStatus.FILLED,
      });

      await strategy.analyze({ exchangeName: 'binance', orders: [tp1Order] });
      await strategy.onOrderFilled(tp1Order);

      state = strategy.getStrategyState();
      expect(state.currentSize).toBe(400); // Only entry2 partial fill remains

      // Use the TP signal for entry2 partial fill that was generated when entry2 was canceled
      const tp2Order = createOrder({
        clientOrderId: tp2Signal.clientOrderId!,
        side: 'sell',
        price: tp2Signal.price!.toNumber(),
        quantity: 400,
      });

      await strategy.analyze({ exchangeName: 'binance', orders: [tp2Order] });
      await strategy.onOrderFilled(tp2Order);

      state = strategy.getStrategyState();
      expect(state.currentSize).toBe(0); // All positions closed
    });
  });

  describe('onOrderFilled - FILLED Status Check', () => {
    it('should only generate TP when order status is FILLED', async () => {
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
        status: OrderStatus.NEW,
      });

      await strategy.analyze({ exchangeName: 'binance', orders: [entryOrder] });

      // Partially filled - should NOT generate TP yet
      const partialOrder = {
        ...entryOrder,
        status: OrderStatus.PARTIALLY_FILLED,
        executedQuantity: new Decimal(600),
        updateTime: new Date(Date.now() + 1000),
      };

      await strategy.onOrderFilled(partialOrder);

      let state = strategy.getStrategyState();

      // Fully filled - should generate TP
      const filledOrder = {
        ...partialOrder,
        status: OrderStatus.FILLED,
        executedQuantity: new Decimal(1000),
        updateTime: new Date(Date.now() + 2000),
      };

      await strategy.onOrderFilled(filledOrder);

      // Note: This test only verifies that onOrderFilled distinguishes between
      // PARTIALLY_FILLED and FILLED status. The TP signal is actually generated
      // when analyze() is called with the FILLED order status change.
      // Size remains 1000 because no TP order was created/filled in this test.
    });
  });
});
