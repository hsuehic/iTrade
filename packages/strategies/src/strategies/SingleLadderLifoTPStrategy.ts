import {
  BaseStrategy,
  StrategyResult,
  StrategyOrderResult,
  StrategyAnalyzeResult,
  StrategyConfig,
  Order,
  OrderStatus,
  Position,
  DataUpdate,
  StrategyParameters,
  TradeMode,
  SignalType,
  SignalMetaData,
  StrategyRecoveryContext,
  StrategyStateSnapshot,
  InitialDataResult,
  Ticker,
  OrderSide,
} from '@itrade/core';
import Decimal from 'decimal.js';
import { StrategyRegistryConfig } from '../type';

/**
 * Entry direction type (used for preferredDirection parameter)
 */
type _EntryDirection = 'long' | 'short';

/**
 * 📊 SingleLadderLifoTPStrategy 参数
 *
 * 单阶梯+LIFO止盈策略参数接口
 *
 * Position semantics:
 * - minPositionAmount <= positionAmount <= maxPositionAmount
 * - min < 0 < max: Bi-directional (long and short)
 * - min > 0: Permanent long base position (底仓)
 * - max < 0: Permanent short base position
 * - min == max: Fixed position (no trading)
 *
 * Order-Status-Only Approach:
 * - Entry orders are placed immediately at calculated price levels (limit orders)
 * - No ticker price monitoring required
 * - Only reacts to order status changes (FILLED, CANCELED, etc.)
 */
export interface SingleLadderLifoTPParameters extends StrategyParameters {
  /** Base price for ladder calculation */
  basePrice: number;
  /** Step percent for ladder (e.g., 0.02 = 2%) */
  stepPercent: number;
  /** Take profit percent (e.g., 0.01 = 1%) */
  takeProfitPercent: number;
  /** Order amount per entry (base size) */
  orderAmount: number;
  /** Minimum internal net size */
  minSize: number;
  /** Maximum internal net size */
  maxSize: number;
  /** Leverage for futures trading */
  leverage?: number;
}

export const SingleLadderLifoTPStrategyRegistryConfig: StrategyRegistryConfig<SingleLadderLifoTPParameters> =
  {
    type: 'SingleLadderLifoTPStrategy',
    name: 'Single Ladder LIFO TP',
    description:
      'Single-position ladder strategy with LIFO take-profit. Order-status-only approach - places limit orders immediately without ticker monitoring.',
    icon: '🪜',
    implemented: true,
    category: 'volatility',
    defaultParameters: {
      basePrice: 100,
      stepPercent: 2,
      takeProfitPercent: 1,
      orderAmount: 100,
      minSize: 0,
      maxSize: 1000,
      leverage: 10,
    },
    parameterDefinitions: [
      {
        name: 'basePrice',
        type: 'number',
        description: 'Base price for ladder calculation (initial reference price)',
        defaultValue: 100,
        required: true,
        min: 0.0001,
        max: 1000000,
        group: 'Ladder',
        order: 1,
      },
      {
        name: 'stepPercent',
        type: 'number',
        description:
          'Step percent for ladder entries (e.g., 2 = 2% from referencePrice)',
        defaultValue: 2,
        required: true,
        min: 0.1,
        max: 50,
        group: 'Ladder',
        order: 2,
        unit: '%',
      },
      {
        name: 'takeProfitPercent',
        type: 'number',
        description: 'Take profit percent from entry price (e.g., 1 = 1% profit). Must be >= stepPercent / 2.',
        defaultValue: 1,
        required: true,
        min: 0.01,
        max: 50,
        group: 'Take Profit',
        order: 3,
        unit: '%',
      },
      {
        name: 'orderAmount',
        type: 'number',
        description: 'Internal net size per order entry (baseSize)',
        defaultValue: 100,
        required: true,
        min: 0.001,
        max: 500000,
        group: 'Risk Management',
        order: 4,
      },
      {
        name: 'minSize',
        type: 'number',
        description:
          'Minimum internal net size (> 0 for long base position, < 0 allows short)',
        defaultValue: 0,
        required: true,
        min: -500000,
        max: 500000,
        group: 'Risk Management',
        order: 5,
      },
      {
        name: 'maxSize',
        type: 'number',
        description: 'Maximum internal net size',
        defaultValue: 1000,
        required: true,
        min: -500000,
        max: 500000,
        group: 'Risk Management',
        order: 6,
      },
      {
        name: 'leverage',
        type: 'number',
        description: 'Leverage for futures trading',
        defaultValue: 10,
        required: false,
        min: 1,
        max: 125,
        group: 'Risk Management',
        order: 7,
      },
    ],

    subscriptionRequirements: {
      ticker: {
        required: false, // Not required - order-status-only approach
        editable: true,
        description:
          'Optional: Ticker data for monitoring (not required for entry signals)',
      },
      klines: {
        required: false,
        allowMultipleIntervals: false,
        defaultIntervals: ['1m'],
        intervalsEditable: true,
        description: 'Optional: Klines for reference price calculation',
      },
    },

    initialDataRequirements: {
      fetchPositions: {
        required: true,
        editable: false,
        description: 'Fetch current positions to track position amount',
      },
      fetchOpenOrders: {
        required: true,
        editable: false,
        description: 'Fetch open orders to resume entry/TP tracking',
      },
      fetchBalance: {
        required: true,
        editable: false,
        description: 'Fetch balance to ensure sufficient capital',
      },
      fetchTicker: {
        required: false,
        editable: true,
        description: 'Optional: Fetch current ticker for monitoring',
      },
    },

    documentation: {
      overview:
        'Single ladder strategy with LIFO take-profit. Uses ORDER-STATUS-ONLY approach: places limit orders immediately at calculated price levels and reacts only to order status changes (not ticker prices).',
      parameters:
        'basePrice sets initial reference, dropPercent/risePercent define ladder steps, takeProfitPercent defines TP target, minPositionAmount/maxPositionAmount define position limits (supports base position), preferredDirection sets initial direction for bi-directional mode.',
      signals:
        'Entry orders placed immediately at ladder levels (limit orders). TP orders placed when entry fills. New entry placed when TP fills.',
      riskFactors: [
        'Strong trends can exhaust position limits',
        'Base position (minPositionAmount > 0) prevents closing completely',
        'Single TP order means only one exit at a time',
        'Limit orders may not fill if price never reaches the level',
      ],
    },
  };

