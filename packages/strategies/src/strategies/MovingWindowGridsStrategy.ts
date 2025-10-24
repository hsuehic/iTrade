//import { Decimal } from 'decimal.js';
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
  // StrategyRecoveryContext, // to support state recovery in the future
} from '@itrade/core';
import Decimal from 'decimal.js';

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
  private positions: Position[] = [];
  private orders: Order[] = [];
  private balances: Balance[] = [];
  private tickers: FixedLengthList<Ticker> = new FixedLengthList<Ticker>(15);
  private klines: FixedLengthList<Kline> = new FixedLengthList<Kline>(15);
  private baseSize: number = 100;
  private maxSize: number = 1000;
  private size: number = 0;

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
    const klines = marketData?.klines;
    if (!!klines && klines.length > 0) {
      const kline = klines[klines.length - 1];
      const volatility = kline.high.minus(kline.low).dividedBy(kline.open).toNumber();
      console.log(
        `[Strategy] isClosed=${kline.isClosed}, vol=${(volatility * 100).toFixed(2)}%, threshold=0.6%`,
      );
      if (kline.isClosed && kline.high.minus(kline.low).dividedBy(kline.open).gt(0.006)) {
        const price = kline.open.add(kline.close).dividedBy(2);
        console.log('✅ analyze: BUY signal!');
        return {
          action: 'buy',
          price,
          quantity: new Decimal(this.baseSize),
          takeProfit: price.mul(1.01),
        };
      }
    }

    return { action: 'hold', reason: 'Waiting for closed kline with >0.6% volatility' };
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
