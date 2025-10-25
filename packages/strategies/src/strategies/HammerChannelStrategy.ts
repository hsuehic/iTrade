import { FixedLengthList } from '@itrade/utils';
import {
  BaseStrategy,
  StrategyResult,
  StrategyParameters,
  Ticker,
  Kline,
  Order,
  Balance,
  Position,
  OrderBook,
  Trade,
  InitialDataResult,
} from '@itrade/core';
import Decimal from 'decimal.js';

/**
 * Candle type for Hammer detection
 */
interface Candle {
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
}

/**
 * Hammer detection parameters
 */
interface HammerDetectionParams {
  lowerShadowToBody: number;
  upperShadowToBody: number;
  bodyToRange: number;
}

/**
 * Strategy parameters for HammerChannelStrategy
 */
export interface HammerChannelParameters extends StrategyParameters {
  windowSize: number;
  lowerShadowToBody: number;
  upperShadowToBody: number;
  bodyToRange: number;
  highThreshold: number;
  lowThreshold: number;
}

/**
 * 🔨 Hammer Channel Strategy
 *
 * This strategy identifies hammer candlestick patterns and generates trading signals
 * based on the position of the hammer within a recent price channel.
 *
 * Key concepts:
 * - Hammer Candle: A candle with a long lower shadow and small body
 * - Channel Position: Where the current price sits relative to recent high/low
 * - Buy Signal: Bearish hammer at low position (potential reversal up)
 * - Sell Signal: Bullish hammer at high position (potential reversal down)
 *
 * @example
 * ```typescript
 * const strategy = new HammerChannelStrategy({
 *   windowSize: 15,
 *   lowerShadowToBody: 2,
 *   upperShadowToBody: 0.3,
 *   bodyToRange: 0.35,
 *   highThreshold: 0.9,
 *   lowThreshold: 0.1,
 * });
 * ```
 */
export class HammerChannelStrategy extends BaseStrategy {
  private windowSize: number;
  private lowerShadowToBody: number;
  private upperShadowToBody: number;
  private bodyToRange: number;
  private highThreshold: number;
  private lowThreshold: number;

  private klines: FixedLengthList<Kline>;
  private candles: Candle[] = [];

  // Account data
  private positions: Position[] = [];
  private orders: Order[] = [];
  private balances: Balance[] = [];
  private tickers: FixedLengthList<Ticker>;

  constructor(parameters: HammerChannelParameters) {
    super('HammerChannel', parameters);

    // Initialize parameters with defaults
    this.windowSize = parameters.windowSize ?? 15;
    this.lowerShadowToBody = parameters.lowerShadowToBody ?? 2;
    this.upperShadowToBody = parameters.upperShadowToBody ?? 0.3;
    this.bodyToRange = parameters.bodyToRange ?? 0.35;
    this.highThreshold = parameters.highThreshold ?? 0.9;
    this.lowThreshold = parameters.lowThreshold ?? 0.1;

    // Initialize buffers
    this.klines = new FixedLengthList<Kline>(this.windowSize);
    this.tickers = new FixedLengthList<Ticker>(10);

    // 🆕 Process loaded initial data if available
    if (parameters.loadedInitialData) {
      this.processInitialData(parameters.loadedInitialData);
    }
  }

  /**
   * 🆕 Process initial data loaded by TradingEngine
   * Called from constructor if initialData was configured
   */
  private processInitialData(initialData: InitialDataResult): void {
    console.log(`📊 [${this.name}] Processing initial data for ${initialData.symbol}`);

    // Load historical klines into strategy buffer
    if (initialData.klines) {
      Object.entries(initialData.klines).forEach(([interval, klines]) => {
        console.log(`  📈 Loaded ${klines.length} klines for interval ${interval}`);
        // Store last N klines for analysis
        klines.forEach((kline) => {
          this.klines.push(kline);
          this.candles.push(this.klineToCandle(kline));
        });
      });
    }

    // Load current positions
    if (initialData.positions && initialData.positions.length > 0) {
      this.positions = initialData.positions;
      console.log(`  💼 Loaded ${initialData.positions.length} position(s)`);
    }

    // Load open orders
    if (initialData.openOrders && initialData.openOrders.length > 0) {
      this.orders = initialData.openOrders;
      console.log(`  📝 Loaded ${initialData.openOrders.length} open order(s)`);
    }

    // Load account balance
    if (initialData.balance) {
      this.balances = initialData.balance;
      console.log(`  💰 Loaded balance for ${initialData.balance.length} asset(s)`);
    }

    // Load current ticker
    if (initialData.ticker) {
      this.tickers.push(initialData.ticker);
      console.log(`  🎯 Current price: ${initialData.ticker.price.toString()}`);
    }

    console.log(`✅ [${this.name}] Initial data processed successfully`);
  }