/**
 * Side of the filled entry
 */
type EntrySide = 'LONG' | 'SHORT';

/**
 * Filled entry record for LIFO tracking
 */
interface FilledEntry {
  side: EntrySide;
  price: Decimal;
  amount: Decimal;
  clientOrderId: string;
  timestamp: number;
  referencePriceBefore: number; // To restore reference price on TP
}

/**
 * 🪜 Single Ladder LIFO Take-Profit Strategy
 *
 * ORDER-STATUS-ONLY APPROACH:
 * - Entry orders are placed IMMEDIATELY at calculated price levels (limit orders)
 * - NO ticker price monitoring required for entry signals
 * - Only reacts to order status changes (FILLED, CANCELED, etc.)
 * - Entry order placed → Wait for exchange to fill → Place TP → Wait for TP fill → Place new entry
 *
 * Core Strategy Logic:
 * 1. Single position (can be long or short, supports base position via minPositionAmount > 0)
 * 2. Single entry order + single take-profit order at any time
 * 3. Take-profit ALWAYS targets the LAST filled entry order (LIFO)
 * 4. minPositionAmount / maxPositionAmount are "hard boundaries"
 *
 * Position Semantics:
 * - min < 0 < max: Bi-directional (long and short)
 * - min > 0: Permanent long base position (底仓)
 * - max < 0: Permanent short base position
 * - min == max: Fixed position (no trading)
 *
 * Entry Rules:
 * - canAddLong = positionAmount + orderAmount <= maxPositionAmount
 * - canAddShort = positionAmount - orderAmount >= minPositionAmount
 * - Long entry price: referencePrice * (1 - dropPercent)
 * - Short entry price: referencePrice * (1 + risePercent)
 *
 * Reference Price Updates:
 * - Updated on entry fill to the filled entry price (next ladder step)
 * - Updated on TP fill based on ladder step
 */
export class SingleLadderLifoTPStrategy extends BaseStrategy<SingleLadderLifoTPParameters> {
// Strategy parameters
  private basePrice: number;
  private stepPercent: number;
  private takeProfitPercent: number;
  private orderAmount: number;
  private minSize: number;
  private maxSize: number;
  private leverage: number;
  private tradeMode: TradeMode = TradeMode.ISOLATED;

