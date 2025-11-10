import { DataSource, Repository } from 'typeorm';

import { OrderEntity } from '../entities/Order';

export class PnLRepository {
  private repository: Repository<OrderEntity>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(OrderEntity);
  }

  /**
   * Calculate PnL from orders
   * @param orders - Array of filled orders
   * @param currentPrice - Current market price for unrealized PnL calculation
   */
  private calculatePnLFromOrders(
    orders: OrderEntity[],
    currentPrice?: number,
  ): {
    realizedPnl: number;
    unrealizedPnl: number;
    openPosition: { side: string; quantity: number; avgPrice: number } | null;
  } {
    let position = 0; // positive = long, negative = short
    let totalCost = 0; // total cost basis
    let realizedPnl = 0;

    // Sort orders by timestamp
    const sortedOrders = [...orders].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    // Process each filled order
    for (const order of sortedOrders) {
      if (order.status !== 'FILLED') continue;

      const executedQty = parseFloat(order.executedQuantity?.toString() || '0');
      const cumulativeQuote = parseFloat(
        order.cummulativeQuoteQuantity?.toString() || '0',
      );

      // Calculate average price: use cummulativeQuoteQuantity if available, otherwise use order price
      const avgPrice =
        cumulativeQuote > 0 && executedQty > 0
          ? cumulativeQuote / executedQty
          : parseFloat(order.price?.toString() || '0');

      if (executedQty === 0 || avgPrice === 0) continue;

      if (order.side === 'BUY') {
        // Opening or adding to long position
        if (position >= 0) {
          // Adding to long position
          totalCost += executedQty * avgPrice;
          position += executedQty;
        } else {
          // Closing short position (realizing PnL)
          const closeQty = Math.min(executedQty, Math.abs(position));
          const avgCost = totalCost / Math.abs(position);
          realizedPnl += closeQty * (avgCost - avgPrice); // profit when covering short
          position += closeQty;
          totalCost = totalCost * (1 - closeQty / Math.abs(position - closeQty));

          if (executedQty > closeQty) {
            // Remaining quantity opens new long position
            const remainingQty = executedQty - closeQty;
            position += remainingQty;
            totalCost += remainingQty * avgPrice;
          }
        }
      } else {
        // SELL
        // Closing or adding to short position
        if (position <= 0) {
          // Adding to short position
          totalCost += executedQty * avgPrice;
          position -= executedQty;
        } else {
          // Closing long position (realizing PnL)
          const closeQty = Math.min(executedQty, position);
          const avgCost = totalCost / position;
          realizedPnl += closeQty * (avgPrice - avgCost); // profit when selling long
          position -= closeQty;
          totalCost = totalCost * (1 - closeQty / (position + closeQty));

          if (executedQty > closeQty) {
            // Remaining quantity opens new short position
            const remainingQty = executedQty - closeQty;
            position -= remainingQty;
            totalCost += remainingQty * avgPrice;
          }
        }
      }
    }

    // Calculate unrealized PnL for open position
    let unrealizedPnl = 0;
    let openPosition: { side: string; quantity: number; avgPrice: number } | null = null;

    if (position !== 0 && currentPrice && currentPrice > 0) {
      const avgCost = totalCost / Math.abs(position);
      if (position > 0) {
        // Long position
        unrealizedPnl = position * (currentPrice - avgCost);
        openPosition = { side: 'BUY', quantity: position, avgPrice: avgCost };
      } else {
        // Short position
        unrealizedPnl = Math.abs(position) * (avgCost - currentPrice);
        openPosition = { side: 'SELL', quantity: Math.abs(position), avgPrice: avgCost };
      }
    }

    return { realizedPnl, unrealizedPnl, openPosition };
  }

  async getStrategyPnL(
    strategyId: number,
    currentPrice?: number,
  ): Promise<{
    totalPnl: number;
    realizedPnl: number;
    unrealizedPnl: number;
    totalOrders: number;
    filledOrders: number;
  }> {
    // Get all orders for this strategy
    const orders = await this.repository.find({
      where: { strategyId },
      order: { timestamp: 'ASC' },
    });

    // Calculate PnL from orders
    const { realizedPnl, unrealizedPnl } = this.calculatePnLFromOrders(
      orders,
      currentPrice,
    );

    // Count orders
    const totalOrders = orders.length;
    const filledOrders = orders.filter((o) => o.status === 'FILLED').length;

    return {
      totalPnl: realizedPnl + unrealizedPnl,
      realizedPnl,
      unrealizedPnl,
      totalOrders,
      filledOrders,
    };
  }

  async getOverallPnL(userId?: string): Promise<{
    totalPnl: number;
    realizedPnl: number;
    unrealizedPnl: number;
    totalOrders: number;
    strategies: Array<{
      strategyId: number;
      strategyName: string;
      pnl: number;
      realizedPnl: number;
      unrealizedPnl: number;
    }>;
  }> {
    // Get all strategies (grouped by strategyId)
    let query = this.repository
      .createQueryBuilder('order')
      .leftJoin('order.strategy', 'strategy')
      .select('strategy.id', 'strategyId')
      .addSelect('strategy.name', 'strategyName')
      .addSelect('strategy.symbol', 'symbol')
      .groupBy('strategy.id')
      .addGroupBy('strategy.name')
      .addGroupBy('strategy.symbol');

    if (userId) {
      query = query.where('strategy.userId = :userId', { userId });
    }

    const strategyResults = await query.getRawMany();

    // Calculate PnL for each strategy
    const strategies = await Promise.all(
      strategyResults.map(async (row) => {
        const orders = await this.repository.find({
          where: { strategyId: row.strategyId },
          order: { timestamp: 'ASC' },
        });

        const { realizedPnl, unrealizedPnl } = this.calculatePnLFromOrders(orders);

        return {
          strategyId: row.strategyId,
          strategyName: row.strategyName,
          pnl: realizedPnl + unrealizedPnl,
          realizedPnl,
          unrealizedPnl,
        };
      }),
    );

    const totalRealizedPnl = strategies.reduce((sum, s) => sum + s.realizedPnl, 0);
    const totalUnrealizedPnl = strategies.reduce((sum, s) => sum + s.unrealizedPnl, 0);

    // Count total orders
    let totalOrders = 0;
    if (userId) {
      totalOrders = await this.repository
        .createQueryBuilder('order')
        .leftJoin('order.strategy', 'strategy')
        .where('strategy.userId = :userId', { userId })
        .getCount();
    } else {
      totalOrders = await this.repository.count();
    }

    return {
      totalPnl: totalRealizedPnl + totalUnrealizedPnl,
      realizedPnl: totalRealizedPnl,
      unrealizedPnl: totalUnrealizedPnl,
      totalOrders,
      strategies,
    };
  }
}
