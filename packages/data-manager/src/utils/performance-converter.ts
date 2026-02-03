/**
 * Performance Conversion Utilities
 *
 * Utilities to convert between StrategyPerformance (in-memory) and
 * StrategyPerformanceEntity (database) formats.
 */

import { Decimal } from 'decimal.js';
import { StrategyPerformance } from '@itrade/core';
import type { StrategyPerformanceEntity } from '../entities/StrategyPerformance';

/**
 * Convert StrategyPerformance to StrategyPerformanceEntity
 * for database storage
 */
export function performanceToEntity(
  performance: StrategyPerformance,
  strategyId: number,
): Omit<
  Partial<StrategyPerformanceEntity>,
  'id' | 'strategy' | 'createdAt' | 'updatedAt'
> {
  return {
    strategyId,

    // Order Metrics - Long
    longOrdersFilledCount: performance.orders.long.filled.count,
    longOrdersFilledValue: performance.orders.long.filled.totalValue,
    longOrdersFilledQuantity: performance.orders.long.filled.totalQuantity,
    longOrdersFilledFees: performance.orders.long.filled.totalFees,
    longOrdersPendingCount: performance.orders.long.pending.count,
    longOrdersPendingValue: performance.orders.long.pending.totalValue,
    longOrdersTotalCount: performance.orders.long.total.count,
    longOrdersTotalValue: performance.orders.long.total.totalValue,

    // Order Metrics - Short
    shortOrdersFilledCount: performance.orders.short.filled.count,
    shortOrdersFilledValue: performance.orders.short.filled.totalValue,
    shortOrdersFilledQuantity: performance.orders.short.filled.totalQuantity,
    shortOrdersFilledFees: performance.orders.short.filled.totalFees,
    shortOrdersPendingCount: performance.orders.short.pending.count,
    shortOrdersPendingValue: performance.orders.short.pending.totalValue,
    shortOrdersTotalCount: performance.orders.short.total.count,
    shortOrdersTotalValue: performance.orders.short.total.totalValue,

    // Order Metrics - Other
    cancelledOrdersCount: performance.orders.cancelled.count,
    rejectedOrdersCount: performance.orders.rejected.count,
    totalOrders:
      performance.orders.long.total.count + performance.orders.short.total.count,

    // PnL Metrics
    realizedPnL: performance.pnl.realizedPnL,
    unrealizedPnL: performance.pnl.unrealizedPnL,
    totalPnL: performance.pnl.totalPnL,
    totalFees: performance.pnl.totalFees,
    netPnL: performance.pnl.netPnL,
    roi: performance.pnl.roi,
    winRate: performance.pnl.winRate,
    profitFactor: performance.pnl.profitFactor,

    // Position Metrics
    currentPosition: performance.position.currentPosition,
    avgEntryPrice: performance.position.avgEntryPrice,
    currentPrice: performance.position.currentPrice,
    marketValue: performance.position.marketValue,
    positionSide: performance.position.side,
    leverage: performance.position.leverage,

    // Activity Metrics
    totalTrades: performance.activity.totalTrades,
    winningTrades: performance.activity.winningTrades,
    losingTrades: performance.activity.losingTrades,
    avgTradeSize: performance.activity.avgTradeSize,
    avgTradeValue: performance.activity.avgTradeValue,
    largestWin: performance.activity.largestWin,
    largestLoss: performance.activity.largestLoss,
    avgHoldingTime: performance.activity.avgHoldingTime,
    totalVolume: performance.activity.totalVolume,

    // Symbol Statistics (first symbol only for now)
    boughtQuantity: performance.symbols[0]?.boughtQuantity || new Decimal(0),
    boughtValue: performance.symbols[0]?.boughtValue || new Decimal(0),
    soldQuantity: performance.symbols[0]?.soldQuantity || new Decimal(0),
    soldValue: performance.symbols[0]?.soldValue || new Decimal(0),
    netPosition: performance.symbols[0]?.netPosition || new Decimal(0),
    avgBuyPrice: performance.symbols[0]?.avgBuyPrice || new Decimal(0),
    avgSellPrice: performance.symbols[0]?.avgSellPrice || new Decimal(0),
    buyOrderCount: performance.symbols[0]?.buyOrderCount || 0,
    sellOrderCount: performance.symbols[0]?.sellOrderCount || 0,

    // Time Metrics
    startTime: performance.time.startTime,
    lastOrderTime: performance.time.lastOrderTime,
    lastSignalTime: performance.time.lastSignalTime,
    totalRuntime: performance.time.totalRuntime,
    activeTradingTime: performance.time.activeTradingTime,

    // Risk Metrics
    maxDrawdown: performance.risk.maxDrawdown,
    currentDrawdown: performance.risk.currentDrawdown,
    sharpeRatio: performance.risk.sharpeRatio,
    maxPositionSize: performance.risk.maxPositionSize,
    totalExposure: performance.risk.totalExposure,
    valueAtRisk: performance.risk.valueAtRisk,
  };
}

