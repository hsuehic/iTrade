import { ILogger, Order, EventBus, OrderEventData } from '@itrade/core';
import { TypeOrmDataManager } from '@itrade/data-manager';
import { Decimal } from 'decimal.js';

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
 */
export class OrderTracker {
  private eventBus: EventBus;
  private pendingPartialFills = new Map<string, DebouncedOrderUpdate>();
  private totalOrders = 0;
  private totalFilled = 0;
  private totalPartialFills = 0;
  private totalPartialFillsSaved = 0;
  private totalCancelled = 0;
  private totalRejected = 0;
  private startTime: Date;

  // Debounce configuration (only for partial fills)
  private readonly DEBOUNCE_MS = 1000; // 1 second debounce for partial fills

  constructor(
    private dataManager: TypeOrmDataManager,
    private logger: ILogger,
  ) {
    this.eventBus = EventBus.getInstance();
    this.startTime = new Date();
  }

  async start(): Promise<void> {
    this.logger.info('Starting Order Tracker...');

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

    this.logger.info(
      `✅ Order Tracker started (partial fill debounce: ${this.DEBOUNCE_MS}ms per order)`,
    );
  }

  async stop(): Promise<void> {
    // Flush all pending partial fills
    await this.flushAllPendingUpdates();

    this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.info('📊 Order Tracker Final Report');
    this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.info(`   Total Orders Created: ${this.totalOrders}`);
    this.logger.info(`   Orders Filled: ${this.totalFilled}`);
    this.logger.info(
      `   Partial Fill Updates: ${this.totalPartialFills} received, ${this.totalPartialFillsSaved} saved`,
    );
    if (this.totalPartialFills > 0) {
      this.logger.info(
        `   Partial Fill Debounce Efficiency: ${((1 - this.totalPartialFillsSaved / this.totalPartialFills) * 100).toFixed(1)}% reduction`,
      );
    }
    this.logger.info(`   Orders Cancelled: ${this.totalCancelled}`);
    this.logger.info(`   Orders Rejected: ${this.totalRejected}`);

    const runTime = Date.now() - this.startTime.getTime();
    const hours = (runTime / (1000 * 60 * 60)).toFixed(2);
    this.logger.info(`   Running time: ${hours} hours`);
    this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  private async handleOrderCreated(order: Order): Promise<void> {
    try {
      this.totalOrders++;

      // 🆕 Directly read strategyId and exchange from order object
      const strategyId = order.strategyId;
      const exchange = order.exchange;

      // Save order to database
      await this.dataManager.saveOrder({
        id: order.id,
        clientOrderId: order.clientOrderId,
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
        strategy: strategyId ? ({ id: strategyId } as any) : undefined,
      });

      this.logger.info(
        `💾 Order saved: ${order.id} | Strategy: ${order.strategyName || 'none'} (ID: ${strategyId || 'N/A'}) | Exchange: ${exchange || 'unknown'}`,
      );
    } catch (error) {
      this.logger.error('❌ Failed to save order to database', error as Error);
    }
  }

  private async handleOrderFilled(order: Order): Promise<void> {
    try {
      this.totalFilled++;

      // Cancel any pending partial fill update for this order
      const pending = this.pendingPartialFills.get(order.id);
      if (pending?.timer) {
        clearTimeout(pending.timer);
        this.pendingPartialFills.delete(order.id);
      }

      // Calculate PnL
      const { realizedPnl, unrealizedPnl, averagePrice } = await this.calculatePnL(order);

      // Update order in database (immediately, no debounce for final state)
      await this.dataManager.updateOrder(order.id, {
        status: order.status,
        executedQuantity: order.executedQuantity,
        cummulativeQuoteQuantity: order.cummulativeQuoteQuantity,
        updateTime: order.updateTime,
        realizedPnl,
        unrealizedPnl,
        averagePrice,
      });

      const pnlStr = realizedPnl
        ? `💰 Realized PnL: ${realizedPnl.toFixed(2)}`
        : unrealizedPnl
          ? `📊 Unrealized PnL: ${unrealizedPnl.toFixed(2)}`
          : 'PnL: N/A';

      this.logger.info(
        `💾 Order filled and updated: ${order.id}, ${pnlStr}, Avg Price: ${averagePrice?.toFixed(8) || 'N/A'}`,
      );
    } catch (error) {
      this.logger.error('❌ Failed to update filled order', error as Error);
    }
  }

  private handleOrderPartiallyFilled(order: Order): void {
    try {
      this.totalPartialFills++;

      // Use debounce for partial fills (can be very frequent)
      const key = order.id;

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
        order,
        timestamp: new Date(),
        timer,
      });

      this.logger.debug(
        `⏳ Partial fill queued: ${order.id} (${order.executedQuantity?.toString()}/${order.quantity.toString()})`,
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

      const { realizedPnl, unrealizedPnl, averagePrice } = await this.calculatePnL(order);

      await this.dataManager.updateOrder(order.id, {
        status: order.status,
        executedQuantity: order.executedQuantity,
        cummulativeQuoteQuantity: order.cummulativeQuoteQuantity,
        updateTime: order.updateTime,
        realizedPnl,
        unrealizedPnl,
        averagePrice,
      });

      this.totalPartialFillsSaved++;
      this.pendingPartialFills.delete(orderId);

      this.logger.info(
        `💾 Partial fill saved: ${order.id} (${order.executedQuantity?.toString()}/${order.quantity.toString()})`,
      );
    } catch (error) {
      this.logger.error(`❌ Failed to save partial fill for ${orderId}`, error as Error);
      this.pendingPartialFills.delete(orderId);
    }
  }

