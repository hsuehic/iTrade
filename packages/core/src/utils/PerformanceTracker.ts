/**
 * 📊 Performance Tracker Utility
 *
 * This class provides methods to calculate and update strategy performance metrics
 * based on orders, positions, and market data.
 */

import { Decimal } from 'decimal.js';
import {
  Order,
  OrderSide,
  OrderStatus,
  Position,
  StrategyPerformance,
  OrderStatistics,
  createEmptyPerformance,
  Trade,
} from '../types';

export class PerformanceTracker {
  /**
   * Update performance metrics based on a new order status change
   * NOTE: This only updates order COUNTS. Volume and PnL are updated via updateWithTrade
   */
  static updateWithOrder(
    performance: StrategyPerformance,
    order: Order,
  ): StrategyPerformance {
    const updated = { ...performance };
    updated.time.lastUpdateTime = new Date();

    // Update last order time if order is filled
    if (order.status === OrderStatus.FILLED) {
      updated.time.lastOrderTime = order.timestamp;
    }

    // Determine status
    const isLong = order.side === OrderSide.BUY;
    const isFilled = order.status === OrderStatus.FILLED;
    const isPending =
      order.status === OrderStatus.NEW || order.status === OrderStatus.PARTIALLY_FILLED;
    const isCancelled = order.status === OrderStatus.CANCELED;
    const isRejected = order.status === OrderStatus.REJECTED;

    // Helper to update order statistics (COUNTS ONLY)
    const updateCount = (stats: OrderStatistics) => {
      stats.count++;
    };

    // Update long/short metrics
    if (isLong) {
      if (isFilled) updateCount(updated.orders.long.filled);
      if (isPending) updateCount(updated.orders.long.pending);
      updateCount(updated.orders.long.total);
    } else {
      if (isFilled) updateCount(updated.orders.short.filled);
      if (isPending) updateCount(updated.orders.short.pending);
      updateCount(updated.orders.short.total);
    }

    // Update cancelled/rejected
    if (isCancelled) updateCount(updated.orders.cancelled);
    if (isRejected) updateCount(updated.orders.rejected);

    return updated;
  }

