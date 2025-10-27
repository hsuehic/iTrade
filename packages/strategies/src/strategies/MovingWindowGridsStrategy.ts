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
  private position: Position | null = null;
  private positions: Position[] = [];
  private orders: Map<string, Order> = new Map();
  private balances: Balance[] = [];
  private tickers: FixedLengthList<Ticker> = new FixedLengthList<Ticker>(15);
  private klines: FixedLengthList<Kline> = new FixedLengthList<Kline>(15);
  private baseSize: number = 100;
  private maxSize: number = 1000;
  private size: number = 0;
  private minVolatility!: number;
  private takeProfitRatio!: number;
  // Signals to be sent when price reaches the target price
  private pendingSignals: Map<string, StrategyResult> = new Map();

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

  public override async analyze({
    exchangeName,
    klines,
    orders,
    positions,
    symbol,
    ticker,
  }: DataUpdate): Promise<StrategyResult> {
    this.ensureInitialized();

    if (exchangeName == this._exchangeName) {
      if (positions) {
        this.handlePosition(positions);
      }

      if (orders) {
        this.handleOrder(orders);
      }

      if (symbol == this._symbol) {
        if (ticker) {
          const result = this.handleTicker(ticker);
          if (result) {
            return result;
          }
        }

        if (!!klines && klines.length > 0) {
          const kline = klines[klines.length - 1];

          const { minVolatility } = this;
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
              this.size += this.baseSize;
              if (this.size <= this.maxSize) {
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
        }
      }
    }

    return { action: 'hold' };
  }

  private handlePosition(positions: Position[]): void {
    const position = positions.find((p) => p.symbol === this._context.symbol);
    if (position) {
      this._logger.info(`[MovingWindowGridsStrategy] Pushed position:`);
      this._logger.info(JSON.stringify(position, null, 2));
      this.position = position;
    }
  }

  private handleTicker(ticker: Ticker): StrategyResult | null {
    const key = ticker.price.toString();
    const signal = this.pendingSignals.get(key);
    if (signal) {
      return signal;
    }
    return null;
  }

  private handleOrder(orders: Order[]): void {
    this._logger.info(`[MovingWindowGridsStrategy] Pushed ${orders.length} order(s):`);
    this._logger.info(JSON.stringify(orders, null, 2));
    orders.forEach((order) => {
      if (this.orders.has(order.clientOrderId!)) {
        const storedOrder = this.orders.get(order.clientOrderId!);
        if (storedOrder?.updateTime && order.updateTime) {
          if (storedOrder?.updateTime?.getTime() < order.updateTime?.getTime()) {
            this.orders.set(order.clientOrderId!, order);
          }
        }
      }
    });
  }

  // orders created from this strategy's signal
  public override async onOrderCreated(order: Order): Promise<void> {
    this.orders.set(order.clientOrderId!, order);
  }

  // all orders from subscription, not filtered
  public override async onOrderFilled(order: Order): Promise<void> {
    if (this.orders.has(order.clientOrderId)) {
      this.orders.set(order.clientOrderId, order);
    }
  }

  protected async onCleanup(): Promise<void> {
    console.log('Clean up');
  }

  public getStrategyState() {
    return {
      strategyId: this.getStrategyId(),
      strategyType: this.strategyType,
      state: this.position,
    };
  }
}
