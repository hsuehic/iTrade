import { EventEmitter } from 'events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Decimal from 'decimal.js';
import { TradingEngine } from '../TradingEngine';
import { EventBus } from '../../events';
import {
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
  Position,
  Balance,
  StrategyResult,
  StrategyConfig,
  StrategyRuntimeContext,
  StrategyParameters,
  RiskLimits,
  RiskMetrics,
} from '../../types';

// Mock implementations
class MockExchange extends EventEmitter implements IExchange {
  name = 'mockExchange';
  isConnected = true;

  async connect() {
    return;
  }

  async disconnect() {
    return;
  }

  async getTicker(_symbol: string) {
    return {
      symbol: 'BTC/USDT',
      price: new Decimal(50000),
      bid: new Decimal(49990),
      ask: new Decimal(50010),
      volume: new Decimal(1000),
      timestamp: new Date(),
      exchange: 'mockExchange',
    };
  }

  async getOrderBook(_symbol: string, _limit?: number) {
    return {
      symbol: 'BTC/USDT',
      timestamp: new Date(),
      bids: [[new Decimal(49990), new Decimal(1)]] as [Decimal, Decimal][],
      asks: [[new Decimal(50010), new Decimal(1)]] as [Decimal, Decimal][],
    };
  }

  async getTrades(_symbol: string, _limit?: number) {
    return [];
  }

  async getKlines(
    _symbol: string,
    _interval: string,
    _startTime?: Date,
    _endTime?: Date,
    _limit?: number,
  ) {
    return [];
  }

  async subscribeToTicker(_symbol: string) {
    return;
  }

  async subscribeToOrderBook(_symbol: string, _depth?: number) {
    return;
  }

  async subscribeToTrades(_symbol: string) {
    return;
  }

  async subscribeToKlines(_symbol: string, _interval: string) {
    return;
  }

  async subscribeToUserData() {
    return;
  }

  async unsubscribe(
    _symbol: string,
    _type: 'ticker' | 'orderbook' | 'trades' | 'klines',
  ) {
    return;
  }

  async getSymbolInfo(_symbol: string) {
    return {
      symbol: 'BTC/USDT',
      nativeSymbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      minQuantity: new Decimal(0.001),
      maxQuantity: new Decimal(1000),
      stepSize: new Decimal(0.001),
      tickSize: new Decimal(0.01),
      minNotional: new Decimal(10),
      pricePrecision: 2,
      quantityPrecision: 3,
      status: 'active' as const,
      market: 'spot' as const,
    };
  }

  async createOrder(
    symbol: string,
    side: OrderSide,
    type: OrderType,
    quantity: Decimal,
    price?: Decimal,
  ): Promise<Order> {
    return {
      id: `order-${Date.now()}`,
      clientOrderId: `client-${Date.now()}`,
      symbol,
      side,
      type,
      quantity,
      price,
      status: OrderStatus.NEW,
      timeInForce: TimeInForce.GTC,
      timestamp: new Date(),
      exchange: this.name,
    };
  }

  async cancelOrder(_symbol: string, _orderId: string, _clientOrderId?: string) {
    return {
      id: _orderId,
      symbol: _symbol,
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      quantity: new Decimal(0),
      status: OrderStatus.CANCELED,
      timeInForce: TimeInForce.GTC,
      timestamp: new Date(),
      exchange: this.name,
    };
  }

  async getOrder(_symbol: string, _orderId: string, _clientOrderId?: string) {
    return {
      id: _orderId,
      symbol: _symbol,
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      quantity: new Decimal(0),
      status: OrderStatus.NEW,
      timeInForce: TimeInForce.GTC,
      timestamp: new Date(),
      exchange: this.name,
    };
  }

  async getOpenOrders(_symbol?: string) {
    return [];
  }

  async getOrderHistory(_symbol?: string, _limit?: number) {
    return [];
  }