  /**
   * Update performance metrics based on a trade execution (fill)
   * Handles volume, fees, and average price updates
   */
  static updateWithTrade(
    performance: StrategyPerformance,
    trade: Trade,
  ): StrategyPerformance {
    const updated = { ...performance };
    updated.time.lastUpdateTime = new Date();

    const quantity = trade.quantity;
    const price = trade.price;
    const value = quantity.times(price);
    const fees = trade.fee || new Decimal(0);
    const isLong = String(trade.side).toLowerCase() === 'buy';

    // Helper to update order statistics (VOLUME ONLY)
    const updateVolume = (
      stats: OrderStatistics,
      qty: Decimal,
      val: Decimal,
      fee: Decimal,
    ) => {
      stats.totalQuantity = stats.totalQuantity.plus(qty);
      stats.totalValue = stats.totalValue.plus(val);
      stats.totalFees = stats.totalFees.plus(fee);
    };

    // Update long/short volume metrics
    // We attribute trade volume to 'filled' and 'total' buckets
    if (isLong) {
      updateVolume(updated.orders.long.filled, quantity, value, fees);
      updateVolume(updated.orders.long.total, quantity, value, fees);
    } else {
      updateVolume(updated.orders.short.filled, quantity, value, fees);
      updateVolume(updated.orders.short.total, quantity, value, fees);
    }

    // Update symbol statistics
    const symbolStats = updated.symbols.find(
      (s) => s.symbol === (trade.symbol || updated.symbol),
    );
    if (symbolStats) {
      if (isLong) {
        symbolStats.boughtQuantity = symbolStats.boughtQuantity.plus(quantity);
        symbolStats.boughtValue = symbolStats.boughtValue.plus(value);
        symbolStats.buyOrderCount++; // Note: This might double count if split? No, trade is execution
        // Update average buy price
        if (symbolStats.boughtQuantity.gt(0)) {
          symbolStats.avgBuyPrice = symbolStats.boughtValue.div(
            symbolStats.boughtQuantity,
          );
        }
      } else {
        symbolStats.soldQuantity = symbolStats.soldQuantity.plus(quantity);
        symbolStats.soldValue = symbolStats.soldValue.plus(value);
        symbolStats.sellOrderCount++;
        // Update average sell price
        if (symbolStats.soldQuantity.gt(0)) {
          symbolStats.avgSellPrice = symbolStats.soldValue.div(symbolStats.soldQuantity);
        }
      }
      // Update net position
      symbolStats.netPosition = symbolStats.boughtQuantity.minus(
        symbolStats.soldQuantity,
      );
    }

    // Update total fees
    updated.pnl.totalFees = updated.pnl.totalFees.plus(fees);

    // 🆕 Calculate Realized PnL if closing a position
    const currentPos = updated.position.currentPosition;
    const avgEntryPrice = updated.position.avgEntryPrice;

    let isClosing = false;
    let closingQty = new Decimal(0);

    if (currentPos.gt(0) && !isLong) {
      // Long position, Sell trade -> Closing
      isClosing = true;
      closingQty = Decimal.min(quantity, currentPos);
    } else if (currentPos.lt(0) && isLong) {
      // Short position, Buy trade -> Closing
      isClosing = true;
      closingQty = Decimal.min(quantity, currentPos.abs());
    }

    if (isClosing && closingQty.gt(0)) {
      let tradePnL = new Decimal(0);

      if (currentPos.gt(0)) {
        // Closing Long: (Sell Price - Avg Entry) * Qty
        tradePnL = price.minus(avgEntryPrice).times(closingQty);
      } else {
        // Closing Short: (Avg Entry - Buy Price) * Qty
        tradePnL = avgEntryPrice.minus(price).times(closingQty);
      }

      // Update PnL metrics
      updated.pnl.realizedPnL = updated.pnl.realizedPnL.plus(tradePnL);
      updated.pnl.totalPnL = updated.pnl.realizedPnL.plus(updated.pnl.unrealizedPnL);
      updated.pnl.netPnL = updated.pnl.totalPnL.minus(updated.pnl.totalFees);

      // Update Win/Loss stats
      if (tradePnL.gt(0)) {
        updated.activity.winningTrades++;
        if (tradePnL.gt(updated.activity.largestWin)) {
          updated.activity.largestWin = tradePnL;
        }
      } else if (tradePnL.lt(0)) {
        updated.activity.losingTrades++;
        if (tradePnL.lt(updated.activity.largestLoss)) {
          updated.activity.largestLoss = tradePnL;
        }
      }

      // Update Win Rate
      const totalClosedTrades =
        updated.activity.winningTrades + updated.activity.losingTrades;
      if (totalClosedTrades > 0) {
        updated.pnl.winRate = new Decimal(updated.activity.winningTrades)
          .div(totalClosedTrades)
          .times(100);
      }
    }

    // Update position size and avgEntryPrice
    if (currentPos.gt(0)) {
      if (isLong) {
        // Adding to Long
        const totalValueOld = currentPos.times(avgEntryPrice);
        const addedValue = quantity.times(price);
        updated.position.currentPosition = currentPos.plus(quantity);
        updated.position.avgEntryPrice = totalValueOld
          .plus(addedValue)
          .div(updated.position.currentPosition);
      } else {
        // Selling Long
        updated.position.currentPosition = currentPos.minus(quantity);
        if (updated.position.currentPosition.lt(0)) {
          // Flipped to Short
          updated.position.avgEntryPrice = price;
        } else if (updated.position.currentPosition.eq(0)) {
          updated.position.avgEntryPrice = new Decimal(0);
        }
      }
    } else if (currentPos.lt(0)) {
      if (!isLong) {
        // Adding to Short
        const absPos = currentPos.abs();
        const totalValueOld = absPos.times(avgEntryPrice);
        const addedValue = quantity.times(price);
        updated.position.currentPosition = currentPos.minus(quantity);
        updated.position.avgEntryPrice = totalValueOld
          .plus(addedValue)
          .div(updated.position.currentPosition.abs());
      } else {
        // Buying Short
        updated.position.currentPosition = currentPos.plus(quantity);
        if (updated.position.currentPosition.gt(0)) {
          // Flipped to Long
          updated.position.avgEntryPrice = price;
        } else if (updated.position.currentPosition.eq(0)) {
          updated.position.avgEntryPrice = new Decimal(0);
        }
      }
    } else {
      // Opening new position
      updated.position.currentPosition = isLong ? quantity : quantity.negated();
      updated.position.avgEntryPrice = price;
    }

    // Determine position side
    if (updated.position.currentPosition.gt(0)) {
      updated.position.side = 'long';
    } else if (updated.position.currentPosition.lt(0)) {
      updated.position.side = 'short';
    } else {
      updated.position.side = 'flat';
    }

    // Update max position size
    const absPosition = updated.position.currentPosition.abs();
    if (absPosition.gt(updated.risk.maxPositionSize)) {
      updated.risk.maxPositionSize = absPosition;
    }

    // Update activity metrics
    updated.activity.totalTrades++;
    updated.activity.totalVolume = updated.activity.totalVolume.plus(value);

    // Update average trade size and value
    if (updated.activity.totalTrades > 0) {
      updated.activity.avgTradeSize = updated.orders.long.filled.totalQuantity
        .plus(updated.orders.short.filled.totalQuantity)
        .div(updated.activity.totalTrades);

      updated.activity.avgTradeValue = updated.activity.totalVolume.div(
        updated.activity.totalTrades,
      );
    }

    return updated;
  }