  private async handleOrderCancelled(order: Order): Promise<void> {
    try {
      this.totalCancelled++;

      // Cancel any pending partial fill update for this order
      const pending = this.pendingPartialFills.get(order.id);
      if (pending?.timer) {
        clearTimeout(pending.timer);
        this.pendingPartialFills.delete(order.id);
      }

      // Save immediately (final state, no debounce)
      await this.dataManager.updateOrder(order.id, {
        status: order.status,
        updateTime: order.updateTime,
      });

      this.logger.info(`💾 Order cancelled and updated: ${order.id}`);
    } catch (error) {
      this.logger.error('❌ Failed to update cancelled order', error as Error);
    }
  }

  private async handleOrderRejected(order: Order): Promise<void> {
    try {
      this.totalRejected++;

      // Cancel any pending partial fill update for this order
      const pending = this.pendingPartialFills.get(order.id);
      if (pending?.timer) {
        clearTimeout(pending.timer);
        this.pendingPartialFills.delete(order.id);
      }

      // Save immediately (final state, no debounce)
      await this.dataManager.updateOrder(order.id, {
        status: order.status,
        updateTime: order.updateTime,
      });

      this.logger.error(`💾 Order rejected and updated: ${order.id}`);
    } catch (error) {
      this.logger.error('❌ Failed to update rejected order', error as Error);
    }
  }

  private async flushAllPendingUpdates(): Promise<void> {
    if (this.pendingPartialFills.size === 0) return;

    this.logger.info(
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
    this.logger.info('✅ All pending partial fill updates flushed');
  }

  private async calculatePnL(order: Order): Promise<{
    realizedPnl?: Decimal;
    unrealizedPnl?: Decimal;
    averagePrice?: Decimal;
  }> {
    try {
      // Calculate average fill price
      let averagePrice: Decimal | undefined;
      if (order.executedQuantity && order.cummulativeQuoteQuantity) {
        averagePrice = order.cummulativeQuoteQuantity.div(order.executedQuantity);
      }

      // Get previous orders for this symbol to calculate PnL
      const previousOrders = await this.dataManager.getOrders({
        symbol: order.symbol,
      });

      // Simple PnL calculation (this is a simplified version)
      // In a real system, you'd track positions and calculate based on entry/exit prices
      let realizedPnl: Decimal | undefined;
      let unrealizedPnl: Decimal | undefined;

      // For now, we'll just set unrealizedPnl for open positions
      if (order.status === 'FILLED' && averagePrice) {
        // This is a placeholder - implement your PnL calculation logic here
        // You would typically:
        // 1. Track the position (entry price, quantity)
        // 2. Calculate PnL based on current price vs entry price
        // 3. Update realized PnL when position is closed

        const oppositeOrders = previousOrders.filter(
          (o) =>
            o.symbol === order.symbol && o.side !== order.side && o.status === 'FILLED',
        );

        if (oppositeOrders.length > 0) {
          // Calculate realized PnL for closing orders
          const lastOpposite = oppositeOrders[0];
          if (lastOpposite.averagePrice && order.executedQuantity) {
            const priceDiff =
              order.side === 'BUY'
                ? lastOpposite.averagePrice.sub(averagePrice)
                : averagePrice.sub(lastOpposite.averagePrice);
            realizedPnl = priceDiff.mul(order.executedQuantity);
          }
        } else {
          // For opening orders, PnL is unrealized
          unrealizedPnl = new Decimal(0);
        }
      }

      return { realizedPnl, unrealizedPnl, averagePrice };
    } catch (error) {
      this.logger.error('Failed to calculate PnL', error as Error);
      return {};
    }
  }

  // 🗑️ No longer needed! strategyId is now directly available in order.strategyId
  // Keeping this method for backward compatibility with old orders
  private extractStrategyId(clientOrderId?: string): number | undefined {
    if (!clientOrderId) return undefined;

    // New format: s-{id}-{timestamp}
    const newMatch = clientOrderId.match(/^s-(\d+)-/);
    if (newMatch) return parseInt(newMatch[1]);

    // Old format (backward compatibility): strategy_{id}_{timestamp}
    const oldMatch = clientOrderId.match(/^strategy_(\d+)_/);
    return oldMatch ? parseInt(oldMatch[1]) : undefined;
  }
}
