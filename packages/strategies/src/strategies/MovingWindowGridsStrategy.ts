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
  InitialDataResult,
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

    // Initialize parameters
    this.windowSize = parameters.windowSize;
    this.gridSize = parameters.gridSize;
    this.gridCount = parameters.gridCount;

    // 🆕 Process loaded initial data if available
    if (parameters.loadedInitialData) {
      this.processInitialData(parameters.loadedInitialData);
    }

    // Strategy-specific initialization logic (if needed)
    // No need to call this.initialize() - it's optional now
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

    console.log(`✅ [${this.name}] Initial data processed successfully`);
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

      // 🔍 Validate symbol match
      const strategySymbol = this.getParameter('symbol');
      if (strategySymbol && kline.symbol !== strategySymbol) {
        return {
          action: 'hold',
          reason: `Symbol mismatch: expected ${strategySymbol}, got ${kline.symbol}`,
        };
      }

      // 🔍 Validate exchange match
      const strategyExchange = this.getParameter('exchange');
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
      if (volatility >= 0.005) {
        console.log(
          `✅ analyze: Kline is closed and volatility(${volatility}) is >0.5%: \n open: ${kline.open.toString()}, close: ${kline.close.toString()}, high: ${kline.high.toString()}, low: ${kline.low.toString()}`,
        );
        const price = kline.open.add(kline.close).dividedBy(2);
        if (kline.close.gt(kline.open)) {
          console.log('✅ analyze: BUY signal!');
          return {
            action: 'buy',
            price,
            quantity: new Decimal(this.baseSize),
            takeProfit: new Decimal(price.mul(1.012)),
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
      name: this.name,
      state: this.position,
    };
  }
}