  async getAccountInfo() {
    return {
      balances: [],
      canTrade: true,
      canDeposit: true,
      canWithdraw: true,
      updateTime: new Date(),
    };
  }

  async getBalances() {
    return [
      {
        asset: 'USDT',
        free: new Decimal(10000),
        locked: new Decimal(0),
        total: new Decimal(10000),
      },
    ];
  }

  async getPositions() {
    return [];
  }

  async getExchangeInfo() {
    return {
      name: 'mockExchange',
      symbols: ['BTC/USDT'],
      tradingFees: {
        maker: new Decimal(0.001),
        taker: new Decimal(0.001),
      },
      minTradeSize: {
        'BTC/USDT': new Decimal(0.001),
      },
    };
  }

  async getSymbols() {
    return ['BTC/USDT'];
  }
}

class MockRiskManager implements IRiskManager {
  limits: RiskLimits = {
    maxPositionSize: new Decimal(1000),
    maxDailyLoss: new Decimal(1000),
    maxDrawdown: new Decimal(0.1),
    maxOpenPositions: 10,
    maxLeverage: new Decimal(5),
  };

  async checkOrderRisk(): Promise<boolean> {
    return true;
  }

  async checkPositionRisk(): Promise<boolean> {
    return true;
  }

  async calculateRiskMetrics(): Promise<RiskMetrics> {
    return {
      currentDrawdown: new Decimal(0),
      dailyPnl: new Decimal(0),
      openPositions: 0,
      totalExposure: new Decimal(0),
      leverage: new Decimal(1),
    };
  }

  async updateLimits(): Promise<void> {
    return;
  }

  async resetDailyLimits(): Promise<void> {
    return;
  }

  async logRiskEvent(): Promise<void> {
    return;
  }

  async getRiskReport() {
    return {
      limits: this.limits,
      metrics: await this.calculateRiskMetrics(),
      violations: [],
    };
  }

  getLimits(): RiskLimits {
    return this.limits;
  }

  async liquidateAllPositions(): Promise<void> {
    return;
  }

  async stopAllTrading(): Promise<void> {
    return;
  }
}

class MockPortfolioManager implements IPortfolioManager {
  async getPositions(): Promise<Position[]> {
    return [];
  }

  async getBalances(): Promise<Balance[]> {
    return [
      {
        asset: 'USDT',
        free: new Decimal(10000),
        locked: new Decimal(0),
        total: new Decimal(10000),
      },
    ];
  }

  async getPortfolioValue(): Promise<Decimal> {
    return new Decimal(10000);
  }

  async updatePosition(): Promise<void> {
    return;
  }

  async closePosition(): Promise<void> {
    return;
  }

  async getUnrealizedPnl(): Promise<Decimal> {
    return new Decimal(0);
  }

  async getRealizedPnl(): Promise<Decimal> {
    return new Decimal(0);
  }

  async getTotalPnl(): Promise<Decimal> {
    return new Decimal(0);
  }

  async getPortfolioSummary() {
    return {
      totalValue: new Decimal(10000),
      positions: [],
      balances: await this.getBalances(),
      unrealizedPnl: new Decimal(0),
      realizedPnl: new Decimal(0),
    };
  }

  async calculatePositionSize(): Promise<Decimal> {
    return new Decimal(0.1);
  }

  async calculateSharpeRatio(): Promise<Decimal> {
    return new Decimal(0);
  }

  calculateMaxDrawdown(_period: { start: Date; end: Date }): Decimal {
    return new Decimal(0);
  }

  async getPerformanceMetrics(_period: { start: Date; end: Date }) {
    return {
      totalReturn: new Decimal(0),
      annualizedReturn: new Decimal(0),
      volatility: new Decimal(0),
      sharpeRatio: new Decimal(0),
      maxDrawdown: new Decimal(0),
    };
  }
}

