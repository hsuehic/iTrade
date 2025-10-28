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
  TradeMode,
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
  baseSize: number;
  maxSize: number;
  leverage?: number;
  tradeMode?: TradeMode;
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
  private baseSize!: number;
  private maxSize!: number;
  private size: number = 0;
  private minVolatility!: number;
  private takeProfitRatio!: number;
  private leverage!: number;
  private tradeMode!: TradeMode;

  // 🆕 Signal and order tracking
  private pendingSignals: Map<string, StrategyResult> = new Map();
  // 🆕 订单元数据映射：clientOrderId -> metadata
  private orderMetadataMap: Map<string, any> = new Map();
  // 🆕 待处理的止盈订单队列：存储已成交的主订单，等待生成止盈信号
  private pendingTakeProfitOrders: Map<string, Order> = new Map();
  // 🆕 止盈订单追踪
  private takeProfitOrders: Map<string, Order> = new Map();
  // 🆕 订单序列号（用于生成唯一 clientOrderId）
  private orderSequence: number = 0;

  constructor(config: StrategyConfig<MovingWindowGridsParameters>) {
    super(config);

    // Parameters will be initialized in onInitialize
    this.windowSize = config.parameters.windowSize;
    this.gridSize = config.parameters.gridSize;
    this.gridCount = config.parameters.gridCount;
    this.minVolatility = config.parameters.minVolatility / 100;
    this.takeProfitRatio = config.parameters.takeProfitRatio / 100;
    this.baseSize = config.parameters.baseSize;
    this.maxSize = config.parameters.maxSize;
    this.leverage = config.parameters.leverage ?? 10;
    this.tradeMode = config.parameters.tradeMode ?? TradeMode.ISOLATED;
    // 🆕 Process loaded initial data if available
    if (this._context.loadedInitialData && 'symbol' in this._context.loadedInitialData) {
      this.processInitialData(this._context.loadedInitialData as any);
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

  /**
   * 🆕 生成唯一的 clientOrderId
   * OKX要求: 字母数字字符, 最大长度32字符
   */
  private generateClientOrderId(type: string): string {
    this.orderSequence++;
    // 使用更短的时间戳（去掉毫秒的后3位）和前缀
    const shortTimestamp = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
    const strategyId = this.getStrategyId();
    // 格式: S{strategyId}{type首字母}{sequence}{timestamp}
    // 例如: S2E11730089500 (19字符) 或 S2TP11730089500 (21字符)
    const typePrefix =
      type === 'entry'
        ? 'E'
        : type === 'take_profit'
          ? 'TP'
          : type.substring(0, 2).toUpperCase();
    return `${typePrefix}${strategyId}${this.orderSequence}${shortTimestamp}`;
  }

  /**
   * 🆕 生成主信号（入场信号）- 根据市场行情产生
   */
  private generateEntrySignal(price: Decimal, quantity: Decimal): StrategyResult {
    const clientOrderId = this.generateClientOrderId('entry');
    const metadata = {
      signalType: 'entry',
      reason: 'volatility_breakout',
      timestamp: Date.now(),
      clientOrderId, // 预存 clientOrderId 用于后续关联
    };

    // 保存 metadata 映射
    this.orderMetadataMap.set(clientOrderId, metadata);

    this._logger.info(`🎯 [Entry Signal Generated] clientOrderId: ${clientOrderId}`);
    this._logger.info(`   Price: ${price.toString()}, Quantity: ${quantity.toString()}`);

    return {
      action: 'buy',
      price,
      quantity,
      leverage: this.leverage,
      tradeMode: this.tradeMode,
      reason: 'volatility_breakout',
      metadata,
    };
  }

  /**
   * 🆕 生成止盈信号 - 根据订单成交情况产生
   */
  private generateTakeProfitSignal(parentOrder: Order): StrategyResult {
    const clientOrderId = this.generateClientOrderId('tp');

    // 计算止盈价格（基于成交均价）
    const entryPrice = parentOrder.averagePrice || parentOrder.price!;
    const takeProfitPrice = entryPrice.mul(1 + this.takeProfitRatio);

    const metadata = {
      signalType: 'take_profit',
      parentOrderId: parentOrder.clientOrderId,
      entryPrice: entryPrice.toString(),
      takeProfitPrice: takeProfitPrice.toString(),
      profitRatio: this.takeProfitRatio,
      timestamp: Date.now(),
      clientOrderId,
    };

    // 保存 metadata 映射
    this.orderMetadataMap.set(clientOrderId, metadata);

    this._logger.info(
      `💰 [Take Profit Signal Generated] clientOrderId: ${clientOrderId}`,
    );
    this._logger.info(`   Parent Order: ${parentOrder.clientOrderId}`);
    this._logger.info(`   Entry Price: ${entryPrice.toString()}`);
    this._logger.info(
      `   TP Price: ${takeProfitPrice.toString()} (+${(this.takeProfitRatio * 100).toFixed(2)}%)`,
    );

    return {
      action: 'sell',
      price: takeProfitPrice,
      leverage: this.leverage,
      quantity: parentOrder.executedQuantity || parentOrder.quantity,
      reason: 'take_profit',
      metadata,
      tradeMode: this.tradeMode,
    };
  }

  public override async analyze(dataUpdate: DataUpdate): Promise<StrategyResult> {
    const { exchangeName, klines, orders, positions, symbol, ticker } = dataUpdate;
    if (exchangeName == this._exchangeName) {
      if (positions) {
        this.handlePosition(positions);
      }

      if (orders) {
        this.handleOrder(orders);
      }

      if (symbol == this._symbol) {
        // 🆕 优先处理待生成的止盈订单
        if (this.pendingTakeProfitOrders.size > 0) {
          const nextEntry = this.pendingTakeProfitOrders.entries().next();
          if (!nextEntry.done && nextEntry.value) {
            const [orderId, parentOrder] = nextEntry.value;
            this.pendingTakeProfitOrders.delete(orderId);

            this._logger.info(`📋 [Processing Pending TP] Parent order: ${orderId}`);
            return this.generateTakeProfitSignal(parentOrder);
          }
        }

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
          const volatility = kline.high.minus(kline.low).dividedBy(kline.open).toNumber();

          if (volatility >= minVolatility && kline.isClosed) {
            const price = kline.open.add(kline.close).dividedBy(2);
            if (kline.close.gt(kline.open)) {
              console.log('✅ analyze: Generating entry signal...');
              const tempSize = this.size + this.baseSize;
              if (tempSize <= this.maxSize) {
                // 🆕 使用新的信号生成方法
                const signal = this.generateEntrySignal(
                  price,
                  new Decimal(this.baseSize),
                );
                this._logger.info(
                  `[${exchangeName}] [${this._strategyName}] Entry signal generated:\n ${JSON.stringify(signal, null, 2)}`,
                );
                return signal;
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
      this._logger.info(
        `[${this._exchangeName}] [${this._strategyName}] Pushed position:`,
      );
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
    this._logger.info(
      `[${this._exchangeName}] [${this._strategyName}] Pushed ${orders.length} order(s):`,
    );
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

  /**
   * 🆕 订单创建回调 - 区分不同类型的订单
   * 从 TradingEngine 调用，订单已成功创建
   */
  public override async onOrderCreated(order: Order): Promise<void> {
    if (!order.clientOrderId) {
      this._logger.warn('⚠️ [Order Created] Order has no clientOrderId, skipping');
      return;
    }

    const metadata = this.orderMetadataMap.get(order.clientOrderId);

    if (!metadata) {
      this._logger.warn(
        `⚠️ [Order Created] No metadata found for order: ${order.clientOrderId}`,
      );
      //this.orders.set(order.clientOrderId, order);
      return;
    }

    const signalType = metadata.signalType;

    if (signalType === 'entry') {
      this._logger.info(`🎯 [Entry Order Created]`);
      this._logger.info(`   Client Order ID: ${order.clientOrderId}`);
      this._logger.info(`   Order ID: ${order.id}`);
      this._logger.info(`   Symbol: ${order.symbol}`);
      this._logger.info(`   Side: ${order.side}, Type: ${order.type}`);
      this._logger.info(
        `   Price: ${order.price?.toString()}, Quantity: ${order.quantity.toString()}`,
      );
      this._logger.info(`   Status: ${order.status}`);
      this.size += this.baseSize;

      // 保存主订单
      this.orders.set(order.clientOrderId, order);
    } else if (signalType === 'take_profit') {
      this._logger.info(`💰 [Take Profit Order Created]`);
      this._logger.info(`   Client Order ID: ${order.clientOrderId}`);
      this._logger.info(`   Order ID: ${order.id}`);
      this._logger.info(`   Parent Order: ${metadata.parentOrderId}`);
      this._logger.info(`   Entry Price: ${metadata.entryPrice}`);
      this._logger.info(
        `   TP Price: ${order.price?.toString()} (+${(metadata.profitRatio * 100).toFixed(2)}%)`,
      );
      this._logger.info(`   Quantity: ${order.quantity.toString()}`);
      this._logger.info(`   Status: ${order.status}`);

      // 保存止盈订单
      this.takeProfitOrders.set(order.clientOrderId, order);
      this.orders.set(order.clientOrderId, order);
    } else {
      this._logger.info(`📝 [Order Created] Signal Type: ${signalType || 'unknown'}`);
      this._logger.info(`   Client Order ID: ${order.clientOrderId}`);
      this.orders.set(order.clientOrderId, order);
    }
  }

  /**
   * 🆕 订单成交回调 - 主订单成交后触发止盈订单创建
   * 从 EventBus 订阅调用，可能包含非本策略的订单
   */
  public override async onOrderFilled(order: Order): Promise<void> {
    this._logger.info(`[MovingWindowGridsStrategy] Order Filled: ${order.clientOrderId}`);
    if (!order.clientOrderId) {
      return;
    }

    // 只处理本策略的订单
    if (!this.orders.has(order.clientOrderId)) {
      return;
    }

    // 更新订单状态
    this.orders.set(order.clientOrderId, order);

    const metadata = this.orderMetadataMap.get(order.clientOrderId);

    if (!metadata) {
      this._logger.warn(
        `⚠️ [Order Filled] No metadata found for order: ${order.clientOrderId}`,
      );
      return;
    }

    const signalType = metadata.signalType;

    if (signalType === 'entry') {
      this._logger.info(`✅ [Entry Order Filled]`);
      this._logger.info(`   Client Order ID: ${order.clientOrderId}`);
      this._logger.info(`   Executed Quantity: ${order.executedQuantity?.toString()}`);
      this._logger.info(`   Average Price: ${order.averagePrice?.toString()}`);
      this._logger.info(`   💡 Scheduling take profit order creation...`);

      // 🔥 关键：将已成交的主订单加入待处理队列
      // 下次 analyze 调用时会生成止盈信号
      this.pendingTakeProfitOrders.set(order.clientOrderId, order);
    } else if (signalType === 'take_profit') {
      this._logger.info(`💰 [Take Profit Order Filled]`);
      this._logger.info(`   Client Order ID: ${order.clientOrderId}`);
      this._logger.info(`   Parent Order: ${metadata.parentOrderId}`);
      this._logger.info(`   Executed Quantity: ${order.executedQuantity?.toString()}`);
      this._logger.info(`   Average Price: ${order.averagePrice?.toString()}`);

      // 计算实现盈利
      const entryPrice = new Decimal(metadata.entryPrice);
      const exitPrice = order.averagePrice || order.price!;
      const profit = exitPrice
        .minus(entryPrice)
        .mul(order.executedQuantity || order.quantity);
      const profitPercent = exitPrice.minus(entryPrice).dividedBy(entryPrice).mul(100);

      this._logger.info(
        `   💵 Realized Profit: ${profit.toString()} (+${profitPercent.toFixed(2)}%)`,
      );

      // 清理订单和元数据
      this.takeProfitOrders.delete(order.clientOrderId);
      this.orders.delete(metadata.parentOrderId);
      this.orderMetadataMap.delete(order.clientOrderId);
      this.orderMetadataMap.delete(metadata.parentOrderId);

      // 减少仓位大小
      this.size -= this.baseSize;
      this._logger.info(`   📉 Position size reduced: ${this.size}`);
    } else {
      this._logger.info(`📝 [Order Filled] Signal Type: ${signalType || 'unknown'}`);
      this._logger.info(`   Client Order ID: ${order.clientOrderId}`);
    }
  }

  protected async onCleanup(): Promise<void> {
    this._logger.info('🧹 [Cleanup] Clearing strategy state...');

    // 清理所有订单映射
    this.orders.clear();
    this.takeProfitOrders.clear();
    this.pendingTakeProfitOrders.clear();
    this.orderMetadataMap.clear();
    this.pendingSignals.clear();

    // 清理市场数据
    this.tickers = new FixedLengthList<Ticker>(15);
    this.klines = new FixedLengthList<Kline>(15);

    // 重置状态
    this.position = null;
    this.positions = [];
    this.balances = [];
    this.size = 0;
    this.orderSequence = 0;

    this._logger.info('✅ [Cleanup] Strategy state cleared');
  }

  public getStrategyState() {
    return {
      strategyId: this.getStrategyId(),
      strategyType: this.strategyType,
      state: this.position,
      // 🆕 额外状态信息
      activeOrders: this.orders.size,
      takeProfitOrders: this.takeProfitOrders.size,
      pendingTakeProfitOrders: this.pendingTakeProfitOrders.size,
      currentSize: this.size,
      maxSize: this.maxSize,
    };
  }
}