  // Strategy state
  private tradedSize: number = 0; // Internal net size tracked from strategy orders
  private filledEntries: FilledEntry[] = [];
  private referencePrice: number;
  private initialDataProcessed: boolean = false; // Flag to trigger initial entry

  // Order tracking
  private openEntryOrder: Order | null = null;
  private openTpOrder: Order | null = null;
  private pendingEntryClientOrderId: string | null = null;
  private pendingTpClientOrderId: string | null = null;
  private initialEntrySignalGenerated: boolean = false; // Track if initial entry was generated
  private orders: Map<string, Order> = new Map();
  private orderMetadataMap: Map<string, SignalMetaData> = new Map();

  // Last ticker for price reference (optional, for monitoring only)
  private lastTicker: Ticker | null = null;
  private recoveryContext: StrategyRecoveryContext | null = null;

  constructor(config: StrategyConfig<SingleLadderLifoTPParameters>) {
    super(config);

    const { parameters } = config;

    // Initialize parameters
    this.basePrice = parameters.basePrice;
    // Convert percent to decimal (e.g., 2 -> 0.02)
    this.stepPercent = parameters.stepPercent / 100;
    this.takeProfitPercent = parameters.takeProfitPercent / 100;
    this.orderAmount = parameters.orderAmount;
    this.minSize = parameters.minSize;
    this.maxSize = parameters.maxSize;
    this.leverage = parameters.leverage ?? 10;

    // Requirement 4: add check that take profit percent should be minimum step percentage/2.
    if (this.takeProfitPercent < this.stepPercent / 2) {
      throw new Error(
        `Invalid Take Profit: takeProfitPercent (${this.takeProfitPercent * 100}%) must be >= stepPercent/2 (${(this.stepPercent / 2) * 100}%)`,
      );
    }

    // Initialize reference price from base price
    this.referencePrice = this.basePrice;

    // Validate size limits
    if (this.minSize > this.maxSize) {
      throw new Error(
        `Invalid size limits: minSize (${this.minSize}) > maxSize (${this.maxSize})`,
      );
    }

    this._logger.info(
      `🪜 [SingleLadderLifoTP] Strategy refactored (ORDER-STATUS-ONLY):`,
    );
    this._logger.info(`   Base Price: ${this.basePrice}`);
    this._logger.info(`   Step %: ${this.stepPercent * 100}%`);
    this._logger.info(`   Take Profit %: ${this.takeProfitPercent * 100}%`);
    this._logger.info(`   Base Size (orderAmount): ${this.orderAmount}`);
    this._logger.info(
      `   Size Limits: [${this.minSize}, ${this.maxSize}]`,
    );
    this._logger.info(`   Mode: ${this.getPositionMode()}`);
  }

  /**
   * Determine position mode based on limits
   */
  private getPositionMode(): string {
    if (this.minSize > 0 && this.maxSize > 0) {
      return 'LONG_ONLY_WITH_BASE';
    }
    if (this.minSize < 0 && this.maxSize < 0) {
      return 'SHORT_ONLY_WITH_BASE';
    }
    if (this.minSize < 0 && this.maxSize > 0) {
      return 'BI_DIRECTIONAL';
    }
    if (this.minSize === this.maxSize) {
      return 'FIXED_POSITION';
    }
    if (this.minSize >= 0 && this.maxSize > 0) {
      return 'LONG_ONLY';
    }
    return 'UNKNOWN';
  }

  /**
   * Check if we can add long position
   */
  private canAddLong(): boolean {
    return this.tradedSize + this.orderAmount <= this.maxSize;
  }

  /**
   * Check if we can add short position
   */
  private canAddShort(): boolean {
    return this.tradedSize - this.orderAmount >= this.minSize;
  }

