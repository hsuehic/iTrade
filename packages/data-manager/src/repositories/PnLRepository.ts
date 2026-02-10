import { DataSource, Repository } from 'typeorm';
import { StrategyPerformance, createEmptyPerformance } from '@itrade/core';
import { Decimal } from 'decimal.js';

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
      totalOrders: number;
      filledOrders: number;
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

    // Fetch all orders in ONE query (optimized)
    const strategyIds = strategyResults.map((row) => row.strategyId);
    let allOrders: any[] = [];

    if (strategyIds.length > 0) {
      const ordersQuery = this.repository
        .createQueryBuilder('order')
        .where('order.strategyId IN (:...ids)', { ids: strategyIds })
        .orderBy('order.timestamp', 'ASC');

      if (userId) {
        ordersQuery.andWhere(
          'order.strategyId IN (SELECT id FROM strategies WHERE "userId" = :userId)',
          { userId },
        );
      }

      allOrders = await ordersQuery.getMany();
    }

    // Group orders by strategyId in memory
    const ordersByStrategy = new Map<number, any[]>();
    for (const order of allOrders) {
      if (!ordersByStrategy.has(order.strategyId)) {
        ordersByStrategy.set(order.strategyId, []);
      }
      ordersByStrategy.get(order.strategyId)!.push(order);
    }

    // Calculate PnL for each strategy using pre-fetched orders
    const strategies = strategyResults.map((row) => {
      const orders = ordersByStrategy.get(row.strategyId) || [];

      const { realizedPnl, unrealizedPnl } = this.calculatePnLFromOrders(orders);

      // Count total and filled orders
      const totalOrders = orders.length;
      const filledOrders = orders.filter((o) => o.status === 'FILLED').length;

      return {
        strategyId: row.strategyId,
        strategyName: row.strategyName,
        pnl: realizedPnl + unrealizedPnl,
        realizedPnl,
        unrealizedPnl,
        totalOrders,
        filledOrders,
      };
    });

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

  /**
   * 🆕 Rebuild full Strategy Performance object from historical orders
   * This provides a reliable source of truth by replaying all orders
   */
  async rebuildStrategyPerformance(
    strategyId: number,
    symbol: string,
    exchange: string,
    strategyName?: string,
    currentPrice?: number,
  ): Promise<StrategyPerformance> {
    // Get all orders for this strategy
    const orders = await this.repository.find({
      where: { strategyId },
      order: { timestamp: 'ASC' },
    });

    // Initialize empty performance
    const perf = createEmptyPerformance(
      symbol,
      exchange,
      strategyId,
      strategyName || `Strategy ${strategyId}`,
    );

    // Initialize calculation state
    let currentPosition = new Decimal(0);
    let avgEntryPrice = new Decimal(0);
    let realizedPnl = new Decimal(0);
    let totalFees = new Decimal(0);
    let winningTrades = 0;
    let losingTrades = 0;
    let totalVolume = new Decimal(0);
    let largestWin = new Decimal(0);
    let largestLoss = new Decimal(0);

    // Track time
    if (orders.length > 0) {
      perf.time.startTime = orders[0].timestamp;
      perf.time.lastOrderTime = orders[orders.length - 1].timestamp;
    }

    // Replay orders
    for (const order of orders) {
      const isLong = order.side === 'BUY';
      const isFilled = order.status === 'FILLED';
      const isPartiallyFilled = order.status === 'PARTIALLY_FILLED';
      const isCancelled = order.status === 'CANCELED';
      const isRejected = order.status === 'REJECTED';

      // Update basic counts
      if (isLong) {
        perf.orders.long.total.count++;
        if (isFilled) perf.orders.long.filled.count++;
        if (order.status === 'NEW' || isPartiallyFilled) perf.orders.long.pending.count++;
      } else {
        perf.orders.short.total.count++;
        if (isFilled) perf.orders.short.filled.count++;
        if (order.status === 'NEW' || isPartiallyFilled)
          perf.orders.short.pending.count++;
      }

      if (isCancelled) perf.orders.cancelled.count++;
      if (isRejected) perf.orders.rejected.count++;

      // Process Fills (Volume & PnL)
      const quantity = new Decimal(order.executedQuantity || 0);
      const price = new Decimal(order.averagePrice || order.price || 0); // Use averagePrice if available
      const value = quantity.times(price);
      // Determine fee
      const fee = new Decimal(0);

      if (quantity.gt(0)) {
        totalVolume = totalVolume.plus(value);
        totalFees = totalFees.plus(fee);

        // Update Volume Stats
        if (isLong) {
          perf.orders.long.filled.totalQuantity =
            perf.orders.long.filled.totalQuantity.plus(quantity);
          perf.orders.long.filled.totalValue =
            perf.orders.long.filled.totalValue.plus(value);
        } else {
          perf.orders.short.filled.totalQuantity =
            perf.orders.short.filled.totalQuantity.plus(quantity);
          perf.orders.short.filled.totalValue =
            perf.orders.short.filled.totalValue.plus(value);
        }

        // PnL Logic (FIFO/AvgCost)
        if (isLong) {
          // BUY
          if (currentPosition.gte(0)) {
            // Increasing Long
            if (currentPosition.plus(quantity).gt(0)) {
              avgEntryPrice = currentPosition
                .times(avgEntryPrice)
                .plus(value)
                .div(currentPosition.plus(quantity));
            }
            currentPosition = currentPosition.plus(quantity);
          } else {
            // Closing Short
            const closeQty = Decimal.min(quantity, currentPosition.abs());
            const remainQty = quantity.minus(closeQty);

            // Calc PnL on closed portion: (Entry - Exit) * Qty for Short
            const tradePnl = avgEntryPrice.minus(price).times(closeQty);
            realizedPnl = realizedPnl.plus(tradePnl);

            // Update Win/Loss stats
            if (tradePnl.gt(0)) {
              winningTrades++;
              if (tradePnl.gt(largestWin)) largestWin = tradePnl;
            } else if (tradePnl.lt(0)) {
              losingTrades++;
              if (tradePnl.lt(largestLoss)) largestLoss = tradePnl;
            }

            currentPosition = currentPosition.plus(closeQty); // Move towards 0

            // If flipped to Long
            if (remainQty.gt(0)) {
              currentPosition = currentPosition.plus(remainQty);
              avgEntryPrice = price; // Reset avg price for new long leg
            }
          }
        } else {
          // SELL
          if (currentPosition.lte(0)) {
            // Increasing Short
            if (currentPosition.minus(quantity).lt(0)) {
              avgEntryPrice = currentPosition
                .abs()
                .times(avgEntryPrice)
                .plus(value)
                .div(currentPosition.abs().plus(quantity));
            }
            currentPosition = currentPosition.minus(quantity);
          } else {
            // Closing Long
            const closeQty = Decimal.min(quantity, currentPosition);
            const remainQty = quantity.minus(closeQty);

            // Calc PnL on closed portion: (Exit - Entry) * Qty for Long
            const tradePnl = price.minus(avgEntryPrice).times(closeQty);
            realizedPnl = realizedPnl.plus(tradePnl);

            // Update Win/Loss stats
            if (tradePnl.gt(0)) {
              winningTrades++;
              if (tradePnl.gt(largestWin)) largestWin = tradePnl;
            } else if (tradePnl.lt(0)) {
              losingTrades++;
              if (tradePnl.lt(largestLoss)) largestLoss = tradePnl;
            }

            currentPosition = currentPosition.minus(closeQty); // Move towards 0

            // If flipped to Short
            if (remainQty.gt(0)) {
              // Remaining becomes new short
              currentPosition = currentPosition.minus(remainQty);
              avgEntryPrice = price;
            }
          }
        }
      }
    }

    // Set calculated values to performance object
    perf.position.currentPosition = currentPosition;
    perf.position.avgEntryPrice = avgEntryPrice;
    perf.pnl.realizedPnL = realizedPnl;
    perf.pnl.totalFees = totalFees;
    perf.activity.totalVolume = totalVolume;
    perf.activity.winningTrades = winningTrades;
    perf.activity.losingTrades = losingTrades;
    perf.activity.totalTrades = winningTrades + losingTrades;
    perf.activity.largestWin = largestWin;
    perf.activity.largestLoss = largestLoss;

    // Derived Metrics
    // Unrealized PnL
    if (currentPrice && !currentPosition.isZero()) {
      const priceDec = new Decimal(currentPrice);
      perf.position.currentPrice = priceDec;
      if (currentPosition.gt(0)) {
        perf.pnl.unrealizedPnL = currentPosition.times(priceDec.minus(avgEntryPrice));
      } else {
        perf.pnl.unrealizedPnL = currentPosition
          .abs()
          .times(avgEntryPrice.minus(priceDec));
      }
    }

    perf.pnl.totalPnL = perf.pnl.realizedPnL.plus(perf.pnl.unrealizedPnL);
    perf.pnl.netPnL = perf.pnl.totalPnL.minus(perf.pnl.totalFees);

    if (perf.activity.totalTrades > 0) {
      perf.pnl.winRate = new Decimal(winningTrades)
        .div(perf.activity.totalTrades)
        .times(100);
    }

    // Symbol Stats (Simplified for single symbol strategy)
    if (perf.symbols.length > 0) {
      perf.symbols[0].netPosition = currentPosition;
      perf.symbols[0].boughtQuantity = perf.orders.long.filled.totalQuantity;
      perf.symbols[0].soldQuantity = perf.orders.short.filled.totalQuantity;
      perf.symbols[0].boughtValue = perf.orders.long.filled.totalValue;
      perf.symbols[0].soldValue = perf.orders.short.filled.totalValue;
    }

    return perf;
  }
}
