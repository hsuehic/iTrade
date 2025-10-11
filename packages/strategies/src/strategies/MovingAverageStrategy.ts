import { Decimal } from 'decimal.js';
import {
  BaseStrategy,
  StrategyResult,
  StrategyParameters,
  Ticker,
  Kline,
  StrategyRecoveryContext,
} from '@itrade/core';

export interface MovingAverageParameters extends StrategyParameters {
  fastPeriod: number;
  slowPeriod: number;
  threshold: number;
}

export class MovingAverageStrategy extends BaseStrategy {
  private priceHistory: Decimal[] = [];
  private fastMA: Decimal = new Decimal(0);
  private slowMA: Decimal = new Decimal(0);
  private position: 'long' | 'short' | 'none' = 'none';

  constructor(parameters: MovingAverageParameters) {
    super('MovingAverage', parameters);
  }

  protected async onInitialize(): Promise<void> {
    this.validateParameters(['fastPeriod', 'slowPeriod', 'threshold']);

    const fastPeriod = this.getParameter<number>('fastPeriod');
    const slowPeriod = this.getParameter<number>('slowPeriod');

    if (fastPeriod >= slowPeriod) {
      throw new Error('Fast period must be less than slow period');
    }

    this.priceHistory = [];
    this.position = 'none';
  }

  public async analyze(marketData: {
    ticker?: Ticker;
    klines?: Kline[];
  }): Promise<StrategyResult> {
    this.ensureInitialized();

    let currentPrice: Decimal;

    // Get current price from available data
    if (marketData.ticker) {
      currentPrice = marketData.ticker.price;
    } else if (marketData.klines && marketData.klines.length > 0) {
      const latestKline = marketData.klines[marketData.klines.length - 1];
      currentPrice = latestKline.close;
    } else {
      return { action: 'hold', reason: 'No price data available' };
    }

    // Add price to history
    this.priceHistory.push(currentPrice);

    const fastPeriod = this.getParameter<number>('fastPeriod');
    const slowPeriod = this.getParameter<number>('slowPeriod');
    const threshold = this.getParameter<number>('threshold', 0.001);

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
      const baseQuantity = this.getParameter<number>('baseQuantity', 100);
      quantity = new Decimal(baseQuantity).mul(confidence);
    }