  /**
   * Process initial data loaded by TradingEngine
   */
  public override async processInitialData(
    initialData: InitialDataResult,
  ): Promise<StrategyAnalyzeResult> {
    this._logger.info(`📊 [SingleLadderLifoTP] Processing initial data...`);
    if (this.recoveryContext?.recovered) {
      this._logger.info(`   🔄 Applying recovered state for initial setup`);
    }

    // Requirement 1: remove position size check. Just use net size of strategy orders.
    // We do NOT sync this.tradedSize with exchange positions here.
    // However, for recovery, we might need to know if we are in sync.
    this._logger.info(
      `   (Self-tracking tradedSize, ignoring exchange positions per requirement)`,
    );

    // Load open orders and reconstruct state
    if (initialData.openOrders && initialData.openOrders.length > 0) {
      this._logger.info(`  📝 Loaded ${initialData.openOrders.length} open order(s)`);
      initialData.openOrders.forEach((order) => {
        if (order.symbol === this._context.symbol) {
          this.orders.set(order.clientOrderId || order.id, order);
          this.ensureRecoveredMetadata(order);

          // Try to identify entry vs TP orders by clientOrderId pattern
          if (order.clientOrderId) {
            if (order.clientOrderId.startsWith('E')) {
              // Entry order
              if (!this.openEntryOrder) {
                this.openEntryOrder = order;
                this._logger.info(`    ✅ Identified entry order: ${order.clientOrderId}`);
              }
            } else if (order.clientOrderId.startsWith('T')) {
              // Take profit order
              if (!this.openTpOrder) {
                this.openTpOrder = order;
                this._logger.info(`    ✅ Identified TP order: ${order.clientOrderId}`);
              }
            }
          }
        }
      });
    }

    this.initialDataProcessed = true;

    // Generate INITIAL entry signals IMMEDIATELY after initialization if no open orders
    if (!this.initialEntrySignalGenerated && !this.openEntryOrder && !this.openTpOrder) {
      this.initialEntrySignalGenerated = true;
      const signals = this.updateLadderOrders();
      this._logger.info(
        `🚀 [SingleLadderLifoTP] Generated ${signals.length} initial signals`,
      );
      return signals;
    }

    return { action: 'hold' };
  }

  /**
   * Generate entry signal (LONG) at specific price
   */
  private generateLongEntrySignal(price: Decimal): StrategyOrderResult {
    const clientOrderId = this.generateClientOrderId(SignalType.Entry);
    const metadata: SignalMetaData = {
      signalType: SignalType.Entry,
      timestamp: Date.now(),
      clientOrderId,
    };

    this.orderMetadataMap.set(clientOrderId, metadata);
    this.pendingEntryClientOrderId = clientOrderId;

    this._logger.info(`🟢 [LONG Entry Signal] clientOrderId: ${clientOrderId.substring(0, 8)} @ ${price.toString()}`);

    return {
      action: 'buy',
      price,
      quantity: new Decimal(this.orderAmount),
      symbol: this._symbol,
      clientOrderId,
      leverage: this.leverage,
      tradeMode: this.tradeMode,
      reason: 'ladder_long_entry',
      metadata,
    };
  }

  /**
   * Generate entry signal (SHORT) at specific price
   */
  private generateShortEntrySignal(price: Decimal): StrategyOrderResult {
    const clientOrderId = this.generateClientOrderId(SignalType.Entry);
    const metadata: SignalMetaData = {
      signalType: SignalType.Entry,
      timestamp: Date.now(),
      clientOrderId,
    };

    this.orderMetadataMap.set(clientOrderId, metadata);
    this.pendingEntryClientOrderId = clientOrderId;

    this._logger.info(`🔴 [SHORT Entry Signal] clientOrderId: ${clientOrderId.substring(0, 8)} @ ${price.toString()}`);

    return {
      action: 'sell',
      price,
      quantity: new Decimal(this.orderAmount),
      symbol: this._symbol,
      clientOrderId,
      leverage: this.leverage,
      tradeMode: this.tradeMode,
      reason: 'ladder_short_entry',
      metadata,
    };
  }

