import { Decimal } from 'decimal.js';
import {
  BaseStrategy,
  StrategyResult,
  StrategyConfig,
  DataUpdate,
  StrategyParameters,
  SignalType,
  InitialDataResult,
  StrategyAnalyzeResult,
  KlineInterval,
} from '@itrade/core';
import { StrategyRegistryConfig } from '../type';

export const MovingAverageStrategyRegistryConfig: StrategyRegistryConfig<MovingAverageParameters> =
  {
    type: 'MovingAverageStrategy',
    name: 'Moving Average Crossover',
    description: 'Classic trend-following strategy using two moving averages',
    icon: '📈',
    implemented: true,
    category: 'trend',
    defaultParameters: {
      fastPeriod: 10,
      slowPeriod: 20,
      threshold: 0.01,
    },
    parameterDefinitions: [
      {
        name: 'fastPeriod',
        type: 'number',
        description: 'Fast moving average period',
        defaultValue: 10,
        required: true,
        min: 1,
        max: 100,
        group: 'Basic',
        order: 1,
      },
      {
        name: 'slowPeriod',
        type: 'number',
        description: 'Slow moving average period',
        defaultValue: 20,
        required: true,
        min: 2,
        max: 200,
        group: 'Basic',
        order: 2,
      },
      {
        name: 'threshold',
        type: 'number',
        description: 'Minimum crossover percentage',
        defaultValue: 0.01,
        required: true,
        min: 0,
        max: 1,
        group: 'Signal',
        order: 3,
        unit: '%',
      },
    ],

    // 🆕 Subscription requirements for MovingAverageStrategy
    subscriptionRequirements: {
      klines: {
        required: true,
        allowMultipleIntervals: true, // Can use multiple timeframes for confirmation
        defaultIntervals: ['15m'], // Default to 15m klines
        intervalsEditable: true, // User can choose different intervals
        description:
          'Kline data is required to calculate moving averages. You can select one or more intervals.',
      },
      ticker: {
        required: false,
        editable: true,
        description: 'Optional: Ticker data can be used for price updates between klines',
      },
    },

    // 🆕 Initial data requirements for MovingAverageStrategy
    initialDataRequirements: {
      klines: {
        required: true,
        defaultConfig: { '15m': 50 }, // Load 50 bars of 15m klines (enough for slow MA)
        allowMultipleIntervals: true, // Strategy can benefit from multiple timeframes
        description:
          'Historical klines are required to initialize moving averages. You can load multiple intervals for multi-timeframe analysis (e.g., 15m + 1h).',
      },
      fetchPositions: {
        required: true,
        description: 'Fetch current positions to know existing exposure',
      },
      fetchOpenOrders: {
        required: true,
        description: 'Fetch open orders to avoid duplicate signals',
      },
    },

    documentation: {
      overview:
        'Generates buy signals when fast MA crosses above slow MA, and sell signals when it crosses below.',
      parameters: 'Fast MA should be shorter than Slow MA.',
      signals: 'Buy: Fast MA > Slow MA. Sell: Fast MA < Slow MA.',
      riskFactors: ['Lagging indicator', 'Choppy markets'],
    },
  };

/**
 * 📊 MovingAverageStrategy 参数
 */
export interface MovingAverageParameters extends StrategyParameters {
  fastPeriod: number;
  slowPeriod: number;
  threshold: number;
}

type MovingAverageConfig = StrategyConfig<MovingAverageParameters>;

export class MovingAverageStrategy extends BaseStrategy<MovingAverageParameters> {
  private priceHistory: Decimal[] = [];
  private fastMA: Decimal = new Decimal(0);
  private slowMA: Decimal = new Decimal(0);
  private position: 'long' | 'short' | 'none' = 'none';

  constructor(config: MovingAverageConfig) {
    super(config);
  }

  public override async processInitialData(
    initialData: InitialDataResult,
  ): Promise<StrategyAnalyzeResult> {
    if (initialData.klines) {
      // Find the interval we are interested in (using the first one available)
      const intervals = Object.keys(initialData.klines);
      if (intervals.length > 0) {
        const klines = initialData.klines[intervals[0] as KlineInterval];
        if (klines && klines.length > 0) {
          // Clear history and populate with initial data
          this.priceHistory = klines.map((k) => k.close);
          this._logger.info(
            `📈 [MovingAverageStrategy] Populated price history with ${this.priceHistory.length} klines`,
          );
        }
      }
    }
    return { action: 'hold' };
  }

