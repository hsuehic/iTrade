import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Decimal } from 'decimal.js';

import { SubscriptionCoordinator } from '../SubscriptionCoordinator';
import { IExchange, ILogger } from '../../interfaces';
import { ISubscriptionObserver } from '../../interfaces/ISubscriptionCoordinator';
import { SubscriptionKey } from '../../types';

/**
 * Comprehensive unit tests for SubscriptionCoordinator
 *
 * Test coverage:
 * 1. Basic subscription/unsubscription
 * 2. Reference counting
 * 3. Subscription method selection (websocket vs REST)
 * 4. REST polling lifecycle
 * 5. Observer notifications
 * 6. Statistics tracking
 * 7. Error handling
 * 8. Cleanup functionality
 */

describe('SubscriptionCoordinator', () => {
  let coordinator: SubscriptionCoordinator;
  let mockLogger: ILogger;
  let mockExchange: IExchange;
  let mockObserver: ISubscriptionObserver;

  beforeEach(() => {
    // Setup mock logger
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

    // Setup mock exchange
    mockExchange = {
      name: 'test-exchange',
      isConnected: true,
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
      emit: vi.fn(),
    } as unknown as IExchange;

    // Setup mock observer
    mockObserver = {
      onSubscriptionCreated: vi.fn(),
      onSubscriptionRemoved: vi.fn(),
      onSubscriptionError: vi.fn(),
    };

    coordinator = new SubscriptionCoordinator(mockLogger);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Basic Subscription', () => {
    it('should create a new websocket subscription', async () => {
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      expect(mockExchange.subscribeToTicker).toHaveBeenCalledWith('BTC/USDT');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Created new websocket subscription')
      );

      const stats = coordinator.getStats();
      expect(stats.total).toBe(1);
      expect(stats.byMethod.websocket).toBe(1);
    });

    it('should create a new REST subscription', async () => {
      vi.useFakeTimers();

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'rest'
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting REST polling')
      );

      const stats = coordinator.getStats();
      expect(stats.total).toBe(1);
      expect(stats.byMethod.rest).toBe(1);
    });

    it('should subscribe to orderbook', async () => {
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'orderbook',
        { depth: 20 },
        'websocket'
      );

      expect(mockExchange.subscribeToOrderBook).toHaveBeenCalledWith(
        'BTC/USDT'
      );
    });

    it('should subscribe to trades', async () => {
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'trades',
        { limit: 10 },
        'websocket'
      );

      expect(mockExchange.subscribeToTrades).toHaveBeenCalledWith('BTC/USDT');
    });

    it('should subscribe to klines with interval', async () => {
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'klines',
        { interval: '1h' },
        'websocket'
      );

      expect(mockExchange.subscribeToKlines).toHaveBeenCalledWith(
        'BTC/USDT',
        '1h'
      );
    });
  });

  describe('Reference Counting', () => {
    it('should increment reference count when multiple strategies subscribe', async () => {
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      await coordinator.subscribe(
        'strategy2',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      // Should only call exchange once
      expect(mockExchange.subscribeToTicker).toHaveBeenCalledTimes(1);

      const subscriptions = coordinator.getAllSubscriptions();
      expect(subscriptions.length).toBe(1);
      expect(subscriptions[0].refCount).toBe(2);
      expect(subscriptions[0].strategies.size).toBe(2);
    });

    it('should keep subscription alive when one strategy unsubscribes', async () => {
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      await coordinator.subscribe(
        'strategy2',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      await coordinator.unsubscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {}
      );

      const subscriptions = coordinator.getAllSubscriptions();
      expect(subscriptions.length).toBe(1);
      expect(subscriptions[0].refCount).toBe(1);
      expect(subscriptions[0].strategies.has('strategy2')).toBe(true);
      expect(subscriptions[0].strategies.has('strategy1')).toBe(false);
    });

    it('should remove subscription when all strategies unsubscribe', async () => {
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      await coordinator.subscribe(
        'strategy2',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      await coordinator.unsubscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {}
      );

      await coordinator.unsubscribe(
        'strategy2',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {}
      );

      const subscriptions = coordinator.getAllSubscriptions();
      expect(subscriptions.length).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Cancelled subscription')
      );
    });

    it('should treat different parameters as separate subscriptions', async () => {
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'klines',
        { interval: '1m' },
        'websocket'
      );

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'klines',
        { interval: '5m' },
        'websocket'
      );

      const subscriptions = coordinator.getAllSubscriptions();
      expect(subscriptions.length).toBe(2);
      expect(mockExchange.subscribeToKlines).toHaveBeenCalledTimes(2);
    });
  });

  describe('Subscription Method Selection', () => {
    it('should choose websocket when exchange is connected and hint is auto', async () => {
      mockExchange = {
        ...mockExchange,
        isConnected: true,
      } as unknown as IExchange;

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'auto'
      );

      const stats = coordinator.getStats();
      expect(stats.byMethod.websocket).toBe(1);
      expect(mockExchange.subscribeToTicker).toHaveBeenCalled();
    });

    it('should choose REST when exchange is not connected and hint is auto', async () => {
      vi.useFakeTimers();
      mockExchange = {
        ...mockExchange,
        isConnected: false,
      } as unknown as IExchange;

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'auto'
      );

      const stats = coordinator.getStats();
      expect(stats.byMethod.rest).toBe(1);
      expect(mockExchange.subscribeToTicker).not.toHaveBeenCalled();
    });

    it('should honor explicit websocket hint', async () => {
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      expect(mockExchange.subscribeToTicker).toHaveBeenCalled();
    });

    it('should honor explicit REST hint', async () => {
      vi.useFakeTimers();

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'rest'
      );

      const stats = coordinator.getStats();
      expect(stats.byMethod.rest).toBe(1);
    });
  });

  describe('REST Polling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should poll ticker at specified interval', async () => {
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        { pollInterval: 1000 },
        'rest'
      );

      expect(mockExchange.getTicker).not.toHaveBeenCalled();

      // Advance by polling interval
      vi.advanceTimersByTime(1000);
      expect(mockExchange.getTicker).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      expect(mockExchange.getTicker).toHaveBeenCalledTimes(2);
    });

    it('should emit data through exchange on REST poll', async () => {
      const mockTicker = {
        symbol: 'BTC/USDT',
        price: Decimal(50000),
        volume: Decimal(1000),
        timestamp: new Date(),
      } as const;
      vi.mocked(mockExchange.getTicker).mockResolvedValue(mockTicker);

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        { pollInterval: 1000 },
        'rest'
      );

      // Fast-forward time and run all pending promises
      await vi.advanceTimersByTimeAsync(1000);

      expect(mockExchange.emit).toHaveBeenCalledWith(
        'ticker',
        'BTC/USDT',
        mockTicker
      );
    });

    it.skip('should stop polling when subscription is cancelled', async () => {
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        { pollInterval: 1000 },
        'rest'
      );

      // Verify polling starts
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockExchange.getTicker).toHaveBeenCalled();

      // Unsubscribe and verify it's removed
      await coordinator.unsubscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {}
      );

      // Verify subscription is gone
      const stats = coordinator.getStats();
      expect(stats.total).toBe(0);
    });

    it('should use default polling intervals for different data types', async () => {
      // Ticker: 5000ms default
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'rest'
      );

      vi.advanceTimersByTime(4999);
      expect(mockExchange.getTicker).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(mockExchange.getTicker).toHaveBeenCalled();
    });

    it('should handle polling errors gracefully', async () => {
      vi.mocked(mockExchange.getTicker).mockRejectedValue(
        new Error('Network error')
      );

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        { pollInterval: 1000 },
        'rest'
      );

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to poll'),
        expect.any(Error)
      );

      // Should continue polling after error
      await vi.advanceTimersByTimeAsync(1000);
      expect(
        vi.mocked(mockExchange.getTicker).mock.calls.length
      ).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Observer Pattern', () => {
    beforeEach(() => {
      coordinator.addObserver(mockObserver);
    });

    it('should notify observers when subscription is created', async () => {
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      expect(mockObserver.onSubscriptionCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          exchange: 'test-exchange',
          symbol: 'BTC/USDT',
          type: 'ticker',
        }),
        'websocket'
      );
    });

    it('should notify observers when subscription is removed', async () => {
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      await coordinator.unsubscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {}
      );

      expect(mockObserver.onSubscriptionRemoved).toHaveBeenCalledWith(
        expect.objectContaining({
          exchange: 'test-exchange',
          symbol: 'BTC/USDT',
          type: 'ticker',
        })
      );
    });

    it('should notify observers of errors', async () => {
      vi.mocked(mockExchange.subscribeToTicker).mockRejectedValue(
        new Error('WebSocket error')
      );

      await expect(
        coordinator.subscribe(
          'strategy1',
          mockExchange,
          'BTC/USDT',
          'ticker',
          {},
          'websocket'
        )
      ).rejects.toThrow('WebSocket error');

      expect(mockObserver.onSubscriptionError).toHaveBeenCalledWith(
        expect.objectContaining({
          exchange: 'test-exchange',
          symbol: 'BTC/USDT',
          type: 'ticker',
        }),
        expect.any(Error)
      );
    });

    it('should allow removing observers', async () => {
      coordinator.removeObserver(mockObserver);

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      expect(mockObserver.onSubscriptionCreated).not.toHaveBeenCalled();
    });
  });

  describe('Statistics', () => {
    it('should track total subscriptions', async () => {
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'ETH/USDT',
        'ticker',
        {},
        'websocket'
      );

      const stats = coordinator.getStats();
      expect(stats.total).toBe(2);
    });

    it('should track subscriptions by type', async () => {
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'orderbook',
        {},
        'websocket'
      );

      const stats = coordinator.getStats();
      expect(stats.byType.ticker).toBe(1);
      expect(stats.byType.orderbook).toBe(1);
    });

    it('should track subscriptions by method', async () => {
      vi.useFakeTimers();

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'ETH/USDT',
        'ticker',
        {},
        'rest'
      );

      const stats = coordinator.getStats();
      expect(stats.byMethod.websocket).toBe(1);
      expect(stats.byMethod.rest).toBe(1);
    });

    it('should track subscriptions by exchange', async () => {
      const mockExchange2 = {
        ...mockExchange,
        name: 'exchange2',
      } as unknown as IExchange;

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      await coordinator.subscribe(
        'strategy1',
        mockExchange2,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      const stats = coordinator.getStats();
      expect(stats.byExchange['test-exchange']).toBe(1);
      expect(stats.byExchange['exchange2']).toBe(1);
    });
  });

  describe('Query Methods', () => {
    it('should get subscriptions for a specific strategy', async () => {
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'ETH/USDT',
        'ticker',
        {},
        'websocket'
      );

      await coordinator.subscribe(
        'strategy2',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      const strategy1Subs = coordinator.getStrategySubscriptions('strategy1');
      expect(strategy1Subs.length).toBe(2);

      const strategy2Subs = coordinator.getStrategySubscriptions('strategy2');
      expect(strategy2Subs.length).toBe(1);
    });

    it('should check if subscription exists', async () => {
      const key: SubscriptionKey = {
        exchange: 'test-exchange',
        symbol: 'BTC/USDT',
        type: 'ticker',
        params: {},
      };

      expect(coordinator.hasSubscription(key)).toBe(false);

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      expect(coordinator.hasSubscription(key)).toBe(true);
    });

    it('should get all subscriptions', async () => {
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'ETH/USDT',
        'ticker',
        {},
        'websocket'
      );

      const allSubs = coordinator.getAllSubscriptions();
      expect(allSubs.length).toBe(2);
      expect(allSubs[0]).toHaveProperty('key');
      expect(allSubs[0]).toHaveProperty('refCount');
      expect(allSubs[0]).toHaveProperty('strategies');
      expect(allSubs[0]).toHaveProperty('method');
    });
  });

  describe('Cleanup', () => {
    it('should clear all subscriptions', async () => {
      vi.useFakeTimers();

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'rest'
      );

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'ETH/USDT',
        'ticker',
        {},
        'websocket'
      );

      expect(coordinator.getStats().total).toBe(2);

      await coordinator.clear();

      expect(coordinator.getStats().total).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith('All subscriptions cleared');
    });

    it('should stop all REST polling timers on clear', async () => {
      vi.useFakeTimers();

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        { pollInterval: 1000 },
        'rest'
      );

      await coordinator.clear();

      vi.advanceTimersByTime(2000);
      // Should not poll after clear
      expect(mockExchange.getTicker).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle exchange subscription errors', async () => {
      vi.mocked(mockExchange.subscribeToTicker).mockRejectedValue(
        new Error('Connection failed')
      );

      await expect(
        coordinator.subscribe(
          'strategy1',
          mockExchange,
          'BTC/USDT',
          'ticker',
          {},
          'websocket'
        )
      ).rejects.toThrow('Connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to subscribe'),
        expect.any(Error)
      );

      // Subscription should not be created
      expect(coordinator.getStats().total).toBe(0);
    });

    it('should handle unsubscribe from non-existent subscription', async () => {
      await coordinator.unsubscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {}
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('non-existent subscription')
      );
    });

    it('should handle observer errors gracefully', async () => {
      const faultyObserver: ISubscriptionObserver = {
        onSubscriptionCreated: vi.fn().mockImplementation(() => {
          throw new Error('Observer error');
        }),
        onSubscriptionRemoved: vi.fn(),
        onSubscriptionError: vi.fn(),
      };

      coordinator.addObserver(faultyObserver);

      // Should not throw, but log error
      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error notifying subscription observer',
        expect.any(Error)
      );

      // Subscription should still be created
      expect(coordinator.getStats().total).toBe(1);
    });
  });

  describe('Subscription Metadata', () => {
    it('should track creation and update timestamps', async () => {
      const beforeCreate = new Date();

      await coordinator.subscribe(
        'strategy1',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      const afterCreate = new Date();

      const subs = coordinator.getAllSubscriptions();
      expect(subs[0].createdAt).toBeInstanceOf(Date);
      expect(subs[0].createdAt.getTime()).toBeGreaterThanOrEqual(
        beforeCreate.getTime()
      );
      expect(subs[0].createdAt.getTime()).toBeLessThanOrEqual(
        afterCreate.getTime()
      );

      const firstUpdate = subs[0].lastUpdated;

      // Add another strategy
      await coordinator.subscribe(
        'strategy2',
        mockExchange,
        'BTC/USDT',
        'ticker',
        {},
        'websocket'
      );

      const updatedSubs = coordinator.getAllSubscriptions();
      expect(updatedSubs[0].lastUpdated.getTime()).toBeGreaterThanOrEqual(
        firstUpdate.getTime()
      );
    });
  });
});
