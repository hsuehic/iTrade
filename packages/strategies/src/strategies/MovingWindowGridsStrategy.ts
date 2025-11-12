import { FixedLengthList } from '@itrade/utils';
import {
  BaseStrategy,
  StrategyResult,
  StrategyConfig,
  Ticker,
  Kline,
  Order,
  OrderStatus,
  Position,
  InitialDataResult,
  DataUpdate,
  StrategyParameters,
  TradeMode,
  SignalType,
  SignalMetaData,
} from '@itrade/core';
import Decimal from 'decimal.js';
import { StrategyRegistryConfig } from '../type';

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

export const MovingWindowGridsStrategyRegistryConfig: StrategyRegistryConfig<MovingWindowGridsParameters> =
  {
    type: 'MovingWindowGridsStrategy',
    name: 'Moving Window Grids',
    description: 'Grid trading strategy within a moving price window',
    icon: '🎯',
    implemented: true,
    category: 'volatility',
    defaultParameters: {
      windowSize: 20,
      gridSize: 0.005,
      gridCount: 5,
      minVolatility: 0.5,
      takeProfitRatio: 1,
      baseSize: 1000,
      maxSize: 10000,
    },
    parameterDefinitions: [
      {
        name: 'minVolatility',
        type: 'number',
        description: 'Minimum volatility threshold',
        defaultValue: 1,
        required: true,
        min: 1,
        max: 80,
        group: 'Risk',
        order: 1,
        unit: '%',
      },
      {
        name: 'takeProfitRatio',
        type: 'number',
        description: 'Take profit ratio',
        defaultValue: 1,
        required: true,
        min: 1,
        max: 50,
        group: 'Risk',
        order: 2,
        unit: '%',
      },
      {
        name: 'baseSize',
        type: 'number',
        description: 'Base size for each grid/per order',
        defaultValue: 1000,
        required: true,
        min: 0.001,
        max: 500000,
        group: 'Risk',
        order: 3,
      },
      {
        name: 'maxSize',
        type: 'number',
        description: 'Maximum position size opened by this strategy',
        defaultValue: 10000,
        required: true,
        min: 0.001,
        max: 500000,
        group: 'Risk',
        order: 4,
      },
    ],
    documentation: {
      overview: 'Places orders based on volatility and take profit ratio.',
      parameters:
        'minVolatility, takeProfitRatio, baseSize, maxSize are the parameters that control the strategy.',
      signals: 'Buy at lower levels, sell at upper levels.',
      riskFactors: ['Trending markets', 'Low volatility'],
    },
  };
export class MovingWindowGridsStrategy extends BaseStrategy<MovingWindowGridsParameters> {
  private position: Position | null = null;
  private orders: Map<string, Order> = new Map();
  private tickers: FixedLengthList<Ticker> = new FixedLengthList<Ticker>(15);
  private klines: FixedLengthList<Kline> = new FixedLengthList<Kline>(15);
  private baseSize!: number;
  private maxSize!: number;
  private size: number = 0;
  private minVolatility!: number;
  private takeProfitRatio!: number;
  private leverage!: number;
  private tradeMode!: TradeMode;

  // 🆕 订单元数据映射：clientOrderId -> metadata
  private orderMetadataMap: Map<string, SignalMetaData> = new Map();
  // 🆕 待处理的止盈订单队列：存储已成交的主订单，等待生成止盈信号
  private pendingTakeProfitOrders: Map<string, Order> = new Map();
  // 🆕 止盈订单追踪
  private takeProfitOrders: Map<string, Order> = new Map();

  constructor(config: StrategyConfig<MovingWindowGridsParameters>) {
    super(config);

    // Parameters will be initialized in onInitialized
    this.minVolatility = config.parameters.minVolatility / 100;
    this.takeProfitRatio = config.parameters.takeProfitRatio / 100;
    this.baseSize = config.parameters.baseSize;
    this.maxSize = config.parameters.maxSize;
    this.leverage = config.parameters.leverage ?? 10;
    this.tradeMode = config.parameters.tradeMode ?? TradeMode.ISOLATED;
    // 🆕 Process loaded initial data if available
    if (this._context.loadedInitialData && 'symbol' in this._context.loadedInitialData) {
      this.processInitialData(this._context.loadedInitialData);
    }
  }

