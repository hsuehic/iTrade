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
export interface SpreadGridParameters extends StrategyParameters {
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
  /** Whether to gate signals based on market (orderbook) prices */
  checkMarketPrice?: boolean;
  /** Refresh TP at most once per interval (ms); 0 disables time gating */
  tpRefreshMinIntervalMs?: number;
}

export const SpreadGridStrategyRegistryConfig: StrategyRegistryConfig<SpreadGridParameters> =
  {
    type: 'SpreadGridStrategy',
    name: 'Spread Grid',
    description:
      'Spread grid strategy with LIFO take-profit. Order-status-only approach - places limit orders immediately without ticker monitoring.',
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
      checkMarketPrice: true,
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
        name: 'checkMarketPrice',
        type: 'boolean',
        description:
          'If true, only place signals when price is within current orderbook range',
        defaultValue: true,
        required: false,
        group: 'Market Data',
        order: 8,
      },
    ],
    subscriptionRequirements: {
      orderbook: {
        required: false,
        editable: true,
        defaultDepth: 20,
        depthEditable: true,
        description: 'Required when checkMarketPrice is enabled.',
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
      fetchOrderBook: {
        required: false,
        editable: true,
        defaultDepth: 20,
        depthEditable: true,
        description: 'Fetch orderbook snapshot',
      },
    },
    documentation: {
      overview: 'Spread grid strategy with LIFO take-profit.',
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

export class SpreadGridStrategy extends BaseStrategy<SpreadGridParameters> {
  private basePrice: number;
  private stepPercent: number;
  private orderAmount: number;
  private leverage: number;
  private checkMarketPrice: boolean;
  private minSize: number;
  private maxSize: number;
  private tradeMode: TradeMode = TradeMode.ISOLATED;

  private lastOrderBook: OrderBook | null = null;

  private positionSize: Decimal = new Decimal(0);
  private filledEntries: FilledEntry[] = [];
  private referencePrice: Decimal;

  private openLowerOrder: Order | null = null; // Always BUY (Entry or TP)
  private openUpperOrder: Order | null = null; // Always SELL (Entry or TP)
  private pendingClientOrderIds: Set<string> = new Set();
  private orders: Map<string, Order> = new Map();
  private orderMetadataMap: Map<string, ExtendedSignalMetaData> = new Map();
  private processedQuantityMap: Map<string, Decimal> = new Map();
  private tpRefreshTracker: Map<string, { qty: Decimal; time: number }> = new Map();
  private lastOrderBookPrice: Decimal | null = null;

  constructor(config: StrategyConfig<SpreadGridParameters>) {
    super(config);
    const { parameters } = config;

    this.basePrice = parameters.basePrice;
    this.stepPercent = parameters.stepPercent;
    this.orderAmount = parameters.orderAmount;
    this.minSize = parameters.minSize;
    this.maxSize = parameters.maxSize;
    this.leverage = parameters.leverage ?? 10;
    this.checkMarketPrice = parameters.checkMarketPrice ?? true;

    this.referencePrice = new Decimal(this.basePrice);

    if (this.minSize > this.maxSize) {
      throw new Error(
        `Invalid size limits: minSize (${this.minSize}) > maxSize (${this.maxSize})`,
      );
    }
  }

  private updateOrderBookPrice(orderbook?: OrderBook): void {
    if (!orderbook) return;
    this.lastOrderBook = orderbook;
    const bestBid = orderbook.bids?.[0]?.[0];
    const bestAsk = orderbook.asks?.[0]?.[0];
    let price: Decimal | null = null;
    if (bestBid && bestAsk && bestBid.gt(0) && bestAsk.gt(0)) {
      price = bestBid.plus(bestAsk).div(2);
    } else if (bestBid && bestBid.gt(0)) {
      price = bestBid;
    } else if (bestAsk && bestAsk.gt(0)) {
      price = bestAsk;
    }
    if (!price) return;
    this.lastOrderBookPrice = price;
  }

  private getOrderBookRange(): { minBid: Decimal; maxAsk: Decimal } | null {
    if (!this.lastOrderBook) return null;
    const bids = this.lastOrderBook.bids ?? [];
    const asks = this.lastOrderBook.asks ?? [];
    if (bids.length === 0 || asks.length === 0) return null;
    const minBid = bids[bids.length - 1]?.[0];
    const maxAsk = asks[asks.length - 1]?.[0];
    if (!minBid || !maxAsk || minBid.lte(0) || maxAsk.lte(0)) return null;
    return { minBid, maxAsk };
  }

  private isSignalPriceWithinOrderBookRange(price: Decimal, side: OrderSide): boolean {
    if (!this.checkMarketPrice) return true;
    const range = this.getOrderBookRange();
    if (!range) return false;
    const { minBid, maxAsk } = range;
    if (side === OrderSide.BUY) {
      return price.gte(minBid) && price.lte(maxAsk);
    }
    return price.gte(minBid) && price.lte(maxAsk);
  }

  private isTerminalStatus(status: OrderStatus): boolean {
    return (
      status === OrderStatus.CANCELED ||
      status === OrderStatus.REJECTED ||
      status === OrderStatus.EXPIRED
    );
  }

  private getPositionMode(): string {
    if (this.minSize > 0) return 'LONG_ONLY_WITH_BASE';
    if (this.maxSize < 0) return 'SHORT_ONLY_WITH_BASE';
    if (this.minSize < 0 && this.maxSize > 0) return 'BI_DIRECTIONAL';
    if (this.minSize === 0 && this.maxSize > 0) return 'LONG_ONLY';
    return 'STANDARD';
  }

  private canAddLong(): boolean {
    return this.positionSize.plus(this.orderAmount).lte(this.maxSize);
  }

  private canAddShort(): boolean {
    return this.positionSize.minus(this.orderAmount).gte(this.minSize);
  }

  private generatePlaceOrderSignal(price: Decimal, side: OrderSide): StrategyOrderResult {
    const clientOrderId = this.generateClientOrderId(SignalType.Entry);
    const metadata: ExtendedSignalMetaData = {
      signalType: SignalType.Entry,
      timestamp: Date.now(),
      clientOrderId,
      side,
    };

    this.orderMetadataMap.set(clientOrderId, metadata);
    this.pendingClientOrderIds.add(clientOrderId);

    return {
      action: side == OrderSide.BUY ? 'buy' : 'sell',
      price,
      quantity: new Decimal(this.orderAmount),
      symbol: this._symbol,
      clientOrderId,
      leverage: this.leverage,
      tradeMode: this.tradeMode,
      reason: 'grid_place_order',
      metadata,
    };
  }

  private generateCancelOrderSignal(clientOrderId: string): StrategyResult {
    return {
      action: 'cancel',
      clientOrderId,
      symbol: this._symbol,
      reason: 'cancel',
    };
  }

  public override async processInitialData(
    initialData: InitialDataResult,
  ): Promise<StrategyAnalyzeResult> {
    const signals: StrategyResult[] = [];
    const performance = this.getPerformance?.();
    if (initialData.openOrders) {
      const ownedOrders = initialData.openOrders.filter((order) => {
        if (order.symbol !== this._context.symbol) return false;
        return (
          (order.strategyId && order.strategyId === this.getStrategyId()) ||
          (order.clientOrderId && this.isStrategyOrderId(order.clientOrderId))
        );
      });

      ownedOrders.forEach((order) => {
        if (!order.clientOrderId) return;
        let metadata = this.orderMetadataMap.get(order.clientOrderId);
        if (!metadata) {
          metadata = this.ensureRecoveredMetadata(order);
        }
        this.orders.set(order.clientOrderId, order);

        if (order.side === OrderSide.BUY) {
          this.openLowerOrder = order;
        } else {
          this.openUpperOrder = order;
        }
      });
    }
    this.positionSize = performance?.position.currentPosition ?? new Decimal(0);
    if (this.openLowerOrder) {
      this.referencePrice = this.openLowerOrder
        .price!.div(100 - this.stepPercent)
        .mul(100);
    } else if (this.openUpperOrder) {
      this.referencePrice = this.openUpperOrder
        .price!.div(100 + this.stepPercent)
        .mul(100);
    }
    if (!this.openLowerOrder && this.canAddLong()) {
      const price = this.referencePrice.mul(100 - this.stepPercent).div(100);

      signals.push(this.generatePlaceOrderSignal(price, OrderSide.BUY));
    }
    if (!this.openUpperOrder && this.canAddShort()) {
      const price = this.referencePrice.mul(100 + this.stepPercent).div(100);
      signals.push(this.generatePlaceOrderSignal(price, OrderSide.SELL));
    }

    return signals;
  }

  public override async analyze(dataUpdate: DataUpdate): Promise<StrategyAnalyzeResult> {
    const { orders } = dataUpdate;
    if (dataUpdate.orderbook) {
      this.lastOrderBook = dataUpdate.orderbook;
    }
    if (orders && orders.length > 0) {
      const signals = this.handleOrderUpdates(orders);
      if (signals.length > 0) return signals;
    }
    return { action: 'hold' };
  }

  public override async onOrderCreated(order: Order): Promise<void> {
    if (!order.clientOrderId) return;
    let metadata = this.orderMetadataMap.get(order.clientOrderId);
    if (!metadata) metadata = this.ensureRecoveredMetadata(order);
    if (!metadata) return;
    this.orders.set(order.clientOrderId, order);
    if (metadata.signalType === SignalType.Entry) {
      if (order.side === OrderSide.BUY) this.openLowerOrder = order;
      else this.openUpperOrder = order;
    }
  }

  private handleOrderUpdates(orders: Order[]): StrategyResult[] {
    const signals: StrategyResult[] = [];
    for (const order of orders) {
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
          if (order.side === OrderSide.BUY) {
            this.openLowerOrder = order;
          } else {
            this.openUpperOrder = order;
          }
        } else if (order.status === OrderStatus.FILLED) {
          return this.handleOrderFilled(order);
        }
      }
    }
    return signals;
  }

  private handleOrderFilled(order: Order): StrategyResult[] {
    const signals: StrategyResult[] = [];
    if (order.side === OrderSide.BUY) {
      this.positionSize = this.positionSize.add(this.orderAmount);
    } else {
      this.positionSize = this.positionSize.sub(this.orderAmount);
    }
    this.referencePrice = order.price!;
    // cancel all existing orders
    this.orders.forEach((o) => {
      if (o.clientOrderId && o.clientOrderId !== order.clientOrderId) {
        signals.push(this.generateCancelOrderSignal(o.clientOrderId));
      }
    });

    this.orders.clear();
    this.orderMetadataMap.clear();

    // place new orders
    if (this.canAddLong()) {
      const price = this.referencePrice.mul(100 - this.stepPercent).div(100);
      signals.push(this.generatePlaceOrderSignal(price, OrderSide.BUY));
    }
    if (this.canAddShort()) {
      const price = this.referencePrice.mul(100 + this.stepPercent).div(100);
      signals.push(this.generatePlaceOrderSignal(price, OrderSide.SELL));
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

  protected async onCleanup(): Promise<void> {
    this.orders.clear();
    this.orderMetadataMap.clear();
    this.openLowerOrder = null;
    this.openUpperOrder = null;
    this.pendingClientOrderIds.clear();
    this.filledEntries = [];
    this.positionSize = new Decimal(0);

    this.processedQuantityMap.clear();
    this.tpRefreshTracker.clear();
    this._logger.info(`🧹 Strategy cleaned up`);
  }

  public getStrategyState() {
    return {
      strategyId: this.getStrategyId(),
      tradedSize: this.positionSize,
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
      orderbook: this.checkMarketPrice ? { enabled: true, depth: 5 } : { enabled: false },
      method: 'websocket' as const,
      exchange: this._context.exchange,
    };
  }

  public override getInitialDataConfig() {
    return {
      fetchPositions: true,
      fetchOpenOrders: true,
      fetchBalance: true,
      fetchOrderBook: this.checkMarketPrice
        ? { enabled: true, depth: 5 }
        : { enabled: false },
    };
  }
}
