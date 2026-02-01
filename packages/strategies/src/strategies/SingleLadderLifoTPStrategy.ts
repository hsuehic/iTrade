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
  private filledEntries: FilledEntry[] = [];
  private lastFilledDirection: EntrySide | null = null; // Track direction even after TP
  private referencePrice: number;
  private currentLevelRepeats: number = 0; // Track entries at current reference price
  private initialDataProcessed: boolean = false; // Flag to trigger initial entry

  // Order tracking
  private openEntryOrder: Order | null = null;
  private openTpOrder: Order | null = null;
  private pendingEntryClientOrderId: string | null = null;
  private pendingTpClientOrderId: string | null = null;
  private initialEntrySignalGenerated: boolean = false; // Track if initial entry was generated
  private orders: Map<string, Order> = new Map();
  private orderMetadataMap: Map<string, SignalMetaData> = new Map();

  // Position from exchange
  private position: Position | null = null;

  // Last ticker for price reference (optional, for monitoring only)
  private lastTicker: Ticker | null = null;
  private recoveryContext: StrategyRecoveryContext | null = null;

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
    if (this.recoveryContext?.recovered) {
      this._logger.info(`   🔄 Applying recovered state for initial setup`);
    }

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
          this.ensureRecoveredMetadata(order);

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
    this.pendingEntryClientOrderId = clientOrderId;

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
    this.pendingEntryClientOrderId = clientOrderId;

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
   * Generate take-profit signal based on lastFilled entry price
   */
  private generateTakeProfitSignal(): StrategyResult | null {
    const lastFilled = this.filledEntries[this.filledEntries.length - 1];
    if (!lastFilled) {
      this._logger.warn(`⚠️ [TP] Cannot generate TP: No filled entries in stack`);
      return null;
    }

    return this.generateTakeProfitSignalForEntry(
      lastFilled.side,
      lastFilled.price,
      lastFilled.amount,
      lastFilled.clientOrderId,
    );
  }

  /**
   * Generate take-profit signal based on a provided entry definition
   */
  private generateTakeProfitSignalForEntry(
    entrySide: EntrySide,
    entryPrice: Decimal,
    amount: Decimal,
    parentOrderId: string,
  ): StrategyResult {
    const clientOrderId = this.generateClientOrderId(SignalType.TakeProfit);

    // Calculate TP price based on entry price
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
      parentOrderId,
      entryPrice: entryPrice.toString(),
      takeProfitPrice: tpPrice.toString(),
      profitRatio: this.takeProfitPercent,
      timestamp: Date.now(),
      clientOrderId,
    };

    this.orderMetadataMap.set(clientOrderId, metadata);
    this.pendingTpClientOrderId = clientOrderId;

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
   * Generate take-profit signal based on a pending entry signal (limit order)
   */
  private generateTakeProfitSignalForEntrySignal(
    entrySignal: StrategyResult,
  ): StrategyResult | null {
    if (
      !this.isOrderSignal(entrySignal) ||
      !entrySignal.price ||
      !entrySignal.quantity ||
      !entrySignal.clientOrderId
    ) {
      return null;
    }

    const entrySide: EntrySide = entrySignal.action === 'buy' ? 'LONG' : 'SHORT';
    return this.generateTakeProfitSignalForEntry(
      entrySide,
      entrySignal.price,
      entrySignal.quantity,
      entrySignal.clientOrderId,
    );
  }

  /**
   * Generate take-profit signal based on an existing open entry order
   */
  private generateTakeProfitSignalForOpenEntry(order: Order): StrategyResult | null {
    if (!order.clientOrderId || !order.price) {
      return null;
    }

    const entrySide: EntrySide = order.side === OrderSide.BUY ? 'LONG' : 'SHORT';
    return this.generateTakeProfitSignalForEntry(
      entrySide,
      order.price,
      order.quantity,
      order.clientOrderId,
    );
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
    const { ticker, orders, positions, symbol } = dataUpdate;

    // Handle position updates
    if (positions && positions.length > 0) {
      this.handlePositionUpdate(positions);
    }

    // Handle order updates - this can trigger new entry/TP signals
    // Returns array when entry fills (TP + next entry) or single result otherwise
    if (orders && orders.length > 0) {
      const signals = this.handleOrderUpdates(orders);
      if (signals.length > 0) {
        return signals.length === 1 ? signals[0] : signals;
      }
    }

    // Update ticker for monitoring (optional)
    if (ticker && symbol === this._symbol) {
      this.lastTicker = ticker;
    }

    // Generate INITIAL entry signal ONCE after initialization
    // Subsequent entry signals are ONLY generated in response to order status changes:
    // - handleEntryFilled() → generates TP + next entry (if position allows)
    // - handleTpFilled() → generates new entry after TP
    // - handleOrderCancellation() → generates new entry after cancel
    if (
      this.initialDataProcessed &&
      !this.initialEntrySignalGenerated &&
      !this.openEntryOrder &&
      !this.openTpOrder
    ) {
      const signal = this.checkEntryConditions();
      if (signal && signal.action !== 'hold') {
        this.initialEntrySignalGenerated = true;
        this._logger.info(`📊 Initial entry signal generated`);
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
    if (this.openEntryOrder || this.pendingEntryClientOrderId) {
      return {
        action: 'hold',
        reason: `Entry order pending: ${this.openEntryOrder?.clientOrderId || this.pendingEntryClientOrderId}`,
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
   * @returns Array of signals (can be multiple when entry fills: TP + next entry)
   */
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
          const cancelSignal = this.handleOrderCancellation(order, metadata);
          if (cancelSignal) {
            signals.push(cancelSignal);
          }
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
    const signals: StrategyResult[] = [];
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

    // Update reference price to the filled entry price (new ladder step)
    const oldReference = this.referencePrice;
    this.referencePrice = filledPrice.toNumber();
    this.currentLevelRepeats = 1;

    // Record filled entry (LIFO stack)
    this.filledEntries.push({
      side,
      price: filledPrice,
      amount: filledAmount,
      clientOrderId: order.clientOrderId!,
      timestamp: Date.now(),
      referencePriceBefore: oldReference,
    });

    // Track direction for future entries (persists after TP)
    this.lastFilledDirection = side;

    // Clear open entry order
    this.openEntryOrder = null;
    if (this.pendingEntryClientOrderId === order.clientOrderId) {
      this.pendingEntryClientOrderId = null;
    }

    this._logger.info(
      `✅ Entry FILLED: ${side} ${filledAmount.toString()} @ ${filledPrice.toString()}`,
    );
    this._logger.info(
      `   Position: ${this.positionAmount}, Repeats: ${this.currentLevelRepeats}/${this.maxRepeatsPerLevel || '∞'}, Ref: ${this.referencePrice}`,
    );
    this._logger.info(
      `   🔄 Reference price updated: ${oldReference} -> ${this.referencePrice}`,
    );

    if (this.openTpOrder) {
      this._logger.info(`   ❌ Cancel existing TP: ${this.openTpOrder.clientOrderId}`);
      signals.push({
        action: 'cancel',
        clientOrderId: this.openTpOrder.clientOrderId,
        symbol: this._symbol,
        reason: 'new_entry_filled_replace_tp',
      });
      this.openTpOrder = null;
    }

    // Generate new TP signal for this entry (reference-based)
    const tpSignal = this.generateTakeProfitSignal();
    if (tpSignal) {
      signals.push(tpSignal);
    }

    // Generate next entry signal after entry fill
    const nextEntrySignal = this.checkEntryConditions();
    if (this.isOrderSignal(nextEntrySignal)) {
      signals.push(nextEntrySignal);
    }

    return signals;
  }

  /**
   * Handle take-profit order filled
   *
   * After TP fills:
   * 1. Update position
   * 2. Update reference price (allows bi-directional ladder walking)
   * 3. Clear lastFilled but KEEP lastFilledDirection
   * 4. If entry order already pending, cancel it (to enforce one open entry)
   * 5. Only generate new entry if no entry is pending
   */
  private handleTpFilled(order: Order, metadata: SignalMetaData): StrategyResult[] {
    const signals: StrategyResult[] = [];

    if (this.filledEntries.length === 0) {
      this._logger.warn(`⚠️ TP filled but no filled entries recorded in stack`);
      return signals;
    }

    const filledAmount = order.executedQuantity || order.quantity;
    const filledPrice = order.averagePrice || order.price!;
    
    // Get the entry that this TP belongs to
    const entry = this.filledEntries.pop()!;
    const entrySide = entry.side;

    // Update position amount (respecting min/max limits)
    if (entrySide === 'LONG') {
      // TP for long = sell, reduce position
      const newPosition = this.positionAmount - filledAmount.toNumber();
      this.positionAmount = Math.max(newPosition, this.minPositionAmount);
    } else {
      // TP for short = buy, increase position
      const newPosition = this.positionAmount + filledAmount.toNumber();
      this.positionAmount = Math.min(newPosition, this.maxPositionAmount);
    }

    // Restore reference price from the entry record (precise stepping)
    const oldReference = this.referencePrice;
    this.referencePrice = entry.referencePriceBefore;
    this.currentLevelRepeats = 0; // Reset counter for new (restored) level

    this._logger.info(
      `✅ TP FILLED: ${order.side} ${filledAmount.toString()} @ ${filledPrice.toString()}`,
    );
    this._logger.info(`   Entry was: ${entrySide} @ ${entry.price.toString()}`);
    this._logger.info(`   New Position: ${this.positionAmount}`);
    this._logger.info(
      `   🔄 Reference price restored: ${oldReference} -> ${this.referencePrice}`,
    );

    // Clear trackers
    this.openTpOrder = null;
    if (this.pendingTpClientOrderId === order.clientOrderId) {
      this.pendingTpClientOrderId = null;
    }

    // Cleanup metadata
    this.orderMetadataMap.delete(order.clientOrderId!);
    if (metadata.parentOrderId) {
      this.orderMetadataMap.delete(metadata.parentOrderId);
    }

    // If an entry order is pending, cancel it
    if (this.openEntryOrder) {
      this._logger.info(
        `   ❌ Cancel existing entry: ${this.openEntryOrder.clientOrderId}`,
      );
      signals.push({
        action: 'cancel',
        clientOrderId: this.openEntryOrder.clientOrderId,
        symbol: this._symbol,
        reason: 'tp_filled_replace_entry',
      });
      this.openEntryOrder = null;
      // Do NOT return here, continue to generate new signals
    }

    // Generate new entry signal (at restored reference price)
    this._logger.info(`   🔄 Generating new entry after TP`);
    const entrySignal = this.checkEntryConditions();
    if (this.isOrderSignal(entrySignal)) {
      signals.push(entrySignal);
    }

    // Generate new TP signal if there are more entries in the stack
    if (this.filledEntries.length > 0) {
      this._logger.info(`   🔄 Generating new TP for remaining position`);
      const tpSignal = this.generateTakeProfitSignal();
      if (tpSignal) {
        signals.push(tpSignal);
      }
    }

    return signals;
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
      // Entry order canceled - clear open entry
      this.openEntryOrder = null;
      if (this.pendingEntryClientOrderId === order.clientOrderId) {
        this.pendingEntryClientOrderId = null;
      }
      this._logger.info(`   Entry order cleared, attempting new entry...`);

      // Cleanup metadata
      this.orderMetadataMap.delete(order.clientOrderId!);

      // Immediately check for new entry after cancellation (ORDER-STATUS-ONLY approach)
      return this.checkEntryConditions();
    } else if (metadata.signalType === SignalType.TakeProfit) {
      // TP order canceled - clear open TP
      this.openTpOrder = null;
      if (this.pendingTpClientOrderId === order.clientOrderId) {
        this.pendingTpClientOrderId = null;
      }
      this._logger.info(`   TP order cleared`);

      // If we still have filled entries, generate new TP
      if (this.filledEntries.length > 0) {
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
    this.lastFilledDirection = null;
    this.positionAmount = 0;
    this.currentLevelRepeats = 0;
    this.initialDataProcessed = false;
    this.initialEntrySignalGenerated = false;
    this.orderSequence = 0;
    this._logger.info(`🧹 [SingleLadderLifoTP] Strategy cleaned up`);
  }

  public override async saveState(): Promise<StrategyStateSnapshot> {
    const state = await super.saveState();
    state.internalState = {
      referencePrice: this.referencePrice,
      currentLevelRepeats: this.currentLevelRepeats,
      filledEntries: this.filledEntries.map((entry) => ({
        side: entry.side,
        price: entry.price.toString(),
        amount: entry.amount.toString(),
        clientOrderId: entry.clientOrderId,
        timestamp: entry.timestamp,
        referencePriceBefore: entry.referencePriceBefore,
      })),
      lastFilledDirection: this.lastFilledDirection,
      positionAmount: this.positionAmount,
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
    if (typeof internalState.currentLevelRepeats === 'number') {
      this.currentLevelRepeats = internalState.currentLevelRepeats;
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
    } else if (internalState.lastFilled) {
      // Migration from old state format
      this.filledEntries = [
        {
          side: internalState.lastFilled.side,
          price: new Decimal(internalState.lastFilled.price),
          amount: new Decimal(internalState.lastFilled.amount),
          clientOrderId: internalState.lastFilled.clientOrderId,
          timestamp: internalState.lastFilled.timestamp,
          referencePriceBefore: this.referencePrice,
        },
      ];
    }

    if (typeof internalState.lastFilledDirection !== 'undefined') {
      this.lastFilledDirection = internalState.lastFilledDirection;
    }
    if (typeof internalState.positionAmount === 'number') {
      this.positionAmount = internalState.positionAmount;
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
      positionAmount: this.positionAmount,
      referencePrice: this.referencePrice,
      currentLevelRepeats: this.currentLevelRepeats,
      maxRepeatsPerLevel: this.maxRepeatsPerLevel,
      filledEntriesCount: this.filledEntries.length,
      lastFilled: this.filledEntries.length > 0
        ? {
            side: this.filledEntries[this.filledEntries.length - 1].side,
            price: this.filledEntries[this.filledEntries.length - 1].price.toString(),
            amount: this.filledEntries[this.filledEntries.length - 1].amount.toString(),
          }
        : null,
      lastFilledDirection: this.lastFilledDirection,
      preferredDirection: this.preferredDirection,
      openEntryOrder: this.openEntryOrder?.clientOrderId || null,
      openTpOrder: this.openTpOrder?.clientOrderId || null,
      initialEntrySignalGenerated: this.initialEntrySignalGenerated,
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
