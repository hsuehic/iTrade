import { FixedLengthList } from '@itrade/utils';
import {
  BaseStrategy,
  StrategyResult,
  StrategyConfig,
  Ticker,
  Kline,
  Order,
  Balance,
  Position,
  InitialDataResult,
  DataUpdate,
  StrategyParameters,
} from '@itrade/core';
import Decimal from 'decimal.js';

/**
 * 📊 MovingWindowGridsStrategy 参数
 */
export interface MovingWindowGridsParameters extends StrategyParameters {
  windowSize: number;
  gridSize: number;
  gridCount: number;
  minVolatility: number;
  takeProfitRatio: number;
}

export class MovingWindowGridsStrategy extends BaseStrategy<MovingWindowGridsParameters> {
  private windowSize!: number;
  private gridSize!: number;
  private gridCount!: number;
  private position: 'long' | 'short' | 'none' = 'none';
  private positions: Position[] = [];
  private orders: Order[] = [];
  private balances: Balance[] = [];
  private tickers: FixedLengthList<Ticker> = new FixedLengthList<Ticker>(15);
  private klines: FixedLengthList<Kline> = new FixedLengthList<Kline>(15);
  private baseSize: number = 100;
  private maxSize: number = 1000;
  private size: number = 0;
  private minVolatility!: number;
  private takeProfitRatio!: number;

  constructor(config: StrategyConfig<MovingWindowGridsParameters>) {
    super(config);

    // Parameters will be initialized in onInitialize

    // 🆕 Process loaded initial data if available
    if (this._context.loadedInitialData && 'symbol' in this._context.loadedInitialData) {
      this.processInitialData(this._context.loadedInitialData as any);
    }

    // Strategy-specific initialization logic (if needed)
    // No need to call this.initialize() - it's optional now
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
        klines.forEach((kline) => this.klines.push(kline));
      });
    }

    // Load current positions
    if (initialData.positions && initialData.positions.length > 0) {
      this.positions = initialData.positions;
      console.log(`  💼 Loaded ${initialData.positions.length} position(s)`);
      // Determine strategy state based on positions
      const totalSize = initialData.positions.reduce(
        (sum, p) => sum + parseFloat(p.quantity.toString()),
        0,
      );
      if (totalSize > 0) {
        this.position = 'long';
        this.size = totalSize;
      } else if (totalSize < 0) {
        this.position = 'short';
        this.size = Math.abs(totalSize);
      }
      console.log(`  📍 Position state: ${this.position}, size: ${this.size}`);
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

    console.log(`✅ [${this.strategyType}] Initial data processed successfully`);
  }

  protected async onInitialize(): Promise<void> {
    this.validateParameters(['windowSize', 'gridSize', 'gridCount'] as any[]);
    this.windowSize = this.getParameter('windowSize') as number;
    this.gridSize = this.getParameter('gridSize') as number;
    this.gridCount = this.getParameter('gridCount') as number;
  }

  public override async analyze({ klines }: DataUpdate): Promise<StrategyResult> {
    this.ensureInitialized();
    if (!!klines && klines.length > 0) {
      const kline = klines[klines.length - 1];
      // 🔍 Validate symbol match
      const strategySymbol = this._context.symbol;
      if (strategySymbol && kline.symbol !== strategySymbol) {
        return {
          action: 'hold',
          reason: `Symbol mismatch: expected ${strategySymbol}, got ${kline.symbol}`,
        };
      }

      // 🔍 Validate exchange match
      const strategyExchange = this._context.exchange;
      if (strategyExchange && kline.exchange) {
        // Handle both single exchange and array of exchanges
        const exchanges = Array.isArray(strategyExchange)
          ? strategyExchange
          : [strategyExchange];
        if (!exchanges.includes(kline.exchange)) {
          return {
            action: 'hold',
            reason: `Exchange mismatch: expected ${exchanges.join(',')}, got ${kline.exchange}`,
          };
        }
      }

      // 🔍 Only process closed klines
      if (!kline.isClosed) {
        return { action: 'hold', reason: 'Waiting for kline to close' };
      }

      const { minVolatility, takeProfitRatio } = this;
      // ✅ Process validated and closed kline
      const range = kline.high.minus(kline.low).toNumber();
      const volatility = kline.high.minus(kline.low).dividedBy(kline.open).toNumber();
      console.log(
        'volatility:',
        volatility,
        'range:',
        range,
        'isClosed:',
        kline.isClosed,
      );
      if (volatility >= minVolatility) {
        console.log(
          `✅ analyze: Kline is closed and volatility(${volatility}) is >${minVolatility * 100}%: \n open: ${kline.open.toString()}, close: ${kline.close.toString()}, high: ${kline.high.toString()}, low: ${kline.low.toString()}`,
        );
        const price = kline.open.add(kline.close).dividedBy(2);
        if (kline.close.gt(kline.open)) {
          console.log('✅ analyze: BUY signal!');
          return {
            action: 'buy',
            price,
            quantity: new Decimal(this.baseSize),
            leverage: 10,
            tradeMode: 'isolated',
          };
        }
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
      strategyType: this.strategyType,
      state: this.position,
    };
  }
}
