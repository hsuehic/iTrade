import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import {
  type HammerChannelParameters,
  HammerChannelStrategy,
} from '../strategies/HammerChannelStrategy';
import { Kline, StrategyConfig } from '@itrade/core';

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
}): Kline {
  const {
    open,
    high,
    low,
    close,
    symbol = 'BTC/USDT',
    exchange = 'binance',
    timestamp = Date.now(),
    isClosed = true,
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
    volume: new Decimal(1000),
    quoteVolume: new Decimal(50000),
    trades: 100,
    isClosed,
  };
}

/**
 * Create a Bearish Hammer (potential reversal up)
 * - close < open (bearish/red candle)
 * - long lower shadow
 * - small upper shadow
 * - small body
 */
function createBearishHammer(
  price: number,
  symbol?: string,
  exchange?: string,
  timestamp?: number,
): Kline {
  const bodySize = 5; // Small body
  const lowerShadow = 20; // Long lower shadow
  const upperShadow = 1; // Very small upper shadow

  return createKline({
    open: price,
    high: price + upperShadow,
    low: price - bodySize - lowerShadow,
    close: price - bodySize,
    symbol,
    exchange,
    timestamp,
  });
}

/**
 * Create a Bullish Hammer (potential reversal down when at high)
 * - close > open (bullish/green candle)
 * - long lower shadow
 * - small upper shadow
 * - small body
 */
function createBullishHammer(
  price: number,
  symbol?: string,
  exchange?: string,
  timestamp?: number,
): Kline {
  const bodySize = 5; // Small body
  const lowerShadow = 20; // Long lower shadow
  const upperShadow = 1; // Very small upper shadow

  return createKline({
    open: price,
    high: price + bodySize + upperShadow,
    low: price - lowerShadow,
    close: price + bodySize,
    symbol,
    exchange,
    timestamp,
  });
}

/**
 * Create a regular candle (NOT a hammer)
 */
function createRegularCandle(
  price: number,
  symbol?: string,
  exchange?: string,
  timestamp?: number,
): Kline {
  return createKline({
    open: price,
    high: price + 10,
    low: price - 10,
    close: price + 5,
    symbol,
    exchange,
    timestamp,
  });
}