  /**
   * Generate take-profit signal for the top entry in LIFO stack
   */
  private generateTakeProfitSignal(): StrategyOrderResult | null {
    const lastFilled = this.filledEntries[this.filledEntries.length - 1];
    if (!lastFilled) return null;

    const entrySide = lastFilled.side;
    const entryPrice = lastFilled.price;
    const amount = lastFilled.amount;
    const parentOrderId = lastFilled.clientOrderId;

    const clientOrderId = this.generateClientOrderId(SignalType.TakeProfit);

    let tpPrice: Decimal;
    let action: 'buy' | 'sell';

    if (entrySide === 'LONG') {
      // Long entry -> Sell to take profit
      tpPrice = entryPrice.mul(1 + this.takeProfitPercent);
      action = 'sell';
    } else {
      // Short entry -> Buy to take profit
      tpPrice = entryPrice.mul(1 - this.takeProfitPercent);
      action = 'buy';
    }

    const metadata: SignalMetaData = {
      signalType: SignalType.TakeProfit,
      parentOrderId,
      entryPrice: entryPrice.toString(),
      takeProfitPrice: tpPrice.toString(),
      profitRatio: this.takeProfitPercent,
      timestamp: Date.now(),
      clientOrderId,
    };

    this.orderMetadataMap.set(clientOrderId, metadata);
    this.pendingTpClientOrderId = clientOrderId;

    this._logger.info(`🎯 [TP Signal] ${action.toUpperCase()} side=${entrySide} @ ${tpPrice.toString()}`);

    return {
      action,
      price: tpPrice,
      quantity: amount,
      symbol: this._symbol,
      clientOrderId,
      leverage: this.leverage,
      tradeMode: this.tradeMode,
      reason: 'ladder_take_profit',
      metadata,
    };
  }

  /**
   * Type guard for order signals
   */
  private isOrderSignal(signal: StrategyResult): signal is StrategyOrderResult {
    return signal.action === 'buy' || signal.action === 'sell';
  }

  /**
   * Main analysis method - called on each data update
   *
   * ORDER-STATUS-ONLY APPROACH:
   * - Entry signals are triggered by: initial startup, TP fills, entry cancellations
   * - NO ticker price monitoring for entry decisions
   * - Ticker is only used for optional monitoring/logging
   *
   * @returns Single result or array of results (e.g., TP + next entry after fill)
   */
  public override async analyze(dataUpdate: DataUpdate): Promise<StrategyAnalyzeResult> {
    const { orders, symbol } = dataUpdate;

    // Handle order updates
    if (orders && orders.length > 0) {
      const signals = this.handleOrderUpdates(orders);
      if (signals.length > 0) {
        return signals.length === 1 ? signals[0] : signals;
      }
    }

    return { action: 'hold' };
  }

  /**
   * Core logic to maintain maximum 2 orders (Cases 1-4)
   * This is called on start and after fill/cancel events.
   */
  private updateLadderOrders(): StrategyResult[] {
    const signals: StrategyResult[] = [];

    // Skip if pending orders are still being processed by the engine
    if (this.pendingEntryClientOrderId || this.pendingTpClientOrderId) {
      return signals;
    }

    const hasPosition = this.filledEntries.length > 0;
    const canLong = this.canAddLong();
    const canShort = this.canAddShort();

    this._logger.info(`📊 Update Ladder: Size=${this.tradedSize}, Ref=${this.referencePrice.toFixed(4)}, HasPos=${hasPosition}`);

    // If we are calling this, we want to REFRESH the orders.
    // So we first cancel any existing orders to ensure we stay within the 2-order limit.
    if (this.openEntryOrder) {
      signals.push({
        action: 'cancel',
        clientOrderId: this.openEntryOrder.clientOrderId,
        symbol: this._symbol,
        reason: 'refresh_ladder_entry',
      });
      this.openEntryOrder = null;
    }
    if (this.openTpOrder) {
      signals.push({
        action: 'cancel',
        clientOrderId: this.openTpOrder.clientOrderId,
        symbol: this._symbol,
        reason: 'refresh_ladder_tp',
      });
      this.openTpOrder = null;
    }

    // Now generate exactly up to 2 new orders based on current state

    // 1. Lower Order (Buy Entry if not short, or Buy TP if short)
    if (this.tradedSize < 0) {
      // Case 2/4: TP for Short
      const tpSignal = this.generateTakeProfitSignal();
      if (tpSignal) signals.push(tpSignal);
    } else if (canLong) {
      // Case 1/3: Long Entry
      const buyPrice = new Decimal(this.referencePrice).mul(1 - this.stepPercent);
      signals.push(this.generateLongEntrySignal(buyPrice));
    }

    // 2. Upper Order (Sell Entry if not long, or Sell TP if long)
    if (this.tradedSize > 0) {
      // Case 2/4: TP for Long
      const tpSignal = this.generateTakeProfitSignal();
      if (tpSignal) {
        // Only if we didn't already add a TP (which shouldn't happen as tradedSize won't be both < 0 and > 0)
        signals.push(tpSignal);
      }
    } else if (canShort) {
      // Case 1/3: Short Entry
      const sellPrice = new Decimal(this.referencePrice).mul(1 + this.stepPercent);
      signals.push(this.generateShortEntrySignal(sellPrice));
    }

    // Filter out duplicates (though there shouldn't be any)
    return signals;
  }