class MockLogger implements ILogger {
  info = vi.fn();
  warn = vi.fn();
  error = vi.fn();
  debug = vi.fn();
  logTrade = vi.fn();
  logStrategy = vi.fn();
  logOrder = vi.fn();
  logRisk = vi.fn();
}

class MockStrategy implements IStrategy {
  strategyType = 'MockStrategy';
  config: StrategyConfig<StrategyParameters>;
  context: StrategyRuntimeContext = {
    symbol: 'BTC/USDT',
    exchange: 'mockExchange',
  };

  constructor(context: StrategyRuntimeContext) {
    this.context = context;
    this.config = {
      ...context,
      type: this.strategyType,
      parameters: {},
    };
  }

  async analyze(): Promise<StrategyResult> {
    return { action: 'hold' };
  }

  processInitialData = vi.fn();
  onOrderCreated = vi.fn();
  onOrderFilled = vi.fn();
  getState = vi.fn().mockResolvedValue({});
  setState = vi.fn().mockResolvedValue(undefined);
}

describe('TradingEngine - Order Event Emission', () => {
  let engine: TradingEngine;
  let mockExchange: MockExchange;
  let mockRiskManager: MockRiskManager;
  let mockPortfolioManager: MockPortfolioManager;
  let mockLogger: MockLogger;
  let eventBus: EventBus;
  let orderCreatedSpy: ReturnType<typeof vi.fn>;
  let orderFilledSpy: ReturnType<typeof vi.fn>;
  let orderPartiallyFilledSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockExchange = new MockExchange();
    mockRiskManager = new MockRiskManager();
    mockPortfolioManager = new MockPortfolioManager();
    mockLogger = new MockLogger();
    eventBus = EventBus.getInstance();

    // Spy on event emissions
    orderCreatedSpy = vi.fn();
    orderFilledSpy = vi.fn();
    orderPartiallyFilledSpy = vi.fn();

    eventBus.onOrderCreated(orderCreatedSpy);
    eventBus.onOrderFilled(orderFilledSpy);
    eventBus.onOrderPartiallyFilled(orderPartiallyFilledSpy);

    engine = new TradingEngine(mockRiskManager, mockPortfolioManager, mockLogger);
  });

  describe('Bug Fix: OrderCreated Always Emitted First', () => {
    it('should emit OrderCreated when receiving FILLED order for the first time', async () => {
      await engine.addExchange('mockExchange', mockExchange);

      const filledOrder: Order = {
        id: 'order-123',
        clientOrderId: 'client-123',
        symbol: 'BTC/USDT',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: new Decimal(0.1),
        price: new Decimal(50000),
        status: OrderStatus.FILLED,
        timeInForce: TimeInForce.GTC,
        timestamp: new Date(),
        executedQuantity: new Decimal(0.1),
        averagePrice: new Decimal(50000),
        updateTime: new Date(),
        exchange: 'mockExchange',
      };

      // Simulate exchange pushing a FILLED order
      mockExchange.emit('orderUpdate', 'BTC/USDT', filledOrder);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should emit OrderCreated first
      expect(orderCreatedSpy).toHaveBeenCalledTimes(1);
      expect(orderCreatedSpy).toHaveBeenCalledWith({
        order: expect.objectContaining({ id: 'order-123' }),
        timestamp: expect.any(Date),
      });

      // Then emit OrderFilled
      expect(orderFilledSpy).toHaveBeenCalledTimes(1);
      expect(orderFilledSpy).toHaveBeenCalledWith({
        order: expect.objectContaining({ id: 'order-123', status: OrderStatus.FILLED }),
        timestamp: expect.any(Date),
      });
    });

    it('should emit OrderCreated when receiving PARTIALLY_FILLED order for the first time', async () => {
      await engine.addExchange('mockExchange', mockExchange);

      const partialOrder: Order = {
        id: 'order-456',
        clientOrderId: 'client-456',
        symbol: 'BTC/USDT',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: new Decimal(0.1),
        price: new Decimal(50000),
        status: OrderStatus.PARTIALLY_FILLED,
        timeInForce: TimeInForce.GTC,
        timestamp: new Date(),
        executedQuantity: new Decimal(0.05),
        updateTime: new Date(),
        exchange: 'mockExchange',
      };

      mockExchange.emit('orderUpdate', 'BTC/USDT', partialOrder);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(orderCreatedSpy).toHaveBeenCalledTimes(1);
      expect(orderPartiallyFilledSpy).toHaveBeenCalledTimes(1);
    });

    it('should NOT emit duplicate OrderCreated for the same order', async () => {
      await engine.addExchange('mockExchange', mockExchange);

      const order: Order = {
        id: 'order-789',
        clientOrderId: 'client-789',
        symbol: 'BTC/USDT',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: new Decimal(0.1),
        price: new Decimal(50000),
        status: OrderStatus.NEW,
        timeInForce: TimeInForce.GTC,
        timestamp: new Date(),
        exchange: 'mockExchange',
      };

      // First update - NEW status
      mockExchange.emit('orderUpdate', 'BTC/USDT', order);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Second update - PARTIALLY_FILLED
      const partialOrder = {
        ...order,
        status: OrderStatus.PARTIALLY_FILLED,
        executedQuantity: new Decimal(0.05),
      };
      mockExchange.emit('orderUpdate', 'BTC/USDT', partialOrder);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Third update - FILLED
      const filledOrder = {
        ...order,
        status: OrderStatus.FILLED,
        executedQuantity: new Decimal(0.1),
      };
      mockExchange.emit('orderUpdate', 'BTC/USDT', filledOrder);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // OrderCreated should only be emitted once
      expect(orderCreatedSpy).toHaveBeenCalledTimes(1);
      expect(orderPartiallyFilledSpy).toHaveBeenCalledTimes(1);
      expect(orderFilledSpy).toHaveBeenCalledTimes(1);
    });

    it('should track multiple different orders correctly', async () => {
      await engine.addExchange('mockExchange', mockExchange);

      const order1: Order = {
        id: 'order-1',
        clientOrderId: 'client-1',
        symbol: 'BTC/USDT',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: new Decimal(0.1),
        price: new Decimal(50000),
        status: OrderStatus.FILLED,
        timeInForce: TimeInForce.GTC,
        timestamp: new Date(),
        executedQuantity: new Decimal(0.1),
        exchange: 'mockExchange',
      };

      const order2: Order = {
        id: 'order-2',
        clientOrderId: 'client-2',
        symbol: 'ETH/USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: new Decimal(1),
        price: new Decimal(3000),
        status: OrderStatus.FILLED,
        timeInForce: TimeInForce.GTC,
        timestamp: new Date(),
        executedQuantity: new Decimal(1),
        exchange: 'mockExchange',
      };

      mockExchange.emit('orderUpdate', 'BTC/USDT', order1);
      await new Promise((resolve) => setTimeout(resolve, 50));

      mockExchange.emit('orderUpdate', 'ETH/USDT', order2);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Each order should emit OrderCreated once
      expect(orderCreatedSpy).toHaveBeenCalledTimes(2);
      expect(orderFilledSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Bug Fix: Execute Take Profit Signals from Account Updates', () => {
    it('should execute take profit signal generated from order update', async () => {
      await engine.addExchange('mockExchange', mockExchange);

      // Create a strategy that generates TP signal on order fill
      const mockStrategy = new MockStrategy({
        exchange: 'mockExchange',
        symbol: 'BTC/USDT',
      });

      // Mock strategy to return TP signal when receiving filled order
      mockStrategy.analyze = vi.fn().mockResolvedValue({
        action: 'sell',
        quantity: new Decimal(0.1),
        price: new Decimal(50500),
        reason: 'take_profit',
        clientOrderId: 'tp-order-123',
      });

      await engine.addStrategy('test-strategy', mockStrategy as IStrategy);
      await engine.start();

      const filledOrder: Order = {
        id: 'entry-order-123',
        clientOrderId: 'client-entry-123',
        symbol: 'BTC/USDT',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: new Decimal(0.1),
        price: new Decimal(50000),
        status: OrderStatus.FILLED,
        timeInForce: TimeInForce.GTC,
        timestamp: new Date(),
        executedQuantity: new Decimal(0.1),
        averagePrice: new Decimal(50000),
        exchange: 'mockExchange',
      };

      // Simulate order fill
      mockExchange.emit('orderUpdate', 'BTC/USDT', filledOrder);
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Strategy's analyze should be called with order data
      expect(mockStrategy.analyze).toHaveBeenCalledWith(
        expect.objectContaining({
          orders: expect.arrayContaining([
            expect.objectContaining({ id: 'entry-order-123' }),
          ]),
        }),
      );

      // Logger should show execution of TP signal
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Executing signal from test-strategy triggered by account update',
        ),
      );
    });
  });

  describe('Execute Order with OrderCreated Tracking', () => {
    it('should mark order as emitted when executing via executeOrder', async () => {
      await engine.addExchange('mockExchange', mockExchange);

      // Create a strategy
      const mockStrategy = new MockStrategy({
        exchange: 'mockExchange',
        symbol: 'BTC/USDT',
      });

      await engine.addStrategy('test-strategy', mockStrategy as IStrategy);
      await engine.start();

      // Execute order
      const order = await engine.executeOrder({
        strategyName: 'test-strategy',
        symbol: 'BTC/USDT',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: new Decimal(0.1),
        price: new Decimal(50000),
      });

      // OrderCreated should be emitted
      expect(orderCreatedSpy).toHaveBeenCalledWith({
        order: expect.objectContaining({ id: order.id }),
        timestamp: expect.any(Date),
      });

      // Now simulate exchange pushing same order with NEW status
      const exchangeOrder = { ...order, status: OrderStatus.NEW };
      mockExchange.emit('orderUpdate', 'BTC/USDT', exchangeOrder);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should NOT emit duplicate OrderCreated
      expect(orderCreatedSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Order Status Transitions', () => {
    it('should emit correct events for NEW -> PARTIALLY_FILLED -> FILLED transition', async () => {
      await engine.addExchange('mockExchange', mockExchange);

      const baseOrder: Order = {
        id: 'order-transition',
        clientOrderId: 'client-transition',
        symbol: 'BTC/USDT',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: new Decimal(0.1),
        price: new Decimal(50000),
        status: OrderStatus.NEW,
        timeInForce: TimeInForce.GTC,
        timestamp: new Date(),
        exchange: 'mockExchange',
      };

      // NEW
      mockExchange.emit('orderUpdate', 'BTC/USDT', baseOrder);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(orderCreatedSpy).toHaveBeenCalledTimes(1);

      // PARTIALLY_FILLED
      const partialOrder = {
        ...baseOrder,
        status: OrderStatus.PARTIALLY_FILLED,
        executedQuantity: new Decimal(0.05),
        updateTime: new Date(),
      };
      mockExchange.emit('orderUpdate', 'BTC/USDT', partialOrder);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(orderPartiallyFilledSpy).toHaveBeenCalledTimes(1);
      expect(orderCreatedSpy).toHaveBeenCalledTimes(1); // Still just once

      // FILLED
      const filledOrder = {
        ...baseOrder,
        status: OrderStatus.FILLED,
        executedQuantity: new Decimal(0.1),
        averagePrice: new Decimal(50000),
        updateTime: new Date(),
      };
      mockExchange.emit('orderUpdate', 'BTC/USDT', filledOrder);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(orderFilledSpy).toHaveBeenCalledTimes(1);
      expect(orderCreatedSpy).toHaveBeenCalledTimes(1); // Still just once
    });
  });
});
