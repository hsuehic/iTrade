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
  StrategyCancelOrderResult,
} from '@itrade/core';
import Decimal from 'decimal.js';
import { StrategyRegistryConfig } from '../type';
import { silentLogger } from '../utils/silent-logger';

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
      orderAmount: 100,
      minSize: 0,
      maxSize: 1000,
      leverage: 10,
      checkMarketPrice: true,
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
  private readonly orderBookStaleMs = 10000;

  private positionSize: Decimal = new Decimal(0);
  private filledEntries: FilledEntry[] = [];
  private referencePrice: Decimal;

  private openLowerOrder: Order | null = null; // Always BUY (Entry or TP)
  private openUpperOrder: Order | null = null; // Always SELL (Entry or TP)
  private pendingClientOrderIds: Set<string> = new Set();
  private processedFillIds: Set<string> = new Set();
  private orders: Map<string, Order> = new Map();
  private orderMetadataMap: Map<string, ExtendedSignalMetaData> = new Map();
  private processedQuantityMap: Map<string, Decimal> = new Map();
  private tpRefreshTracker: Map<string, { qty: Decimal; time: number }> = new Map();
  private lastOrderBookPrice: Decimal | null = null;

  constructor(config: StrategyConfig<SpreadGridParameters>) {
    super({ ...config, logger: silentLogger });
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

  private isOrderBookStale(now: number = Date.now()): boolean {
    if (!this.lastOrderBook?.timestamp) return true;
    const lastTs = this.lastOrderBook.timestamp.getTime();
    if (Number.isNaN(lastTs)) return true;
    return now - lastTs > this.orderBookStaleMs;
  }

  private getBestBidAsk(): { bestBid?: Decimal; bestAsk?: Decimal } {
    const bestBid = this.lastOrderBook?.bids?.[0]?.[0];
    const bestAsk = this.lastOrderBook?.asks?.[0]?.[0];
    if (bestBid?.gt(0) || bestAsk?.gt(0)) {
      return { bestBid, bestAsk };
    }
    return {};
  }

  private ensureMakerPrice(price: Decimal, side: OrderSide): Decimal | null {
    if (!this.lastOrderBook || this.isOrderBookStale()) {
      return null;
    }

    const { bestBid, bestAsk } = this.getBestBidAsk();
    if (side === OrderSide.BUY) {
      if (bestBid && bestBid.gt(0)) {
        return Decimal.min(price, bestBid);
      }
      if (bestAsk && bestAsk.gt(0)) {
        return price.lt(bestAsk) ? price : null;
      }
      return null;
    }

    if (bestAsk && bestAsk.gt(0)) {
      return Decimal.max(price, bestAsk);
    }
    if (bestBid && bestBid.gt(0)) {
      return price.gt(bestBid) ? price : null;
    }
    return null;
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

  /**
   * Returns the unfilled (remaining) quantity of the current pending BUY order.
   * Used for worst-case position estimation before placing new signals.
   */
  private getPendingLongRemaining(): Decimal {
    let total = new Decimal(0);
    for (const order of this.orders.values()) {
      if (order.side !== OrderSide.BUY) continue;
      if (
        order.status !== OrderStatus.NEW &&
        order.status !== OrderStatus.PARTIALLY_FILLED
      ) {
        continue;
      }
      const executed = order.executedQuantity || new Decimal(0);
      const remaining = order.quantity.sub(executed);
      if (remaining.gt(0)) {
        total = total.add(remaining);
      }
    }
    return total;
  }

  /**
   * Returns the unfilled (remaining) quantity of the current pending SELL order.
   * Used for worst-case position estimation before placing new signals.
   */
  private getPendingShortRemaining(): Decimal {
    let total = new Decimal(0);
    for (const order of this.orders.values()) {
      if (order.side !== OrderSide.SELL) continue;
      if (
        order.status !== OrderStatus.NEW &&
        order.status !== OrderStatus.PARTIALLY_FILLED
      ) {
        continue;
      }
      const executed = order.executedQuantity || new Decimal(0);
      const remaining = order.quantity.sub(executed);
      if (remaining.gt(0)) {
        total = total.add(remaining);
      }
    }
    return total;
  }

  /**
   * Checks whether placing a new BUY order is safe.
   * Uses worst-case position: assumes all pending BUYs fill AND the new BUY fills.
   * This guarantees maxSize is never breached even if all open orders fill simultaneously.
   */
  private canAddLong(extraPendingLong: Decimal = new Decimal(0)): boolean {
    const worstCaseLong = this.positionSize
      .plus(this.getPendingLongRemaining())
      .plus(extraPendingLong)
      .plus(this.orderAmount);
    return worstCaseLong.lte(this.maxSize);
  }

  /**
   * Checks whether placing a new SELL order is safe.
   * Uses worst-case position: assumes all pending SELLs fill AND the new SELL fills.
   * This guarantees minSize is never breached even if all open orders fill simultaneously.
   */
  private canAddShort(extraPendingShort: Decimal = new Decimal(0)): boolean {
    const worstCaseShort = this.positionSize
      .minus(this.getPendingShortRemaining())
      .minus(extraPendingShort)
      .minus(this.orderAmount);
    return worstCaseShort.gte(this.minSize);
  }

  /**
   * Generate new entry orders with reservation-based risk checks.
   * This guarantees that if all newly generated orders fill, size limits are still respected.
   */
  private generateEntrySignalsWithReservation(options?: {
    allowBuy?: boolean;
    allowSell?: boolean;
  }): StrategyResult[] {
    const signals: StrategyResult[] = [];
    let reservedLong = new Decimal(0);
    let reservedShort = new Decimal(0);
    const orderAmount = new Decimal(this.orderAmount);
    const allowBuy = options?.allowBuy ?? true;
    const allowSell = options?.allowSell ?? true;

    if (this.isOrderBookStale()) {
      this._logger.warn(
        `[SpreadGrid] Skipping entry signals: stale orderbook (${this.orderBookStaleMs}ms)`,
      );
      return signals;
    }

    if (allowBuy && this.canAddLong(reservedLong)) {
      const price = this.referencePrice.mul(100 - this.stepPercent).div(100);
      const makerPrice = this.ensureMakerPrice(price, OrderSide.BUY);
      if (makerPrice) {
        signals.push(this.generatePlaceOrderSignal(makerPrice, OrderSide.BUY));
        reservedLong = reservedLong.add(orderAmount);
        this._logger.debug(`[SpreadGrid] Generated BUY signal @ ${makerPrice}`);
      } else {
        this._logger.warn(
          `[SpreadGrid] Skipping BUY: unable to ensure maker price (missing bid/ask or stale).`,
        );
      }
    } else if (allowBuy) {
      this._logger.debug(
        `[SpreadGrid] Skipping BUY: canAddLong=false (Fills: ${this.positionSize}, PendingBuy: ${this.getPendingLongRemaining()}, ReservedBuy: ${reservedLong}, Max: ${this.maxSize})`,
      );
    }

    if (allowSell && this.canAddShort(reservedShort)) {
      const price = this.referencePrice.mul(100 + this.stepPercent).div(100);
      const makerPrice = this.ensureMakerPrice(price, OrderSide.SELL);
      if (makerPrice) {
        signals.push(this.generatePlaceOrderSignal(makerPrice, OrderSide.SELL));
        reservedShort = reservedShort.add(orderAmount);
        this._logger.debug(`[SpreadGrid] Generated SELL signal @ ${makerPrice}`);
      } else {
        this._logger.warn(
          `[SpreadGrid] Skipping SELL: unable to ensure maker price (missing bid/ask or stale).`,
        );
      }
    } else if (allowSell) {
      this._logger.debug(
        `[SpreadGrid] Skipping SELL: canAddShort=false (Fills: ${this.positionSize}, PendingSell: ${this.getPendingShortRemaining()}, ReservedSell: ${reservedShort}, Min: ${this.minSize})`,
      );
    }

    return signals;
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

  private generateCancelOrderSignal(order: Order): StrategyCancelOrderResult {
    return {
      action: 'cancel',
      orderId: order.id,
      symbol: this._symbol,
      reason: 'cancel',
    };
  }

  private inferReferencePriceFromOpenOrders(orders: Order[]): Decimal | null {
    const stepRatio = new Decimal(this.stepPercent).div(100);
    const inferredRefs: Decimal[] = [];

    for (const order of orders) {
      if (!order.price || order.price.lte(0)) continue;
      if (order.side === OrderSide.BUY) {
        const denom = new Decimal(1).minus(stepRatio);
        if (denom.gt(0)) {
          inferredRefs.push(order.price.div(denom));
        }
      } else {
        const denom = new Decimal(1).plus(stepRatio);
        if (denom.gt(0)) {
          inferredRefs.push(order.price.div(denom));
        }
      }
    }

    if (inferredRefs.length === 0) return null;
    const sum = inferredRefs.reduce((acc, val) => acc.add(val), new Decimal(0));
    return sum.div(inferredRefs.length);
  }

  public override async processInitialData(
    initialData: InitialDataResult,
  ): Promise<StrategyAnalyzeResult> {
    const signals: StrategyResult[] = [];
    const hasSqlNetPosition = initialData.strategyNetPosition !== undefined;
    this.updateOrderBookPrice(initialData.orderBook);

    // Prioritize SQL-level net position calculation for better performance
    if (hasSqlNetPosition) {
      this.positionSize = initialData.strategyNetPosition!;
      this._logger.info(
        `✅ [SpreadGrid] Initialized positionSize from SQL: ${this.positionSize.toString()}`,
      );
    } else {
      this.positionSize = new Decimal(0);
    }

    let ownedOrders: Order[] = [];
    if (initialData.openOrders) {
      ownedOrders = initialData.openOrders.filter((order) => {
        // Prioritize Strategy ID / Client Order ID match over Symbol match
        const isIdMatch =
          order.strategyId && String(order.strategyId) === String(this.getStrategyId());
        const isClientOIdMatch =
          order.clientOrderId && this.isStrategyOrderId(order.clientOrderId);

        return isIdMatch || isClientOIdMatch;
      });

      this._logger.debug(
        `[SpreadGrid] Found ${ownedOrders.length} owned open orders from initial data`,
      );

      // positionSize tracks FILLS ONLY.
      // strategyNetPosition (from SQL) includes pending order quantities (NEW/PARTIALLY_FILLED).
      // We subtract the unfilled (remaining) portion of each open order to convert to fills-only.
      ownedOrders.forEach((order: Order) => {
        if (!order.clientOrderId) return;
        let metadata = this.orderMetadataMap.get(order.clientOrderId);
        if (!metadata) {
          metadata = this.ensureRecoveredMetadata(order);
        }
        this.orders.set(order.clientOrderId, order);

        const executed = order.executedQuantity || new Decimal(0);
        if (hasSqlNetPosition) {
          // SQL net position includes pending quantity for NEW/PARTIALLY_FILLED orders.
          // Convert it to fills-only by removing the remaining unfilled part.
          const remaining = order.quantity.sub(executed);
          if (remaining.gt(0)) {
            if (order.side === OrderSide.BUY) {
              this.positionSize = this.positionSize.sub(remaining);
            } else {
              this.positionSize = this.positionSize.add(remaining);
            }
          }
        } else if (executed.gt(0)) {
          // Fallback mode (no SQL net position): bootstrap fills-only position from
          // executed quantities visible on open orders (typically PARTIALLY_FILLED).
          if (order.side === OrderSide.BUY) {
            this.positionSize = this.positionSize.add(executed);
          } else {
            this.positionSize = this.positionSize.sub(executed);
          }
        }

        // Track the already-processed (partially filled) quantity to avoid double-counting on fill.
        if (executed.gt(0)) {
          this.processedQuantityMap.set(order.clientOrderId, executed);
        }

        // Track open order references (for duplicate order prevention).
        if (order.side === OrderSide.BUY) {
          this.openLowerOrder = order;
        } else {
          this.openUpperOrder = order;
        }
      });
    }

    const inferredRef = this.inferReferencePriceFromOpenOrders(ownedOrders);
    if (inferredRef) {
      this.referencePrice = inferredRef;
      this._logger.info(
        `[SpreadGrid] Inferred referencePrice from ${ownedOrders.length} open orders: ${this.referencePrice.toString()}`,
      );
    } else if (this.openLowerOrder?.price) {
      this.referencePrice = this.openLowerOrder.price
        .div(100 - this.stepPercent)
        .mul(100);
    } else if (this.openUpperOrder?.price) {
      this.referencePrice = this.openUpperOrder.price
        .div(100 + this.stepPercent)
        .mul(100);
    }

    signals.push(
      ...this.generateEntrySignalsWithReservation({
        allowBuy: !this.openLowerOrder,
        allowSell: !this.openUpperOrder,
      }),
    );

    return signals;
  }

  public override async analyze(dataUpdate: DataUpdate): Promise<StrategyAnalyzeResult> {
    const { orders } = dataUpdate;
    if (dataUpdate.orderbook) {
      this.updateOrderBookPrice(dataUpdate.orderbook);
    }
    if (orders && orders.length > 0) {
      const signals = this.handleOrderUpdates(orders);
      if (signals.length > 0) return signals;
    }
    return { action: 'hold' };
  }

  public override async onOrderCreated(order: Order): Promise<void> {
    if (!order.clientOrderId) return;
    if (this.orders.has(order.clientOrderId)) return; // Avoid double counting

    let metadata = this.orderMetadataMap.get(order.clientOrderId);
    if (!metadata) metadata = this.ensureRecoveredMetadata(order);
    if (!metadata) return;

    this.orders.set(order.clientOrderId, order);
    // Track open order references only.
    // positionSize is updated ONLY when orders are FILLED, not when they are placed.
    if (order.side === OrderSide.BUY) {
      this.openLowerOrder = order;
    } else {
      this.openUpperOrder = order;
    }
  }

  private handleOrderUpdates(orders: Order[]): StrategyResult[] {
    const signals: StrategyResult[] = [];
    let shouldRebuildAfterFill = false;
    for (const order of orders) {
      if (!order.clientOrderId) continue;
      if (this.processedFillIds.has(order.clientOrderId)) continue;

      let metadata = this.orderMetadataMap.get(order.clientOrderId);
      if (!metadata) metadata = this.ensureRecoveredMetadata(order);
      if (!metadata) continue;

      const existingOrder = this.orders.get(order.clientOrderId);
      if (
        existingOrder?.updateTime &&
        order.updateTime &&
        existingOrder.updateTime.getTime() > order.updateTime.getTime()
      ) {
        this._logger.warn(
          `[SpreadGrid] Ignoring stale order update for ${order.clientOrderId}. Existing: ${existingOrder.updateTime.toISOString()}, New: ${order.updateTime.toISOString()}`,
        );
        continue;
      }

      this.orders.set(order.clientOrderId, order);
      if (metadata.signalType === SignalType.Entry) {
        if (order.status === OrderStatus.NEW) {
          this._logger.debug(`[SpreadGrid] Order ${order.clientOrderId} is NEW`);
          if (order.side === OrderSide.BUY) {
            this.openLowerOrder = order;
          } else {
            this.openUpperOrder = order;
          }
        } else if (order.status === OrderStatus.PARTIALLY_FILLED) {
          // Track incremental fills: positionSize only grows with actual filled qty.
          const currentExecuted = order.executedQuantity || new Decimal(0);
          const previousExecuted =
            this.processedQuantityMap.get(order.clientOrderId) || new Decimal(0);
          const incrementalFill = currentExecuted.sub(previousExecuted);
          if (incrementalFill.gt(0)) {
            if (order.side === OrderSide.BUY) {
              this.positionSize = this.positionSize.add(incrementalFill);
            } else {
              this.positionSize = this.positionSize.sub(incrementalFill);
            }
            this.processedQuantityMap.set(order.clientOrderId, currentExecuted);
            this._logger.debug(
              `[SpreadGrid] PARTIALLY_FILLED ${order.clientOrderId}: +${incrementalFill} fill. positionSize=${this.positionSize}`,
            );
          }
          if (order.side === OrderSide.BUY) {
            this.openLowerOrder = order;
          } else {
            this.openUpperOrder = order;
          }
        } else if (order.status === OrderStatus.FILLED) {
          this._logger.debug(
            `[SpreadGrid] Order ${order.clientOrderId} FILLED. Processing fill...`,
          );
          signals.push(...this.handleOrderFilled(order, false));
          shouldRebuildAfterFill = true;
        } else if (this.isTerminalStatus(order.status)) {
          // Fill-only tracking: we never added pending qty to positionSize, so no revert needed.
          // Just clean up order references.
          this.processedQuantityMap.delete(order.clientOrderId);
          if (order.side === OrderSide.BUY) {
            if (this.openLowerOrder?.clientOrderId === order.clientOrderId) {
              this.openLowerOrder = null;
            }
          } else {
            if (this.openUpperOrder?.clientOrderId === order.clientOrderId) {
              this.openUpperOrder = null;
            }
          }
          this._logger.debug(
            `[SpreadGrid] Order ${order.clientOrderId} terminal (${order.status}). No positionSize adjustment needed.`,
          );
        }
      }
    }
    if (shouldRebuildAfterFill) {
      signals.push(...this.rebuildOrdersAfterFill());
    }
    return signals;
  }

  private handleOrderFilled(
    order: Order,
    rebuildOrders: boolean = true,
  ): StrategyResult[] {
    const signals: StrategyResult[] = [];
    const filledQty = order.executedQuantity || order.quantity || new Decimal(0);

    this._logger.debug(
      `[SpreadGrid] Handle Fill: ${order.clientOrderId} ${order.side} ${filledQty} @ ${order.averagePrice || order.price}`,
    );

    // Fill-only tracking: add only the net-new fill quantity (accounting for partial fills
    // that were already incremented in handleOrderUpdates via processedQuantityMap).
    const previouslyProcessed =
      this.processedQuantityMap.get(order.clientOrderId!) || new Decimal(0);
    const newFillQty = filledQty.sub(previouslyProcessed);
    if (newFillQty.gt(0)) {
      if (order.side === OrderSide.BUY) {
        this.positionSize = this.positionSize.add(newFillQty);
      } else {
        this.positionSize = this.positionSize.sub(newFillQty);
      }
    }
    // Clear the partial-fill tracking entry for this order.
    this.processedQuantityMap.delete(order.clientOrderId!);

    const fillPrice = order.averagePrice || order.price;
    if (fillPrice) {
      this.referencePrice = fillPrice;
    }

    this._logger.debug(
      `[SpreadGrid] New Position Size: ${this.positionSize}, Ref Price: ${this.referencePrice}`,
    );

    // Record filled entry
    if (order.clientOrderId) {
      this.processedFillIds.add(order.clientOrderId);
      const entry: FilledEntry = {
        side: order.side === OrderSide.BUY ? 'LONG' : 'SHORT',
        price: this.referencePrice, // Using updated reference price
        amount: filledQty,
        clientOrderId: order.clientOrderId,
        timestamp: Date.now(),
        referencePriceBefore: this.referencePrice, // Note: this is actually post-update
      };
      this.filledEntries.push(entry);
    }

    if (rebuildOrders) {
      signals.push(...this.rebuildOrdersAfterFill());
    }

    return signals;
  }

  private rebuildOrdersAfterFill(): StrategyResult[] {
    const signals: StrategyResult[] = [];
    // cancel all existing active orders that are not terminal
    this.orders.forEach((o) => {
      if (!o.clientOrderId) return;
      if (o.status === OrderStatus.FILLED) return;
      if (this.isTerminalStatus(o.status)) return;
      signals.push(this.generateCancelOrderSignal(o));
    });

    this.orders.clear();
    this.orderMetadataMap.clear();
    this.pendingClientOrderIds.clear();
    this.openLowerOrder = null;
    this.openUpperOrder = null;

    // place new orders with reservation-aware checks
    signals.push(...this.generateEntrySignalsWithReservation());
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
    if (!strategyId) return false;
    const match = /^(E|T)(\d+)D/.exec(clientOrderId);
    return !!match && String(match[2]) === String(strategyId);
  }

  protected async onCleanup(): Promise<void> {
    this.orders.clear();
    this.orderMetadataMap.clear();
    this.openLowerOrder = null;
    this.openUpperOrder = null;
    this.pendingClientOrderIds.clear();
    this.processedFillIds.clear();
    this.filledEntries = [];
    this.positionSize = new Decimal(0);

    this.processedQuantityMap.clear();
    this.tpRefreshTracker.clear();
    this._logger.debug(`🧹 Strategy cleaned up`);
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
      pendingLongRemaining: this.getPendingLongRemaining().toString(),
      pendingShortRemaining: this.getPendingShortRemaining().toString(),
      worstCaseLongPosition: this.positionSize
        .plus(this.getPendingLongRemaining())
        .toString(),
      worstCaseShortPosition: this.positionSize
        .minus(this.getPendingShortRemaining())
        .toString(),
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
      fetchOrderBook: { enabled: true, depth: 5 },
      fetchStrategyNetPosition: true,
    };
  }
}
