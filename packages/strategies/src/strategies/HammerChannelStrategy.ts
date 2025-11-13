import { FixedLengthList } from '@itrade/utils';
import {
  BaseStrategy,
  StrategyResult,
  StrategyConfig,
  Ticker,
  Kline,
  KlineInterval,
  Order,
  Position,
  InitialDataResult,
  StrategyParameters,
  DataUpdate,
  TradeMode,
  SignalType,
} from '@itrade/core';
import Decimal from 'decimal.js';
import { StrategyRegistryConfig } from '../type';

export const HammerChannelStrategyRegistryConfig: StrategyRegistryConfig<HammerChannelParameters> =
  {
    type: 'HammerChannelStrategy',
    name: 'Hammer Channel',
    description: 'Identifies hammer patterns within price channels',
    icon: '🔨',
    implemented: true,
    category: 'momentum',
    defaultParameters: {
      windowSize: 15,
      lowerShadowToBody: 2,
      upperShadowToBody: 0.3,
      bodyToRange: 0.35,
      highThreshold: 0.9,
      lowThreshold: 0.1,
      baseQuantity: 1000,
      leverage: 10,
      maxPositionSize: 6000,
      minPositionSize: -6000,
    },
    parameterDefinitions: [
      {
        name: 'windowSize',
        type: 'number',
        description: 'Number of candles to analyze for channel calculation (e.g., 15) ',
        defaultValue: 15,
        required: true,
        min: 5,
        max: 100,
        group: 'Channel',
        order: 1,
      },
      {
        name: 'lowerShadowToBody',
        type: 'number',
        description:
          'Minimum ratio of lower shadow to body for hammer detection (e.g., 2 = lower shadow must be 2x body)',
        defaultValue: 2,
        required: true,
        min: 1,
        max: 10,
        group: 'Hammer',
        order: 2,
      },
      {
        name: 'upperShadowToBody',
        type: 'number',
        description:
          'Maximum ratio of upper shadow to body for hammer detection (e.g., 0.8 = upper shadow must be <80% of body)',
        defaultValue: 0.8,
        required: true,
        min: 0,
        max: 1,
        group: 'Hammer',
        order: 3,
      },
      {
        name: 'bodyToRange',
        type: 'number',
        description:
          'Maximum ratio of body to total range for hammer detection (e.g., 0.35 = body must be <35% of range)',
        defaultValue: 0.35,
        required: true,
        min: 0.1,
        max: 0.9,
        group: 'Hammer',
        order: 4,
      },
      {
        name: 'highThreshold',
        type: 'number',
        description:
          'High position threshold for sell signals (e.g., 0.9 = top 10% of channel) ',
        defaultValue: 0.9,
        required: true,
        min: 0.5,
        max: 1,
        group: 'Channel',
        order: 5,
      },
      {
        name: 'lowThreshold',
        type: 'number',
        description:
          'Low position threshold for buy signals (e.g., 0.1 = bottom 10% of channel)',
        defaultValue: 0.1,
        required: true,
        min: 0,
        max: 0.5,
        group: 'Channel',
        order: 6,
      },
      {
        name: 'baseQuantity',
        type: 'number',
        description: 'Base quantity for trading (e.g., 1000)',
        defaultValue: 1000,
        required: true,
        min: 100,
        max: 10000,
        group: 'Risk Management',
        order: 7,
      },
      {
        name: 'leverage',
        type: 'number',
        description: 'Leverage for trading (e.g., 10)',
        defaultValue: 10,
        required: true,
        min: 1,
        max: 100,
        group: 'Risk Management',
        order: 8,
      },
      {
        name: 'maxPositionSize',
        type: 'number',
        description: 'Max position size for trading (e.g., 6000)',
        defaultValue: 6000,
        required: true,
        min: 1000,
        max: 100000,
        group: 'Risk Management',
        order: 9,
      },
      {
        name: 'minPositionSize',
        type: 'number',
        description: 'Min position size for trading (e.g., -6000)',
        defaultValue: -6000,
        required: true,
        min: -100000,
        max: 100000,
        group: 'Risk Management',
        order: 10,
      },
    ],
    documentation: {
      overview: 'Detects hammer patterns and signals based on channel position.',
      parameters: 'Adjust ratios for pattern strictness, thresholds for timing.',
      signals: 'Buy: Bearish hammer at low. Sell: Bullish hammer at high.',
      riskFactors: ['False hammers', 'Strong trends'],
    },
  };
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
  /** Maximum ratio of upper shadow to body for hammer detection (e.g., 0.8 = upper shadow must be <80% of body) */
  upperShadowToBody: number;
  /** Maximum ratio of body to total range for hammer detection (e.g., 0.35 = body must be <35% of range) */
  bodyToRange: number;
  /** High position threshold for sell signals (e.g., 0.9 = top 10% of channel) */
  highThreshold: number;
  /** Low position threshold for buy signals (e.g., 0.1 = bottom 10% of channel) */
  lowThreshold: number;

  baseQuantity: number;
  leverage: number;
  maxPositionSize: number;
  minPositionSize: number;
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
  private baseQuantity: number;
  private leverage: number;
  private maxPositionSize: number;
  private minPositionSize: number;

  private klines: FixedLengthList<Kline>;

  // Account data
  private positions: Position[] = [];
  private position: Position | null = null;
  // Orders by executing signal generated by this Strategy, key is clientOrderId
  private orders: Map<string, Order | null> = new Map();
  // Open orders of the same symbol and exchange, key is order id. Used to calculate possible position size if all orders are filled.
  private openOrders: Map<string, Order> = new Map();

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

    this.baseQuantity = parameters.baseQuantity ?? 1000;
    this.leverage = parameters.leverage ?? 10;
    this.maxPositionSize = parameters.maxPositionSize ?? 6000;
    this.minPositionSize = parameters.minPositionSize ?? -6000;

    // Initialize buffers
    this.klines = new FixedLengthList<Kline>(this.windowSize);
    this.tickers = new FixedLengthList<Ticker>(10);

    // Note: Initial data will be processed via processInitialData() called by TradingEngine
    // after the strategy is added and initial data is loaded
  }

  /**
   * Process initial data loaded by TradingEngine
   * Overrides BaseStrategy.processInitialData to populate strategy buffers with historical data
   */
  public override processInitialData(initialData: InitialDataResult): void {
    this._logger.info(
      `📊 [${this.strategyType}] Processing initial data for ${initialData.symbol}`,
    );
    this._logger.info(JSON.stringify(initialData, null, 2));

    // Load historical klines into strategy buffer
    if (initialData.klines) {
      this._logger.info(
        `Initial data config: ${JSON.stringify(this._context.initialDataConfig, null, 2)}`,
      );
      Object.entries(initialData.klines).forEach(([interval, klines]) => {
        this._logger.info(`  📈 Loaded ${klines.length} klines for interval ${interval}`);
        // Store last N klines for analysis
        // Check if this interval was requested in initialDataConfig
        if (this._context.initialDataConfig?.klines?.[interval as KlineInterval]) {
          klines.forEach((kline) => {
            this.klines.push(kline);
          });
          this._logger.info(
            `  ✅ Loaded ${klines.length} klines for interval ${interval} into strategy buffer`,
          );
        }
      });
    }

    // Load current positions
    if (initialData.positions && initialData.positions.length > 0) {
      this.positions = initialData.positions;
      this._logger.info(`  💼 Loaded ${initialData.positions.length} position(s): `);
      this.positions.forEach((position) => {
        if (position.symbol === this._context.symbol) {
          this.position = position;
        }
      });
    }

    // Load open orders
    if (initialData.openOrders && initialData.openOrders.length > 0) {
      this._logger.info(`  📝 Loaded ${initialData.openOrders.length} open order(s)`);
      initialData.openOrders.forEach((order) => {
        if (order.symbol === this._context.symbol) {
          this.openOrders.set(order.id, order);
        }
      });
    }

    // Load current ticker
    if (initialData.ticker) {
      this.tickers.push(initialData.ticker);
      this._logger.info(`  🎯 Current price: ${initialData.ticker.price.toString()}`);
    }

    this._logger.info(`✅ [${this.strategyType}] Initial data processed successfully`);
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
    const { klines, positions, exchangeName } = dataUpdate;

    // Update account data
    this.handlePosition(positions, exchangeName);

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
    const closes = allKlines.map((k: Kline) => k.close.toNumber());
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
      const price = latestKline.close.add(latestKline.low).div(2);
      const quantity = new Decimal(this.baseQuantity); // Base quantity

      console.log(
        `✅ [HammerChannel] BUY signal: Bearish hammer at low position (${(positionRatio * 100).toFixed(1)}%)`,
      );
      if (this.checkPositionSizeForSignal('buy')) {
        return {
          action: 'buy',
          clientOrderId: this.generateClientOrderId(SignalType.Entry),
          price,
          quantity,
          leverage: this.leverage,
          tradeMode: TradeMode.ISOLATED,
        };
      }
    }

    if (isBullish && positionRatio >= this.highThreshold) {
      // Bullish hammer at high position = potential reversal down = SELL
      const price = latestKline.close.add(latestKline.high).div(2);
      const quantity = new Decimal(this.baseQuantity); // Base quantity

      console.log(
        `✅ [HammerChannel] SELL signal: Bullish hammer at high position (${(positionRatio * 100).toFixed(1)}%)`,
      );
      if (this.checkPositionSizeForSignal('sell')) {
        return {
          action: 'sell',
          clientOrderId: this.generateClientOrderId(SignalType.Entry),
          price,
          quantity,
          leverage: this.leverage,
          tradeMode: TradeMode.ISOLATED,
        };
      }
    }

    return {
      action: 'hold',
      reason: `Hammer detected but position not extreme (${(positionRatio * 100).toFixed(1)}%)`,
    };
  }

  private handlePosition(positions: Position[] | undefined, exchangeName?: string): void {
    if (positions && positions.length > 0) {
      const position = positions.find(
        (p) =>
          p.symbol === this._context.symbol && exchangeName === this._context.exchange,
      );
      if (position) {
        this.position = position;
      }
    }
  }

  private checkPositionSizeForSignal(side: 'buy' | 'sell'): boolean {
    const currentPositionSize = this.position?.quantity.toNumber() || 0;
    const newPositionSize =
      side === 'buy'
        ? currentPositionSize + this.baseQuantity
        : currentPositionSize - this.baseQuantity;
    return (
      newPositionSize <= this.maxPositionSize && newPositionSize >= this.minPositionSize
    );
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
      openOrders: this.orders.size,
    };
  }
}
