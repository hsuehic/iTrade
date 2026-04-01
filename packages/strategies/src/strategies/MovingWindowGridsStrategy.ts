import {
  BaseStrategy,
  StrategyResult,
  StrategyConfig,
  Order,
  OrderStatus,
  Position,
  DataUpdate,
  StrategyParameters,
  TradeMode,
  SignalType,
  SignalMetaData,
  StrategyAnalyzeResult,
  InitialDataResult,
} from '@itrade/core';
import Decimal from 'decimal.js';
import { StrategyRegistryConfig } from '../type';
import { silentLogger } from '../utils/silent-logger';

/**
 * 📊 MovingWindowGridsStrategy 参数
 */
export interface MovingWindowGridsParameters extends StrategyParameters {
  minVolatility: number;
  takeProfitRatio: number;
  baseSize: number;
  maxSize: number;
  leverage?: number;
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
      minVolatility: 0.5,
      takeProfitRatio: 1,
      baseSize: 1000,
      maxSize: 10000,
      leverage: 10,
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

    // 🆕 Subscription requirements for MovingWindowGridsStrategy
    subscriptionRequirements: {
      klines: {
        required: true,
        allowMultipleIntervals: false, // This strategy works with a single timeframe
        defaultIntervals: ['15m'], // Default to 15m klines
        intervalsEditable: true, // User can choose different interval
        description:
          'Kline data is required to detect volatility breakouts. Select one interval.',
      },
      ticker: {
        required: false,
        editable: true,
        description: 'Optional: Ticker data can be used for faster entry signals',
      },
    },

    // 🆕 Initial data requirements for MovingWindowGridsStrategy
    initialDataRequirements: {
      klines: {
        required: true,
        defaultConfig: { '15m': 30 }, // Load 30 bars to establish price window
        allowMultipleIntervals: false, // This strategy works best with a single timeframe
        description:
          'Historical klines are required to establish the initial price window. This strategy works with a single interval.',
      },
      fetchPositions: {
        required: true,
        description: 'Fetch current positions to track exposure',
      },
      fetchOpenOrders: {
        required: true,
        description: 'Fetch open orders to track entry and take-profit orders',
      },
      fetchBalance: {
        required: true,
        description: 'Fetch balance to ensure sufficient capital for grid orders',
      },
    },

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

  // 🆕 Track last processed kline timestamp to avoid reprocessing
  private lastProcessedKlineTime: number = 0;

  constructor(config: StrategyConfig<MovingWindowGridsParameters>) {
    super({ ...config, logger: silentLogger });

    // Parameters will be initialized in onInitialized
    this.minVolatility = config.parameters.minVolatility / 100;
    this.takeProfitRatio = config.parameters.takeProfitRatio / 100;
    this.baseSize = config.parameters.baseSize;
    this.maxSize = config.parameters.maxSize;
    this.leverage = config.parameters.leverage ?? 10;
    this.tradeMode = TradeMode.ISOLATED;

    // Note: Initial data will be processed via processInitialData() called by TradingEngine
    // after the strategy is added and initial data is loaded
  }

