import { EventEmitter } from 'events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Decimal from 'decimal.js';
import { TradingEngine } from '../TradingEngine';
import { EventBus } from '../../events';
import type {
  IExchange,
  IRiskManager,
  IPortfolioManager,
  ILogger,
  IStrategy,
} from '../../interfaces';
import {
  Order,
  OrderStatus,
  OrderSide,
  OrderType,
  TimeInForce,
  StrategyConfig,
  StrategyParameters,
  RiskLimits,
  createEmptyPerformance,
} from '../../types';

/**
 * Regression tests for the Strategy 609 oversell — engine side
 * (2026-09-23, `2026-09-WLD-L-9`, WLDUSDC perp → net position -15000).
 *
 *  - Fix 2: before placing a risk-reducing (reduceOnly) order, the engine
 *    reconciles against the exchange and cancels this strategy's own still-live
 *    orders on the same symbol+side, so a TP that lost its local reference can
 *    never sit in the book next to its replacement.
 *  - Fix 5: a failed cancel must never rewrite an already-executed order as
 *    REJECTED (that is how the second, genuinely filled TP ended up stored as
 *    REJECTED while keeping executedQuantity=15000).
 */

class TestExchange extends EventEmitter {
  name = 'mockExchange';
  isConnected = true;
  openOrders: Order[] = [];
  createOrderSpy = vi.fn();
  cancelOrderSpy = vi.fn();
  cancelOrderError: Error | null = null;

  async connect() {
    return;
  }
  async disconnect() {
    return;
  }
  async getOpenOrders(_symbol?: string) {
    return this.openOrders;
  }
  async getSymbolInfo(symbol: string) {
    return {
      symbol,
      nativeSymbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      minQuantity: new Decimal(0.001),
      maxQuantity: new Decimal(1_000_000),
      stepSize: new Decimal(0.001),
      tickSize: new Decimal(0.0001),
      minNotional: new Decimal(1),
      pricePrecision: 4,
      quantityPrecision: 3,
      status: 'active' as const,
      market: 'spot' as const,
    };
  }
  async getOrder(_symbol: string, orderId: string) {
    return { id: orderId, status: OrderStatus.NEW } as unknown as Order;
  }
  async createOrder(
    symbol: string,
    side: OrderSide,
    type: OrderType,
    quantity: Decimal,
    price?: Decimal,
    timeInForce?: TimeInForce,
    clientOrderId?: string,
    options?: Record<string, unknown>,
  ): Promise<Order> {
    this.createOrderSpy(
      symbol,
      side,
      type,
      quantity,
      price,
      timeInForce,
      clientOrderId,
      options,
    );
    return {
      id: `order-${clientOrderId ?? Date.now()}`,
      clientOrderId: clientOrderId ?? `client-${Date.now()}`,
      symbol,
      side,
      type,
      quantity,
      price,
      status: OrderStatus.NEW,
      timeInForce: timeInForce ?? TimeInForce.GTC,
      timestamp: new Date(),
      exchange: this.name,
    };
  }
  async cancelOrder(symbol: string, orderId: string, clientOrderId?: string) {
    this.cancelOrderSpy(symbol, orderId, clientOrderId);
    if (this.cancelOrderError) {
      throw this.cancelOrderError;
    }
    return {
      id: orderId,
      clientOrderId,
      symbol,
      side: OrderSide.SELL,
      type: OrderType.LIMIT,
      quantity: new Decimal(0),
      status: OrderStatus.CANCELED,
      timeInForce: TimeInForce.GTC,
      timestamp: new Date(),
      exchange: this.name,
    } as Order;
  }
}

class TestStrategy implements Partial<IStrategy> {
  strategyType = 'TestStrategy';
  config: StrategyConfig<StrategyParameters>;
  strategyName = 'test-strategy';

  constructor(strategyId = 1) {
    this.config = {
      type: this.strategyType,
      parameters: {},
      symbol: 'BTC/USDT',
      exchange: 'mockExchange',
      strategyId,
      strategyName: 'test-strategy',
      performance: createEmptyPerformance(
        'BTC/USDT',
        'mockExchange',
        strategyId,
        'test-strategy',
      ),
    };
  }

  async analyze() {
    return { action: 'hold' } as const;
  }
  getStrategyId() {
    return this.config.strategyId;
  }
}

function createLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    logTrade: vi.fn(),
    logStrategy: vi.fn(),
    logOrder: vi.fn(),
    logRisk: vi.fn(),
  } as unknown as ILogger;
}

function createOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    clientOrderId: `T1D1790172796407`,
    symbol: 'BTC/USDT',
    side: OrderSide.SELL,
    type: OrderType.LIMIT,
    quantity: new Decimal(15000),
    price: new Decimal(0.4202),
    status: OrderStatus.NEW,
    timeInForce: TimeInForce.GTC,
    timestamp: new Date(),
    updateTime: new Date(),
    exchange: 'mockExchange',
    strategyId: 1,
    ...overrides,
  };
}

