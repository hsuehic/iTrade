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
  /** Drop percent for long entry (e.g., 0.02 = 2%) */
  dropPercent: number;
  /** Rise percent for short entry (e.g., 0.02 = 2%) */
  risePercent: number;
  /** Take profit percent (e.g., 0.01 = 1%) */
  takeProfitPercent: number;
  /** Order amount per entry */
  orderAmount: number;
  /** Minimum position amount (can be > 0 for base position) */
  minPositionAmount: number;
  /** Maximum position amount */
  maxPositionAmount: number;
  /** Maximum repeat entries at the same reference price level (0 = unlimited) */
  maxRepeatsPerLevel: number;
  /** Preferred direction for bi-directional mode ('long', 'short', or 'auto') */
  preferredDirection?: 'long' | 'short' | 'auto';
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
      dropPercent: 0.02,
      risePercent: 0.02,
      takeProfitPercent: 0.01,
      orderAmount: 100,
      minPositionAmount: 0,
      maxPositionAmount: 1000,
      maxRepeatsPerLevel: 3,
      preferredDirection: 'auto',
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
        name: 'dropPercent',
        type: 'number',
        description:
          'Drop percent for long entry (e.g., 2 = entry at referencePrice * 0.98)',
        defaultValue: 2,
        required: true,
        min: 0.1,
        max: 50,
        group: 'Ladder',
        order: 2,
        unit: '%',
      },
      {
        name: 'risePercent',
        type: 'number',
        description:
          'Rise percent for short entry (e.g., 2 = entry at referencePrice * 1.02)',
        defaultValue: 2,
        required: true,
        min: 0.1,
        max: 50,
        group: 'Ladder',
        order: 3,
        unit: '%',
      },
      {
        name: 'takeProfitPercent',
        type: 'number',
        description: 'Take profit percent from entry price (e.g., 1 = 1% profit)',
        defaultValue: 1,
        required: true,
        min: 0.1,
        max: 50,
        group: 'Take Profit',
        order: 4,
        unit: '%',
      },
      {
        name: 'orderAmount',
        type: 'number',
        description: 'Amount per order entry',
        defaultValue: 100,
        required: true,
        min: 0.001,
        max: 500000,
        group: 'Risk Management',
        order: 5,
      },
      {
        name: 'minPositionAmount',
        type: 'number',
        description:
          'Minimum position amount (> 0 for long base position, < 0 allows short)',
        defaultValue: 0,
        required: true,
        min: -500000,
        max: 500000,
        group: 'Risk Management',
        order: 6,
      },
      {
        name: 'maxPositionAmount',
        type: 'number',
        description: 'Maximum position amount',
        defaultValue: 1000,
        required: true,
        min: -500000,
        max: 500000,
        group: 'Risk Management',
        order: 7,
      },
      {
        name: 'maxRepeatsPerLevel',
        type: 'number',
        description:
          'Maximum repeat entries at the same reference price level (0 = unlimited). After reaching this limit, reference price updates to fill price.',
        defaultValue: 3,
        required: true,
        min: 0,
        max: 100,
        group: 'Ladder',
        order: 8,
      },
      {
        name: 'preferredDirection',
        type: 'string',
        description:
          'Preferred entry direction for bi-directional mode. Values: "auto", "long", "short". Auto: determined by position limits and last fill.',
        defaultValue: 'auto',
        required: false,
        group: 'Ladder',
        order: 9,
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
        order: 10,
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
 * - Updated when maxRepeatsPerLevel is reached on entry fill
 * - Updated on TP fill to allow bi-directional ladder walking
 */
export class SingleLadderLifoTPStrategy extends BaseStrategy<SingleLadderLifoTPParameters> {
  // Strategy parameters
  private basePrice: number;
  private dropPercent: number;
  private risePercent: number;
  private takeProfitPercent: number;
  private orderAmount: number;
  private minPositionAmount: number;
  private maxPositionAmount: number;
  private maxRepeatsPerLevel: number;
  private preferredDirection: 'long' | 'short' | 'auto';
  private leverage: number;
  private tradeMode: TradeMode = TradeMode.ISOLATED;

  // Strategy state
  private positionAmount: number = 0;
  private lastFilled: FilledEntry | null = null;
  private lastFilledDirection: EntrySide | null = null; // Track direction even after TP
  private referencePrice: number;
  private currentLevelRepeats: number = 0; // Track entries at current reference price
  private initialDataProcessed: boolean = false; // Flag to trigger initial entry

  // Order tracking
  private openEntryOrder: Order | null = null;
  private openTpOrder: Order | null = null;
  private pendingEntrySignalId: string | null = null; // Track pending entry signal to prevent duplicates
  private pendingTpSignalId: string | null = null; // Track pending TP signal to prevent duplicates
  private orders: Map<string, Order> = new Map();
  private orderMetadataMap: Map<string, SignalMetaData> = new Map();

  // Position from exchange
  private position: Position | null = null;

  // Last ticker for price reference (optional, for monitoring only)
  private lastTicker: Ticker | null = null;

  constructor(config: StrategyConfig<SingleLadderLifoTPParameters>) {
    super(config);

    const { parameters } = config;

    // Initialize parameters
    this.basePrice = parameters.basePrice;
    // Convert percent to decimal (e.g., 2 -> 0.02)
    this.dropPercent = parameters.dropPercent / 100;
    this.risePercent = parameters.risePercent / 100;
    this.takeProfitPercent = parameters.takeProfitPercent / 100;
    this.orderAmount = parameters.orderAmount;
    this.minPositionAmount = parameters.minPositionAmount;
    this.maxPositionAmount = parameters.maxPositionAmount;
    this.maxRepeatsPerLevel = parameters.maxRepeatsPerLevel ?? 0;
    this.preferredDirection = parameters.preferredDirection ?? 'auto';
    this.leverage = parameters.leverage ?? 10;

    // Initialize reference price from base price
    this.referencePrice = this.basePrice;
    this.currentLevelRepeats = 0;

    // Validate position limits
    if (this.minPositionAmount > this.maxPositionAmount) {
      throw new Error(
        `Invalid position limits: minPositionAmount (${this.minPositionAmount}) > maxPositionAmount (${this.maxPositionAmount})`,
      );
    }

    this._logger.info(
      `🪜 [SingleLadderLifoTP] Strategy initialized (ORDER-STATUS-ONLY):`,
    );
    this._logger.info(`   Base Price: ${this.basePrice}`);
    this._logger.info(`   Drop %: ${this.dropPercent * 100}%`);
    this._logger.info(`   Rise %: ${this.risePercent * 100}%`);
    this._logger.info(`   Take Profit %: ${this.takeProfitPercent * 100}%`);
    this._logger.info(`   Order Amount: ${this.orderAmount}`);
    this._logger.info(
      `   Position Limits: [${this.minPositionAmount}, ${this.maxPositionAmount}]`,
    );
    this._logger.info(
      `   Max Repeats Per Level: ${this.maxRepeatsPerLevel === 0 ? 'unlimited' : this.maxRepeatsPerLevel}`,
    );
    this._logger.info(`   Preferred Direction: ${this.preferredDirection}`);
    this._logger.info(`   Mode: ${this.getPositionMode()}`);
  }

  /**
   * Determine position mode based on limits
   */
  private getPositionMode(): string {
    if (this.minPositionAmount > 0 && this.maxPositionAmount > 0) {
      return 'LONG_ONLY_WITH_BASE';
    }
    if (this.minPositionAmount < 0 && this.maxPositionAmount < 0) {
      return 'SHORT_ONLY_WITH_BASE';
    }
    if (this.minPositionAmount < 0 && this.maxPositionAmount > 0) {
      return 'BI_DIRECTIONAL';
    }
    if (this.minPositionAmount === this.maxPositionAmount) {
      return 'FIXED_POSITION';
    }
    if (this.minPositionAmount >= 0 && this.maxPositionAmount > 0) {
      return 'LONG_ONLY';
    }
    return 'UNKNOWN';
  }

  /**
   * Check if we can add long position
   */
  private canAddLong(): boolean {
    return this.positionAmount + this.orderAmount <= this.maxPositionAmount;
  }

  /**
   * Check if we can add short position
   */
  private canAddShort(): boolean {
    return this.positionAmount - this.orderAmount >= this.minPositionAmount;
  }

  /**
   * Process initial data loaded by TradingEngine
   */
  public override processInitialData(initialData: InitialDataResult): void {
    this._logger.info(`📊 [SingleLadderLifoTP] Processing initial data...`);

    // Load current positions
    if (initialData.positions && initialData.positions.length > 0) {
      const position = initialData.positions.find(
        (p) => p.symbol === this._context.symbol,
      );
      if (position) {
        this.position = position;
        // Determine position amount based on side
        this.positionAmount =
          position.side === 'long'
            ? position.quantity.toNumber()
            : -position.quantity.abs().toNumber();
        this._logger.info(
          `  💼 Loaded position: ${this.positionAmount} @ ${position.avgPrice?.toString() || 'N/A'}`,
        );

        // Infer last direction from position
        if (this.positionAmount > 0) {
          this.lastFilledDirection = 'LONG';
        } else if (this.positionAmount < 0) {
          this.lastFilledDirection = 'SHORT';
        }
      }
    }

    // Load open orders and reconstruct state
    if (initialData.openOrders && initialData.openOrders.length > 0) {
      this._logger.info(`  📝 Loaded ${initialData.openOrders.length} open order(s)`);
      initialData.openOrders.forEach((order) => {
        if (order.symbol === this._context.symbol) {
          this.orders.set(order.clientOrderId || order.id, order);

          // Try to identify entry vs TP orders by clientOrderId pattern
          if (order.clientOrderId) {
            if (order.clientOrderId.startsWith('E')) {
              // Entry order
              if (!this.openEntryOrder) {
                this.openEntryOrder = order;
                this._logger.info(
                  `    ✅ Identified entry order: ${order.clientOrderId}`,
                );
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

    // Load ticker for monitoring (optional)
    if (initialData.ticker) {
      this.lastTicker = initialData.ticker;
      this._logger.info(`  📈 Current price: ${initialData.ticker.price.toString()}`);
    }

    // Mark initial data as processed - this will trigger initial entry on next analyze()
    this.initialDataProcessed = true;

    this._logger.info(
      `✅ [SingleLadderLifoTP] Initial data processed. Position: ${this.positionAmount}, Entry Order: ${!!this.openEntryOrder}, TP Order: ${!!this.openTpOrder}`,
    );
    this._logger.info(
      `   Reference Price: ${this.referencePrice}, Direction: ${this.lastFilledDirection || 'none'}`,
    );
  }

  /**
   * Generate entry signal (LONG)
   */
  private generateLongEntrySignal(price: Decimal): StrategyResult {
    const clientOrderId = this.generateClientOrderId(SignalType.Entry);
    const metadata: SignalMetaData = {
      signalType: SignalType.Entry,
      timestamp: Date.now(),
      clientOrderId,
    };

    this.orderMetadataMap.set(clientOrderId, metadata);

    // Track pending signal to prevent duplicate entries before onOrderCreated is called
    this.pendingEntrySignalId = clientOrderId;

    this._logger.info(`🟢 [LONG Entry Signal] clientOrderId: ${clientOrderId}`);
    this._logger.info(
      `   Price: ${price.toString()}, Amount: ${this.orderAmount}, Ref: ${this.referencePrice}, Repeats: ${this.currentLevelRepeats}/${this.maxRepeatsPerLevel || '∞'}`,
    );

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
   * Generate entry signal (SHORT)
   */
  private generateShortEntrySignal(price: Decimal): StrategyResult {
    const clientOrderId = this.generateClientOrderId(SignalType.Entry);
    const metadata: SignalMetaData = {
      signalType: SignalType.Entry,
      timestamp: Date.now(),
      clientOrderId,
    };

    this.orderMetadataMap.set(clientOrderId, metadata);

    // Track pending signal to prevent duplicate entries before onOrderCreated is called
    this.pendingEntrySignalId = clientOrderId;

    this._logger.info(`🔴 [SHORT Entry Signal] clientOrderId: ${clientOrderId}`);
    this._logger.info(
      `   Price: ${price.toString()}, Amount: ${this.orderAmount}, Ref: ${this.referencePrice}, Repeats: ${this.currentLevelRepeats}/${this.maxRepeatsPerLevel || '∞'}`,
    );

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
   * Generate take-profit signal based on lastFilled entry
   */
  private generateTakeProfitSignal(): StrategyResult | null {
    if (!this.lastFilled) {
      this._logger.warn(`⚠️ [TP] Cannot generate TP: No lastFilled entry`);
      return null;
    }

    const clientOrderId = this.generateClientOrderId(SignalType.TakeProfit);
    const entryPrice = this.lastFilled.price;
    const entrySide = this.lastFilled.side;
    const amount = this.lastFilled.amount;

    // Calculate TP price based on entry side
    let tpPrice: Decimal;
    let action: 'buy' | 'sell';

    if (entrySide === 'LONG') {
      // Long entry -> Sell to take profit (price goes UP)
      tpPrice = entryPrice.mul(1 + this.takeProfitPercent);
      action = 'sell';
    } else {
      // Short entry -> Buy to take profit (price goes DOWN)
      tpPrice = entryPrice.mul(1 - this.takeProfitPercent);
      action = 'buy';
    }

    const metadata: SignalMetaData = {
      signalType: SignalType.TakeProfit,
      parentOrderId: this.lastFilled.clientOrderId,
      entryPrice: entryPrice.toString(),
      takeProfitPrice: tpPrice.toString(),
      profitRatio: this.takeProfitPercent,
      timestamp: Date.now(),
      clientOrderId,
    };

    this.orderMetadataMap.set(clientOrderId, metadata);

    // Track pending signal to prevent duplicate TP orders before onOrderCreated is called
    this.pendingTpSignalId = clientOrderId;

    this._logger.info(`🎯 [TP Signal] clientOrderId: ${clientOrderId}`);
    this._logger.info(
      `   Entry Side: ${entrySide}, Entry Price: ${entryPrice.toString()}, TP Price: ${tpPrice.toString()}`,
    );
    this._logger.info(`   Amount: ${amount.toString()}, Action: ${action}`);

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
   * Main analysis method - called on each data update
   *
   * ORDER-STATUS-ONLY APPROACH:
   * - Entry signals are triggered by: initial startup, TP fills, entry cancellations
   * - NO ticker price monitoring for entry decisions
   * - Ticker is only used for optional monitoring/logging
   */
  public override async analyze(dataUpdate: DataUpdate): Promise<StrategyResult> {
    const { ticker, orders, positions, symbol } = dataUpdate;

    // Handle position updates
    if (positions && positions.length > 0) {
      this.handlePositionUpdate(positions);
    }

    // Handle order updates - this can trigger new entry/TP signals
    if (orders && orders.length > 0) {
      const signal = this.handleOrderUpdates(orders);
      if (signal) {
        return signal;
      }
    }

    // Update ticker for monitoring (optional)
    if (ticker && symbol === this._symbol) {
      this.lastTicker = ticker;
    }

    // Check if we need to place initial entry order (on startup)
    // This is called after processInitialData and triggers the first entry
    // Also check pendingEntrySignalId to prevent duplicate signals before onOrderCreated is called
    if (
      this.initialDataProcessed &&
      !this.openEntryOrder &&
      !this.openTpOrder &&
      !this.pendingEntrySignalId
    ) {
      const signal = this.checkEntryConditions();
      if (signal && signal.action !== 'hold') {
        return signal;
      }
    }

    return { action: 'hold' };
  }

  /**
   * Determine entry direction based on position limits and preferences
   *
   * Priority:
   * 1. If only one direction is allowed by position limits → use that
   * 2. If lastFilledDirection is set (from previous entry) → continue same direction (mean reversion)
   * 3. Use preferredDirection parameter
   * 4. Default to 'long'
   */
  private determineEntryDirection(): EntrySide | null {
    const canLong = this.canAddLong();
    const canShort = this.canAddShort();

    // Can't add in either direction
    if (!canLong && !canShort) {
      this._logger.debug(`Cannot add position: canLong=${canLong}, canShort=${canShort}`);
      return null;
    }

    // Only one direction possible
    if (canLong && !canShort) {
      return 'LONG';
    }
    if (canShort && !canLong) {
      return 'SHORT';
    }

    // Both directions possible - use preferences
    // Continue same direction as last filled (mean reversion behavior)
    if (this.lastFilledDirection) {
      return this.lastFilledDirection;
    }

    // Use configured preference
    if (this.preferredDirection === 'long') {
      return 'LONG';
    }
    if (this.preferredDirection === 'short') {
      return 'SHORT';
    }

    // Default to long (for 'auto' with no history)
    return 'LONG';
  }

  /**
   * Check entry conditions (ORDER-STATUS-ONLY approach)
   *
   * Places entry order immediately at calculated price level.
   * NO ticker price monitoring - just place the limit order and wait.
   */
  private checkEntryConditions(): StrategyResult {
    // Skip if we already have an open entry order
    if (this.openEntryOrder) {
      return {
        action: 'hold',
        reason: `Entry order pending: ${this.openEntryOrder.clientOrderId}`,
      };
    }

    // Skip if max repeats reached at current level
    if (
      this.maxRepeatsPerLevel > 0 &&
      this.currentLevelRepeats >= this.maxRepeatsPerLevel
    ) {
      return {
        action: 'hold',
        reason: `Max repeats (${this.maxRepeatsPerLevel}) reached at current level`,
      };
    }

    // Determine entry direction
    const direction = this.determineEntryDirection();
    if (!direction) {
      return {
        action: 'hold',
        reason: 'Cannot determine entry direction (position limits reached)',
      };
    }

    // Calculate entry prices
    const longEntryPrice = this.referencePrice * (1 - this.dropPercent);
    const shortEntryPrice = this.referencePrice * (1 + this.risePercent);

    this._logger.info(
      `📊 Entry Check: Ref=${this.referencePrice}, ` +
        `Long@${longEntryPrice.toFixed(4)}, Short@${shortEntryPrice.toFixed(4)}, ` +
        `Position=${this.positionAmount}, Direction=${direction}`,
    );

    // Generate entry signal based on direction
    if (direction === 'LONG') {
      this._logger.info(
        `🟢 Placing LONG entry order @ ${longEntryPrice.toFixed(4)} (limit order)`,
      );
      return this.generateLongEntrySignal(new Decimal(longEntryPrice));
    } else {
      this._logger.info(
        `🔴 Placing SHORT entry order @ ${shortEntryPrice.toFixed(4)} (limit order)`,
      );
      return this.generateShortEntrySignal(new Decimal(shortEntryPrice));
    }
  }

  /**
   * Handle position updates
   */
  private handlePositionUpdate(positions: Position[]): void {
    const position = positions.find((p) => p.symbol === this._symbol);
    if (position) {
      this.position = position;
      // Update position amount based on side
      const newPositionAmount =
        position.side === 'long'
          ? position.quantity.toNumber()
          : -position.quantity.abs().toNumber();

      if (newPositionAmount !== this.positionAmount) {
        this._logger.info(
          `💼 Position updated: ${this.positionAmount} -> ${newPositionAmount}`,
        );
        this.positionAmount = newPositionAmount;
      }
    }
  }

  /**
   * Handle order updates
   */
  private handleOrderUpdates(orders: Order[]): StrategyResult | null {
    for (const order of orders) {
      if (!order.clientOrderId) continue;

      const metadata = this.orderMetadataMap.get(order.clientOrderId);
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
          const signal = this.handleOrderFilled(order, metadata);
          if (signal) {
            return signal;
          }
        }

        // Handle CANCELED/REJECTED/EXPIRED
        if (
          order.status === OrderStatus.CANCELED ||
          order.status === OrderStatus.REJECTED ||
          order.status === OrderStatus.EXPIRED
        ) {
          const signal = this.handleOrderCancellation(order, metadata);
          if (signal) {
            return signal;
          }
        }
      }
    }

    return null;
  }

  /**
   * Handle order filled event
   */
  private handleOrderFilled(
    order: Order,
    metadata: SignalMetaData | undefined,
  ): StrategyResult | null {
    if (!metadata) {
      this._logger.warn(`⚠️ Order filled without metadata: ${order.clientOrderId}`);
      return null;
    }

    if (metadata.signalType === SignalType.Entry) {
      return this.handleEntryFilled(order);
    } else if (metadata.signalType === SignalType.TakeProfit) {
      // handleTpFilled now returns a new entry signal (ORDER-STATUS-ONLY approach)
      return this.handleTpFilled(order, metadata);
    }

    return null;
  }

  /**
   * Handle entry order filled
   */
  private handleEntryFilled(order: Order): StrategyResult | null {
    const filledAmount = order.executedQuantity || order.quantity;
    const filledPrice = order.averagePrice || order.price!;

    // Determine entry side
    const side: EntrySide = order.side === OrderSide.BUY ? 'LONG' : 'SHORT';

    // Update position amount
    if (side === 'LONG') {
      this.positionAmount += filledAmount.toNumber();
    } else {
      this.positionAmount -= filledAmount.toNumber();
    }

    // Increment repeat counter for current level
    this.currentLevelRepeats++;

    // Check if we've reached max repeats at this level
    const shouldUpdateReference =
      this.maxRepeatsPerLevel > 0 && this.currentLevelRepeats >= this.maxRepeatsPerLevel;

    if (shouldUpdateReference) {
      const oldReference = this.referencePrice;
      this.referencePrice = filledPrice.toNumber();
      this.currentLevelRepeats = 0; // Reset counter for new level
      this._logger.info(
        `   🔄 Reference price updated: ${oldReference} -> ${this.referencePrice} (max repeats reached)`,
      );
    }

    // Record last filled entry (LIFO)
    this.lastFilled = {
      side,
      price: filledPrice,
      amount: filledAmount,
      clientOrderId: order.clientOrderId!,
      timestamp: Date.now(),
    };

    // Track direction for future entries (persists after TP)
    this.lastFilledDirection = side;

    // Clear open entry order
    this.openEntryOrder = null;

    this._logger.info(
      `✅ Entry FILLED: ${side} ${filledAmount.toString()} @ ${filledPrice.toString()}`,
    );
    this._logger.info(
      `   Position: ${this.positionAmount}, Repeats: ${this.currentLevelRepeats}/${this.maxRepeatsPerLevel || '∞'}, Ref: ${this.referencePrice}`,
    );

    // Cancel existing TP order if any
    if (this.openTpOrder) {
      this._logger.info(
        `   ❌ Need to cancel existing TP: ${this.openTpOrder.clientOrderId}`,
      );
      // Note: Actual cancellation would be done by TradingEngine
      // For now, we just mark it as needing cancellation and generate new TP
      this.openTpOrder = null;
    }

    // Generate new TP signal for this entry
    const tpSignal = this.generateTakeProfitSignal();
    if (tpSignal) {
      return tpSignal;
    }

    return null;
  }

  /**
   * Handle take-profit order filled
   *
   * After TP fills:
   * 1. Update position
   * 2. Update reference price (allows bi-directional ladder walking)
   * 3. Clear lastFilled but KEEP lastFilledDirection
   * 4. Return entry signal to place new entry order
   */
  private handleTpFilled(order: Order, metadata: SignalMetaData): StrategyResult | null {
    if (!this.lastFilled) {
      this._logger.warn(`⚠️ TP filled but no lastFilled entry recorded`);
      return null;
    }

    const filledAmount = order.executedQuantity || order.quantity;
    const filledPrice = order.averagePrice || order.price!;
    const entrySide = this.lastFilled.side;

    // Update position amount (respecting min/max limits)
    if (entrySide === 'LONG') {
      // TP for long = sell, reduce position
      const newPosition = this.positionAmount - filledAmount.toNumber();
      this.positionAmount = Math.max(newPosition, this.minPositionAmount);
    } else {
      // TP for short = buy, increase position (towards 0 or max)
      const newPosition = this.positionAmount + filledAmount.toNumber();
      this.positionAmount = Math.min(newPosition, this.maxPositionAmount);
    }

    // Update reference price to TP fill price (allows bi-directional ladder walking)
    const oldReference = this.referencePrice;
    this.referencePrice = filledPrice.toNumber();
    this.currentLevelRepeats = 0; // Reset counter for new level

    this._logger.info(
      `✅ TP FILLED: ${order.side} ${filledAmount.toString()} @ ${filledPrice.toString()}`,
    );
    this._logger.info(`   Entry was: ${entrySide} @ ${this.lastFilled.price.toString()}`);
    this._logger.info(`   New Position: ${this.positionAmount}`);
    this._logger.info(
      `   🔄 Reference price updated: ${oldReference} -> ${this.referencePrice}`,
    );

    // Clear lastFilled but KEEP lastFilledDirection for next entry direction
    // lastFilledDirection is preserved to maintain mean-reversion behavior
    this.lastFilled = null;
    this.openTpOrder = null;

    // Cleanup metadata
    this.orderMetadataMap.delete(order.clientOrderId!);
    if (metadata.parentOrderId) {
      this.orderMetadataMap.delete(metadata.parentOrderId);
    }

    // Immediately check for new entry after TP fills (ORDER-STATUS-ONLY approach)
    return this.checkEntryConditions();
  }

  /**
   * Handle order cancellation/rejection
   *
   * After entry order is canceled:
   * - Clear open entry order
   * - Attempt to place a new entry order (ORDER-STATUS-ONLY approach)
   */
  private handleOrderCancellation(
    order: Order,
    metadata: SignalMetaData | undefined,
  ): StrategyResult | null {
    if (!metadata) {
      this._logger.warn(
        `⚠️ Order ${order.status} without metadata: ${order.clientOrderId}`,
      );
      return null;
    }

    this._logger.info(`❌ Order ${order.status}: ${order.clientOrderId}`);

    if (metadata.signalType === SignalType.Entry) {
      // Entry order canceled - clear open entry and pending signal
      this.openEntryOrder = null;
      this.pendingEntrySignalId = null;
      this._logger.info(`   Entry order cleared, attempting new entry...`);

      // Cleanup metadata
      this.orderMetadataMap.delete(order.clientOrderId!);

      // Immediately check for new entry after cancellation (ORDER-STATUS-ONLY approach)
      return this.checkEntryConditions();
    } else if (metadata.signalType === SignalType.TakeProfit) {
      // TP order canceled - clear open TP and pending signal
      this.openTpOrder = null;
      this.pendingTpSignalId = null;
      this._logger.info(`   TP order cleared`);

      // If we still have lastFilled, generate new TP
      if (this.lastFilled) {
        this._logger.info(`   Re-generating TP for last filled entry...`);
        // Cleanup metadata first
        this.orderMetadataMap.delete(order.clientOrderId!);
        return this.generateTakeProfitSignal();
      }
    }

    // Cleanup metadata
    this.orderMetadataMap.delete(order.clientOrderId!);
    return null;
  }

  /**
   * Called when order is created from this strategy's signal
   */
  public override async onOrderCreated(order: Order): Promise<void> {
    const metadata = this.orderMetadataMap.get(order.clientOrderId || '');

    if (metadata) {
      if (metadata.signalType === SignalType.Entry) {
        this.openEntryOrder = order;
        // Clear pending signal ID now that order is tracked
        this.pendingEntrySignalId = null;
        this._logger.info(`📝 Entry order created: ${order.clientOrderId}`);
      } else if (metadata.signalType === SignalType.TakeProfit) {
        this.openTpOrder = order;
        // Clear pending signal ID now that order is tracked
        this.pendingTpSignalId = null;
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
    this.pendingEntrySignalId = null;
    this.pendingTpSignalId = null;
    this.lastFilled = null;
    this.lastFilledDirection = null;
    this.positionAmount = 0;
    this.currentLevelRepeats = 0;
    this.initialDataProcessed = false;
    this.orderSequence = 0;
    this._logger.info(`🧹 [SingleLadderLifoTP] Strategy cleaned up`);
  }

  /**
   * Get strategy state for monitoring
   */
  public getStrategyState() {
    return {
      strategyId: this.getStrategyId(),
      strategyType: this.strategyType,
      positionAmount: this.positionAmount,
      referencePrice: this.referencePrice,
      currentLevelRepeats: this.currentLevelRepeats,
      maxRepeatsPerLevel: this.maxRepeatsPerLevel,
      lastFilled: this.lastFilled
        ? {
            side: this.lastFilled.side,
            price: this.lastFilled.price.toString(),
            amount: this.lastFilled.amount.toString(),
          }
        : null,
      lastFilledDirection: this.lastFilledDirection,
      preferredDirection: this.preferredDirection,
      openEntryOrder: this.openEntryOrder?.clientOrderId || null,
      openTpOrder: this.openTpOrder?.clientOrderId || null,
      pendingEntrySignalId: this.pendingEntrySignalId,
      pendingTpSignalId: this.pendingTpSignalId,
      positionLimits: {
        min: this.minPositionAmount,
        max: this.maxPositionAmount,
      },
      canAddLong: this.canAddLong(),
      canAddShort: this.canAddShort(),
      mode: this.getPositionMode(),
      // Calculated entry prices for monitoring
      longEntryPrice: this.referencePrice * (1 - this.dropPercent),
      shortEntryPrice: this.referencePrice * (1 + this.risePercent),
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