  /**
   * Update performance metrics based on position update
   */
  static updateWithPosition(
    performance: StrategyPerformance,
    position: Position,
    currentPrice?: Decimal,
  ): StrategyPerformance {
    const updated = { ...performance };
    updated.time.lastUpdateTime = new Date();

    // Update position metrics
    updated.position.currentPosition = position.quantity;
    updated.position.avgEntryPrice = position.avgPrice;
    updated.position.currentPrice = currentPrice || position.markPrice;
    updated.position.marketValue = position.quantity.times(
      currentPrice || position.markPrice,
    );
    updated.position.unrealizedPnL = position.unrealizedPnl;
    updated.position.leverage = position.leverage;

    // Determine position side
    if (position.quantity.gt(0)) {
      updated.position.side = 'long';
    } else if (position.quantity.lt(0)) {
      updated.position.side = 'short';
    } else {
      updated.position.side = 'flat';
    }

    // Update max position size
    const absPosition = position.quantity.abs();
    if (absPosition.gt(updated.risk.maxPositionSize)) {
      updated.risk.maxPositionSize = absPosition;
    }

    // Update total exposure
    updated.risk.totalExposure = updated.position.marketValue.abs();

    // Update unrealized PnL in pnl metrics
    updated.pnl.unrealizedPnL = position.unrealizedPnl;
    updated.pnl.totalPnL = updated.pnl.realizedPnL.plus(updated.pnl.unrealizedPnL);
    updated.pnl.netPnL = updated.pnl.totalPnL.minus(updated.pnl.totalFees);

    return updated;
  }

  /**
   * Calculate PnL metrics from order history
   */
  static calculatePnL(
    performance: StrategyPerformance,
    orders: Order[],
  ): StrategyPerformance {
    const updated = { ...performance };

    // Sort orders by timestamp
    const sortedOrders = [...orders].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    let position = new Decimal(0);
    let totalCost = new Decimal(0);
    let realizedPnl = new Decimal(0);
    const trades: { pnl: Decimal; timestamp: Date }[] = [];

    // Process each filled order
    for (const order of sortedOrders) {
      if (order.status !== OrderStatus.FILLED) continue;

      const executedQty = order.executedQuantity || order.quantity;
      const avgPrice = order.averagePrice || order.price || new Decimal(0);

      if (executedQty.eq(0) || avgPrice.eq(0)) continue;

      if (order.side === OrderSide.BUY) {
        if (position.gte(0)) {
          // Adding to long position
          totalCost = totalCost.plus(executedQty.times(avgPrice));
          position = position.plus(executedQty);
        } else {
          // Closing short position
          const closeQty = Decimal.min(executedQty, position.abs());
          const avgCost = totalCost.div(position.abs());
          const tradePnl = closeQty.times(avgCost.minus(avgPrice));
          realizedPnl = realizedPnl.plus(tradePnl);
          trades.push({ pnl: tradePnl, timestamp: order.timestamp });

          position = position.plus(closeQty);
          totalCost = totalCost.times(
            new Decimal(1).minus(closeQty.div(position.abs().plus(closeQty))),
          );

          if (executedQty.gt(closeQty)) {
            // Remaining quantity opens new long position
            const remainingQty = executedQty.minus(closeQty);
            position = position.plus(remainingQty);
            totalCost = totalCost.plus(remainingQty.times(avgPrice));
          }
        }
      } else {
        // SELL
        if (position.lte(0)) {
          // Adding to short position
          totalCost = totalCost.plus(executedQty.times(avgPrice));
          position = position.minus(executedQty);
        } else {
          // Closing long position
          const closeQty = Decimal.min(executedQty, position);
          const avgCost = totalCost.div(position);
          const tradePnl = closeQty.times(avgPrice.minus(avgCost));
          realizedPnl = realizedPnl.plus(tradePnl);
          trades.push({ pnl: tradePnl, timestamp: order.timestamp });

          position = position.minus(closeQty);
          totalCost = totalCost.times(
            new Decimal(1).minus(closeQty.div(position.plus(closeQty))),
          );

          if (executedQty.gt(closeQty)) {
            // Remaining quantity opens new short position
            const remainingQty = executedQty.minus(closeQty);
            position = position.minus(remainingQty);
            totalCost = totalCost.plus(remainingQty.times(avgPrice));
          }
        }
      }
    }

    // Update realized PnL
    updated.pnl.realizedPnL = realizedPnl;
    updated.pnl.totalPnL = updated.pnl.realizedPnL.plus(updated.pnl.unrealizedPnL);
    updated.pnl.netPnL = updated.pnl.totalPnL.minus(updated.pnl.totalFees);

    // Calculate win rate
    const winningTrades = trades.filter((t) => t.pnl.gt(0)).length;
    const losingTrades = trades.filter((t) => t.pnl.lt(0)).length;
    updated.activity.winningTrades = winningTrades;
    updated.activity.losingTrades = losingTrades;

    if (trades.length > 0) {
      updated.pnl.winRate = new Decimal(winningTrades).div(trades.length).times(100);
    }

    // Calculate profit factor
    const grossProfit = trades
      .filter((t) => t.pnl.gt(0))
      .reduce((sum, t) => sum.plus(t.pnl), new Decimal(0));
    const grossLoss = trades
      .filter((t) => t.pnl.lt(0))
      .reduce((sum, t) => sum.plus(t.pnl.abs()), new Decimal(0));

    if (grossLoss.gt(0)) {
      updated.pnl.profitFactor = grossProfit.div(grossLoss);
    }

    // Update largest win/loss
    if (trades.length > 0) {
      updated.activity.largestWin = trades.reduce(
        (max, t) => (t.pnl.gt(max) ? t.pnl : max),
        new Decimal(0),
      );
      updated.activity.largestLoss = trades.reduce(
        (min, t) => (t.pnl.lt(min) ? t.pnl : min),
        new Decimal(0),
      );
    }

    // Calculate ROI (assuming initial capital from first order)
    if (orders.length > 0 && updated.activity.totalVolume.gt(0)) {
      updated.pnl.roi = updated.pnl.netPnL.div(updated.activity.totalVolume).times(100);
    }

    return updated;
  }