describe('TradingEngine — Strategy 609 oversell guards', () => {
  let engine: TradingEngine;
  let exchange: TestExchange;
  let logger: ILogger;
  let eventBus: EventBus;

  beforeEach(async () => {
    exchange = new TestExchange();
    logger = createLogger();
    eventBus = EventBus.getInstance();

    const riskManager = {
      limits: {
        maxPositionSize: new Decimal(1e9),
        maxDailyLoss: new Decimal(1e9),
        maxDrawdown: new Decimal(1),
        maxOpenPositions: 100,
        maxLeverage: new Decimal(100),
      } as RiskLimits,
      checkOrderRisk: vi.fn().mockResolvedValue(true),
      checkPositionRisk: vi.fn().mockResolvedValue(true),
    } as unknown as IRiskManager;

    const portfolioManager = {
      getPositions: vi.fn().mockResolvedValue([]),
      getBalances: vi.fn().mockResolvedValue([]),
    } as unknown as IPortfolioManager;

    engine = new TradingEngine(riskManager, portfolioManager, logger);
    await engine.addExchange('mockExchange', exchange as unknown as IExchange);
    await engine.addStrategy(
      'test-strategy',
      new TestStrategy(1) as unknown as IStrategy,
    );
    await engine.start();
  });

  describe('Fix 2: reconcile duplicate exits against the exchange', () => {
    it("cancels this strategy's own live SELL orders before placing a reduceOnly exit", async () => {
      exchange.openOrders = [
        createOrder({
          id: 'dup-1',
          clientOrderId: 'T1D1790172796407',
          side: OrderSide.SELL,
        }),
        // Another strategy on the same account/symbol — must NOT be touched.
        createOrder({
          id: 'other-strategy',
          clientOrderId: 'T2D1790172796407',
          side: OrderSide.SELL,
        }),
        // Same strategy, but a BUY entry — must NOT be cancelled either.
        createOrder({
          id: 'entry-1',
          clientOrderId: 'E1D1790172796407',
          side: OrderSide.BUY,
        }),
      ];

      await engine.executeOrder({
        strategyName: 'test-strategy',
        symbol: 'BTC/USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: new Decimal(15000),
        price: new Decimal(0.4202),
        clientOrderId: 'T1D1790172800589',
        reduceOnly: true,
      });

      expect(exchange.cancelOrderSpy).toHaveBeenCalledTimes(1);
      expect(exchange.cancelOrderSpy).toHaveBeenCalledWith(
        'BTC/USDT',
        'dup-1',
        'T1D1790172796407',
      );
    });

    it('does NOT cancel a same-side strategy order of a different size (legit concurrent exit)', async () => {
      // Review must-fix: same-side alone is too broad. A ladder may keep a
      // second live exit (another level / stop-loss) — cancelling it would
      // delete the position's only way out.
      exchange.openOrders = [
        createOrder({
          id: 'other-leg',
          clientOrderId: 'T1D1790172700000',
          quantity: new Decimal(8000),
        }),
      ];

      await engine.executeOrder({
        strategyName: 'test-strategy',
        symbol: 'BTC/USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: new Decimal(15000),
        price: new Decimal(0.4202),
        clientOrderId: 'T1D1790172800589',
        reduceOnly: true,
      });

      expect(exchange.cancelOrderSpy).not.toHaveBeenCalled();
    });

    it('does NOT cancel a same-side, same-size strategy order at a different price', async () => {
      exchange.openOrders = [
        createOrder({
          id: 'other-price',
          clientOrderId: 'T1D1790172700001',
          price: new Decimal(0.51),
        }),
      ];

      await engine.executeOrder({
        strategyName: 'test-strategy',
        symbol: 'BTC/USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: new Decimal(15000),
        price: new Decimal(0.4202),
        clientOrderId: 'T1D1790172800589',
        reduceOnly: true,
      });

      expect(exchange.cancelOrderSpy).not.toHaveBeenCalled();
    });

    it('does NOT cancel when the live order is on a different symbol', async () => {
      // Defence in depth for connectors whose getOpenOrders ignores the symbol
      // filter (Coinbase returns the whole account).
      exchange.openOrders = [
        createOrder({
          id: 'other-symbol',
          clientOrderId: 'T1D1790172700002',
          symbol: 'ETH/USDT',
        }),
      ];

      await engine.executeOrder({
        strategyName: 'test-strategy',
        symbol: 'BTC/USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: new Decimal(15000),
        price: new Decimal(0.4202),
        clientOrderId: 'T1D1790172800589',
        reduceOnly: true,
      });

      expect(exchange.cancelOrderSpy).not.toHaveBeenCalled();
    });

    it('passes reduceOnly through to the exchange for risk-reducing orders', async () => {
      await engine.executeOrder({
        strategyName: 'test-strategy',
        symbol: 'BTC/USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: new Decimal(15000),
        price: new Decimal(0.4202),
        clientOrderId: 'T1D1790172800589',
        reduceOnly: true,
      });

      const options = exchange.createOrderSpy.mock.calls[0][7] as Record<string, unknown>;
      expect(options.reduceOnly).toBe(true);
    });

    it('does not reconcile when the order is not risk-reducing', async () => {
      exchange.openOrders = [
        createOrder({ id: 'dup-1', clientOrderId: 'T1D1790172796407' }),
      ];

      await engine.executeOrder({
        strategyName: 'test-strategy',
        symbol: 'BTC/USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: new Decimal(15000),
        price: new Decimal(0.4202),
        clientOrderId: 'T1D1790172800589',
      });

      expect(exchange.cancelOrderSpy).not.toHaveBeenCalled();
    });
  });

  describe('Fix 5: a failed cancel must not downgrade an executed order', () => {
    it('keeps a FILLED order FILLED when the cancel fails (-2011)', async () => {
      const rejectedSpy = vi.fn();
      eventBus.onOrderRejected(rejectedSpy);

      const filledSell = createOrder({
        id: 'order-4743137639',
        clientOrderId: 'T1D1790172800589',
        status: OrderStatus.FILLED,
        executedQuantity: new Decimal(15000),
      });

      // Engine learns about the fill (tracks the order in its cache).
      exchange.emit('orderUpdate', 'BTC/USDT', filledSell);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The exchange rejects the cancel exactly like Binance does for an
      // already-filled order.
      exchange.cancelOrderError = new Error(
        'Binance API error: -2011 Unknown order sent.',
      );

      await (
        engine as unknown as {
          executeCancelOrder: (
            strategyName: string,
            symbol: string,
            signal: { action: 'cancel'; clientOrderId: string; symbol: string },
          ) => Promise<void>;
        }
      ).executeCancelOrder('test-strategy', 'BTC/USDT', {
        action: 'cancel',
        clientOrderId: 'T1D1790172800589',
        symbol: 'BTC/USDT',
      });

      expect(rejectedSpy).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('already executed'),
      );
    });

    it('still reports a genuine rejection when the order was never filled', async () => {
      const rejectedSpy = vi.fn();
      eventBus.onOrderRejected(rejectedSpy);

      const liveSell = createOrder({
        id: 'order-live',
        clientOrderId: 'T1D1790172800000',
        status: OrderStatus.NEW,
        executedQuantity: new Decimal(0),
      });

      exchange.emit('orderUpdate', 'BTC/USDT', liveSell);
      await new Promise((resolve) => setTimeout(resolve, 100));

      exchange.cancelOrderError = new Error(
        'Binance API error: -2011 Unknown order sent.',
      );

      await (
        engine as unknown as {
          executeCancelOrder: (
            strategyName: string,
            symbol: string,
            signal: { action: 'cancel'; clientOrderId: string; symbol: string },
          ) => Promise<void>;
        }
      ).executeCancelOrder('test-strategy', 'BTC/USDT', {
        action: 'cancel',
        clientOrderId: 'T1D1790172800000',
        symbol: 'BTC/USDT',
      });

      expect(rejectedSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps a PARTIALLY filled order out of REJECTED when the cancel fails', async () => {
      // Review must-fix: broadening isOrderAlreadyExecuted to any execution.
      // Inventory really did move, so REJECTED would hide it (609 wrote a real
      // 15000 fill as REJECTED and the oversell stayed invisible).
      const rejectedSpy = vi.fn();
      eventBus.onOrderRejected(rejectedSpy);

      const partialSell = createOrder({
        id: 'partial-1',
        clientOrderId: 'T1D1790172800111',
        status: OrderStatus.PARTIALLY_FILLED,
        quantity: new Decimal(15000),
        executedQuantity: new Decimal(6000),
      });

      exchange.emit('orderUpdate', 'BTC/USDT', partialSell);
      await new Promise((resolve) => setTimeout(resolve, 100));

      exchange.cancelOrderError = new Error(
        'Binance API error: -2011 Unknown order sent.',
      );

      await (
        engine as unknown as {
          executeCancelOrder: (
            strategyName: string,
            symbol: string,
            signal: { action: 'cancel'; clientOrderId: string; symbol: string },
          ) => Promise<void>;
        }
      ).executeCancelOrder('test-strategy', 'BTC/USDT', {
        action: 'cancel',
        clientOrderId: 'T1D1790172800111',
        symbol: 'BTC/USDT',
      });

      expect(rejectedSpy).not.toHaveBeenCalled();
    });
  });
});
