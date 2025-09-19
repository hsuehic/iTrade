import { Decimal } from 'decimal.js';

import { BaseStrategy, StrategyResult, StrategyParameters, Ticker, Kline } from '@crypto-trading/core';

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
      reason: reason || `Fast MA: ${fastValue.toFixed(2)}, Slow MA: ${slowValue.toFixed(2)}`,
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

  public getCurrentPosition(): 'long' | 'short' | 'none' {
    return this.position;
  }
}