/**
 * Convert StrategyPerformanceEntity to StrategyPerformance
 * for in-memory use
 */
export function entityToPerformance(
  entity: StrategyPerformanceEntity,
  symbol: string,
  exchange: string,
): StrategyPerformance {
  return {
    strategyId: entity.strategyId,
    strategyName: undefined, // Will be set from strategy entity if needed
    symbol,
    exchange,

    orders: {
      long: {
        filled: {
          count: entity.longOrdersFilledCount,
          totalValue: entity.longOrdersFilledValue,
          totalQuantity: entity.longOrdersFilledQuantity,
          totalFees: entity.longOrdersFilledFees,
        },
        pending: {
          count: entity.longOrdersPendingCount,
          totalValue: entity.longOrdersPendingValue,
          totalQuantity: new Decimal(0), // Not stored separately
          totalFees: new Decimal(0),
        },
        total: {
          count: entity.longOrdersTotalCount,
          totalValue: entity.longOrdersTotalValue,
          totalQuantity: new Decimal(0), // Not stored separately
          totalFees: new Decimal(0),
        },
      },
      short: {
        filled: {
          count: entity.shortOrdersFilledCount,
          totalValue: entity.shortOrdersFilledValue,
          totalQuantity: entity.shortOrdersFilledQuantity,
          totalFees: entity.shortOrdersFilledFees,
        },
        pending: {
          count: entity.shortOrdersPendingCount,
          totalValue: entity.shortOrdersPendingValue,
          totalQuantity: new Decimal(0),
          totalFees: new Decimal(0),
        },
        total: {
          count: entity.shortOrdersTotalCount,
          totalValue: entity.shortOrdersTotalValue,
          totalQuantity: new Decimal(0),
          totalFees: new Decimal(0),
        },
      },
      cancelled: {
        count: entity.cancelledOrdersCount,
        totalValue: new Decimal(0),
        totalQuantity: new Decimal(0),
        totalFees: new Decimal(0),
      },
      rejected: {
        count: entity.rejectedOrdersCount,
        totalValue: new Decimal(0),
        totalQuantity: new Decimal(0),
        totalFees: new Decimal(0),
      },
    },

    symbols: [
      {
        symbol,
        boughtQuantity: entity.boughtQuantity,
        boughtValue: entity.boughtValue,
        soldQuantity: entity.soldQuantity,
        soldValue: entity.soldValue,
        netPosition: entity.netPosition,
        avgBuyPrice: entity.avgBuyPrice,
        avgSellPrice: entity.avgSellPrice,
        buyOrderCount: entity.buyOrderCount,
        sellOrderCount: entity.sellOrderCount,
      },
    ],

    pnl: {
      realizedPnL: entity.realizedPnL,
      unrealizedPnL: entity.unrealizedPnL,
      totalPnL: entity.totalPnL,
      totalFees: entity.totalFees,
      netPnL: entity.netPnL,
      roi: entity.roi,
      winRate: entity.winRate,
      profitFactor: entity.profitFactor,
    },

    position: {
      currentPosition: entity.currentPosition,
      avgEntryPrice: entity.avgEntryPrice,
      currentPrice: entity.currentPrice,
      marketValue: entity.marketValue,
      unrealizedPnL: entity.unrealizedPnL,
      side: entity.positionSide,
      leverage: entity.leverage,
    },

    activity: {
      totalTrades: entity.totalTrades,
      winningTrades: entity.winningTrades,
      losingTrades: entity.losingTrades,
      avgTradeSize: entity.avgTradeSize,
      avgTradeValue: entity.avgTradeValue,
      largestWin: entity.largestWin,
      largestLoss: entity.largestLoss,
      avgHoldingTime: entity.avgHoldingTime,
      totalVolume: entity.totalVolume,
    },

    time: {
      startTime: entity.startTime,
      lastUpdateTime: entity.updatedAt,
      lastOrderTime: entity.lastOrderTime,
      lastSignalTime: entity.lastSignalTime,
      totalRuntime: entity.totalRuntime,
      activeTradingTime: entity.activeTradingTime,
    },

    risk: {
      maxDrawdown: entity.maxDrawdown,
      currentDrawdown: entity.currentDrawdown,
      sharpeRatio: entity.sharpeRatio,
      maxPositionSize: entity.maxPositionSize,
      totalExposure: entity.totalExposure,
      valueAtRisk: entity.valueAtRisk,
    },

    metadata: {},
  };
}