  public async analyze({ ticker, klines }: DataUpdate): Promise<StrategyResult> {
    let currentPrice: Decimal;

    // Get current price from available data
    if (ticker) {
      currentPrice = ticker.price;
    } else if (klines && klines.length > 0) {
      const latestKline = klines[klines.length - 1];
      currentPrice = latestKline.close;
    } else {
      return { action: 'hold', reason: 'No price data available' };
    }

    // Add price to history
    this.priceHistory.push(currentPrice);

    const fastPeriod = this._parameters.fastPeriod;
    const slowPeriod = this._parameters.slowPeriod;
    const threshold = this._parameters.threshold ?? 0.001;

    // Keep only required history
    if (this.priceHistory.length > slowPeriod) {
      this.priceHistory = this.priceHistory.slice(-slowPeriod);
    }

    // Need enough data to calculate slow MA
    if (this.priceHistory.length < slowPeriod) {
      return { action: 'hold', reason: 'Insufficient data for analysis' };
    }

    // Calculate moving averages
    this.fastMA = this.calculateSMA(fastPeriod);
    this.slowMA = this.calculateSMA(slowPeriod);

    // Generate signals
    const fastValue = this.fastMA.toNumber();
    const slowValue = this.slowMA.toNumber();
    const crossoverPercent = Math.abs(fastValue - slowValue) / slowValue;

    let action: 'buy' | 'sell' | 'hold' = 'hold';
    let confidence = 0;
    let reason = '';

    if (fastValue > slowValue && crossoverPercent > threshold) {
      if (this.position !== 'long') {
        action = 'buy';
        confidence = Math.min(crossoverPercent * 100, 1.0);
        reason = `Fast MA (${fastValue.toFixed(2)}) crossed above Slow MA (${slowValue.toFixed(2)})`;
        this.position = 'long';
      }
    } else if (fastValue < slowValue && crossoverPercent > threshold) {
      if (this.position !== 'short') {
        action = 'sell';
        confidence = Math.min(crossoverPercent * 100, 1.0);
        reason = `Fast MA (${fastValue.toFixed(2)}) crossed below Slow MA (${slowValue.toFixed(2)})`;
        this.position = 'short';
      }
    }

    // Calculate position size based on confidence
    let quantity: Decimal | undefined;
    if (action !== 'hold') {
      const baseQuantity = (this._parameters as any).baseQuantity ?? 100;
      quantity = new Decimal(baseQuantity).mul(confidence);
    }

    return {
      action,
      quantity,
      price: currentPrice,
      confidence,
      reason:
        reason || `Fast MA: ${fastValue.toFixed(2)}, Slow MA: ${slowValue.toFixed(2)}`,
      clientOrderId: this.generateClientOrderId(SignalType.Entry),
    };
  }

  private calculateSMA(period: number): Decimal {
    if (this.priceHistory.length < period) {
      return new Decimal(0);
    }

    const relevantPrices = this.priceHistory.slice(-period);
    const sum = relevantPrices.reduce((acc, price) => acc.add(price), new Decimal(0));

    return sum.div(period);
  }

  protected async onCleanup(): Promise<void> {
    this.priceHistory = [];
    this.position = 'none';
  }

  // Getters for testing and monitoring
  public getFastMA(): Decimal {
    return this.fastMA;
  }

  public getSlowMA(): Decimal {
    return this.slowMA;
  }

  public getPositionType(): 'long' | 'short' | 'none' {
    return this.position;
  }

  /**
   * Get comprehensive strategy status for monitoring
   */
  public getStrategyState() {
    return {
      strategyId: this.getStrategyId(),
      position: this.position,
      priceHistoryLength: this.priceHistory.length,
      fastMA: this.fastMA.toString(),
      slowMA: this.slowMA.toString(),
      currentPosition: this.getCurrentPosition().toString(), // BaseStrategy method - returns Decimal
      positionType: this.getPositionType(), // MovingAverage method - returns 'long'|'short'|'none'
      averagePrice: this.getAveragePrice()?.toString(),
      lastSignal: this.getLastSignal(),
      isInitialized: this._isInitialized,
    };
  }
}