  /**
   * Initialize strategy
   */
  protected async onInitialize(): Promise<void> {
    this.validateParameters([
      'windowSize',
      'lowerShadowToBody',
      'upperShadowToBody',
      'bodyToRange',
      'highThreshold',
      'lowThreshold',
    ]);

    this.windowSize = this.getParameter('windowSize');
    this.lowerShadowToBody = this.getParameter('lowerShadowToBody');
    this.upperShadowToBody = this.getParameter('upperShadowToBody');
    this.bodyToRange = this.getParameter('bodyToRange');
    this.highThreshold = this.getParameter('highThreshold');
    this.lowThreshold = this.getParameter('lowThreshold');

    console.log(`🔨 [HammerChannel] Initialized with parameters:`, {
      windowSize: this.windowSize,
      lowerShadowToBody: this.lowerShadowToBody,
      upperShadowToBody: this.upperShadowToBody,
      bodyToRange: this.bodyToRange,
      highThreshold: this.highThreshold,
      lowThreshold: this.lowThreshold,
    });
  }

  /**
   * Convert Kline to simple Candle format
   */
  private klineToCandle(kline: Kline): Candle {
    return {
      o: kline.open.toNumber(),
      h: kline.high.toNumber(),
      l: kline.low.toNumber(),
      c: kline.close.toNumber(),
    };
  }

  /**
   * Check if a candle is a hammer pattern
   */
  private isHammer(candle: Candle, params: HammerDetectionParams): boolean {
    const { o, h, l, c } = candle;
    const body = Math.abs(c - o);
    const range = h - l;

    if (range === 0 || body === 0) return false;

    const lowerShadow = Math.min(o, c) - l;
    const upperShadow = h - Math.max(o, c);

    // Check hammer conditions:
    // 1. Lower shadow should be at least N times the body
    const lowerShadowRatio = lowerShadow / body;
    if (lowerShadowRatio < params.lowerShadowToBody) return false;

    // 2. Upper shadow should be small (less than N times the body)
    const upperShadowRatio = upperShadow / body;
    if (upperShadowRatio > params.upperShadowToBody) return false;

    // 3. Body should be small relative to the range
    const bodyToRangeRatio = body / range;
    if (bodyToRangeRatio > params.bodyToRange) return false;

    return true;
  }