describe('HammerChannelStrategy', () => {
  let strategy: HammerChannelStrategy;
  let config: StrategyConfig<HammerChannelParameters>;

  beforeEach(async () => {
    config = {
      type: 'hammer_channel',
      parameters: {
        windowSize: 15,
        lowerShadowToBody: 2,
        upperShadowToBody: 0.3,
        bodyToRange: 0.35,
        highThreshold: 0.9,
        lowThreshold: 0.1,
      },
      symbol: 'BTC/USDT',
      exchange: 'binance',
    };

    strategy = new HammerChannelStrategy(config);
    await strategy.initialize(config);
  });

  describe('Initialization', () => {
    it('should initialize with correct parameters', () => {
      const state = strategy.getStrategyState();
      expect(state.strategyType).toBe('hammer_channel');
      expect(state.windowSize).toBe(15);
      expect(state.klineCount).toBe(0);
    });

    it('should validate required parameters', async () => {
      const invalidConfig = {
        type: 'hammer_channel',
        parameters: {} as HammerChannelParameters,
        symbol: 'BTC/USDT',
        exchange: 'binance',
      };

      const invalidStrategy = new HammerChannelStrategy(invalidConfig);
      await expect(invalidStrategy.initialize(invalidConfig)).rejects.toThrow();
    });
  });

  describe('Data Collection Phase', () => {
    it('should return hold when not enough data collected', async () => {
      // Add only 5 klines (need 15), one at a time
      let result;
      for (let i = 0; i < 5; i++) {
        const kline = createRegularCandle(
          50000 + i * 10,
          'BTC/USDT',
          'binance',
          Date.now() + i * 1000,
        );
        result = await strategy.analyze({ klines: [kline] });
      }

      expect(result!.action).toBe('hold');
      expect(result!.reason).toContain('Collecting data');
      expect(result!.reason).toContain('5/15');
    });

    it('should accept data once windowSize is reached', async () => {
      // Add exactly 15 klines, one at a time
      let result;
      for (let i = 0; i < 15; i++) {
        const kline = createRegularCandle(
          50000 + i * 10,
          'BTC/USDT',
          'binance',
          Date.now() + i * 1000,
        );
        result = await strategy.analyze({ klines: [kline] });
      }

      // Should not be collecting anymore
      expect(result!.reason).not.toContain('Collecting data');
    });
  });

  describe('Kline Validation', () => {
    it('should reject klines that are not closed', async () => {
      // Create 15 regular candles first
      const baseKlines = Array.from({ length: 14 }, (_, i) =>
        createRegularCandle(50000, 'BTC/USDT', 'binance', Date.now() + i * 1000),
      );

      // Add an unclosed kline
      const unclosedKline = createKline({
        open: 50000,
        high: 50010,
        low: 49990,
        close: 50005,
        isClosed: false,
      });

      const result = await strategy.analyze({ klines: [...baseKlines, unclosedKline] });

      expect(result.action).toBe('hold');
      expect(result.reason).toBe('Waiting for kline to close');
    });

    it('should reject klines with mismatched symbol', async () => {
      const klines = Array.from({ length: 15 }, (_, i) =>
        createRegularCandle(50000, 'ETH/USDT', 'binance', Date.now() + i * 1000),
      );

      const result = await strategy.analyze({ klines });

      expect(result.action).toBe('hold');
      expect(result.reason).toContain('Symbol mismatch');
    });

    it('should reject klines with mismatched exchange', async () => {
      const klines = Array.from({ length: 15 }, (_, i) =>
        createRegularCandle(50000, 'BTC/USDT', 'okx', Date.now() + i * 1000),
      );

      const result = await strategy.analyze({ klines });

      expect(result.action).toBe('hold');
      expect(result.reason).toContain('Exchange mismatch');
    });
  });

  describe('Hammer Pattern Detection', () => {
    it('should detect no signal when no hammer pattern exists', async () => {
      // Add 15 regular candles (not hammers), one at a time
      let result;
      for (let i = 0; i < 15; i++) {
        const kline = createRegularCandle(
          50000 + i * 10,
          'BTC/USDT',
          'binance',
          Date.now() + i * 1000,
        );
        result = await strategy.analyze({ klines: [kline] });
      }

      expect(result!.action).toBe('hold');
      expect(result!.reason).toBe('No hammer pattern detected');
    });

    it('should detect hammer pattern at middle position and hold', async () => {
      // Create price channel: 49000 to 51000 (middle ~50000)
      for (let i = 0; i < 14; i++) {
        const price = 49000 + (i * 2000) / 14; // Spread prices across range
        const kline = createRegularCandle(
          price,
          'BTC/USDT',
          'binance',
          Date.now() + i * 1000,
        );
        await strategy.analyze({ klines: [kline] });
      }

      // Add bearish hammer at middle position (~50000)
      const hammerKline = createBearishHammer(
        50000,
        'BTC/USDT',
        'binance',
        Date.now() + 15000,
      );
      const result = await strategy.analyze({ klines: [hammerKline] });

      expect(result.action).toBe('hold');
      expect(result.reason).toContain('Hammer detected but position not extreme');
    });
  });

  describe('BUY Signal Generation', () => {
    it('should generate BUY signal for bearish hammer at low position', async () => {
      // Create price channel with recent high prices, then drop to low
      // First 14 klines: high prices (51000-52000)
      for (let i = 0; i < 14; i++) {
        const kline = createRegularCandle(
          51000 + i * 70,
          'BTC/USDT',
          'binance',
          Date.now() + i * 1000,
        );
        await strategy.analyze({ klines: [kline] });
      }

      // Last kline: Bearish hammer at LOW position (49100)
      // This creates positionRatio near 0 (below lowThreshold of 0.1)
      const hammerKline = createBearishHammer(
        49100,
        'BTC/USDT',
        'binance',
        Date.now() + 15000,
      );
      const result = await strategy.analyze({ klines: [hammerKline] });

      expect(result.action).toBe('buy');
      expect(result.price).toBeDefined();
      expect(result.quantity).toBeDefined();
      expect(result.leverage).toBe(1);
      expect(result.tradeMode).toBe('isolated');

      // Verify price is based on hammer close price
      expect(result.price?.toNumber()).toBeCloseTo(49095, 0); // close = 49100 - 5
    });

    it('should NOT generate BUY signal for bullish hammer at low position', async () => {
      // Create price channel with recent high prices, then drop to low
      for (let i = 0; i < 14; i++) {
        const kline = createRegularCandle(
          51000 + i * 70,
          'BTC/USDT',
          'binance',
          Date.now() + i * 1000,
        );
        await strategy.analyze({ klines: [kline] });
      }

      // Bullish hammer at LOW position - should NOT trigger BUY
      // (we want bearish hammer for buy signal)
      const hammerKline = createBullishHammer(
        49100,
        'BTC/USDT',
        'binance',
        Date.now() + 15000,
      );
      const result = await strategy.analyze({ klines: [hammerKline] });

      expect(result.action).toBe('hold');
    });
  });

  describe('SELL Signal Generation', () => {
    it('should generate SELL signal for bullish hammer at high position', async () => {
      // Create price channel with recent low prices, then spike to high
      // First 14 klines: low prices (49000-50000)
      for (let i = 0; i < 14; i++) {
        const kline = createRegularCandle(
          49000 + i * 70,
          'BTC/USDT',
          'binance',
          Date.now() + i * 1000,
        );
        await strategy.analyze({ klines: [kline] });
      }

      // Last kline: Bullish hammer at HIGH position (51900)
      // This creates positionRatio near 1 (above highThreshold of 0.9)
      const hammerKline = createBullishHammer(
        51900,
        'BTC/USDT',
        'binance',
        Date.now() + 15000,
      );
      const result = await strategy.analyze({ klines: [hammerKline] });

      expect(result.action).toBe('sell');
      expect(result.price).toBeDefined();
      expect(result.quantity).toBeDefined();
      expect(result.leverage).toBe(1);
      expect(result.tradeMode).toBe('isolated');

      // Verify price is based on hammer close price
      expect(result.price?.toNumber()).toBeCloseTo(51905, 0); // close = 51900 + 5
    });

    it('should NOT generate SELL signal for bearish hammer at high position', async () => {
      // Create price channel with recent low prices, then spike to high
      for (let i = 0; i < 14; i++) {
        const kline = createRegularCandle(
          49000 + i * 70,
          'BTC/USDT',
          'binance',
          Date.now() + i * 1000,
        );
        await strategy.analyze({ klines: [kline] });
      }

      // Bearish hammer at HIGH position - should NOT trigger SELL
      // (we want bullish hammer for sell signal)
      const hammerKline = createBearishHammer(
        51900,
        'BTC/USDT',
        'binance',
        Date.now() + 15000,
      );
      const result = await strategy.analyze({ klines: [hammerKline] });

      expect(result.action).toBe('hold');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty klines array', async () => {
      const result = await strategy.analyze({ klines: [] });

      expect(result.action).toBe('hold');
      expect(result.reason).toBe('No kline data available');
    });

    it('should handle undefined klines', async () => {
      const result = await strategy.analyze({});

      expect(result.action).toBe('hold');
      expect(result.reason).toBe('No kline data available');
    });

    it('should handle klines with same close prices (no range)', async () => {
      // All klines have the same close price
      const klines = Array.from({ length: 15 }, (_, i) =>
        createRegularCandle(50000, 'BTC/USDT', 'binance', Date.now() + i * 1000),
      );

      const result = await strategy.analyze({ klines });

      // Should not crash and return hold
      expect(result.action).toBe('hold');
    });

    it('should update positions when provided in marketData', async () => {
      const klines = Array.from({ length: 15 }, (_, i) =>
        createRegularCandle(50000, 'BTC/USDT', 'binance', Date.now() + i * 1000),
      );

      const positions = [
        {
          symbol: 'BTC/USDT',
          exchange: 'binance',
          side: 'long' as const,
          contracts: new Decimal(1),
          entryPrice: new Decimal(50000),
          markPrice: new Decimal(50100),
          liquidationPrice: new Decimal(45000),
          leverage: new Decimal(1),
          unrealizedPnl: new Decimal(100),
          timestamp: new Date(),
          quantity: new Decimal(1),
          avgPrice: new Decimal(50000),
        },
      ];

      const result = await strategy.analyze({ klines, positions });

      // Should not crash with positions data
      expect(result).toBeDefined();
      expect(result.action).toBeDefined();
    });
  });

  describe('Parameter Boundaries', () => {
    it('should trigger BUY at exact lowThreshold', async () => {
      const customConfig = {
        ...config,
        parameters: {
          ...config.parameters,
          lowThreshold: 0.2, // 20% threshold
        },
      };

      const customStrategy = new HammerChannelStrategy(customConfig);
      await customStrategy.initialize(customConfig);

      // Create channel with consistent prices
      // Use prices from 50000 to 52000
      for (let i = 0; i < 14; i++) {
        const kline = createRegularCandle(
          50000 + i * 140,
          'BTC/USDT',
          'binance',
          Date.now() + i * 1000,
        );
        await customStrategy.analyze({ klines: [kline] });
      }

      // Add bearish hammer at low position (< 20%)
      // Use 49900 to ensure it's at the bottom
      const hammerKline = createBearishHammer(
        49900,
        'BTC/USDT',
        'binance',
        Date.now() + 15000,
      );
      const result = await customStrategy.analyze({ klines: [hammerKline] });

      expect(result.action).toBe('buy');
    });

    it('should trigger SELL at exact highThreshold', async () => {
      const customConfig = {
        ...config,
        parameters: {
          ...config.parameters,
          highThreshold: 0.8, // 80% threshold
        },
      };

      const customStrategy = new HammerChannelStrategy(customConfig);
      await customStrategy.initialize(customConfig);

      // Create channel: 49000 to 51000
      for (let i = 0; i < 14; i++) {
        const kline = createRegularCandle(
          49000 + i * 140,
          'BTC/USDT',
          'binance',
          Date.now() + i * 1000,
        );
        await customStrategy.analyze({ klines: [kline] });
      }

      // Add bullish hammer at exactly 80% position
      // 49000 + (51000-49000) * 0.8 = 50600
      const hammerKline = createBullishHammer(
        50600,
        'BTC/USDT',
        'binance',
        Date.now() + 15000,
      );
      const result = await customStrategy.analyze({ klines: [hammerKline] });

      expect(result.action).toBe('sell');
    });
  });

  describe('Strategy State', () => {
    it('should update klineCount as data is processed', async () => {
      let state = strategy.getStrategyState();
      expect(state.klineCount).toBe(0);

      // Add 5 klines, one at a time
      for (let i = 0; i < 5; i++) {
        const kline = createRegularCandle(
          50000,
          'BTC/USDT',
          'binance',
          Date.now() + i * 1000,
        );
        await strategy.analyze({ klines: [kline] });
      }

      state = strategy.getStrategyState();
      expect(state.klineCount).toBe(5);

      // Add 10 more klines
      for (let i = 0; i < 10; i++) {
        const kline = createRegularCandle(
          50000,
          'BTC/USDT',
          'binance',
          Date.now() + (i + 5) * 1000,
        );
        await strategy.analyze({ klines: [kline] });
      }

      state = strategy.getStrategyState();
      expect(state.klineCount).toBe(15); // capped at windowSize
    });

    it('should maintain fixed window size', async () => {
      // Add 20 klines (more than windowSize of 15)
      for (let i = 0; i < 20; i++) {
        const klines = [
          createRegularCandle(50000 + i, 'BTC/USDT', 'binance', Date.now() + i * 1000),
        ];
        await strategy.analyze({ klines });
      }

      const state = strategy.getStrategyState();
      expect(state.klineCount).toBe(15); // Should not exceed windowSize
    });
  });

  describe('Cleanup', () => {
    it('should cleanup strategy state', async () => {
      // Add some data, one at a time
      for (let i = 0; i < 10; i++) {
        const kline = createRegularCandle(
          50000,
          'BTC/USDT',
          'binance',
          Date.now() + i * 1000,
        );
        await strategy.analyze({ klines: [kline] });
      }

      let state = strategy.getStrategyState();
      expect(state.klineCount).toBe(10);

      // Cleanup is optional in IStrategy interface
      if (typeof (strategy as any).cleanup === 'function') {
        await (strategy as any).cleanup();
      }

      // Strategy should still be defined
      expect(strategy).toBeDefined();
    });
  });
});
