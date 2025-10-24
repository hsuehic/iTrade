//import { Decimal } from 'decimal.js';
import {
  BaseStrategy,
  StrategyResult,
  StrategyParameters,
  Ticker,
  Kline,
  Order,
  // StrategyRecoveryContext, // to support state recovery in the future
} from '@itrade/core';

export interface MovingWindowGridsParameters extends StrategyParameters {
  windowSize: number;
  gridSize: number;
  gridCount: number;
}

export class MovingWindowGridsStrategy extends BaseStrategy {
  private windowSize: number;
  private gridSize: number;
  private gridCount: number;
  private position: 'long' | 'short' | 'none' = 'none';

  constructor(parameters: MovingWindowGridsParameters) {
    super('MovingWindowGrids', parameters);
    this.windowSize = parameters.windowSize;
    this.gridSize = parameters.gridSize;
    this.gridCount = parameters.gridCount;
  }

  protected async onInitialize(): Promise<void> {
    this.validateParameters(['windowSize', 'gridSize', 'gridCount']);
    this.windowSize = this.getParameter('windowSize');
    this.gridSize = this.getParameter('gridSize');
    this.gridCount = this.getParameter('gridCount');
  }

  public override async analyze(marketData: {
    ticker?: Ticker;
    klines?: Kline[];
  }): Promise<StrategyResult> {
    console.log('analyze: MovingWindowGridsStrategy');
    console.log(marketData);
    this.ensureInitialized();
    if (!marketData.klines) {
      return { action: 'hold', reason: 'No klines data available' };
    } else {
      return { action: 'hold', reason: 'No klines data available' };
    }
  }

  public override async onOrderFilled(order: Order): Promise<void> {
    console.log('on order:', order);
  }

  protected async onCleanup(): Promise<void> {
    this.position = 'none';
  }

  public getStrategyState() {
    return {
      strategyId: this.getStrategyId(),
      name: this.name,
      state: this.position,
    };
  }
}