  /**
   * Analyze market data and generate trading signals
   */
  public override async analyze(marketData: {
    // Market Data
    ticker?: Ticker;
    klines?: Kline[];
    orderbook?: OrderBook;
    trades?: Trade[];
    // Account Data
    positions?: Position[];
    orders?: Order[];
    balances?: Balance[];
  }): Promise<StrategyResult> {
    this.ensureInitialized();

    // Update account data
    if (marketData.positions) this.positions = marketData.positions;
    if (marketData.orders) this.orders = marketData.orders;
    if (marketData.balances) this.balances = marketData.balances;

    // Process klines
    const klines = marketData?.klines;
    if (!klines || klines.length === 0) {
      return { action: 'hold', reason: 'No kline data available' };
    }

    // Get the latest kline
    const latestKline = klines[klines.length - 1];

    // 🔍 Validate symbol match
    const strategySymbol = this.getParameter('symbol');
    if (strategySymbol && latestKline.symbol !== strategySymbol) {
      return {
        action: 'hold',
        reason: `Symbol mismatch: expected ${strategySymbol}, got ${latestKline.symbol}`,
      };
    }

    // 🔍 Validate exchange match
    const strategyExchange = this.getParameter('exchange');
    if (strategyExchange && latestKline.exchange) {
      // Handle both single exchange and array of exchanges
      const exchanges = Array.isArray(strategyExchange)
        ? strategyExchange
        : [strategyExchange];
      if (!exchanges.includes(latestKline.exchange)) {
        return {
          action: 'hold',
          reason: `Exchange mismatch: expected ${exchanges.join(',')}, got ${latestKline.exchange}`,
        };
      }
    }

    // 🔍 Only process closed klines
    if (!latestKline.isClosed) {
      return { action: 'hold', reason: 'Waiting for kline to close' };
    }

    // ✅ Add to buffer (only closed klines with matching symbol/exchange)
    this.klines.push(latestKline);
    const candle = this.klineToCandle(latestKline);
    this.candles.push(candle);

    // Keep buffer size fixed
    if (this.candles.length > this.windowSize) {
      this.candles.shift();
    }

    // Need enough data
    if (this.candles.length < this.windowSize) {
      return {
        action: 'hold',
        reason: `Collecting data (${this.candles.length}/${this.windowSize})`,
      };
    }

    // Check if current candle is a hammer
    const isHammerCandle = this.isHammer(candle, {
      lowerShadowToBody: this.lowerShadowToBody,
      upperShadowToBody: this.upperShadowToBody,
      bodyToRange: this.bodyToRange,
    });

    if (!isHammerCandle) {
      return { action: 'hold', reason: 'No hammer pattern detected' };
    }

    console.log('🔨 [HammerChannel] Hammer pattern detected!');

    // Determine if bullish or bearish candle
    const isBullish = candle.c > candle.o;
    const isBearish = candle.c < candle.o;

    // Calculate position within recent channel
    const closes = this.candles.map((c) => c.c);
    const minClose = Math.min(...closes);
    const maxClose = Math.max(...closes);
    const range = maxClose - minClose || 1e-9; // Avoid division by zero

    const positionRatio = (candle.c - minClose) / range; // 0=lowest, 1=highest

    console.log(
      `🔨 [HammerChannel] Channel position: ${(positionRatio * 100).toFixed(2)}%`,
      {
        close: candle.c,
        minClose,
        maxClose,
        isBullish,
        isBearish,
      },
    );

    // Generate signals based on hammer type and position
    if (isBearish && positionRatio <= this.lowThreshold) {
      // Bearish hammer at low position = potential reversal up = BUY
      const price = new Decimal(candle.c);
      const quantity = new Decimal(100); // Base quantity

      console.log(
        `✅ [HammerChannel] BUY signal: Bearish hammer at low position (${(positionRatio * 100).toFixed(1)}%)`,
      );

      return {
        action: 'buy',
        price,
        quantity,
        takeProfit: price.mul(1.02), // 2% profit target
        stopLoss: price.mul(0.98), // 2% stop loss
        leverage: 1,
        tradeMode: 'isolated',
      };
    }

    if (isBullish && positionRatio >= this.highThreshold) {
      // Bullish hammer at high position = potential reversal down = SELL
      const price = new Decimal(candle.c);
      const quantity = new Decimal(100); // Base quantity

      console.log(
        `✅ [HammerChannel] SELL signal: Bullish hammer at high position (${(positionRatio * 100).toFixed(1)}%)`,
      );

      return {
        action: 'sell',
        price,
        quantity,
        takeProfit: price.mul(0.98), // 2% profit target
        stopLoss: price.mul(1.02), // 2% stop loss
        leverage: 1,
        tradeMode: 'isolated',
      };
    }

    return {
      action: 'hold',
      reason: `Hammer detected but position not extreme (${(positionRatio * 100).toFixed(1)}%)`,
    };
  }

  /**
   * Handle order filled event
   */
  public override async onOrderFilled(order: Order): Promise<void> {
    console.log('🔨 [HammerChannel] Order filled:', {
      orderId: order.id,
      side: order.side,
      price: order.price?.toString(),
      quantity: order.quantity?.toString(),
    });
  }

  /**
   * Cleanup strategy state
   */
  protected async onCleanup(): Promise<void> {
    this.candles = [];
    console.log('🔨 [HammerChannel] Strategy cleaned up');
  }

  /**
   * Get strategy state for monitoring
   */
  public getStrategyState() {
    return {
      strategyId: this.getStrategyId(),
      name: this.name,
      candleCount: this.candles.length,
      windowSize: this.windowSize,
      positions: this.positions.length,
      openOrders: this.orders.length,
    };
  }
}
