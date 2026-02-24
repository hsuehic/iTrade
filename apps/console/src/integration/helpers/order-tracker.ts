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
        kind: 'created' | 'filled' | 'partial',
      ): Promise<void>;
    },
    private userId?: string,
  ) {
    this.eventBus = EventBus.getInstance();
    this.orderManager = new OrderManager();
    this.startTime = new Date();
  }

  async start(): Promise<void> {
    this.logger.debug('Starting Order Tracker...');

    // 🆕 Load existing OPEN orders from database to prevent duplicate notifications on restart
    // Only open orders need to be tracked - closed orders are cleaned up automatically
    try {
      this.logger.debug(
        `🔍 Loading existing orders for user: ${this.userId || 'ALL'}...`,
      );
      const existingOrders = await this.dataManager.getOrders({
        userId: this.userId,
      });
      for (const order of existingOrders) {
        this.orderManager.addOrder(order);
        // 🔥 Mark as already notified to prevent duplicate notifications
        // when status updates arrive via WebSocket after app restart
        this.notifiedOrderIds.add(order.id);
      }
      this.logger.debug(
        `✅ Loaded ${existingOrders.length} orders from database (marked as already notified)`,
      );
    } catch (error) {
      this.logger.error(
        '❌ Failed to load existing orders from database',
        error as Error,
      );
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

    this.logger.debug(
      `✅ Order Tracker started (partial fill debounce: ${this.DEBOUNCE_MS}ms per order)`,
    );
  }

  async stop(): Promise<void> {
    // Flush all pending partial fills
    await this.flushAllPendingUpdates();

    this.logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.debug('📊 Order Tracker Final Report');
    this.logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.debug(`   Total Orders Created: ${this.totalOrders}`);
    this.logger.debug(`   Orders Filled: ${this.totalFilled}`);
    this.logger.debug(
      `   Partial Fill Updates: ${this.totalPartialFills} received, ${this.totalPartialFillsSaved} saved`,
    );
    if (this.totalPartialFills > 0) {
      this.logger.debug(
        `   Partial Fill Debounce Efficiency: ${((1 - this.totalPartialFillsSaved / this.totalPartialFills) * 100).toFixed(1)}% reduction`,
      );
    }
    this.logger.debug(`   Orders Cancelled: ${this.totalCancelled}`);
    this.logger.debug(`   Orders Rejected: ${this.totalRejected}`);

    const runTime = Date.now() - this.startTime.getTime();
    const hours = (runTime / (1000 * 60 * 60)).toFixed(2);
    this.logger.debug(`   Running time: ${hours} hours`);
    this.logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
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
      } catch (error) {
        this.logger.error('❌ Failed to resolve strategy user', error as Error);
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

      this.logger.debug(
        `💾 Order saved: ${order.id} | Strategy: ${order.strategyName || 'none'} (ID: ${strategyId || 'N/A'}) | Exchange: ${exchange || 'unknown'}`,
      );

      // 🔥 FIX: Check if we've notified this order, not just if it's new in OrderManager
      // This allows notifications for manually placed orders loaded from DB on startup
      const hasBeenNotified = this.notifiedOrderIds.has(order.id);
      if (!hasBeenNotified) {
        this.notifiedOrderIds.add(order.id);
        await this.pushNotificationService?.notifyOrderUpdate(order, 'created');
        this.logger.debug(
          `📨 Sent "Order Placed" notification for ${order.symbol} ${order.side} (${order.id})`,
        );
      } else {
        this.logger.debug(
          `ℹ️  Suppressing duplicate notification for already notified order: ${order.id}`,
        );
      }
    } catch (error) {
      this.logger.error('❌ Failed to save order to database', error as Error);
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

      this.logger.debug(
        `💾 Order filled and updated: ${mergedOrder.id} (${mergedOrder.executedQuantity?.toString()}/${mergedOrder.quantity.toString()})`,
      );

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
    } catch (error) {
      this.logger.error('❌ Failed to update filled order', error as Error);
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

      this.logger.debug(
        `⏳ Partial fill queued: ${mergedOrder.id} (${mergedOrder.executedQuantity?.toString()}/${mergedOrder.quantity.toString()})`,
      );
    } catch (error) {
      this.logger.error('❌ Failed to queue partial fill update', error as Error);
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

      this.logger.debug(
        `💾 Partial fill saved: ${order.id} (${order.executedQuantity?.toString()}/${order.quantity.toString()})`,
      );

      await this.pushNotificationService?.notifyOrderUpdate(order, 'partial');
    } catch (error) {
      this.logger.error(`❌ Failed to save partial fill for ${orderId}`, error as Error);
      this.pendingPartialFills.delete(orderId);
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

      this.logger.debug(`💾 Order cancelled and updated: ${mergedOrder.id}`);
    } catch (error) {
      this.logger.error('❌ Failed to update cancelled order', error as Error);
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

      this.logger.error(`💾 Order rejected and updated: ${mergedOrder.id}`);
    } catch (error) {
      this.logger.error('❌ Failed to update rejected order', error as Error);
    }
  }

  private async flushAllPendingUpdates(): Promise<void> {
    if (this.pendingPartialFills.size === 0) return;

    this.logger.debug(
      `🔄 Flushing ${this.pendingPartialFills.size} pending partial fill updates...`,
    );

    // Cancel all timers and save immediately
    const promises: Promise<void>[] = [];
    for (const [orderId, update] of this.pendingPartialFills) {
      if (update.timer) {
        clearTimeout(update.timer);
      }
      promises.push(this.savePartialFillUpdate(orderId));
    }

    await Promise.allSettled(promises);
    this.logger.debug('✅ All pending partial fill updates flushed');
  }
}