  /**
   * Process initial data loaded by TradingEngine
   * ⚠️ IMPORTANT: This method should NOT generate signals for historical klines
   * It only loads positions and orders to understand current state
   */
  public override async processInitialData(
    initialData: InitialDataResult,
  ): Promise<StrategyAnalyzeResult> {
    // Load current positions to track size
    if (initialData.positions && initialData.positions.length > 0) {
      const position = initialData.positions.find(
        (p) => p.symbol === this._context.symbol,
      );
      if (position) {
        this.position = position;
        this.size = position.quantity.abs().toNumber();
        this._logger.debug(
          `  💼 Loaded position: ${position.quantity.toString()} @ ${position.avgPrice?.toString() || 'N/A'}`,
        );
      }
    }

    // Load open orders to track entry and take-profit orders
    if (initialData.openOrders && initialData.openOrders.length > 0) {
      this._logger.debug(`  📝 Loaded ${initialData.openOrders.length} open order(s)`);
      initialData.openOrders.forEach((order) => {
        if (order.symbol === this._context.symbol) {
          this.orders.set(order.id, order);
          const metadata = this.ensureRecoveredMetadata(order);

          // Track take-profit orders separately
          if (metadata?.signalType === SignalType.TakeProfit) {
            this.takeProfitOrders.set(order.id, order);
          }
        }
      });
    }

    // Load balance information (for logging only)
    if (initialData.balance) {
      this._logger.debug(`  💰 Loaded balance information`);
    }

    // Real-time klines will be analyzed via analyze() method
    if (initialData.klines) {
      Object.entries(initialData.klines).forEach(([_interval, klines]) => {
        // 🆕 Set lastProcessedKlineTime to the most recent historical kline
        // This prevents reprocessing historical klines if they come through WebSocket
        if (klines.length > 0) {
          const mostRecentKline = klines[klines.length - 1];
          const klineTime = mostRecentKline.openTime.getTime();
          if (klineTime > this.lastProcessedKlineTime) {
            this.lastProcessedKlineTime = klineTime;
          }
        }
      });
    }

    this._logger.debug(
      `✅ Initial data loaded. Strategy ready for real-time analysis. Current size: ${this.size}/${this.maxSize}`,
    );
    return { action: 'hold' };
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

    this._logger.debug(`🎯 [Entry Signal Generated] clientOrderId: ${clientOrderId}`);
    this._logger.debug(
      ` Token: ${this._symbol},  Price: ${price.toString()}, Quantity: ${quantity.toString()}`,
    );

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
    this._logger.debug(
      `🎯 [Take Profit Signal Generated] clientOrderId: ${clientOrderId}`,
    );
    this._logger.debug(
      ` Token: ${this._symbol},  Price: ${price.toString()}, Quantity: ${quantity.toString()}`,
    );

    return {
      action: 'sell',
      price: takeProfitPrice,
      symbol: this._symbol,
      leverage: this.leverage,
      quantity,
      reason: 'take_profit',
      metadata,
      tradeMode: this.tradeMode,
      clientOrderId,
    };
  }

