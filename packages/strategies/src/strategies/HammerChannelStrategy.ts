import { FixedLengthList } from '@itrade/utils';
import {
  BaseStrategy,
  StrategyResult,
  StrategyConfig,
  Ticker,
  Kline,
  Order,
  Position,
  InitialDataResult,
  StrategyParameters,
  DataUpdate,
} from '@itrade/core';
import Decimal from 'decimal.js';

/**
 * Hammer detection parameters
 */
interface HammerDetectionParams {
  lowerShadowToBody: number;
  upperShadowToBody: number;
  bodyToRange: number;
}

/**
 * Hammer Channel Strategy Parameters
 * Detects hammer candlestick patterns and generates signals based on channel position
 */
export interface HammerChannelParameters extends StrategyParameters {
  /** Number of candles to analyze for channel calculation (e.g., 15) */
  windowSize: number;
  /** Minimum ratio of lower shadow to body for hammer detection (e.g., 2 = lower shadow must be 2x body) */
  lowerShadowToBody: number;
  /** Maximum ratio of upper shadow to body for hammer detection (e.g., 0.3 = upper shadow must be <30% of body) */
  upperShadowToBody: number;
  /** Maximum ratio of body to total range for hammer detection (e.g., 0.35 = body must be <35% of range) */
  bodyToRange: number;
  /** High position threshold for sell signals (e.g., 0.9 = top 10% of channel) */
  highThreshold: number;
  /** Low position threshold for buy signals (e.g., 0.1 = bottom 10% of channel) */
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
export class HammerChannelStrategy extends BaseStrategy<HammerChannelParameters> {
  private windowSize: number;
  private lowerShadowToBody: number;
  private upperShadowToBody: number;
  private bodyToRange: number;
  private highThreshold: number;
  private lowThreshold: number;

  private klines: FixedLengthList<Kline>;

  // Account data
  private positions: Position[] = [];
  private orders: Order[] = [];
  private tickers: FixedLengthList<Ticker>;

  constructor(config: StrategyConfig<HammerChannelParameters>) {
    super(config);
    const { parameters } = config;
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
    if (config.loadedInitialData) {
      this.processInitialData(config.loadedInitialData);
    }
  }

  /**
   * 🆕 Process initial data loaded by TradingEngine
   * Called from constructor if initialData was configured
   */
  private processInitialData(initialData: InitialDataResult): void {
    console.log(
      `📊 [${this.strategyType}] Processing initial data for ${initialData.symbol}`,
    );

    // Load historical klines into strategy buffer
    if (initialData.klines) {
      Object.entries(initialData.klines).forEach(([interval, klines]) => {
        console.log(`  📈 Loaded ${klines.length} klines for interval ${interval}`);
        // Store last N klines for analysis
        klines.forEach((kline) => {
          this.klines.push(kline);
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

    // Load current ticker
    if (initialData.ticker) {
      this.tickers.push(initialData.ticker);
      console.log(`  🎯 Current price: ${initialData.ticker.price.toString()}`);
    }

    console.log(`✅ [${this.strategyType}] Initial data processed successfully`);
  }

  /**
   * Initialize strategy
   */
  protected override async onInitialize(): Promise<void> {
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
   * Check if a kline is a hammer pattern
   */
  private isHammer(kline: Kline, params: HammerDetectionParams): boolean {
    const o = kline.open.toNumber();
    const h = kline.high.toNumber();
    const l = kline.low.toNumber();
    const c = kline.close.toNumber();

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
  public override async analyze(dataUpdate: DataUpdate): Promise<StrategyResult> {
    this.ensureInitialized();

    const { ticker, klines, positions, orders, exchangeName, symbol } = dataUpdate;

    // Update account data

    // Process klines
    if (!klines || klines.length === 0) {
      return { action: 'hold', reason: 'No kline data available' };
    }

    // Get the latest kline
    const latestKline = klines[klines.length - 1];

    // 🔍 Validate symbol match
    const strategySymbol = this._context.symbol;
    if (strategySymbol && latestKline.symbol !== strategySymbol) {
      return {
        action: 'hold',
        reason: `Symbol mismatch: expected ${strategySymbol}, got ${latestKline.symbol}`,
      };
    }

    // 🔍 Validate exchange match
    const strategyExchange = this._context.exchange;
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

    // Need enough data
    const allKlines = this.klines.toArray();
    if (allKlines.length < this.windowSize) {
      return {
        action: 'hold',
        reason: `Collecting data (${allKlines.length}/${this.windowSize})`,
      };
    }

    // Check if current kline is a hammer
    const isHammerCandle = this.isHammer(latestKline, {
      lowerShadowToBody: this.lowerShadowToBody,
      upperShadowToBody: this.upperShadowToBody,
      bodyToRange: this.bodyToRange,
    });

    if (!isHammerCandle) {
      return { action: 'hold', reason: 'No hammer pattern detected' };
    }

    console.log('🔨 [HammerChannel] Hammer pattern detected!');

    // Determine if bullish or bearish kline
    const isBullish = latestKline.close.gt(latestKline.open);
    const isBearish = latestKline.close.lt(latestKline.open);

    // Calculate position within recent channel
    const closes = allKlines.map((k) => k.close.toNumber());
    const minClose = Math.min(...closes);
    const maxClose = Math.max(...closes);
    const range = maxClose - minClose || 1e-9; // Avoid division by zero

    const currentClose = latestKline.close.toNumber();
    const positionRatio = (currentClose - minClose) / range; // 0=lowest, 1=highest

    console.log(
      `🔨 [HammerChannel] Channel position: ${(positionRatio * 100).toFixed(2)}%`,
      {
        close: currentClose,
        minClose,
        maxClose,
        isBullish,
        isBearish,
      },
    );

    // Generate signals based on hammer type and position
    if (isBearish && positionRatio <= this.lowThreshold) {
      // Bearish hammer at low position = potential reversal up = BUY
      const price = latestKline.close;
      const quantity = new Decimal(100); // Base quantity

      console.log(
        `✅ [HammerChannel] BUY signal: Bearish hammer at low position (${(positionRatio * 100).toFixed(1)}%)`,
      );

      return {
        action: 'buy',
        price,
        quantity,
        leverage: 1,
        tradeMode: 'isolated',
      };
    }

    if (isBullish && positionRatio >= this.highThreshold) {
      // Bullish hammer at high position = potential reversal down = SELL
      const price = latestKline.close;
      const quantity = new Decimal(100); // Base quantity

      console.log(
        `✅ [HammerChannel] SELL signal: Bullish hammer at high position (${(positionRatio * 100).toFixed(1)}%)`,
      );

      return {
        action: 'sell',
        price,
        quantity,
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
    console.log('🔨 [HammerChannel] Strategy cleaned up');
  }

  /**
   * Get strategy state for monitoring
   */
  public getStrategyState() {
    return {
      strategyId: this.getStrategyId(),
      strategyType: this.strategyType,
      klineCount: this.klines.toArray().length,
      windowSize: this.windowSize,
      positions: this.positions.length,
      openOrders: this.orders.length,
    };
  }
}
