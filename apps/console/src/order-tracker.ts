import { ILogger, Order, EventBus, OrderEventData } from '@itrade/core';
import { TypeOrmDataManager } from '@itrade/data-manager';
import { Decimal } from 'decimal.js';

export class OrderTracker {
  private eventBus: EventBus;
  private totalOrders = 0;
  private totalFilled = 0;
  private totalCancelled = 0;
  private totalRejected = 0;
  private startTime: Date;

  constructor(
    private dataManager: TypeOrmDataManager,
    private logger: ILogger
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
      '✅ Order Tracker started - All orders will be saved to database'
    );
  }

  async stop(): Promise<void> {
    this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.info('📊 Order Tracker Final Report');
    this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.info(`   Total Orders Created: ${this.totalOrders}`);
    this.logger.info(`   Orders Filled: ${this.totalFilled}`);
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

      // Extract strategy ID from clientOrderId (format: strategy_{id}_{timestamp})
      const strategyId = this.extractStrategyId(order.clientOrderId);

      // Save order to database
      await this.dataManager.saveOrder({
        id: order.id,
        clientOrderId: order.clientOrderId,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity,
        price: order.price,
        stopPrice: order.stopPrice,
        status: order.status,
        timeInForce: order.timeInForce,
        timestamp: order.timestamp,
        executedQuantity: order.executedQuantity,
        cummulativeQuoteQuantity: order.cummulativeQuoteQuantity,
        strategy: strategyId ? ({ id: strategyId } as any) : undefined,
      });

      this.logger.info(
        `💾 Order saved to database: ${order.id} (Strategy ID: ${strategyId || 'none'})`
      );
    } catch (error) {
      this.logger.error('❌ Failed to save order to database', error as Error);
    }
  }

  private async handleOrderFilled(order: Order): Promise<void> {
    try {
      this.totalFilled++;

      // Calculate PnL
      const { realizedPnl, unrealizedPnl, averagePrice } =
        await this.calculatePnL(order);

      // Update order in database
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
        `💾 Order filled and updated: ${order.id}, ${pnlStr}, Avg Price: ${averagePrice?.toFixed(8) || 'N/A'}`
      );
    } catch (error) {
      this.logger.error('❌ Failed to update filled order', error as Error);
    }
  }

  private async handleOrderPartiallyFilled(order: Order): Promise<void> {
    try {
      this.logger.info(`Order partially filled: ${order.id}`);

      const { realizedPnl, unrealizedPnl, averagePrice } =
        await this.calculatePnL(order);

      await this.dataManager.updateOrder(order.id, {
        status: order.status,
        executedQuantity: order.executedQuantity,
        cummulativeQuoteQuantity: order.cummulativeQuoteQuantity,
        updateTime: order.updateTime,
        realizedPnl,
        unrealizedPnl,
        averagePrice,
      });
    } catch (error) {
      this.logger.error(
        'Failed to update partially filled order',
        error as Error
      );
    }
  }

  private async handleOrderCancelled(order: Order): Promise<void> {
    try {
      this.totalCancelled++;

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

      await this.dataManager.updateOrder(order.id, {
        status: order.status,
        updateTime: order.updateTime,
      });

      this.logger.error(`💾 Order rejected and updated: ${order.id}`);
    } catch (error) {
      this.logger.error('❌ Failed to update rejected order', error as Error);
    }
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
        averagePrice = order.cummulativeQuoteQuantity.div(
          order.executedQuantity
        );
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
            o.symbol === order.symbol &&
            o.side !== order.side &&
            o.status === 'FILLED'
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

  private extractStrategyId(clientOrderId?: string): number | undefined {
    if (!clientOrderId) return undefined;

    // Format: strategy_{id}_{timestamp}
    const match = clientOrderId.match(/^strategy_(\d+)_/);
    return match ? parseInt(match[1]) : undefined;
  }
}
