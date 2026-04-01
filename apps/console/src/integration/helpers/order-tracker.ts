import { ILogger, Order, EventBus, OrderEventData, OrderManager } from '@itrade/core';
import { TypeOrmDataManager } from '@itrade/data-manager';

interface DebouncedOrderUpdate {
  order: Order;
  timestamp: Date;
  timer: NodeJS.Timeout;
}

/**
 * OrderTracker - 监听并持久化订单信息
 *
 * 功能：
 * 1. 监听订单事件（创建、部分成交、完全成交、取消、拒绝）
 * 2. 对部分成交使用 debounce 机制（可能非常频繁）
 * 3. 对其他状态立即保存（创建、完全成交、取消、拒绝）
 * 4. 按 orderId 分组 debounce
 * 5. 使用 OrderManager 管理订单状态和索引
 */
export class OrderTracker {
  private eventBus: EventBus;
  private pendingPartialFills = new Map<string, DebouncedOrderUpdate>();
  private orderManager: OrderManager;
  private totalOrders = 0;
  private totalFilled = 0;
  private totalPartialFills = 0;
  private totalPartialFillsSaved = 0;
  private totalCancelled = 0;
  private totalRejected = 0;
  private startTime: Date;

  // Debounce configuration (only for partial fills)
  private readonly DEBOUNCE_MS = 1000; // 1 second debounce for partial fills
  private readonly strategyUserCache = new Map<number, string>();

  // 🆕 Track which orders have been notified (separate from OrderManager)
  // This prevents re-notifying orders loaded from DB on startup
  private readonly notifiedOrderIds = new Set<string>();

  constructor(
    private dataManager: TypeOrmDataManager,
    private logger: ILogger,
    private pushNotificationService?: {
      notifyOrderUpdate(
        order: Order,
        kind: 'created' | 'filled' | 'partial' | 'failed',
      ): Promise<void>;
    },
    private userId?: string,
  ) {
    this.eventBus = EventBus.getInstance();
    this.orderManager = new OrderManager();
    this.startTime = new Date();
  }

  async start(): Promise<void> {
    // 🆕 Load existing OPEN orders from database to prevent duplicate notifications on restart
    // Only open orders need to be tracked - closed orders are cleaned up automatically
    try {
      const existingOrders = await this.dataManager.getOrders({
        userId: this.userId,
      });
      for (const order of existingOrders) {
        this.orderManager.addOrder(order);
        // 🔥 Mark as already notified to prevent duplicate notifications
        // when status updates arrive via WebSocket after app restart
        this.notifiedOrderIds.add(order.id);
      }
    } catch {
      return;
    }

    // Listen for order events
    this.eventBus.onOrderCreated((data: OrderEventData) => {
      this.handleOrderCreated(data.order);
    });

    this.eventBus.onOrderFilled((data: OrderEventData) => {
      this.handleOrderFilled(data.order);
    });

    this.eventBus.onOrderPartiallyFilled((data: OrderEventData) => {
      this.handleOrderPartiallyFilled(data.order);
    });

    this.eventBus.onOrderCancelled((data: OrderEventData) => {
      this.handleOrderCancelled(data.order);
    });

    this.eventBus.onOrderRejected((data: OrderEventData) => {
      this.handleOrderRejected(data.order);
    });
  }

  async stop(): Promise<void> {
    // Flush all pending partial fills
    await this.flushAllPendingUpdates();
  }

  /**
   * Get the OrderManager instance for accessing order data
   */
  public getOrderManager(): OrderManager {
    return this.orderManager;
  }

  private mergeWithExistingOrder(order: Order): Order {
    const existingOrder = this.orderManager.getOrder(order.id);
    if (!existingOrder) {
      return order;
    }

    return {
      ...existingOrder,
      ...order,
      price: order.price ?? existingOrder.price,
      type: order.type ?? existingOrder.type,
      timeInForce: order.timeInForce ?? existingOrder.timeInForce,
      exchange: order.exchange ?? existingOrder.exchange,
      strategyId: order.strategyId ?? existingOrder.strategyId,
      strategyType: order.strategyType ?? existingOrder.strategyType,
      strategyName: order.strategyName ?? existingOrder.strategyName,
    };
  }

