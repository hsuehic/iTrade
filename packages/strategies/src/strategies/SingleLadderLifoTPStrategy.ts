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
  InitialDataResult,
  OrderSide,
} from '@itrade/core';
import Decimal from 'decimal.js';
import { StrategyRegistryConfig } from '../type';

/**
 * 📊 SingleLadderLifoTPStrategy 参数
 *
 * 单阶梯+LIFO止盈策略参数接口
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
        description: 'Step percent for ladder entries (e.g., 2 = 2% from referencePrice)',
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
        description:
          'Take profit percent from entry price (e.g., 1 = 1% profit). Must be >= stepPercent / 2.',
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
        required: false,
        editable: true,
        description: 'Optional: Ticker data for monitoring',
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
      fetchPositions: { required: true, editable: false, description: 'Fetch positions' },
      fetchOpenOrders: {
        required: true,
        editable: false,
        description: 'Fetch open orders',
      },
      fetchBalance: { required: true, editable: false, description: 'Fetch balance' },
      fetchTicker: { required: false, editable: true, description: 'Fetch ticker' },
    },
    documentation: {
      overview: 'Single ladder strategy with LIFO take-profit.',
      parameters: '...',
      signals: '...',
      riskFactors: [
        'Trend exhaustion',
        'Base position limit',
        'Single TP order',
        'Limit orders may not fill',
      ],
    },
  };

type EntrySide = 'LONG' | 'SHORT';

interface FilledEntry {
  side: EntrySide;
  price: Decimal;
  amount: Decimal;
  clientOrderId: string;
  timestamp: number;
  referencePriceBefore: Decimal;
}

interface ExtendedSignalMetaData extends SignalMetaData {
  side?: OrderSide;
}

export class SingleLadderLifoTPStrategy extends BaseStrategy<SingleLadderLifoTPParameters> {
  private basePrice: number;
  private stepPercent: number;
  private takeProfitPercent: number;
  private orderAmount: number;
  private minSize: number;
  private maxSize: number;
  private leverage: number;
  private tradeMode: TradeMode = TradeMode.ISOLATED;

  private tradedSize: Decimal = new Decimal(0);
  private filledEntries: FilledEntry[] = [];
  private referencePrice: Decimal;
  private initialDataProcessed: boolean = false;

  private openLowerOrder: Order | null = null; // Always BUY (Entry or TP)
  private openUpperOrder: Order | null = null; // Always SELL (Entry or TP)
  private pendingClientOrderIds: Set<string> = new Set();
  private orders: Map<string, Order> = new Map();
  private orderMetadataMap: Map<string, ExtendedSignalMetaData> = new Map();
  private processedQuantityMap: Map<string, Decimal> = new Map();

  constructor(config: StrategyConfig<SingleLadderLifoTPParameters>) {
    super(config);
    const { parameters } = config;

    this.basePrice = parameters.basePrice;
    this.stepPercent = parameters.stepPercent / 100;
    this.takeProfitPercent = parameters.takeProfitPercent / 100;
    this.orderAmount = parameters.orderAmount;
    this.minSize = parameters.minSize;
    this.maxSize = parameters.maxSize;
    this.leverage = parameters.leverage ?? 10;

    if (this.takeProfitPercent < this.stepPercent / 2) {
      throw new Error(
        `Invalid Take Profit: takeProfitPercent (${this.takeProfitPercent * 100}%) must be >= stepPercent/2 (${(this.stepPercent / 2) * 100}%)`,
      );
    }

    this.referencePrice = new Decimal(this.basePrice);

    if (this.minSize > this.maxSize) {
      throw new Error(
        `Invalid size limits: minSize (${this.minSize}) > maxSize (${this.maxSize})`,
      );
    }

    this._logger.info(`🪜 [SingleLadderLifoTP] Strategy initialized.`);
  }

  private getPositionMode(): string {
    if (this.minSize > 0) return 'LONG_ONLY_WITH_BASE';
    if (this.maxSize < 0) return 'SHORT_ONLY_WITH_BASE';
    if (this.minSize < 0 && this.maxSize > 0) return 'BI_DIRECTIONAL';
    if (this.minSize === 0 && this.maxSize > 0) return 'LONG_ONLY';
    return 'STANDARD';
  }

  private canAddLong(): boolean {
    return this.tradedSize.plus(this.orderAmount).lte(this.maxSize);
  }

  private canAddShort(): boolean {
    return this.tradedSize.minus(this.orderAmount).gte(this.minSize);
  }

  public override async processInitialData(
    initialData: InitialDataResult,
  ): Promise<StrategyAnalyzeResult> {
    this._logger.info(`📊 [SingleLadderLifoTP] Processing initial data...`);
    const signals: StrategyResult[] = [];

    if (initialData.openOrders) {
      initialData.openOrders.forEach((order) => {
        if (order.symbol === this._context.symbol) {
          const isOwned =
            (order.strategyId && order.strategyId === this.getStrategyId()) ||
            (order.clientOrderId && this.isStrategyOrderId(order.clientOrderId));

          if (isOwned && order.clientOrderId) {
            let metadata = this.orderMetadataMap.get(order.clientOrderId);
            if (!metadata) {
              metadata = this.ensureRecoveredMetadata(order);
            }

            // Requirement: there should not be tp order when starting.
            // If we find an existing TP order, we cancel it and don't track it.
            if (metadata?.signalType === SignalType.TakeProfit) {
              this._logger.info(
                `🗑️ Found existing TP order on start, cancelling per requirement: ${order.clientOrderId}`,
              );
              signals.push({
                action: 'cancel',
                clientOrderId: order.clientOrderId,
                symbol: this._symbol,
                reason: 'no_tp_on_start',
              });
            } else {
              this.orders.set(order.clientOrderId, order);
              if (order.side === OrderSide.BUY) {
                this.openLowerOrder = order;
                this._logger.info(
                  `🔍 Found existing Lower Entry order: ${order.clientOrderId}`,
                );
              } else {
                this.openUpperOrder = order;
                this._logger.info(
                  `🔍 Found existing Upper Entry order: ${order.clientOrderId}`,
                );
              }
            }
          }
        }
      });
    }

    this.initialDataProcessed = true;
    const newSignals = this.updateLadderOrders(true);
    signals.push(...newSignals);

    this._logger.info(
      `🚀 [SingleLadderLifoTP] Initialization complete. Found ${signals.length} initial signals.`,
    );
    return signals;
  }

  private isBuySignal(clientOrderId: string): boolean {
    const metadata = this.orderMetadataMap.get(clientOrderId);
    return metadata?.side === OrderSide.BUY;
  }

  private isSellSignal(clientOrderId: string): boolean {
    const metadata = this.orderMetadataMap.get(clientOrderId);
    return metadata?.side === OrderSide.SELL;
  }

  private generateLongEntrySignal(price: Decimal): StrategyOrderResult {
    const clientOrderId = this.generateClientOrderId(SignalType.Entry);
    const metadata: ExtendedSignalMetaData = {
      signalType: SignalType.Entry,
      timestamp: Date.now(),
      clientOrderId,
      side: OrderSide.BUY,
    };

    this.orderMetadataMap.set(clientOrderId, metadata);
    this.pendingClientOrderIds.add(clientOrderId);

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

  private generateShortEntrySignal(price: Decimal): StrategyOrderResult {
    const clientOrderId = this.generateClientOrderId(SignalType.Entry);
    const metadata: ExtendedSignalMetaData = {
      signalType: SignalType.Entry,
      timestamp: Date.now(),
      clientOrderId,
      side: OrderSide.SELL,
    };

    this.orderMetadataMap.set(clientOrderId, metadata);
    this.pendingClientOrderIds.add(clientOrderId);

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
      tpPrice = entryPrice.mul(1 + this.takeProfitPercent);
      action = 'sell';
    } else {
      tpPrice = entryPrice.mul(1 - this.takeProfitPercent);
      action = 'buy';
    }

    const metadata: ExtendedSignalMetaData = {
      signalType: SignalType.TakeProfit,
      parentOrderId,
      entryPrice: entryPrice.toString(),
      takeProfitPrice: tpPrice.toString(),
      profitRatio: this.takeProfitPercent,
      timestamp: Date.now(),
      clientOrderId,
      side: action === 'buy' ? OrderSide.BUY : OrderSide.SELL,
    };

    this.orderMetadataMap.set(clientOrderId, metadata);
    this.pendingClientOrderIds.add(clientOrderId);

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

  public override async analyze(dataUpdate: DataUpdate): Promise<StrategyAnalyzeResult> {
    const { orders } = dataUpdate;
    if (orders && orders.length > 0) {
      const signals = this.handleOrderUpdates(orders);
      if (signals.length > 0) return signals;
    }
    return { action: 'hold' };
  }

  private updateLadderOrders(excludeTp: boolean = false): StrategyResult[] {
    const signals: StrategyResult[] = [];
    const canLong = this.canAddLong();
    const canShort = this.canAddShort();

    const pendingOrderIds = Array.from(this.pendingClientOrderIds);

    const lowerPending =
      !!this.openLowerOrder ||
      pendingOrderIds.some((id) => {
        const m = this.orderMetadataMap.get(id);
        return m?.side === OrderSide.BUY;
      });

    const upperPending =
      !!this.openUpperOrder ||
      pendingOrderIds.some((id) => {
        const m = this.orderMetadataMap.get(id);
        return m?.side === OrderSide.SELL;
      });

    this._logger.debug(
      `[updateLadderOrders] Size: ${this.tradedSize.toString()}, LowerPending: ${lowerPending}, UpperPending: ${upperPending}`,
    );

    // Generate up to 2 orders
    // 1. Lower Order (Buy Entry or Buy TP)
    if (this.tradedSize.lt(0)) {
      if (!excludeTp && !lowerPending) {
        const tpSignal = this.generateTakeProfitSignal();
        if (tpSignal) signals.push(tpSignal);
      }
    } else if (canLong) {
      if (!lowerPending) {
        const buyPrice = this.referencePrice.mul(1 - this.stepPercent);
        signals.push(this.generateLongEntrySignal(buyPrice));
      }
    }

    // 2. Upper Order (Sell Entry or Sell TP)
    if (this.tradedSize.gt(0)) {
      if (!excludeTp && !upperPending) {
        const tpSignal = this.generateTakeProfitSignal();
        if (tpSignal) signals.push(tpSignal);
      }
    } else if (canShort) {
      if (!upperPending) {
        const sellPrice = this.referencePrice.mul(1 + this.stepPercent);
        signals.push(this.generateShortEntrySignal(sellPrice));
      }
    }

    return signals;
  }

  private handleOrderUpdates(orders: Order[]): StrategyResult[] {
    const signals: StrategyResult[] = [];
    for (const order of orders) {
      if (order.status === OrderStatus.PARTIALLY_FILLED) {
        this._logger.info(
          `🔄 Partially filled: ${order.side} ${order.symbol} ${order.price} ${order.executedQuantity}/${order.quantity} ${order.status}`,
        );
      }
      if (!order.clientOrderId) continue;

      let metadata = this.orderMetadataMap.get(order.clientOrderId);
      if (!metadata) metadata = this.ensureRecoveredMetadata(order);
      if (!metadata) continue;

      const existingOrder = this.orders.get(order.clientOrderId);
      if (
        existingOrder?.updateTime &&
        order.updateTime &&
        existingOrder.updateTime.getTime() >= order.updateTime.getTime()
      )
        continue;

      this.orders.set(order.clientOrderId, order);

      if (!existingOrder || existingOrder.status !== order.status) {
        this._logger.info(
          `🔄 Order status: ${order.clientOrderId.substring(0, 12)}... ${order.status}`,
        );
        if (
          order.status === OrderStatus.FILLED ||
          order.status === OrderStatus.PARTIALLY_FILLED
        ) {
          signals.push(...this.handleOrderFilled(order, metadata));
        }
        if (
          [OrderStatus.CANCELED, OrderStatus.REJECTED, OrderStatus.EXPIRED].includes(
            order.status,
          )
        ) {
          this.processedQuantityMap.delete(order.clientOrderId);
          signals.push(...this.handleOrderCancellation(order, metadata));
        }
      }
    }
    return signals;
  }

  private ensureRecoveredMetadata(order: Order): ExtendedSignalMetaData | undefined {
    if (!order.clientOrderId || !this.isStrategyOrderId(order.clientOrderId))
      return undefined;
    const signalType = order.clientOrderId.startsWith('T')
      ? SignalType.TakeProfit
      : SignalType.Entry;
    const metadata: ExtendedSignalMetaData = {
      signalType,
      timestamp: Date.now(),
      clientOrderId: order.clientOrderId,
      side: order.side,
    };
    this.orderMetadataMap.set(order.clientOrderId, metadata);
    return metadata;
  }

  private isStrategyOrderId(clientOrderId: string): boolean {
    const strategyId = this.getStrategyId();
    const match = /^(E|T)(\d+)D/.exec(clientOrderId);
    return !!match && match[2] === String(strategyId);
  }

  private handleOrderFilled(
    order: Order,
    metadata: ExtendedSignalMetaData,
  ): StrategyResult[] {
    if (order.status === OrderStatus.FILLED) {
      this.pendingClientOrderIds.delete(order.clientOrderId!);
    }
    if (metadata.signalType === SignalType.Entry) return this.handleEntryFilled(order);
    if (metadata.signalType === SignalType.TakeProfit)
      return this.handleTpFilled(order, metadata);
    return [];
  }

  private handleEntryFilled(order: Order): StrategyResult[] {
    const totalFilled = order.executedQuantity || order.quantity;
    const lastProcessed =
      this.processedQuantityMap.get(order.clientOrderId!) || new Decimal(0);
    const delta = totalFilled.minus(lastProcessed);
    if (delta.lte(0)) return [];

    const filledPrice = order.averagePrice || order.price!;
    const side: EntrySide = order.side === OrderSide.BUY ? 'LONG' : 'SHORT';

    this.tradedSize = this.tradedSize.plus(side === 'LONG' ? delta : delta.neg());
    const oldReference = this.referencePrice;
    this.referencePrice = filledPrice;

    this.filledEntries.push({
      side,
      price: filledPrice,
      amount: delta,
      clientOrderId: order.clientOrderId!,
      timestamp: Date.now(),
      referencePriceBefore: oldReference,
    });

    this.processedQuantityMap.set(order.clientOrderId!, totalFilled);

    const signals: StrategyResult[] = [];

    if (order.status === OrderStatus.FILLED) {
      if (order.side === OrderSide.BUY) {
        this.openLowerOrder = null;
        // If we filled a LONG entry, cancel existing SELL TP to refresh it for LIFO
        if (this.openUpperOrder) {
          const m = this.orderMetadataMap.get(this.openUpperOrder.clientOrderId!);
          if (m?.signalType === SignalType.TakeProfit) {
            signals.push({
              action: 'cancel',
              clientOrderId: this.openUpperOrder.clientOrderId,
              symbol: this._symbol,
              reason: 'lifo_tp_refresh',
            });
            this.openUpperOrder = null;
          }
        }
      } else {
        this.openUpperOrder = null;
        // If we filled a SHORT entry, cancel existing BUY TP
        if (this.openLowerOrder) {
          const m = this.orderMetadataMap.get(this.openLowerOrder.clientOrderId!);
          if (m?.signalType === SignalType.TakeProfit) {
            signals.push({
              action: 'cancel',
              clientOrderId: this.openLowerOrder.clientOrderId,
              symbol: this._symbol,
              reason: 'lifo_tp_refresh',
            });
            this.openLowerOrder = null;
          }
        }
      }
    }

    this._logger.info(
      `✅ Entry FILLED: ${side} ${delta.toString()} @ ${filledPrice.toString()}. Size: ${this.tradedSize.toFixed(4)}`,
    );
    signals.push(...this.updateLadderOrders());
    return signals;
  }

  private handleTpFilled(
    order: Order,
    metadata: ExtendedSignalMetaData,
  ): StrategyResult[] {
    if (this.filledEntries.length === 0) return [];

    const totalFilled = order.executedQuantity || order.quantity;
    const lastProcessed =
      this.processedQuantityMap.get(order.clientOrderId!) || new Decimal(0);
    const delta = totalFilled.minus(lastProcessed);
    if (delta.lte(0)) return [];

    const entry = this.filledEntries.pop()!;
    this.tradedSize = this.tradedSize.plus(entry.side === 'LONG' ? delta.neg() : delta);
    this.referencePrice = entry.referencePriceBefore;

    this.processedQuantityMap.set(order.clientOrderId!, totalFilled);
    if (order.status === OrderStatus.FILLED) {
      if (order.side === OrderSide.BUY) this.openLowerOrder = null;
      else this.openUpperOrder = null;
      this.orderMetadataMap.delete(order.clientOrderId!);
      if (metadata.parentOrderId) this.orderMetadataMap.delete(metadata.parentOrderId);
    }

    this._logger.info(
      `✅ TP FILLED: ${order.side} ${delta.toString()}. Size: ${this.tradedSize.toFixed(4)}`,
    );
    return this.updateLadderOrders();
  }

  private handleOrderCancellation(
    order: Order,
    metadata: ExtendedSignalMetaData,
  ): StrategyResult[] {
    this._logger.info(`❌ Order ${order.status}: ${order.clientOrderId}`);
    if (order.side === OrderSide.BUY) this.openLowerOrder = null;
    else this.openUpperOrder = null;

    if (order.clientOrderId) {
      this.pendingClientOrderIds.delete(order.clientOrderId);
      this.orderMetadataMap.delete(order.clientOrderId);
    }
    return this.updateLadderOrders();
  }

  public override async onOrderCreated(order: Order): Promise<void> {
    if (order.side === OrderSide.BUY) this.openLowerOrder = order;
    else this.openUpperOrder = order;
    if (order.clientOrderId) this.pendingClientOrderIds.delete(order.clientOrderId);
    this.orders.set(order.clientOrderId || order.id, order);
  }

  public override async onOrderFilled(order: Order): Promise<void> {
    this._logger.debug(`[onOrderFilled] ${order.clientOrderId}`);
  }

  public override async onPositionUpdate(_position: Position): Promise<void> {
    // No-op: strictly track ONLY strategy-generated trades via tradedSize
    this._logger.debug(`[onPositionUpdate] Ignored external position update`);
  }

  protected async onCleanup(): Promise<void> {
    this.orders.clear();
    this.orderMetadataMap.clear();
    this.openLowerOrder = null;
    this.openUpperOrder = null;
    this.pendingClientOrderIds.clear();
    this.filledEntries = [];
    this.tradedSize = new Decimal(0);
    this.initialDataProcessed = false;

    this.processedQuantityMap.clear();
    this._logger.info(`🧹 Strategy cleaned up`);
  }

  public getStrategyState() {
    return {
      strategyId: this.getStrategyId(),
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
      openLowerOrder: this.openLowerOrder?.clientOrderId || null,
      openUpperOrder: this.openUpperOrder?.clientOrderId || null,
      sizeLimits: {
        min: this.minSize,
        max: this.maxSize,
      },
      canAddLong: this.canAddLong(),
      canAddShort: this.canAddShort(),
      mode: this.getPositionMode(),
      // Calculated entry prices for monitoring
      buyPrice: this.referencePrice.mul(1 - this.stepPercent).toNumber(),
      sellPrice: this.referencePrice.mul(1 + this.stepPercent).toNumber(),
    };
  }

  public override getSubscriptionConfig() {
    return {
      ticker: { enabled: true },
      method: 'websocket' as const,
      exchange: this._context.exchange,
    };
  }

  public override getInitialDataConfig() {
    return {
      fetchPositions: false,
      fetchOpenOrders: true,
      fetchBalance: true,
      fetchTicker: true,
    };
  }
}