  public override async analyze(dataUpdate: DataUpdate): Promise<StrategyResult> {
    const { exchangeName, klines, orders, positions, symbol } = dataUpdate;

    // 🆕 DEBUG: Log all incoming data updates
    if (orders && orders.length > 0) {
      this._logger.debug(
        `📥 [analyze] Received ${orders.length} order update(s) from ${exchangeName}`,
      );
    }

    if (
      exchangeName === this._exchangeName ||
      this.context.subscription?.exchange?.includes(exchangeName || '')
    ) {
      if (positions) {
        this.handlePosition(positions);
      }

      if (orders) {
        this._logger.debug(`   ✅ Exchange matches, processing orders...`);
        const signal = this.handleOrder(orders);
        if (signal) {
          return signal; // Return TP signal immediately if generated
        }
      } else {
        // Log when no orders in the update
        if (klines || positions) {
          // Only log if this is not just a data feed update
        }
      }

      if (symbol === this._symbol) {
        // TP signals are now generated immediately in handleOrder when entry orders become FILLED

        if (!!klines && klines.length > 0) {
          const kline = klines[klines.length - 1];

          // 🆕 Check if kline interval matches expected interval
          const klinesConfig = this.context.subscription?.klines;
          let expectedIntervals: string[] = [];
          if (klinesConfig && typeof klinesConfig === 'object') {
            if (klinesConfig.intervals) {
              expectedIntervals = klinesConfig.intervals;
            } else if (klinesConfig.interval) {
              expectedIntervals = [klinesConfig.interval];
            }
          }

          if (
            expectedIntervals.length > 0 &&
            !expectedIntervals.includes(kline.interval)
          ) {
            return { action: 'hold' };
          }

          // 🆕 Prevent reprocessing the same kline timestamp
          const klineTime = kline.openTime.getTime();
          if (klineTime <= this.lastProcessedKlineTime) {
            return { action: 'hold' };
          }

          const { minVolatility } = this;
          // ✅ Process validated and closed kline
          const volatility = kline.high.minus(kline.low).dividedBy(kline.open).toNumber();

          if (volatility >= minVolatility && kline.isClosed) {
            // Update last processed timestamp
            this.lastProcessedKlineTime = klineTime;

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
    this._logger.debug(`🆕 [handleOrder] Received ${orders.length} order(s)`);

    for (const order of orders) {
      if (!order.clientOrderId) {
        this._logger.warn('⚠️ [Order] Order has no clientOrderId, skipping');
        continue;
      }

      let metadata = this.orderMetadataMap.get(order.clientOrderId);
      if (!metadata) {
        metadata = this.ensureRecoveredMetadata(order);
      }

      this._logger.debug(
        `📋 [Order] ${order.clientOrderId.substring(0, 8)}... | ` +
          `Status: ${order.status} | ` +
          `Side: ${order.side} | ` +
          `Qty: ${order.quantity.toString()} | ` +
          `Metadata: ${metadata ? metadata.signalType : 'NONE'}`,
      );

      // Check if this is a NEW order (not seen before)
      if (!this.orders.has(order.clientOrderId)) {
        // 🔥 NEW ORDER - Handle like onOrderCreated

        // 🆕 FIX: Handle orders without metadata (manual orders or after restart)
        if (!metadata) {
          this._logger.warn(
            `⚠️ [New Order] No metadata found for order: ${order.clientOrderId}`,
          );
          this._logger.warn(
            `   This order was not created by this strategy. ` +
              `It might be a manual order or from a previous run.`,
          );

          // 🆕 Still track the order to detect status changes (like cancellation)
          // This prevents "ghost orders" from affecting strategy state
          this.orders.set(order.clientOrderId, order);

          // 🆕 If order is already in a terminal state, handle it
          if (
            order.status === OrderStatus.CANCELED ||
            order.status === OrderStatus.REJECTED ||
            order.status === OrderStatus.EXPIRED
          ) {
            this._logger.debug(
              `   📊 Order already in terminal state: ${order.status}, no action needed`,
            );
          }

          continue; // Skip further processing for orders without metadata
        }

        const signalType = metadata.signalType;
        this._logger.debug(
          `✨ [New Order] Client Order ID: ${order.clientOrderId}, Type: ${signalType}, Status: ${order.status}`,
        );

        if (signalType === SignalType.Entry) {
          this.size += this.baseSize;
          this.orders.set(order.clientOrderId, order);

          // 🆕 FIX: Handle immediate fill for new orders
          if (order.status === OrderStatus.FILLED) {
            this._logger.debug(
              `✅ [Entry Order FULLY FILLED] (new order) Generating TP signal immediately for: ${order.clientOrderId}`,
            );
            return this.generateTakeProfitSignal(order);
          }
        } else if (signalType === SignalType.TakeProfit) {
          // Check if TP order is already FILLED when first seen
          if (order.status === OrderStatus.FILLED) {
            // TP filled immediately - Reduce size and clean up
            this._logger.debug(
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
              this._logger.debug(
                `   🧹 Cleaned up parent entry order: ${metadata.parentOrderId}`,
              );
            }

            this._logger.debug(`   📊 New size: ${this.size}`);
            continue; // Don't add to orders map
          } else {
            // TP order not filled yet - track it
            this.takeProfitOrders.set(order.clientOrderId, order);
            this.orders.set(order.clientOrderId, order);
            this._logger.debug(`   📊 TP order tracked`);
          }
        } else {
          this.orders.set(order.clientOrderId, order);
        }

        continue; // Move to next order
      }

      // 🔥 EXISTING ORDER - Check for status changes
      const storedOrder = this.orders.get(order.clientOrderId)!;

      // 🆕 FIX: Better timestamp validation
      if (!order.updateTime) {
        this._logger.warn(
          `⚠️ [Order Update] No updateTime for order: ${order.clientOrderId}, using current time`,
        );
        // Still process the order, just log the warning
      }

      // Only skip if we have both timestamps and new one is older
      if (
        storedOrder?.updateTime &&
        order.updateTime &&
        storedOrder.updateTime.getTime() >= order.updateTime.getTime()
      ) {
        this._logger.debug(
          `   ⏭️ Order ${order.clientOrderId.substring(0, 8)}... is not newer, skipping`,
        );
        continue; // Order is not newer, skip
      }

      // 🔥 ORDER STATUS CHANGED
      if (storedOrder.status !== order.status) {
        this._logger.debug(
          `🔄 [Order Status Changed] ${order.clientOrderId.substring(0, 8)}... | ` +
            `${storedOrder.status} → ${order.status}`,
        );

        // Handle cancellation/rejection/expiration
        if (
          order.status === OrderStatus.CANCELED ||
          order.status === OrderStatus.REJECTED ||
          order.status === OrderStatus.EXPIRED
        ) {
          this._logger.warn(
            `   ❌ Order ${order.status}: ${order.clientOrderId.substring(0, 8)}...`,
          );

          // 🆕 FIX: Handle cancellation even for orders without metadata
          if (!metadata) {
            this._logger.warn(`   ⚠️ Cannot adjust strategy size: order has no metadata`);
            this._logger.warn(
              `   This might be a manual order or order from previous run`,
            );
            // Still update and remove from tracking
            this.orders.delete(order.clientOrderId);
            continue;
          }

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

          if (metadata && metadata.signalType === SignalType.Entry) {
            // Entry order filled - Generate TP signal
            this._logger.debug(
              `✅ [Entry Order FULLY FILLED] Generating TP signal immediately for: ${order.clientOrderId}`,
            );
            // Update stored order first
            this.orders.set(order.clientOrderId, order);
            // Generate and return TP signal immediately
            return this.generateTakeProfitSignal(order);
          } else if (metadata && metadata.signalType === SignalType.TakeProfit) {
            // TP order filled - Reduce size and clean up
            this._logger.debug(
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
              this._logger.debug(
                `   🧹 Cleaned up parent entry order: ${metadata.parentOrderId}`,
              );
            }

            this._logger.debug(`   📊 New size: ${this.size}`);
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
      this._logger.warn(`⚠️ [Order Cancellation] Order has no clientOrderId`);
      return null;
    }

    this._logger.debug(
      `🗑️ [Order Cancellation] Processing ${order.status} order: ${order.clientOrderId.substring(0, 8)}...`,
    );

    const metadata = this.orderMetadataMap.get(order.clientOrderId);

    if (!metadata) {
      this._logger.warn(
        `⚠️ [Order Cancellation] No metadata found for order: ${order.clientOrderId}`,
      );
      this._logger.warn(
        `   Cannot adjust strategy size without knowing order type (entry/TP)`,
      );
      return null;
    }

    const signalType = metadata.signalType;
    const executedQty = order.executedQuantity || new Decimal(0);
    const totalQty = order.quantity;

    this._logger.debug(
      `   Signal Type: ${signalType} | Executed: ${executedQty.toString()}/${totalQty.toString()}`,
    );

    if (signalType === SignalType.Entry) {
      const hasGeneratedTP = this.findTakeProfitOrderByParentId(order.clientOrderId);

      if (hasGeneratedTP) {
        // 订单已完全成交，止盈订单已存在
        // 不调整 size，因为止盈订单成交时会处理
        this._logger.debug(
          `   ℹ️ Entry was FULLY FILLED, TP order exists, size will be adjusted when TP fills`,
        );
      } else if (executedQty.gt(0)) {
        // 🔥 关键：只释放未成交部分的大小承诺
        // The executed portion's size commitment will be released when TP fills
        const unfilledAmount = this.baseSize * (1 - executedQty.div(totalQty).toNumber());
        const oldSize = this.size;
        this.size -= unfilledAmount;

        this._logger.debug(
          `   📊 Entry partially filled and ${order.status.toLowerCase()}:`,
        );
        this._logger.debug(
          `      Filled: ${executedQty.toString()}/${totalQty.toString()} ` +
            `(${executedQty.div(totalQty).mul(100).toFixed(2)}%)`,
        );
        this._logger.debug(
          `      Released unfilled size: ${unfilledAmount.toFixed(2)} ` +
            `(${oldSize.toFixed(2)} → ${this.size.toFixed(2)})`,
        );

        // Generate and return TP signal immediately for the filled portion
        this._logger.debug(`      Generating TP signal for filled portion...`);
        return this.generateTakeProfitSignal(order);
      } else {
        const oldSize = this.size;
        this.size -= this.baseSize;

        this._logger.debug(`   📊 Entry ${order.status.toLowerCase()} with NO fills:`);
        this._logger.debug(
          `      Released full size: ${this.baseSize} ` +
            `(${oldSize.toFixed(2)} → ${this.size.toFixed(2)})`,
        );

        this.orders.delete(order.clientOrderId);
        this.orderMetadataMap.delete(order.clientOrderId);
      }

      // Note: For partially filled orders, metadata is kept until TP fills
      // Only delete for unfilled orders (handled above)
      if (executedQty.isZero()) {
        this.orders.delete(order.clientOrderId);
        this.orderMetadataMap.delete(order.clientOrderId);
        this._logger.debug(`   🧹 Cleaned up unfilled entry order metadata`);
      }
    } else if (signalType === SignalType.TakeProfit) {
      const parentOrderId = metadata.parentOrderId;

      if (executedQty.gt(0) && executedQty.lt(totalQty)) {
        const filledRatio = executedQty.div(totalQty).toNumber();
        const sizeToRelease = this.baseSize * filledRatio;
        const oldSize = this.size;
        this.size -= sizeToRelease;

        this._logger.debug(
          `   📊 TP partially filled and ${order.status.toLowerCase()}:`,
        );
        this._logger.debug(
          `      Filled: ${executedQty.toString()}/${totalQty.toString()} ` +
            `(${executedQty.div(totalQty).mul(100).toFixed(2)}%)`,
        );
        this._logger.debug(
          `      Released filled size: ${sizeToRelease.toFixed(2)} ` +
            `(${oldSize.toFixed(2)} → ${this.size.toFixed(2)})`,
        );
      } else if (executedQty.isZero()) {
        this._logger.debug(
          `   📊 TP ${order.status.toLowerCase()} with NO fills - no size adjustment needed`,
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
        this._logger.debug(
          `   🧹 Cleaned up parent entry order: ${parentOrderId.substring(0, 8)}...`,
        );
      }

      this._logger.debug(`   🧹 Cleaned up TP order and metadata`);
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

    // 重置状态
    this.position = null;
    this.size = 0;
    this.orderSequence = 0;
  }

  private ensureRecoveredMetadata(order: Order): SignalMetaData | undefined {
    if (!order.clientOrderId) return undefined;
    const existing = this.orderMetadataMap.get(order.clientOrderId);
    if (existing) return existing;

    if (!this.isStrategyOrderId(order.clientOrderId)) return undefined;

    const signalType = order.clientOrderId.startsWith('T')
      ? SignalType.TakeProfit
      : SignalType.Entry;
    const metadata: SignalMetaData = {
      signalType,
      timestamp: Date.now(),
      clientOrderId: order.clientOrderId,
    };
    this.orderMetadataMap.set(order.clientOrderId, metadata);
    return metadata;
  }

  private isStrategyOrderId(clientOrderId: string): boolean {
    const strategyId = this.getStrategyId();
    if (!strategyId) return false;
    const match = /^(E|T)(\d+)D/.exec(clientOrderId);
    return !!match && match[2] === String(strategyId);
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