  private async resolveUserId(order: Order): Promise<string | null> {
    if (order.userId) {
      return order.userId;
    }

    if (order.strategyId) {
      const cached = this.strategyUserCache.get(order.strategyId);
      if (cached) return cached;

      try {
        const strategy = await this.dataManager.getStrategy(order.strategyId);
        if (strategy?.userId) {
          this.strategyUserCache.set(order.strategyId, strategy.userId);
          return strategy.userId;
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  private async getScopedUserId(order: Order): Promise<string | null> {
    const resolvedUserId = await this.resolveUserId(order);

    if (this.userId) {
      if (resolvedUserId && resolvedUserId !== this.userId) {
        return null;
      }
    }

    return resolvedUserId ?? this.userId ?? null;
  }

  private async handleOrderCreated(order: Order): Promise<void> {
    try {
      const scopedUserId = await this.getScopedUserId(order);
      if (this.userId && !scopedUserId) {
        return;
      }

      const isNew = !this.orderManager.getOrder(order.id);
      if (isNew) {
        this.totalOrders++;
      }
      this.orderManager.addOrder(order);

      // 🆕 Directly read strategyId and exchange from order object
      const strategyId = order.strategyId;
      const exchange = order.exchange;
      const userId = scopedUserId ?? order.userId;
      if (userId) {
        order.userId = userId;
      }

      // Save order to database
      await this.dataManager.saveOrder({
        id: order.id,
        clientOrderId: order.clientOrderId,
        userId,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity,
        price: order.price,
        status: order.status,
        timeInForce: order.timeInForce,
        timestamp: order.timestamp,
        executedQuantity: order.executedQuantity,
        cummulativeQuoteQuantity: order.cummulativeQuoteQuantity,
        exchange: exchange, // 🆕 Save exchange association
        strategyId: strategyId, // ✅ Set strategyId directly
        strategyType: order.strategyType, // ✅ Save strategy type
        strategyName: order.strategyName, // ✅ Save strategy name
      });

      if (isNew) {
        const orderPrice = order.price ? order.price.toString() : 'market';
        this.logger.info(
          `🧾 Order placed: ${order.symbol} ${order.side} ${order.quantity.toString()} @ ${orderPrice} (${order.id})`,
        );
      }

      // 🔥 FIX: Check if we've notified this order, not just if it's new in OrderManager
      // This allows notifications for manually placed orders loaded from DB on startup
      const hasBeenNotified = this.notifiedOrderIds.has(order.id);
      if (!hasBeenNotified) {
        this.notifiedOrderIds.add(order.id);
        await this.pushNotificationService?.notifyOrderUpdate(order, 'created');
      }
    } catch {
      return;
    }
  }

  private async handleOrderFilled(order: Order): Promise<void> {
    try {
      const scopedUserId = await this.getScopedUserId(order);
      if (this.userId && !scopedUserId) {
        return;
      }

      const existingOrder = this.orderManager.getOrder(order.id);
      const mergedOrder = this.mergeWithExistingOrder(order);
      const shouldNotify = !existingOrder || existingOrder.status !== 'FILLED';
      if (!existingOrder || existingOrder.status !== 'FILLED') {
        this.totalFilled++;
      }

      if (existingOrder) {
        this.orderManager.updateOrder(order.id, mergedOrder);
      } else {
        this.orderManager.addOrder(mergedOrder);
      }

      // Cancel any pending partial fill update for this order
      const pending = this.pendingPartialFills.get(order.id);
      if (pending?.timer) {
        clearTimeout(pending.timer);
        this.pendingPartialFills.delete(order.id);
      }

      // 🆕 Directly read strategyId and exchange from order object
      const strategyId = mergedOrder.strategyId;
      const exchange = mergedOrder.exchange;
      const userId = scopedUserId ?? mergedOrder.userId;
      if (userId) {
        mergedOrder.userId = userId;
      }

      // 🆕 Use saveOrder (upsert) instead of updateOrder to handle case where OrderCreated wasn't received
      // This ensures the order is saved even if it's the first time we're seeing it
      await this.dataManager.saveOrder({
        id: mergedOrder.id,
        clientOrderId: mergedOrder.clientOrderId,
        userId,
        symbol: mergedOrder.symbol,
        side: mergedOrder.side,
        type: mergedOrder.type,
        quantity: mergedOrder.quantity,
        price: mergedOrder.price,
        status: mergedOrder.status,
        timeInForce: mergedOrder.timeInForce,
        timestamp: mergedOrder.timestamp,
        updateTime: mergedOrder.updateTime,
        executedQuantity: mergedOrder.executedQuantity,
        cummulativeQuoteQuantity: mergedOrder.cummulativeQuoteQuantity,
        exchange: exchange,
        strategyId: strategyId,
        strategyType: mergedOrder.strategyType,
        strategyName: mergedOrder.strategyName,
      });

      if (shouldNotify) {
        const filledQuantity =
          mergedOrder.executedQuantity?.toString() ?? mergedOrder.quantity.toString();
        this.logger.info(
          `✅ Order filled: ${mergedOrder.symbol} ${mergedOrder.side} ${filledQuantity} (${mergedOrder.id})`,
        );
      }

      // 🧹 Clean up: remove from notified set (order is now closed)
      // This prevents memory leaks during long-running sessions
      this.notifiedOrderIds.delete(mergedOrder.id);

      // 🧹 Clean up: remove from OrderManager (order is now closed)
      // This prevents unbounded growth in OrderManager's internal maps
      setTimeout(() => {
        this.orderManager.removeOrder(mergedOrder.id);
      }, 5000); // Wait 5s to allow queries to complete

      if (shouldNotify) {
        await this.pushNotificationService?.notifyOrderUpdate(mergedOrder, 'filled');
      }
    } catch {
      return;
    }
  }

  private async handleOrderPartiallyFilled(order: Order): Promise<void> {
    try {
      const scopedUserId = await this.getScopedUserId(order);
      if (this.userId && !scopedUserId) {
        return;
      }

      if (scopedUserId) {
        order.userId = scopedUserId;
      }

      this.totalPartialFills++;
      const mergedOrder = this.mergeWithExistingOrder(order);

      // Use debounce for partial fills (can be very frequent)
      const key = mergedOrder.id;

      // Cancel existing timer if present
      const existing = this.pendingPartialFills.get(key);
      if (existing?.timer) {
        clearTimeout(existing.timer);
      }

      // Create new debounced update
      const timer = setTimeout(() => {
        this.savePartialFillUpdate(key);
      }, this.DEBOUNCE_MS);

      this.pendingPartialFills.set(key, {
        order: mergedOrder,
        timestamp: new Date(),
        timer,
      });
    } catch {
      return;
    }
  }

  private async savePartialFillUpdate(orderId: string): Promise<void> {
    const update = this.pendingPartialFills.get(orderId);
    if (!update) return;

    try {
      const { order } = update;

      const scopedUserId = await this.getScopedUserId(order);
      if (this.userId && !scopedUserId) {
        this.pendingPartialFills.delete(orderId);
        return;
      }

      // 🆕 Directly read strategyId and exchange from order object
      const strategyId = order.strategyId;
      const exchange = order.exchange;
      const userId = scopedUserId ?? order.userId;
      if (userId) {
        order.userId = userId;
      }

      // 🆕 Use saveOrder (upsert) instead of updateOrder to handle case where OrderCreated wasn't received
      await this.dataManager.saveOrder({
        id: order.id,
        clientOrderId: order.clientOrderId,
        userId,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity,
        price: order.price,
        status: order.status,
        timeInForce: order.timeInForce,
        timestamp: order.timestamp,
        updateTime: order.updateTime,
        executedQuantity: order.executedQuantity,
        cummulativeQuoteQuantity: order.cummulativeQuoteQuantity,
        exchange: exchange,
        strategyId: strategyId,
        strategyType: order.strategyType,
        strategyName: order.strategyName,
      });

      this.totalPartialFillsSaved++;
      this.pendingPartialFills.delete(orderId);

      await this.pushNotificationService?.notifyOrderUpdate(order, 'partial');
    } catch {
      this.pendingPartialFills.delete(orderId);
      return;
    }
  }

  private async handleOrderCancelled(order: Order): Promise<void> {
    try {
      const scopedUserId = await this.getScopedUserId(order);
      if (this.userId && !scopedUserId) {
        return;
      }

      if (scopedUserId) {
        order.userId = scopedUserId;
      }

      const existingOrder = this.orderManager.getOrder(order.id);
      const mergedOrder = this.mergeWithExistingOrder(order);
      if (!existingOrder || existingOrder.status !== 'CANCELED') {
        this.totalCancelled++;
      }

      // Update OrderManager's in-memory state
      if (existingOrder) {
        this.orderManager.updateOrder(order.id, mergedOrder);
      } else {
        this.orderManager.addOrder(mergedOrder);
      }

      // Cancel any pending partial fill update for this order
      const pending = this.pendingPartialFills.get(order.id);
      if (pending?.timer) {
        clearTimeout(pending.timer);
        this.pendingPartialFills.delete(order.id);
      }

      // Save immediately (final state, no debounce)
      await this.dataManager.updateOrder(mergedOrder.id, {
        status: mergedOrder.status,
        updateTime: mergedOrder.updateTime,
      });

      // 🧹 Clean up: remove from notified set (order is now closed)
      this.notifiedOrderIds.delete(mergedOrder.id);

      // 🧹 Clean up: remove from OrderManager (order is now closed)
      setTimeout(() => {
        this.orderManager.removeOrder(mergedOrder.id);
      }, 5000); // Wait 5s to allow queries to complete
    } catch {
      return;
    }
  }

  private async handleOrderRejected(order: Order): Promise<void> {
    try {
      const scopedUserId = await this.getScopedUserId(order);
      if (this.userId && !scopedUserId) {
        return;
      }

      if (scopedUserId) {
        order.userId = scopedUserId;
      }

      const existingOrder = this.orderManager.getOrder(order.id);
      const mergedOrder = this.mergeWithExistingOrder(order);
      const shouldNotify = !existingOrder || existingOrder.status !== 'REJECTED';
      if (!existingOrder || existingOrder.status !== 'REJECTED') {
        this.totalRejected++;
      }

      // Update OrderManager's in-memory state
      if (existingOrder) {
        this.orderManager.updateOrder(order.id, mergedOrder);
      } else {
        this.orderManager.addOrder(mergedOrder);
      }

      // Cancel any pending partial fill update for this order
      const pending = this.pendingPartialFills.get(order.id);
      if (pending?.timer) {
        clearTimeout(pending.timer);
        this.pendingPartialFills.delete(order.id);
      }

      // Save immediately (final state, no debounce)
      await this.dataManager.updateOrder(mergedOrder.id, {
        status: mergedOrder.status,
        updateTime: mergedOrder.updateTime,
      });

      // 🧹 Clean up: remove from notified set (order is now closed)
      this.notifiedOrderIds.delete(mergedOrder.id);

      // 🧹 Clean up: remove from OrderManager (order is now closed)
      setTimeout(() => {
        this.orderManager.removeOrder(mergedOrder.id);
      }, 5000); // Wait 5s to allow queries to complete

      if (shouldNotify && mergedOrder.errorMessage) {
        await this.pushNotificationService?.notifyOrderUpdate(mergedOrder, 'failed');
      }
    } catch {
      return;
    }
  }

  private async flushAllPendingUpdates(): Promise<void> {
    if (this.pendingPartialFills.size === 0) return;

    // Cancel all timers and save immediately
    const promises: Promise<void>[] = [];
    for (const [orderId, update] of this.pendingPartialFills) {
      if (update.timer) {
        clearTimeout(update.timer);
      }
      promises.push(this.savePartialFillUpdate(orderId));
    }

    await Promise.allSettled(promises);
  }
}