  /**
   * Update time metrics
   */
  static updateTimeMetrics(performance: StrategyPerformance): StrategyPerformance {
    const updated = { ...performance };
    const now = new Date();

    updated.time.lastUpdateTime = now;
    updated.time.totalRuntime = Math.floor(
      (now.getTime() - updated.time.startTime.getTime()) / 1000,
    );

    return updated;
  }

  /**
   * Calculate risk metrics (drawdown, Sharpe ratio, etc.)
   */
  static calculateRiskMetrics(
    performance: StrategyPerformance,
    equityCurve?: Array<{ timestamp: Date; value: Decimal }>,
  ): StrategyPerformance {
    const updated = { ...performance };

    // Calculate drawdown if equity curve is provided
    if (equityCurve && equityCurve.length > 0) {
      let peak = equityCurve[0].value;
      let maxDrawdown = new Decimal(0);

      for (const point of equityCurve) {
        if (point.value.gt(peak)) {
          peak = point.value;
        }
        const drawdown = peak.minus(point.value).div(peak).times(100);
        if (drawdown.gt(maxDrawdown)) {
          maxDrawdown = drawdown;
        }
      }

      updated.risk.maxDrawdown = maxDrawdown;

      // Current drawdown
      const currentValue = equityCurve[equityCurve.length - 1].value;
      updated.risk.currentDrawdown = peak.minus(currentValue).div(peak).times(100);
    }

    return updated;
  }

  /**
   * Create a summary of key performance metrics for display
   */
  static getSummary(performance: StrategyPerformance): {
    totalOrders: number;
    filledOrders: number;
    pendingOrders: number;
    totalPnL: string;
    winRate: string;
    totalVolume: string;
    currentPosition: string;
  } {
    const totalOrders =
      performance.orders.long.total.count + performance.orders.short.total.count;
    const filledOrders =
      performance.orders.long.filled.count + performance.orders.short.filled.count;
    const pendingOrders =
      performance.orders.long.pending.count + performance.orders.short.pending.count;

    return {
      totalOrders,
      filledOrders,
      pendingOrders,
      totalPnL: performance.pnl.totalPnL.toFixed(2),
      winRate: performance.pnl.winRate.toFixed(2) + '%',
      totalVolume: performance.activity.totalVolume.toFixed(2),
      currentPosition: performance.position.currentPosition.toFixed(8),
    };
  }
}
