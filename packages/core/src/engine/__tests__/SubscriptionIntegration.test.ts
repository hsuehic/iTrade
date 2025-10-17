import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Decimal from 'decimal.js';

import { TradingEngine } from '../TradingEngine';
import {
  IExchange,
  ILogger,
  IRiskManager,
  IPortfolioManager,
  IStrategy,
} from '../../interfaces';
import { StrategyParameters, StrategyResult, Ticker } from '../../types';

/**
 * Integration tests for subscription functionality
 *
 * Tests the full flow: Strategy -> TradingEngine -> SubscriptionCoordinator -> Exchange
 */

describe('Subscription Integration Tests', () => {
  let engine: TradingEngine;
  let mockLogger: ILogger;
  let mockRiskManager: IRiskManager;
  let mockPortfolioManager: IPortfolioManager;
  let mockExchange: IExchange;
  let mockStrategy: IStrategy;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      logOrder: vi.fn(),
      logTrade: vi.fn(),
      logStrategy: vi.fn(),
      logRisk: vi.fn(),
    } as ILogger;

    // Mock risk manager
    mockRiskManager = {
      checkOrderRisk: vi.fn().mockResolvedValue(true),
      checkPositionRisk: vi.fn().mockResolvedValue(true),
      calculateRiskMetrics: vi.fn().mockResolvedValue({}),
      updateLimits: vi.fn(),
      getLimits: vi.fn().mockReturnValue({}),
      liquidateAllPositions: vi.fn(),
      stopAllTrading: vi.fn(),
    } as unknown as IRiskManager;

    // Mock portfolio manager
    mockPortfolioManager = {
      getPositions: vi.fn().mockResolvedValue([]),
      getBalances: vi.fn().mockResolvedValue([]),
      getPortfolioValue: vi.fn().mockResolvedValue(10000),
      updatePosition: vi.fn(),
      closePosition: vi.fn(),
      getUnrealizedPnl: vi.fn(),
      getRealizedPnl: vi.fn(),
      calculateSharpeRatio: vi.fn(),
      calculateMaxDrawdown: vi.fn(),
      getPerformanceMetrics: vi.fn(),
    } as unknown as IPortfolioManager;

    // Mock exchange
    mockExchange = {
      name: 'test-exchange',
      isConnected: true,
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      subscribeToTicker: vi.fn().mockResolvedValue(undefined),
      subscribeToOrderBook: vi.fn().mockResolvedValue(undefined),
      subscribeToTrades: vi.fn().mockResolvedValue(undefined),
      subscribeToKlines: vi.fn().mockResolvedValue(undefined),
      getTicker: vi.fn().mockResolvedValue({
        symbol: 'BTC/USDT',
        price: 50000,
        volume: 1000,
        timestamp: new Date(),
      }),
      getOrderBook: vi.fn().mockResolvedValue({
        symbol: 'BTC/USDT',
        bids: [],
        asks: [],
        timestamp: new Date(),
      }),
      getTrades: vi.fn().mockResolvedValue([]),
      getKlines: vi.fn().mockResolvedValue([]),
      createOrder: vi.fn(),
      cancelOrder: vi.fn(),
      getOrder: vi.fn(),
      getOpenOrders: vi.fn(),
      getOrderHistory: vi.fn(),
      getAccountInfo: vi.fn(),
      getBalances: vi.fn(),
      getPositions: vi.fn(),
      getExchangeInfo: vi.fn(),
      getSymbols: vi.fn(),
      on: vi.fn(),
      emit: vi.fn(),
      removeAllListeners: vi.fn(),
    } as unknown as IExchange;

    // Create engine
    engine = new TradingEngine(
      mockRiskManager,
      mockPortfolioManager,
      mockLogger
    );
    engine.addExchange('test-exchange', mockExchange);
  });

  afterEach(async () => {
    if (engine.isRunning) {
      await engine.stop();
    }
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Strategy Subscription Lifecycle', () => {
    it('should auto-subscribe when strategy is added to running engine', async () => {
      // Create strategy with subscription config
      mockStrategy = createMockStrategy('test-strategy', {
        symbol: 'BTC/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: true,
          method: 'websocket',
        },
      });

      await engine.start();
      await engine.addStrategy('test-strategy', mockStrategy);

      // Should subscribe to ticker
      expect(mockExchange.subscribeToTicker).toHaveBeenCalledWith('BTC/USDT');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Auto-subscribing data')
      );
    });

    it('should auto-subscribe when engine starts with existing strategies', async () => {
      mockStrategy = createMockStrategy('test-strategy', {
        symbol: 'BTC/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: true,
          method: 'websocket',
        },
      });

      await engine.addStrategy('test-strategy', mockStrategy);
      await engine.start();

      expect(mockExchange.subscribeToTicker).toHaveBeenCalledWith('BTC/USDT');
    });

    it('should auto-unsubscribe when strategy is removed', async () => {
      mockStrategy = createMockStrategy('test-strategy', {
        symbol: 'BTC/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: true,
          method: 'websocket',
        },
      });

      await engine.start();
      await engine.addStrategy('test-strategy', mockStrategy);
      await engine.removeStrategy('test-strategy');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Auto-unsubscribing')
      );
    });

    it('should clear all subscriptions when engine stops', async () => {
      mockStrategy = createMockStrategy('test-strategy', {
        symbol: 'BTC/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: true,
          method: 'websocket',
        },
      });

      await engine.start();
      await engine.addStrategy('test-strategy', mockStrategy);
      await engine.stop();

      const stats = engine.getSubscriptionStats();
      expect(stats.total).toBe(0);
    });
  });

  describe('Multiple Data Type Subscriptions', () => {
    it('should subscribe to multiple data types', async () => {
      mockStrategy = createMockStrategy('test-strategy', {
        symbol: 'BTC/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: true,
          orderbook: { enabled: true, depth: 20 },
          trades: { enabled: true, limit: 10 },
          klines: { enabled: true, interval: '1m' },
          method: 'websocket',
        },
      });

      await engine.start();
      await engine.addStrategy('test-strategy', mockStrategy);

      expect(mockExchange.subscribeToTicker).toHaveBeenCalledWith('BTC/USDT');
      expect(mockExchange.subscribeToOrderBook).toHaveBeenCalledWith(
        'BTC/USDT'
      );
      expect(mockExchange.subscribeToTrades).toHaveBeenCalledWith('BTC/USDT');
      expect(mockExchange.subscribeToKlines).toHaveBeenCalledWith(
        'BTC/USDT',
        '1m'
      );

      const stats = engine.getSubscriptionStats();
      expect(stats.total).toBe(4);
    });

    it('should handle selective subscriptions', async () => {
      mockStrategy = createMockStrategy('test-strategy', {
        symbol: 'BTC/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: true,
          orderbook: false, // Not subscribed
          method: 'websocket',
        },
      });

      await engine.start();
      await engine.addStrategy('test-strategy', mockStrategy);

      expect(mockExchange.subscribeToTicker).toHaveBeenCalled();
      expect(mockExchange.subscribeToOrderBook).not.toHaveBeenCalled();

      const stats = engine.getSubscriptionStats();
      expect(stats.total).toBe(1);
    });
  });

  describe('Multi-Strategy Subscription Sharing', () => {
    it('should share subscriptions between strategies', async () => {
      const strategy1 = createMockStrategy('strategy1', {
        symbol: 'BTC/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: true,
          method: 'websocket',
        },
      });

      const strategy2 = createMockStrategy('strategy2', {
        symbol: 'BTC/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: true,
          method: 'websocket',
        },
      });

      await engine.start();
      await engine.addStrategy('strategy1', strategy1);
      await engine.addStrategy('strategy2', strategy2);

      // Should only subscribe once
      expect(mockExchange.subscribeToTicker).toHaveBeenCalledTimes(1);

      const stats = engine.getSubscriptionStats();
      expect(stats.total).toBe(1);
    });

    it('should keep subscription alive when one strategy is removed', async () => {
      const strategy1 = createMockStrategy('strategy1', {
        symbol: 'BTC/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: true,
          method: 'websocket',
        },
      });

      const strategy2 = createMockStrategy('strategy2', {
        symbol: 'BTC/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: true,
          method: 'websocket',
        },
      });

      await engine.start();
      await engine.addStrategy('strategy1', strategy1);
      await engine.addStrategy('strategy2', strategy2);

      // Remove one strategy
      await engine.removeStrategy('strategy1');

      // Subscription should still exist
      const stats = engine.getSubscriptionStats();
      expect(stats.total).toBe(1);
    });

    it('should cancel subscription when all strategies are removed', async () => {
      const strategy1 = createMockStrategy('strategy1', {
        symbol: 'BTC/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: true,
          method: 'websocket',
        },
      });

      const strategy2 = createMockStrategy('strategy2', {
        symbol: 'BTC/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: true,
          method: 'websocket',
        },
      });

      await engine.start();
      await engine.addStrategy('strategy1', strategy1);
      await engine.addStrategy('strategy2', strategy2);

      // Remove both strategies
      await engine.removeStrategy('strategy1');
      await engine.removeStrategy('strategy2');

      // Subscription should be cancelled
      const stats = engine.getSubscriptionStats();
      expect(stats.total).toBe(0);
    });
  });

  describe('REST Polling Integration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should poll market data via REST', async () => {
      mockStrategy = createMockStrategy('test-strategy', {
        symbol: 'BTC/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: { enabled: true, interval: 1000 },
          method: 'rest',
        },
      });

      await engine.start();
      await engine.addStrategy('test-strategy', mockStrategy);

      // Should not call immediately
      expect(mockExchange.getTicker).not.toHaveBeenCalled();

      // Advance timer
      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(mockExchange.getTicker).toHaveBeenCalledWith('BTC/USDT');
    });

    it.skip('should deliver REST polled data to strategies', async () => {
      const mockTicker: Ticker = {
        symbol: 'BTC/USDT',
        price: Decimal(50000),
        volume: Decimal(1000),
        timestamp: new Date(),
      };

      vi.mocked(mockExchange.getTicker).mockResolvedValue(mockTicker);

      mockStrategy = createMockStrategy('test-strategy', {
        symbol: 'BTC/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: { enabled: true, interval: 1000 },
          method: 'rest',
        },
      });

      await engine.start();
      await engine.addStrategy('test-strategy', mockStrategy);

      vi.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve(); // Give time for async operations

      // Exchange should emit the data
      expect(mockExchange.emit).toHaveBeenCalledWith(
        'ticker',
        'BTC/USDT',
        mockTicker
      );
    });
  });

  describe('Multi-Exchange Subscriptions', () => {
    let mockExchange2: IExchange;

    beforeEach(() => {
      mockExchange2 = {
        ...mockExchange,
        name: 'exchange2',
      } as IExchange;

      engine.addExchange('exchange2', mockExchange2);
    });

    it('should subscribe to multiple exchanges', async () => {
      const strategy1 = createMockStrategy('strategy1', {
        symbol: 'BTC/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: true,
          method: 'websocket',
        },
      });

      const strategy2 = createMockStrategy('strategy2', {
        symbol: 'BTC/USDT',
        exchange: 'exchange2',
        subscription: {
          ticker: true,
          method: 'websocket',
        },
      });

      await engine.start();
      await engine.addStrategy('strategy1', strategy1);
      await engine.addStrategy('strategy2', strategy2);

      expect(mockExchange.subscribeToTicker).toHaveBeenCalled();
      expect(mockExchange2.subscribeToTicker).toHaveBeenCalled();

      const stats = engine.getSubscriptionStats();
      expect(stats.total).toBe(2);
      expect(stats.byExchange['test-exchange']).toBe(1);
      expect(stats.byExchange['exchange2']).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it.skip('should handle subscription errors gracefully', async () => {
      vi.mocked(mockExchange.subscribeToTicker).mockRejectedValue(
        new Error('WebSocket connection failed')
      );

      mockStrategy = createMockStrategy('test-strategy', {
        symbol: 'BTC/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: true,
          method: 'websocket',
        },
      });

      await engine.start();

      // Should log error but not crash
      await engine.addStrategy('test-strategy', mockStrategy);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to subscribe'),
        expect.any(Error)
      );
    });

    it.skip('should continue with other strategies if one fails to subscribe', async () => {
      const failingStrategy = createMockStrategy('failing-strategy', {
        symbol: 'INVALID/SYMBOL',
        exchange: 'test-exchange',
        subscription: {
          ticker: true,
          method: 'websocket',
        },
      });

      const workingStrategy = createMockStrategy('working-strategy', {
        symbol: 'BTC/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: true,
          method: 'websocket',
        },
      });

      // Make subscription fail for invalid symbol
      vi.mocked(mockExchange.subscribeToTicker).mockImplementation(
        (symbol: string) => {
          if (symbol === 'INVALID/SYMBOL') {
            return Promise.reject(new Error('Invalid symbol'));
          }
          return Promise.resolve();
        }
      );

      await engine.start();
      await engine.addStrategy('failing-strategy', failingStrategy);
      await engine.addStrategy('working-strategy', workingStrategy);

      // Working strategy should still be subscribed
      expect(mockExchange.subscribeToTicker).toHaveBeenCalledWith('BTC/USDT');
    });
  });

  describe('Subscription Statistics', () => {
    it('should provide accurate subscription statistics', async () => {
      const strategy1 = createMockStrategy('strategy1', {
        symbol: 'BTC/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: true,
          orderbook: true,
          method: 'websocket',
        },
      });

      const strategy2 = createMockStrategy('strategy2', {
        symbol: 'ETH/USDT',
        exchange: 'test-exchange',
        subscription: {
          ticker: true,
          method: 'websocket',
        },
      });

      await engine.start();
      await engine.addStrategy('strategy1', strategy1);
      await engine.addStrategy('strategy2', strategy2);

      const stats = engine.getSubscriptionStats();
      expect(stats.total).toBe(3);
      expect(stats.byType.ticker).toBe(2);
      expect(stats.byType.orderbook).toBe(1);
      expect(stats.byMethod.websocket).toBe(3);
    });
  });
});

// Helper function to create mock strategies
function createMockStrategy(
  name: string,
  parameters: StrategyParameters
): IStrategy {
  return {
    name,
    parameters,
    initialize: vi.fn().mockResolvedValue(undefined),
    analyze: vi.fn().mockResolvedValue({
      action: 'hold',
    } as StrategyResult),
    onOrderFilled: vi.fn().mockResolvedValue(undefined),
    onPositionChanged: vi.fn().mockResolvedValue(undefined),
    saveState: vi.fn().mockResolvedValue({
      internalState: {},
      indicatorData: {},
      currentPosition: '0',
    }),
    restoreState: vi.fn().mockResolvedValue(undefined),
    setRecoveryContext: vi.fn().mockResolvedValue(undefined),
    getStateVersion: vi.fn().mockReturnValue('1.0'),
    cleanup: vi.fn().mockResolvedValue(undefined),
  } as IStrategy;
}