    return {
      action,
      quantity,
      price: currentPrice,
      confidence,
      reason:
        reason ||
        `Fast MA: ${fastValue.toFixed(2)}, Slow MA: ${slowValue.toFixed(2)}`,
    };
  }

  private calculateSMA(period: number): Decimal {
    if (this.priceHistory.length < period) {
      return new Decimal(0);
    }

    const relevantPrices = this.priceHistory.slice(-period);
    const sum = relevantPrices.reduce(
      (acc, price) => acc.add(price),
      new Decimal(0)
    );

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

  // 🔄 State Management Implementation

  /**
   * Override stateVersion for MovingAverage strategy
   */
  protected _stateVersion = '1.1.0';

  /**
   * Save internal state specific to MovingAverage strategy
   */
  protected async getInternalState(): Promise<Record<string, unknown>> {
    const baseState = await super.getInternalState();

    return {
      ...baseState,
      position: this.position,
      priceHistoryLength: this.priceHistory.length,
      lastAnalysisTime: new Date().toISOString(),
      parameters: {
        fastPeriod: this.getParameter('fastPeriod'),
        slowPeriod: this.getParameter('slowPeriod'),
        threshold: this.getParameter('threshold'),
      },
    };
  }

  /**
   * Restore internal state for MovingAverage strategy
   */
  protected async setInternalState(
    state: Record<string, unknown>
  ): Promise<void> {
    await super.setInternalState(state);

    if (state.position && typeof state.position === 'string') {
      this.position = state.position as 'long' | 'short' | 'none';
    }

    // Note: priceHistory and MAs will be restored from indicatorData
  }

  /**
   * Save technical indicator data for MovingAverage strategy
   */
  protected async getIndicatorData(): Promise<Record<string, unknown>> {
    return {
      priceHistory: this.priceHistory.map((price) => price.toString()),
      fastMA: this.fastMA.toString(),
      slowMA: this.slowMA.toString(),
      indicatorTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Restore technical indicator data for MovingAverage strategy
   */
  protected async setIndicatorData(
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      // Restore price history
      if (data.priceHistory && Array.isArray(data.priceHistory)) {
        this.priceHistory = (data.priceHistory as string[]).map(
          (price) => new Decimal(price)
        );
      }

      // Restore moving averages
      if (data.fastMA && typeof data.fastMA === 'string') {
        this.fastMA = new Decimal(data.fastMA);
      }

      if (data.slowMA && typeof data.slowMA === 'string') {
        this.slowMA = new Decimal(data.slowMA);
      }

      this.emit('indicatorsRestored', {
        priceHistoryLength: this.priceHistory.length,
        fastMA: this.fastMA.toString(),
        slowMA: this.slowMA.toString(),
      });
    } catch (error) {
      this.emit('stateRecoveryError', {
        phase: 'indicatorData',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Fallback: reset indicators if restoration fails
      this.priceHistory = [];
      this.fastMA = new Decimal(0);
      this.slowMA = new Decimal(0);
    }
  }

  /**
   * Handle recovery context setup specific to MovingAverage strategy
   */
  protected async onRecoveryContextSet(
    context: StrategyRecoveryContext
  ): Promise<void> {
    const { openOrders, totalPosition } = context;

    // Log recovery information
    this.emit('recoveryInfo', {
      strategyType: 'MovingAverage',
      openOrdersCount: openOrders.length,
      totalPosition: totalPosition,
      priceHistoryLength: this.priceHistory.length,
      lastSignal: this.getLastSignal(),
    });

    // Validate recovered state
    const fastPeriod = this.getParameter<number>('fastPeriod');
    const slowPeriod = this.getParameter<number>('slowPeriod');

    if (this.priceHistory.length < slowPeriod) {
      this.emit('recoveryWarning', {
        message: `Insufficient price history (${this.priceHistory.length}/${slowPeriod}). Strategy may need to rebuild indicators.`,
        recommendation:
          'Consider fetching recent price data to rebuild indicators',
      });
    }

    // Recalculate MAs if we have sufficient data but MAs are zero
    if (
      this.priceHistory.length >= slowPeriod &&
      this.fastMA.eq(0) &&
      this.slowMA.eq(0)
    ) {
      try {
        this.fastMA = this.calculateSMA(fastPeriod);
        this.slowMA = this.calculateSMA(slowPeriod);

        this.emit('indicatorsRecalculated', {
          fastMA: this.fastMA.toString(),
          slowMA: this.slowMA.toString(),
          priceHistoryLength: this.priceHistory.length,
        });
      } catch (error) {
        this.emit('recoveryError', {
          phase: 'indicatorRecalculation',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Update position based on total position from context
    if (totalPosition && !new Decimal(totalPosition).eq(0)) {
      const positionDecimal = new Decimal(totalPosition);
      if (positionDecimal.gt(0)) {
        this.position = 'long';
      } else if (positionDecimal.lt(0)) {
        this.position = 'short';
      } else {
        this.position = 'none';
      }

      this.updatePosition(positionDecimal, this._averagePrice);
    }
  }

  /**
   * Get comprehensive strategy status for monitoring
   */
  public getStrategyStatus() {
    return {
      strategyId: this.getStrategyId(),
      name: this.name,
      position: this.position,
      priceHistoryLength: this.priceHistory.length,
      fastMA: this.fastMA.toString(),
      slowMA: this.slowMA.toString(),
      currentPosition: this.getCurrentPosition().toString(), // BaseStrategy method - returns Decimal
      positionType: this.getPositionType(), // MovingAverage method - returns 'long'|'short'|'none'
      averagePrice: this.getAveragePrice()?.toString(),
      lastSignal: this.getLastSignal(),
      isInitialized: this._isInitialized,
      stateVersion: this._stateVersion,
    };
  }
}
