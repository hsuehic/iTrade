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
  private klines: FixedLengthList<Kline> = new FixedLengthList<Kline>(15);
  private baseSize!: number;
  private maxSize!: number;
  private size: number = 0;
  private minVolatility!: number;
  private takeProfitRatio!: number;
  private leverage!: number;
  private tradeMode!: TradeMode;

  // 🆕 metadata mapping：clientOrderId -> metadata
  private orderMetadataMap: Map<string, SignalMetaData> = new Map();
  // 🆕 take profile order tracker
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

    // Note: Initial data will be processed via processInitialData() called by TradingEngine
    // after the strategy is added and initial data is loaded
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

    this.orderMetadataMap.set(clientOrderId, metadata);
    const price = takeProfitPrice;
    const quantity = parentOrder.executedQuantity || parentOrder.quantity;
    this._logger.info(
      `🎯 [Take Profit Signal Generated] clientOrderId: ${clientOrderId}`,
    );
    this._logger.info(`   Price: ${price.toString()}, Quantity: ${quantity.toString()}`);

    return {
      action: 'sell',
      price: takeProfitPrice,
      symbol: this._symbol,
      leverage: this.leverage,
      quantity: new Decimal(this.baseSize),
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
        // TP signals are now generated immediately in handleOrder when entry orders become FILLED

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
        } else if (signalType === 'take_profit') {
          // Check if TP order is already FILLED when first seen
          if (order.status === OrderStatus.FILLED) {
            // TP filled immediately - Reduce size and clean up
            this._logger.info(
              `✅ [TP Order FULLY FILLED] (new order) Reducing size for: ${order.clientOrderId}`,
            );

            // Reduce size by the actual filled quantity (not baseSize, in case of partial fills)
            const filledQty = (order.executedQuantity || order.quantity).toNumber();
            this.size -= filledQty;

            // Clean up TP order (don't add to maps since it's already done)
            this.orderMetadataMap.delete(order.clientOrderId);

            // Clean up parent entry order
            if (metadata.parentOrderId) {
              this.orders.delete(metadata.parentOrderId);
              this.orderMetadataMap.delete(metadata.parentOrderId);
              this._logger.info(
                `   🧹 Cleaned up parent entry order: ${metadata.parentOrderId}`,
              );
            }

            this._logger.info(`   📊 New size: ${this.size}`);
            continue; // Don't add to orders map
          } else {
            // TP order not filled yet - track it
            this.takeProfitOrders.set(order.clientOrderId, order);
            this.orders.set(order.clientOrderId, order);
            this._logger.info(`   📊 TP order tracked`);
          }
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
          // Don't update order if it was deleted during cancellation
          continue;
        }

        // 🔥 Handle FILLED status
        if (order.status === OrderStatus.FILLED) {
          const metadata = this.orderMetadataMap.get(order.clientOrderId);

          if (metadata && metadata.signalType === 'entry') {
            // Entry order filled - Generate TP signal
            this._logger.info(
              `✅ [Entry Order FULLY FILLED] Generating TP signal immediately for: ${order.clientOrderId}`,
            );
            // Update stored order first
            this.orders.set(order.clientOrderId, order);
            // Generate and return TP signal immediately
            return this.generateTakeProfitSignal(order);
          } else if (metadata && metadata.signalType === 'take_profit') {
            // TP order filled - Reduce size and clean up
            this._logger.info(
              `✅ [TP Order FULLY FILLED] Reducing size for: ${order.clientOrderId}`,
            );

            // Reduce size by the actual filled quantity (not baseSize, in case of partial fills)
            const filledQty = (order.executedQuantity || order.quantity).toNumber();
            this.size -= filledQty;

            // Clean up TP order
            this.takeProfitOrders.delete(order.clientOrderId);
            this.orders.delete(order.clientOrderId);
            this.orderMetadataMap.delete(order.clientOrderId);

            // Clean up parent entry order
            if (metadata.parentOrderId) {
              this.orders.delete(metadata.parentOrderId);
              this.orderMetadataMap.delete(metadata.parentOrderId);
              this._logger.info(
                `   🧹 Cleaned up parent entry order: ${metadata.parentOrderId}`,
              );
            }

            this._logger.info(`   📊 New size: ${this.size}`);
            // Don't return signal, just update stored order
            this.orders.set(order.clientOrderId, order);
            continue;
          }
        }
      }

      // Update stored order (only if not canceled/rejected/expired)
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

    if (signalType === 'entry') {
      const hasGeneratedTP = this.findTakeProfitOrderByParentId(order.clientOrderId);

      if (hasGeneratedTP) {
        // 订单已完全成交，止盈订单已存在
        // 不调整 size，因为止盈订单成交时会处理
        this._logger.info(
          `   ℹ️ Entry was FULLY FILLED, TP order exists, size will be adjusted when TP fills`,
        );
      } else if (executedQty.gt(0)) {
        // 🔥 关键：只释放未成交部分的大小承诺
        // The executed portion's size commitment will be released when TP fills
        const unfilledAmount = this.baseSize * (1 - executedQty.div(totalQty).toNumber());
        this.size -= unfilledAmount;

        // Generate and return TP signal immediately
        return this.generateTakeProfitSignal(order);
      } else {
        this.size -= this.baseSize;
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
      const parentOrderId = metadata.parentOrderId;

      if (executedQty.gt(0) && executedQty.lt(totalQty)) {
        const filledRatio = executedQty.div(totalQty).toNumber();
        const sizeToRelease = this.baseSize * filledRatio;
        this.size -= sizeToRelease;

        this._logger.warn(
          `   📉 TP partially filled and canceled, released: ${sizeToRelease.toFixed(2)}, new size: ${this.size}`,
        );
      }
      // If fully filled, onOrderFilled already handled size adjustment

      // 清理订单和元数据
      this.takeProfitOrders.delete(order.clientOrderId);
      this.orders.delete(order.clientOrderId);
      this.orderMetadataMap.delete(order.clientOrderId);

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
      `[MovingWindowGridsStrategy][onOrderCreated] Called for ${order.clientOrderId} - handled in handleOrder() instead`,
    );
  }

  /**
   * 🆕 订单成交回调 - 主订单完全成交后触发止盈订单创建
   * 从 EventBus 订阅调用，可能包含非本策略的订单
   *
   * Important: TP orders are ONLY generated when entry order is FULLY FILLED
   */
  public override async onOrderFilled(order: Order): Promise<void> {
    this._logger.debug(
      `[MovingWindowGridsStrategy][onOrderFilled] Called for ${order.clientOrderId}`,
    );
  }

  protected async onCleanup(): Promise<void> {
    // 清理所有订单映射
    this.orders.clear();
    this.takeProfitOrders.clear();
    this.orderMetadataMap.clear();

    // 清理市场数据
    this.klines = new FixedLengthList<Kline>(15);

    // 重置状态
    this.position = null;
    this.size = 0;
    this.orderSequence = 0;
  }

  public getStrategyState() {
    return {
      strategyId: this.getStrategyId(),
      strategyType: this.strategyType,
      state: this.position,
      // 🆕 额外状态信息
      activeOrders: this.orders.size,
      takeProfitOrders: this.takeProfitOrders.size,
      currentSize: this.size,
      maxSize: this.maxSize,
    };
  }
}
