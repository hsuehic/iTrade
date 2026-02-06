import {
  BaseStrategy,
  StrategyResult,
  StrategyOrderResult,
  StrategyAnalyzeResult,
  StrategyConfig,
  Order,
  OrderStatus,
  DataUpdate,
  StrategyParameters,
  TradeMode,
  SignalType,
  SignalMetaData,
  InitialDataResult,
  OrderSide,
  OrderBook,
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
  /** Refresh TP at most once per interval (ms); 0 disables time gating */
  tpRefreshMinIntervalMs?: number;
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
      tpRefreshMinIntervalMs: 500,
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
      {
        name: 'tpRefreshMinIntervalMs',
        type: 'number',
        description:
          'Minimum time interval between TP refreshes in ms (0 = no time gating)',
        defaultValue: 500,
        required: false,
        min: 0,
        max: 600000,
        group: 'Take Profit',
        order: 8,
        unit: 'ms',
      },
    ],
    subscriptionRequirements: {
      ticker: {
        required: true,
        editable: false,
        description: 'Required: Ticker data for order gating',
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
      fetchTicker: { required: false, editable: false, description: 'Fetch ticker' },
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
  private leverage: number;
  private tpRefreshMinIntervalMs: number;
  private minSize: number;
  private maxSize: number;
  private tradeMode: TradeMode = TradeMode.ISOLATED;

  private lastOrderBook: OrderBook | null = null;

  private tradedSize: Decimal = new Decimal(0);
  private filledEntries: FilledEntry[] = [];
  private referencePrice: Decimal;

  private openLowerOrder: Order | null = null; // Always BUY (Entry or TP)
  private openUpperOrder: Order | null = null; // Always SELL (Entry or TP)
  private pendingClientOrderIds: Set<string> = new Set();
  private orders: Map<string, Order> = new Map();
  private orderMetadataMap: Map<string, ExtendedSignalMetaData> = new Map();
  private processedQuantityMap: Map<string, Decimal> = new Map();
  private tpRefreshTracker: Map<string, { qty: Decimal; time: number }> = new Map();
  private lastTickerPrice: Decimal | null = null;
  private initialDataProcessed = false;

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
    this.tpRefreshMinIntervalMs = Math.max(parameters.tpRefreshMinIntervalMs ?? 0, 0);

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

  private getOrderTime(order: Order): number {
    return (order.updateTime ?? order.timestamp).getTime();
  }

  private pickLatestOrder(orders: Order[]): Order | null {
    if (orders.length === 0) return null;
    return orders.reduce((latest, current) =>
      this.getOrderTime(current) > this.getOrderTime(latest) ? current : latest,
    );
  }

  private isActiveEntryOrder(order: Order): boolean {
    if (
      order.status !== OrderStatus.NEW &&
      order.status !== OrderStatus.PARTIALLY_FILLED
    ) {
      return false;
    }
    const metadata = order.clientOrderId
      ? this.orderMetadataMap.get(order.clientOrderId)
      : undefined;
    return metadata?.signalType === SignalType.Entry;
  }

  private hasActiveEntry(side: OrderSide): boolean {
    const direct = side === OrderSide.BUY ? this.openLowerOrder : this.openUpperOrder;
    if (direct && this.isActiveEntryOrder(direct)) return true;

    for (const order of this.orders.values()) {
      if (order.side === side && this.isActiveEntryOrder(order)) return true;
    }
    return false;
  }

  private shouldRefreshTakeProfit(
    order: Order,
    totalFilled: Decimal,
    timestamp: number,
  ): boolean {
    if (order.status === OrderStatus.FILLED) return true;
    if (this.tpRefreshMinIntervalMs <= 0) return true;

    const tracker = this.tpRefreshTracker.get(order.clientOrderId!);
    const lastTime = tracker?.time ?? order.timestamp.getTime();

    if (
      this.tpRefreshMinIntervalMs > 0 &&
      timestamp - lastTime >= this.tpRefreshMinIntervalMs
    )
      return true;
    return false;
  }

  private updateTickerPrice(price?: Decimal): void {
    if (!price || price.lte(0)) return;
    this.lastTickerPrice = price;
  }

  private isSignalPriceInBookRange(price: Decimal, side: OrderSide): boolean {
    if (
      !this.lastOrderBook ||
      !this.lastOrderBook.bids?.length ||
      !this.lastOrderBook.asks?.length
    ) {
      // If we don't have order book data, we conservatively block signals
      // strictly following "only when in range"
      return false;
    }

    if (side === OrderSide.BUY) {
      // For BUY, price must be within range of current Bids
      // Bids are sorted Descending (Best/High -> Worst/Low)
      // We check if price >= Lowest Bid in the provided snapshot
      // The snapshot depth is configured to 5 in getSubscriptionConfig
      const depth = Math.min(this.lastOrderBook.bids.length, 5);
      const lowestBid = this.lastOrderBook.bids[depth - 1][0];
      return price.gte(lowestBid);
    } else {
      // For SELL, price must be within range of current Asks
      // Asks are sorted Ascending (Best/Low -> Worst/High)
      // We check if price <= Highest Ask in the provided snapshot
      const depth = Math.min(this.lastOrderBook.asks.length, 5);
      const highestAsk = this.lastOrderBook.asks[depth - 1][0];
      return price.lte(highestAsk);
    }
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
    const performanceSummary = this.getPerformanceSummary?.();
    const performance = this.getPerformance?.();
    if (performanceSummary) {
      this._logger.info(
        `📈 [SingleLadderLifoTP] Performance summary on start: totalOrders=${performanceSummary.totalOrders}, pendingOrders=${performanceSummary.pendingOrders}, currentPosition=${performanceSummary.currentPosition}`,
      );
    }
    if (performance) {
      this._logger.info(
        `📈 [SingleLadderLifoTP] Performance snapshot: currentPosition=${performance.position.currentPosition.toFixed(8)}, avgEntryPrice=${performance.position.avgEntryPrice.toFixed(8)}, filledQty=${performance.orders.long.filled.totalQuantity.plus(performance.orders.short.filled.totalQuantity).toFixed(8)}`,
      );
    }

    if (initialData.openOrders) {
      const ownedOrders = initialData.openOrders.filter((order) => {
        if (order.symbol !== this._context.symbol) return false;
        return (
          (order.strategyId && order.strategyId === this.getStrategyId()) ||
          (order.clientOrderId && this.isStrategyOrderId(order.clientOrderId))
        );
      });

      const entryBuys: Order[] = [];
      const entrySells: Order[] = [];
      const filledSnapshots: Array<{
        side: EntrySide;
        amount: Decimal;
        price: Decimal;
        clientOrderId: string;
        timestamp: number;
        referencePriceBefore: Decimal;
      }> = [];

      ownedOrders.forEach((order) => {
        if (!order.clientOrderId) return;
        let metadata = this.orderMetadataMap.get(order.clientOrderId);
        if (!metadata) {
          metadata = this.ensureRecoveredMetadata(order);
        }
        this.orders.set(order.clientOrderId, order);

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
          return;
        }

        if (order.side === OrderSide.BUY) {
          entryBuys.push(order);
        } else {
          entrySells.push(order);
        }

        if (
          metadata?.signalType === SignalType.Entry &&
          order.executedQuantity &&
          order.executedQuantity.gt(0)
        ) {
          const filledPrice = order.averagePrice || order.price || this.referencePrice;
          const side: EntrySide = order.side === OrderSide.BUY ? 'LONG' : 'SHORT';
          filledSnapshots.push({
            side,
            amount: order.executedQuantity,
            price: filledPrice,
            clientOrderId: order.clientOrderId,
            timestamp: this.getOrderTime(order),
            referencePriceBefore: this.referencePrice,
          });
          this.processedQuantityMap.set(order.clientOrderId, order.executedQuantity);
        }
      });

      const keepBuy = this.pickLatestOrder(entryBuys);
      const keepSell = this.pickLatestOrder(entrySells);

      if (entryBuys.length > 1) {
        this._logger.warn(
          `⚠️ Found multiple BUY orders on start. Keeping ${keepBuy?.clientOrderId ?? 'none'} and cancelling ${entryBuys.length - 1} extra order(s).`,
        );
      }
      if (entrySells.length > 1) {
        this._logger.warn(
          `⚠️ Found multiple SELL orders on start. Keeping ${keepSell?.clientOrderId ?? 'none'} and cancelling ${entrySells.length - 1} extra order(s).`,
        );
      }

      entryBuys.forEach((order) => {
        if (keepBuy && order.clientOrderId === keepBuy.clientOrderId) return;
        if (!order.clientOrderId) return;
        signals.push({
          action: 'cancel',
          clientOrderId: order.clientOrderId,
          symbol: this._symbol,
          reason: 'single_buy_order_enforced',
        });
      });

      entrySells.forEach((order) => {
        if (keepSell && order.clientOrderId === keepSell.clientOrderId) return;
        if (!order.clientOrderId) return;
        signals.push({
          action: 'cancel',
          clientOrderId: order.clientOrderId,
          symbol: this._symbol,
          reason: 'single_sell_order_enforced',
        });
      });

      if (keepBuy?.clientOrderId) {
        this.openLowerOrder = keepBuy;
        this._logger.info(
          `🔍 Found existing Lower Entry order: ${keepBuy.clientOrderId}`,
        );
      }
      if (keepSell?.clientOrderId) {
        this.openUpperOrder = keepSell;
        this._logger.info(
          `🔍 Found existing Upper Entry order: ${keepSell.clientOrderId}`,
        );
      }

      if (filledSnapshots.length > 0) {
        filledSnapshots.sort((a, b) => a.timestamp - b.timestamp);
        this.filledEntries = filledSnapshots.map((snapshot) => ({
          side: snapshot.side,
          price: snapshot.price,
          amount: snapshot.amount,
          clientOrderId: snapshot.clientOrderId,
          timestamp: snapshot.timestamp,
          referencePriceBefore: snapshot.referencePriceBefore,
        }));
        const lastSnapshot = filledSnapshots[filledSnapshots.length - 1];
        if (lastSnapshot) this.referencePrice = lastSnapshot.price;
        this.tradedSize = filledSnapshots.reduce((total, snapshot) => {
          return total.plus(
            snapshot.side === 'LONG' ? snapshot.amount : snapshot.amount.neg(),
          );
        }, new Decimal(0));
        this._logger.info(
          `🧩 Restored ${filledSnapshots.length} filled entries from open orders. Size=${this.tradedSize.toFixed(8)}`,
        );
      }
    }

    if (initialData.ticker?.price) {
      this.updateTickerPrice(initialData.ticker.price);
    }

    if (initialData.positions && initialData.positions.length > 0) {
      this._logger.info(
        `ℹ️ Initial positions loaded (${initialData.positions.length}) but not applied to tradedSize per strategy rule.`,
      );
    }

    const performancePosition = performance?.position.currentPosition ?? null;
    const performanceAvgPrice = performance?.position.avgEntryPrice ?? null;
    if (
      performancePosition &&
      !performancePosition.isZero() &&
      this.filledEntries.length === 0
    ) {
      this.tradedSize = performancePosition;
      if (performanceAvgPrice && performanceAvgPrice.gt(0)) {
        this.referencePrice = performanceAvgPrice;
      }
      this._logger.info(
        `📌 Restored position from performance: size=${this.tradedSize.toFixed(8)} avgPrice=${this.referencePrice.toFixed(8)}`,
      );
      const side: EntrySide = this.tradedSize.gt(0) ? 'LONG' : 'SHORT';
      const amount = this.tradedSize.abs();
      this.filledEntries.push({
        side,
        price: this.referencePrice,
        amount,
        clientOrderId: 'recovered_position',
        timestamp: Date.now(),
        referencePriceBefore: this.referencePrice,
      });
      this._logger.info(
        `🧩 Seeded LIFO entry from performance position: ${side} ${amount.toFixed(8)} @ ${this.referencePrice.toFixed(8)}`,
      );
    } else if (
      performanceSummary &&
      this.tradedSize.isZero() &&
      this.filledEntries.length === 0
    ) {
      const summaryPosition = new Decimal(performanceSummary.currentPosition);
      if (!summaryPosition.isZero()) {
        this.tradedSize = summaryPosition;
        if (performanceAvgPrice && performanceAvgPrice.gt(0)) {
          this.referencePrice = performanceAvgPrice;
        }
        this._logger.info(
          `📌 Restored position from performance summary: size=${this.tradedSize.toFixed(8)} avgPrice=${this.referencePrice.toFixed(8)}`,
        );
        const side: EntrySide = this.tradedSize.gt(0) ? 'LONG' : 'SHORT';
        const amount = this.tradedSize.abs();
        this.filledEntries.push({
          side,
          price: this.referencePrice,
          amount,
          clientOrderId: 'recovered_position',
          timestamp: Date.now(),
          referencePriceBefore: this.referencePrice,
        });
        this._logger.info(
          `🧩 Seeded LIFO entry from performance summary: ${side} ${amount.toFixed(8)} @ ${this.referencePrice.toFixed(8)}`,
        );
      }
    }

    this.initialDataProcessed = true;
    const newSignals = this.updateLadderOrders(false);
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

  private getTakeProfitPlan(): {
    tpPrice: Decimal;
    action: 'buy' | 'sell';
    amount: Decimal;
    parentOrderId: string;
    entryPrice: Decimal;
  } | null {
    const lastFilled = this.filledEntries[this.filledEntries.length - 1];
    if (!lastFilled) return null;

    const entrySide = lastFilled.side;
    const entryPrice = lastFilled.price;
    const amount = lastFilled.amount;
    const parentOrderId = lastFilled.clientOrderId;

    let tpPrice: Decimal;
    let action: 'buy' | 'sell';

    if (entrySide === 'LONG') {
      tpPrice = entryPrice.mul(1 + this.takeProfitPercent);
      action = 'sell';
    } else {
      tpPrice = entryPrice.mul(1 - this.takeProfitPercent);
      action = 'buy';
    }

    return {
      tpPrice,
      action,
      amount,
      parentOrderId,
      entryPrice,
    };
  }

  private createTakeProfitSignal(plan: {
    tpPrice: Decimal;
    action: 'buy' | 'sell';
    amount: Decimal;
    parentOrderId: string;
    entryPrice: Decimal;
  }): StrategyOrderResult {
    const clientOrderId = this.generateClientOrderId(SignalType.TakeProfit);
    const metadata: ExtendedSignalMetaData = {
      signalType: SignalType.TakeProfit,
      parentOrderId: plan.parentOrderId,
      entryPrice: plan.entryPrice.toString(),
      takeProfitPrice: plan.tpPrice.toString(),
      profitRatio: this.takeProfitPercent,
      timestamp: Date.now(),
      clientOrderId,
      side: plan.action === 'buy' ? OrderSide.BUY : OrderSide.SELL,
    };

    this.orderMetadataMap.set(clientOrderId, metadata);
    this.pendingClientOrderIds.add(clientOrderId);

    return {
      action: plan.action,
      price: plan.tpPrice,
      quantity: plan.amount,
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
    if (dataUpdate.ticker?.price) {
      this.updateTickerPrice(dataUpdate.ticker.price);
    }
    if (dataUpdate.orderbook) {
      this.lastOrderBook = dataUpdate.orderbook;
    }
    if (orders && orders.length > 0) {
      const signals = this.handleOrderUpdates(orders);
      if (signals.length > 0) return signals;
      return { action: 'hold' };
    }
    if (dataUpdate.ticker?.price) {
      const signals = this.updateLadderOrders();
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
      this.hasActiveEntry(OrderSide.BUY) ||
      pendingOrderIds.some((id) => {
        const m = this.orderMetadataMap.get(id);
        return m?.side === OrderSide.BUY;
      });

    const upperPending =
      this.hasActiveEntry(OrderSide.SELL) ||
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
        const tpPlan = this.getTakeProfitPlan();
        if (tpPlan) {
          const side = tpPlan.action === 'buy' ? OrderSide.BUY : OrderSide.SELL;
          if (this.isSignalPriceInBookRange(tpPlan.tpPrice, side)) {
            signals.push(this.createTakeProfitSignal(tpPlan));
          } else {
            this._logger.warn(
              `⏳ Skip TP signal outside book range: price=${tpPlan.tpPrice.toString()}`,
            );
          }
        }
      }
    } else if (canLong) {
      if (!lowerPending) {
        const buyPrice = this.referencePrice.mul(1 - this.stepPercent);
        if (this.isSignalPriceInBookRange(buyPrice, OrderSide.BUY)) {
          signals.push(this.generateLongEntrySignal(buyPrice));
        } else {
          this._logger.debug(
            `⏳ Skip BUY entry outside book range: price=${buyPrice.toString()}`,
          );
        }
      }
    }

    // 2. Upper Order (Sell Entry or Sell TP)
    if (this.tradedSize.gt(0)) {
      if (!excludeTp && !upperPending) {
        const tpPlan = this.getTakeProfitPlan();
        if (tpPlan) {
          const side = tpPlan.action === 'buy' ? OrderSide.BUY : OrderSide.SELL;
          if (this.isSignalPriceInBookRange(tpPlan.tpPrice, side)) {
            signals.push(this.createTakeProfitSignal(tpPlan));
          } else {
            this._logger.warn(
              `⏳ Skip TP signal outside book range: price=${tpPlan.tpPrice.toString()}`,
            );
          }
        }
      }
    } else if (canShort) {
      if (!upperPending) {
        const sellPrice = this.referencePrice.mul(1 + this.stepPercent);
        if (this.isSignalPriceInBookRange(sellPrice, OrderSide.SELL)) {
          signals.push(this.generateShortEntrySignal(sellPrice));
        } else {
          this._logger.debug(
            `⏳ Skip SELL entry outside book range: price=${sellPrice.toString()}`,
          );
        }
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
      if (metadata.signalType === SignalType.Entry) {
        if (
          order.status === OrderStatus.NEW ||
          order.status === OrderStatus.PARTIALLY_FILLED
        ) {
          if (order.side === OrderSide.BUY) this.openLowerOrder = order;
          else this.openUpperOrder = order;
        } else if (order.status === OrderStatus.FILLED) {
          if (order.side === OrderSide.BUY) this.openLowerOrder = null;
          else this.openUpperOrder = null;
        }
      }

      const totalFilled = order.executedQuantity || order.quantity;
      const lastProcessed =
        this.processedQuantityMap.get(order.clientOrderId) || new Decimal(0);
      const hasNewFill = totalFilled.gt(lastProcessed);

      if (!existingOrder || existingOrder.status !== order.status) {
        this._logger.info(
          `🔄 Order status: ${order.clientOrderId.substring(0, 12)}... ${order.status}`,
        );
      }

      if (
        hasNewFill &&
        (order.status === OrderStatus.FILLED ||
          order.status === OrderStatus.PARTIALLY_FILLED)
      ) {
        signals.push(...this.handleOrderFilled(order, metadata));
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

    const lastEntry = this.filledEntries[this.filledEntries.length - 1];
    if (
      lastEntry &&
      lastEntry.clientOrderId === order.clientOrderId &&
      lastEntry.side === side
    ) {
      lastEntry.amount = lastEntry.amount.plus(delta);
      lastEntry.price = filledPrice;
      lastEntry.timestamp = Date.now();
    } else {
      this.filledEntries.push({
        side,
        price: filledPrice,
        amount: delta,
        clientOrderId: order.clientOrderId!,
        timestamp: Date.now(),
        referencePriceBefore: oldReference,
      });
    }

    this.processedQuantityMap.set(order.clientOrderId!, totalFilled);

    const signals: StrategyResult[] = [];
    const now = (order.updateTime ?? order.timestamp).getTime();
    const shouldRefreshTp = this.shouldRefreshTakeProfit(order, totalFilled, now);
    if (shouldRefreshTp) {
      this.tpRefreshTracker.set(order.clientOrderId!, { qty: totalFilled, time: now });
    }

    if (order.side === OrderSide.BUY) {
      if (order.status === OrderStatus.FILLED) {
        this.openLowerOrder = null;
      }
      if (shouldRefreshTp) {
        // Refresh SELL TP on any buy fill delta (partial or full)
        if (this.openUpperOrder) {
          const m = this.orderMetadataMap.get(this.openUpperOrder.clientOrderId!);
          if (m?.signalType === SignalType.TakeProfit) {
            signals.push({
              action: 'cancel',
              clientOrderId: this.openUpperOrder.clientOrderId,
              symbol: this._symbol,
              reason: 'lifo_tp_refresh',
            });
            this.pendingClientOrderIds.delete(this.openUpperOrder.clientOrderId!);
            this.orderMetadataMap.delete(this.openUpperOrder.clientOrderId!);
            this.openUpperOrder = null;
          }
        }
        // Cancel pending SELL TP signals to allow refresh with new quantity
        for (const clientOrderId of Array.from(this.pendingClientOrderIds)) {
          const metadata = this.orderMetadataMap.get(clientOrderId);
          if (
            metadata?.signalType === SignalType.TakeProfit &&
            metadata.side === OrderSide.SELL
          ) {
            signals.push({
              action: 'cancel',
              clientOrderId,
              symbol: this._symbol,
              reason: 'lifo_tp_refresh',
            });
            this.pendingClientOrderIds.delete(clientOrderId);
            this.orderMetadataMap.delete(clientOrderId);
          }
        }
      }
    } else {
      if (order.status === OrderStatus.FILLED) {
        this.openUpperOrder = null;
      }
      if (shouldRefreshTp) {
        // Refresh BUY TP on any sell fill delta (partial or full)
        if (this.openLowerOrder) {
          const m = this.orderMetadataMap.get(this.openLowerOrder.clientOrderId!);
          if (m?.signalType === SignalType.TakeProfit) {
            signals.push({
              action: 'cancel',
              clientOrderId: this.openLowerOrder.clientOrderId,
              symbol: this._symbol,
              reason: 'lifo_tp_refresh',
            });
            this.pendingClientOrderIds.delete(this.openLowerOrder.clientOrderId!);
            this.orderMetadataMap.delete(this.openLowerOrder.clientOrderId!);
            this.openLowerOrder = null;
          }
        }
        // Cancel pending BUY TP signals to allow refresh with new quantity
        for (const clientOrderId of Array.from(this.pendingClientOrderIds)) {
          const metadata = this.orderMetadataMap.get(clientOrderId);
          if (
            metadata?.signalType === SignalType.TakeProfit &&
            metadata.side === OrderSide.BUY
          ) {
            signals.push({
              action: 'cancel',
              clientOrderId,
              symbol: this._symbol,
              reason: 'lifo_tp_refresh',
            });
            this.pendingClientOrderIds.delete(clientOrderId);
            this.orderMetadataMap.delete(clientOrderId);
          }
        }
      }
    }

    this._logger.info(
      `✅ Entry FILLED: ${side} ${delta.toString()} @ ${filledPrice.toString()}. Size: ${this.tradedSize.toFixed(4)}`,
    );
    signals.push(...this.updateLadderOrders(!shouldRefreshTp));
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

    let remaining = delta;
    let lastReference: Decimal | null = null;
    while (remaining.gt(0) && this.filledEntries.length > 0) {
      const entry = this.filledEntries[this.filledEntries.length - 1];
      const closeAmount = Decimal.min(remaining, entry.amount);
      this.tradedSize = this.tradedSize.plus(
        entry.side === 'LONG' ? closeAmount.neg() : closeAmount,
      );
      entry.amount = entry.amount.minus(closeAmount);
      remaining = remaining.minus(closeAmount);

      if (entry.amount.lte(0)) {
        lastReference = entry.referencePriceBefore;
        this.filledEntries.pop();
      }
    }
    if (lastReference) {
      this.referencePrice = lastReference;
    }

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

  public override async onOrderCreated(order: Order): Promise<void> {
    if (order.side === OrderSide.BUY) this.openLowerOrder = order;
    else this.openUpperOrder = order;
    if (order.clientOrderId) this.pendingClientOrderIds.delete(order.clientOrderId);
    this.orders.set(order.clientOrderId || order.id, order);
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
    this.tpRefreshTracker.clear();
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
      orderbook: { enabled: true, depth: 5 },
      method: 'websocket' as const,
      exchange: this._context.exchange,
    };
  }

  public override getInitialDataConfig() {
    return {
      fetchPositions: true,
      fetchOpenOrders: true,
      fetchBalance: true,
    };
  }
}