  private handleOrderUpdates(orders: Order[]): StrategyResult[] {
    const signals: StrategyResult[] = [];

    for (const order of orders) {
      if (!order.clientOrderId) continue;

      let metadata = this.orderMetadataMap.get(order.clientOrderId);
      if (!metadata) {
        metadata = this.ensureRecoveredMetadata(order);
      }
      const existingOrder = this.orders.get(order.clientOrderId);

      // Skip if order is not newer
      if (
        existingOrder?.updateTime &&
        order.updateTime &&
        existingOrder.updateTime.getTime() >= order.updateTime.getTime()
      ) {
        continue;
      }

      // Track order
      this.orders.set(order.clientOrderId, order);

      // Handle status changes
      if (!existingOrder || existingOrder.status !== order.status) {
        this._logger.info(
          `🔄 Order status: ${order.clientOrderId.substring(0, 12)}... ${existingOrder?.status || 'NEW'} -> ${order.status}`,
        );

        // Handle FILLED status
        if (order.status === OrderStatus.FILLED) {
          const filledSignals = this.handleOrderFilled(order, metadata);
          signals.push(...filledSignals);
        }

        // Handle CANCELED/REJECTED/EXPIRED
        if (
          order.status === OrderStatus.CANCELED ||
          order.status === OrderStatus.REJECTED ||
          order.status === OrderStatus.EXPIRED
        ) {
          const cancelSignals = this.handleOrderCancellation(order, metadata);
          signals.push(...cancelSignals);
        }
      }
    }

    return signals;
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

  /**
   * Handle order filled event
   * @returns Array of signals (entry fill → TP + next entry, TP fill → new entry)
   */
  private handleOrderFilled(
    order: Order,
    metadata: SignalMetaData | undefined,
  ): StrategyResult[] {
    if (!metadata) {
      this._logger.warn(`⚠️ Order filled without metadata: ${order.clientOrderId}`);
      return [];
    }

    if (metadata.signalType === SignalType.Entry) {
      // Entry fill returns array: [TP signal, next entry signal (if allowed)]
      return this.handleEntryFilled(order);
    } else if (metadata.signalType === SignalType.TakeProfit) {
      // TP fill returns single signal or empty
      return this.handleTpFilled(order, metadata);
    }

    return [];
  }

  /**
   * Handle entry order filled
   *
   * After entry fills:
   * 1. Update position
   * 2. Track repeats at current reference level
   * 3. Record lastFilled (LIFO)
   * 4. Cancel existing TP if any
   * 5. Generate TP signal based on reference price for this entry
   *
   * @returns Array of signals: [TP signal]
   */
  private handleEntryFilled(order: Order): StrategyResult[] {
    const filledAmount = order.executedQuantity || order.quantity;
    const filledPrice = order.averagePrice || order.price!;
    const side: EntrySide = order.side === OrderSide.BUY ? 'LONG' : 'SHORT';

    // Update tradedSize
    const amount = filledAmount.toNumber();
    this.tradedSize += (side === 'LONG' ? amount : -amount);

    // Update reference price to the filled entry price (simpler than complex step calculation)
    const oldReference = this.referencePrice;
    this.referencePrice = filledPrice.toNumber();

    // Record filled entry (LIFO stack)
    this.filledEntries.push({
      side,
      price: filledPrice,
      amount: filledAmount,
      clientOrderId: order.clientOrderId!,
      timestamp: Date.now(),
      referencePriceBefore: oldReference,
    });

    this.openEntryOrder = null;
    if (this.pendingEntryClientOrderId === order.clientOrderId) {
      this.pendingEntryClientOrderId = null;
    }

    this._logger.info(`✅ Entry FILLED: ${side} ${filledAmount.toString()} @ ${filledPrice.toString()}, Size: ${this.tradedSize.toFixed(4)}`);
    this._logger.info(`   🔄 Ref: ${oldReference.toFixed(4)} -> ${this.referencePrice.toFixed(4)}`);

    // Maintain 2 orders
    return this.updateLadderOrders();
  }

  private handleTpFilled(order: Order, metadata: SignalMetaData): StrategyResult[] {
    if (this.filledEntries.length === 0) return [];

    const filledAmount = order.executedQuantity || order.quantity;
    const filledPrice = order.averagePrice || order.price!;
    const entry = this.filledEntries.pop()!;
    const entrySide = entry.side;

    // Update tradedSize
    const amount = filledAmount.toNumber();
    this.tradedSize += (entrySide === 'LONG' ? -amount : amount);

    // Restore reference price from entry (precise stepping back)
    const oldReference = this.referencePrice;
    this.referencePrice = entry.referencePriceBefore;

    this._logger.info(`✅ TP FILLED: ${order.side} ${filledAmount.toString()} @ ${filledPrice.toString()}, Size: ${this.tradedSize.toFixed(4)}`);
    this._logger.info(`   🔄 Ref: ${oldReference.toFixed(4)} -> ${this.referencePrice.toFixed(4)}`);

    this.openTpOrder = null;
    if (this.pendingTpClientOrderId === order.clientOrderId) {
      this.pendingTpClientOrderId = null;
    }

    // Cleanup metadata
    this.orderMetadataMap.delete(order.clientOrderId!);
    if (metadata.parentOrderId) {
      this.orderMetadataMap.delete(metadata.parentOrderId);
    }

    // Maintain 2 orders
    return this.updateLadderOrders();
  }

  private handleOrderCancellation(
    order: Order,
    metadata: SignalMetaData | undefined,
  ): StrategyResult[] {
    if (!metadata) {
      this._logger.warn(
        `⚠️ Order ${order.status} without metadata: ${order.clientOrderId}`,
      );
      return [];
    }

    this._logger.info(`❌ Order ${order.status}: ${order.clientOrderId}`);

    // Track order status
    this.orders.set(order.clientOrderId!, order);

    if (metadata.signalType === SignalType.Entry) {
      // Entry order canceled - clear open entry
      this.openEntryOrder = null;
      if (this.pendingEntryClientOrderId === order.clientOrderId) {
        this.pendingEntryClientOrderId = null;
      }
      this._logger.info(`   Entry order cleared, attempting new entry...`);

      // Cleanup metadata
      this.orderMetadataMap.delete(order.clientOrderId!);

      // Immediately check for new entry after cancellation
      return this.updateLadderOrders();
    } else if (metadata.signalType === SignalType.TakeProfit) {
      // TP order canceled - clear open TP
      this.openTpOrder = null;
      if (this.pendingTpClientOrderId === order.clientOrderId) {
        this.pendingTpClientOrderId = null;
      }
      this._logger.info(`   TP order cleared`);

      // Cleanup metadata
      this.orderMetadataMap.delete(order.clientOrderId!);

      // If we still have filled entries, updateLadderOrders will re-generate TP
      if (this.filledEntries.length > 0) {
        return this.updateLadderOrders();
      }
    }

    // Cleanup metadata
    this.orderMetadataMap.delete(order.clientOrderId!);
    return [];
  }

  /**
   * Called when order is created from this strategy's signal
   */
  public override async onOrderCreated(order: Order): Promise<void> {
    const metadata = this.orderMetadataMap.get(order.clientOrderId || '');

    if (metadata) {
      if (metadata.signalType === SignalType.Entry) {
        this.openEntryOrder = order;
        if (this.pendingEntryClientOrderId === order.clientOrderId) {
          this.pendingEntryClientOrderId = null;
        }
        this._logger.info(`📝 Entry order created: ${order.clientOrderId}`);
      } else if (metadata.signalType === SignalType.TakeProfit) {
        this.openTpOrder = order;
        if (this.pendingTpClientOrderId === order.clientOrderId) {
          this.pendingTpClientOrderId = null;
        }
        this._logger.info(`📝 TP order created: ${order.clientOrderId}`);
      }
    }

    this.orders.set(order.clientOrderId || order.id, order);
  }

  /**
   * Called when order is filled
   */
  public override async onOrderFilled(order: Order): Promise<void> {
    this._logger.debug(
      `[SingleLadderLifoTP][onOrderFilled] Called for ${order.clientOrderId}`,
    );
  }

  /**
   * Cleanup strategy state
   */
  protected async onCleanup(): Promise<void> {
    this.orders.clear();
    this.orderMetadataMap.clear();
    this.openEntryOrder = null;
    this.openTpOrder = null;
    this.pendingEntryClientOrderId = null;
    this.pendingTpClientOrderId = null;
    this.filledEntries = [];
    this.tradedSize = 0;
    this.initialDataProcessed = false;
    this.initialEntrySignalGenerated = false;
    this.orderSequence = 0;
    this._logger.info(`🧹 [SingleLadderLifoTP] Strategy cleaned up`);
  }

  public override async saveState(): Promise<StrategyStateSnapshot> {
    const state = await super.saveState();
    state.internalState = {
      referencePrice: this.referencePrice,
      filledEntries: this.filledEntries.map((entry) => ({
        side: entry.side,
        price: entry.price.toString(),
        amount: entry.amount.toString(),
        clientOrderId: entry.clientOrderId,
        timestamp: entry.timestamp,
        referencePriceBefore: entry.referencePriceBefore,
      })),
      tradedSize: this.tradedSize,
      orderSequence: this.orderSequence,
      initialEntrySignalGenerated: this.initialEntrySignalGenerated,
    };
    return state;
  }

  public override async loadState(
    snapshot: StrategyStateSnapshot,
  ): Promise<StrategyRecoveryContext> {
    const context = await super.loadState(snapshot);
    const internalState = snapshot.internalState as any;

    if (typeof internalState.referencePrice === 'number') {
      this.referencePrice = internalState.referencePrice;
    }

    if (Array.isArray(internalState.filledEntries)) {
      this.filledEntries = internalState.filledEntries.map((e: any) => ({
        side: e.side,
        price: new Decimal(e.price),
        amount: new Decimal(e.amount),
        clientOrderId: e.clientOrderId,
        timestamp: e.timestamp,
        referencePriceBefore: e.referencePriceBefore || this.referencePrice,
      }));
    }

    if (typeof internalState.tradedSize === 'number') {
      this.tradedSize = internalState.tradedSize;
    } else if (typeof internalState.positionAmount === 'number') {
      this.tradedSize = internalState.positionAmount;
    }

    if (typeof internalState.orderSequence === 'number') {
      this.orderSequence = internalState.orderSequence;
    }
    if (typeof internalState.initialEntrySignalGenerated === 'boolean') {
      this.initialEntrySignalGenerated = internalState.initialEntrySignalGenerated;
    }

    return context;
  }

  public async setRecoveryContext(context: StrategyRecoveryContext): Promise<void> {
    this.recoveryContext = context;
  }

  /**
   * Get strategy state for monitoring
   */
  public getStrategyState() {
    return {
      strategyId: this.getStrategyId(),
      strategyType: this.strategyType,
      tradedSize: this.tradedSize,
      referencePrice: this.referencePrice,
      filledEntriesCount: this.filledEntries.length,
      lastFilled:
        this.filledEntries.length > 0
          ? {
              side: this.filledEntries[this.filledEntries.length - 1].side,
              price: this.filledEntries[this.filledEntries.length - 1].price.toString(),
              amount: this.filledEntries[this.filledEntries.length - 1].amount.toString(),
            }
          : null,
      openEntryOrder: this.openEntryOrder?.clientOrderId || null,
      openTpOrder: this.openTpOrder?.clientOrderId || null,
      initialEntrySignalGenerated: this.initialEntrySignalGenerated,
      sizeLimits: {
        min: this.minSize,
        max: this.maxSize,
      },
      canAddLong: this.canAddLong(),
      canAddShort: this.canAddShort(),
      mode: this.getPositionMode(),
      // Calculated entry prices for monitoring
      buyPrice: this.referencePrice * (1 - this.stepPercent),
      sellPrice: this.referencePrice * (1 + this.stepPercent),
    };
  }

  /**
   * Get subscription configuration
   *
   * ORDER-STATUS-ONLY approach: Ticker is optional (for monitoring only)
   * The strategy primarily relies on order status updates
   */
  public override getSubscriptionConfig() {
    return {
      ticker: { enabled: false }, // Ticker not required for entry signals
      method: 'websocket' as const,
      exchange: this._context.exchange,
    };
  }

  /**
   * Get initial data configuration
   */
  public override getInitialDataConfig() {
    return {
      fetchPositions: true,
      fetchOpenOrders: true,
      fetchBalance: true,
      fetchTicker: true,
    };
  }
}