  /**
   * 🆕 Process initial data loaded by TradingEngine
   * Called from constructor if initialData was configured
   */
  private processInitialData(initialData?: InitialDataResult): void {
    if (!initialData) return;
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

    // Load current ticker
    if (initialData.ticker) {
      this.tickers.push(initialData.ticker);
      console.log(`  🎯 Current price: ${initialData.ticker.price.toString()}`);
    }

    console.log(`✅ [${this.strategyType}] Initial data processed successfully`);
  }

  /**
   * 🆕 生成主信号（入场信号）- 根据市场行情产生
   */
  private generateEntrySignal(price: Decimal, quantity: Decimal): StrategyResult {
    const clientOrderId = this.generateClientOrderId(SignalType.Entry);
    const metadata: SignalMetaData = {
      signalType: SignalType.Entry,
      timestamp: Date.now(),
    };

    // 保存 metadata 映射
    this.orderMetadataMap.set(clientOrderId, metadata);

    this._logger.info(`🎯 [Entry Signal Generated] clientOrderId: ${clientOrderId}`);
    this._logger.info(`   Price: ${price.toString()}, Quantity: ${quantity.toString()}`);

    return {
      action: 'buy',
      price,
      quantity,
      symbol: this._symbol,
      clientOrderId, // ✅ FIX: Use the same clientOrderId that was stored with metadata
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
    const clientOrderId = this.generateClientOrderId(SignalType.TakeProfit);

    // 计算止盈价格（基于成交均价）
    const entryPrice = parentOrder.averagePrice || parentOrder.price!;
    const takeProfitPrice = entryPrice.mul(1 + this.takeProfitRatio);

    const metadata: SignalMetaData = {
      signalType: SignalType.TakeProfit,
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
      symbol: this._symbol,
      leverage: this.leverage,
      quantity: parentOrder.executedQuantity || parentOrder.quantity,
      reason: 'take_profit',
      metadata,
      tradeMode: this.tradeMode,
      clientOrderId,
    };
  }

  public override async analyze(dataUpdate: DataUpdate): Promise<StrategyResult> {
    const { exchangeName, klines, orders, positions, symbol } = dataUpdate;
    if (
      exchangeName === this._exchangeName ||
      this.context.subscription?.exchange?.includes(exchangeName || '')
    ) {
      this._logger.info(
        `[${exchangeName}] [${this._strategyName}] Analyzing data update`,
      );
      if (positions) {
        this.handlePosition(positions);
      }

      if (orders) {
        const signal = this.handleOrder(orders);
        if (signal) {
          return signal; // Return TP signal immediately if generated
        }
      }

      if (symbol === this._symbol) {
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

        if (!!klines && klines.length > 0) {
          const kline = klines[klines.length - 1];

          const { minVolatility } = this;
          // ✅ Process validated and closed kline
          const volatility = kline.high.minus(kline.low).dividedBy(kline.open).toNumber();

          if (volatility >= minVolatility && kline.isClosed) {
            const price = kline.open.add(kline.close).dividedBy(2);
            if (kline.close.gt(kline.open)) {
              const tempSize = this.size + this.baseSize;
              if (tempSize <= this.maxSize) {
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
    const position = positions.find((p) => p.symbol === this._symbol);
    if (position) {
      this._logger.info(
        `[${this._exchangeName}] [${this._strategyName}] Pushed position:`,
      );
      this._logger.info(JSON.stringify(position, null, 2));
      this.position = position;
    }
  }

  /**
   * 🆕 统一订单处理入口 - 处理新订单和订单状态变更
   * Unified order handling - handles both new orders and order updates
   *
   * This replaces the need for onOrderCreated callback
   *
   * @returns StrategyResult if TP signal should be generated, null otherwise
   */
  private handleOrder(orders: Order[]): StrategyResult | null {
    this._logger.info(
      `[${this._exchangeName}] [${this._strategyName}] Pushed ${orders.length} order(s):`,
    );
    this._logger.info(JSON.stringify(orders, null, 2));

    for (const order of orders) {
      if (!order.clientOrderId) {
        this._logger.warn('⚠️ [Order] Order has no clientOrderId, skipping');
        continue;
      }

      const metadata = this.orderMetadataMap.get(order.clientOrderId);

      // Check if this is a NEW order (not seen before)
      if (!this.orders.has(order.clientOrderId)) {
        // 🔥 NEW ORDER - Handle like onOrderCreated
        if (!metadata) {
          this._logger.warn(
            `⚠️ [New Order] No metadata found for order: ${order.clientOrderId}`,
          );
          continue;
        }

        const signalType = metadata.signalType;
        this._logger.info(
          `✨ [New Order] Client Order ID: ${order.clientOrderId}, Type: ${signalType}, Status: ${order.status}`,
        );

        if (signalType === 'entry') {
          this.size += this.baseSize;
          this.orders.set(order.clientOrderId, order);
          this._logger.info(`   📈 Position size increased: ${this.size}`);
        } else if (signalType === 'take_profit') {
          this.takeProfitOrders.set(order.clientOrderId, order);
          this.orders.set(order.clientOrderId, order);
          this._logger.info(`   📊 TP order tracked`);
        } else {
          this.orders.set(order.clientOrderId, order);
        }

        continue; // Move to next order
      }

      // 🔥 EXISTING ORDER - Check for status changes
      const storedOrder = this.orders.get(order.clientOrderId)!;

      // Skip if no update time or order is older than stored
      if (!storedOrder?.updateTime || !order.updateTime) {
        continue;
      }

      if (storedOrder.updateTime.getTime() >= order.updateTime.getTime()) {
        continue; // Order is not newer, skip
      }

      // 🔥 ORDER STATUS CHANGED
      if (storedOrder.status !== order.status) {
        this._logger.info(
          `🔄 [Order Status Changed] ${order.clientOrderId}: ${storedOrder.status} → ${order.status}`,
        );

        // Handle cancellation/rejection/expiration
        if (
          order.status === OrderStatus.CANCELED ||
          order.status === OrderStatus.REJECTED ||
          order.status === OrderStatus.EXPIRED
        ) {
          const signal = this.handleOrderCancellation(order);
          if (signal) {
            return signal; // Return TP signal immediately
          }
        }
      }

      // Update stored order
      this.orders.set(order.clientOrderId, order);
    }

    return null;
  }

  /**
   * 🆕 处理订单取消/拒绝/过期
   * When an entry order is canceled, rejected, or expired, we need to update the size
   *
   * Important: Generates TP for partially filled orders
   * - If FULLY FILLED → TP already generated → TP will handle size
   * - If PARTIALLY FILLED → Generate TP signal immediately, release unfilled size
   * - If NOT FILLED → Release full size commitment
   *
   * @returns StrategyResult if TP signal should be generated, null otherwise
   */
  private handleOrderCancellation(order: Order): StrategyResult | null {
    if (!order.clientOrderId) {
      return null;
    }

    const metadata = this.orderMetadataMap.get(order.clientOrderId);

    if (!metadata) {
      this._logger.warn(
        `⚠️ [Order Cancellation] No metadata found for order: ${order.clientOrderId}`,
      );
      return null;
    }

    const signalType = metadata.signalType;
    const executedQty = order.executedQuantity || new Decimal(0);
    const totalQty = order.quantity;

    this._logger.info(
      `🚫 [Order ${order.status}] Client Order ID: ${order.clientOrderId}, Signal Type: ${signalType}`,
    );
    this._logger.info(`   Executed: ${executedQty.toString()} / ${totalQty.toString()}`);

    if (signalType === 'entry') {
      // 🔥 关键：检查是否已经生成或待生成止盈订单
      const hasPendingTP = this.pendingTakeProfitOrders.has(order.clientOrderId);
      const hasGeneratedTP = this.findTakeProfitOrderByParentId(order.clientOrderId);

      if (hasPendingTP || hasGeneratedTP) {
        // 订单已完全成交，止盈订单存在或待生成
        // 不调整 size，因为止盈订单成交时会处理
        this._logger.info(
          `   ℹ️ Entry was FULLY FILLED, TP order ${hasPendingTP ? 'pending' : 'exists'}, size will be adjusted when TP fills`,
        );

        // 清理 pending TP（因为原订单已取消，不会再通过 analyze 生成 TP）
        if (hasPendingTP) {
          this.pendingTakeProfitOrders.delete(order.clientOrderId);
        }
      } else if (executedQty.gt(0)) {
        // 🔥 订单部分成交 - 关键场景！
        // Generate TP signal IMMEDIATELY for the executed portion
        this._logger.info(
          `   🎯 Entry was PARTIALLY FILLED, generating TP signal immediately for: ${executedQty.toString()}`,
        );

        // 🔥 关键：只释放未成交部分的大小承诺
        // The executed portion's size commitment will be released when TP fills
        const unfilledAmount = this.baseSize * (1 - executedQty.div(totalQty).toNumber());
        this.size -= unfilledAmount;

        this._logger.info(
          `   📉 Released unfilled portion from size: -${unfilledAmount.toFixed(2)}, new size: ${this.size}`,
        );

        // Generate and return TP signal immediately
        return this.generateTakeProfitSignal(order);
      } else {
        // 订单完全未成交
        // 释放全部大小承诺
        this.size -= this.baseSize;
        this._logger.info(
          `   📉 Entry was NOT filled, released full size commitment: ${this.size}`,
        );

        // 清理订单和元数据（完全未成交，无需保留）
        this.orders.delete(order.clientOrderId);
        this.orderMetadataMap.delete(order.clientOrderId);
      }

      // Note: For partially filled orders, metadata is kept until TP fills
      // Only delete for unfilled orders (handled above)
      if (executedQty.isZero()) {
        this.orders.delete(order.clientOrderId);
        this.orderMetadataMap.delete(order.clientOrderId);
      }
    } else if (signalType === 'take_profit') {
      // 止盈订单被取消（可能是部分成交或完全未成交）
      // 需要根据成交情况调整 size
      const parentOrderId = metadata.parentOrderId;

      if (executedQty.gt(0) && executedQty.lt(totalQty)) {
        // TP 部分成交后被取消 - 只释放已成交部分对应的 size
        const filledRatio = executedQty.div(totalQty).toNumber();
        const sizeToRelease = this.baseSize * filledRatio;
        this.size -= sizeToRelease;

        this._logger.info(
          `   📉 TP partially filled and canceled, released: ${sizeToRelease.toFixed(2)}, new size: ${this.size}`,
        );
      } else if (executedQty.isZero()) {
        // TP 完全未成交被取消 - 不调整 size（position 仍然持有）
        this._logger.warn(
          `   ⚠️ TP canceled with no fill, position remains open! Size unchanged: ${this.size}`,
        );
      }
      // If fully filled, onOrderFilled already handled size adjustment

      // 清理订单和元数据
      this.takeProfitOrders.delete(order.clientOrderId);
      this.orders.delete(order.clientOrderId);
      this.orderMetadataMap.delete(order.clientOrderId);

      // 清理父订单元数据
      if (parentOrderId) {
        this.orders.delete(parentOrderId);
        this.orderMetadataMap.delete(parentOrderId);
      }
    }

    return null;
  }

  /**
   * 🆕 Helper: 根据父订单ID查找止盈订单
   * Returns the TP order if found, otherwise null
   */
  private findTakeProfitOrderByParentId(parentOrderId: string): Order | null {
    for (const [tpOrderId, tpOrder] of this.takeProfitOrders) {
      const tpMetadata = this.orderMetadataMap.get(tpOrderId);
      if (tpMetadata?.parentOrderId === parentOrderId) {
        return tpOrder;
      }
    }
    return null;
  }

  /**
   * 🚫 DEPRECATED: onOrderCreated callback is no longer used
   * All order handling is now unified in handleOrder() method
   *
   * This method is kept for backward compatibility but does nothing
   */
  public override async onOrderCreated(order: Order): Promise<void> {
    // All logic moved to handleOrder() - this is now a no-op
    this._logger.debug(
      `[onOrderCreated] Called for ${order.clientOrderId} - handled in handleOrder() instead`,
    );
  }

  /**
   * 🆕 订单成交回调 - 主订单完全成交后触发止盈订单创建
   * 从 EventBus 订阅调用，可能包含非本策略的订单
   *
   * Important: TP orders are ONLY generated when entry order is FULLY FILLED
   */
  public override async onOrderFilled(order: Order): Promise<void> {
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
      // 🔥 关键：只有完全成交时才生成止盈订单
      // TP orders are ONLY generated when order is FULLY FILLED
      if (order.status === OrderStatus.FILLED) {
        this._logger.info(
          `✅ [Entry Order FULLY FILLED] Queueing TP generation for: ${order.clientOrderId}`,
        );
        this.pendingTakeProfitOrders.set(order.clientOrderId, order);
      } else {
        this._logger.info(
          `⏳ [Entry Order PARTIALLY FILLED] ${order.executedQuantity?.toString() || '0'} / ${order.quantity.toString()}, waiting for full fill`,
        );
      }
    } else if (signalType === 'take_profit') {
      // calculate profit
      const entryPrice = new Decimal(metadata.entryPrice!);
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
      this.orders.delete(metadata.parentOrderId!);
      this.orderMetadataMap.delete(order.clientOrderId);
      this.orderMetadataMap.delete(metadata.parentOrderId!);

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

    // 清理市场数据
    this.tickers = new FixedLengthList<Ticker>(15);
    this.klines = new FixedLengthList<Kline>(15);

    // 重置状态
    this.position = null;
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
