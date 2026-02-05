/**
 * Performance Conversion Utilities
 *
 * Utilities to convert between StrategyPerformance (in-memory) and
 * StrategyPerformanceEntity (database) formats.
 */

import { Decimal } from 'decimal.js';
import { StrategyPerformance } from '@itrade/core';
import type { StrategyPerformanceEntity } from '../entities/StrategyPerformance';

const stripWrappedQuotes = (value: string): string => {
  let cleaned = value.trim();
  while (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
};

const toDecimal = (value: Decimal | number | string | null | undefined): Decimal => {
  if (Decimal.isDecimal(value)) {
    return value as Decimal;
  }

  if (value === null || value === undefined) {
    return new Decimal(0);
  }

  if (typeof value === 'string') {
    const cleaned = stripWrappedQuotes(value);
    if (cleaned === '') {
      return new Decimal(0);
    }
    return new Decimal(cleaned);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Decimal(value);
  }

  return new Decimal(0);
};

const toInteger = (value: number | string | null | undefined): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const cleaned = stripWrappedQuotes(value);
    const parsed = Number.parseInt(cleaned, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

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
  const longOrdersFilledCount = toInteger(performance.orders.long.filled.count);
  const longOrdersPendingCount = toInteger(performance.orders.long.pending.count);
  const longOrdersTotalCount = toInteger(performance.orders.long.total.count);
  const shortOrdersFilledCount = toInteger(performance.orders.short.filled.count);
  const shortOrdersPendingCount = toInteger(performance.orders.short.pending.count);
  const shortOrdersTotalCount = toInteger(performance.orders.short.total.count);
  const cancelledOrdersCount = toInteger(performance.orders.cancelled.count);
  const rejectedOrdersCount = toInteger(performance.orders.rejected.count);

  return {
    strategyId,

    // Order Metrics - Long
    longOrdersFilledCount,
    longOrdersFilledValue: toDecimal(performance.orders.long.filled.totalValue),
    longOrdersFilledQuantity: toDecimal(performance.orders.long.filled.totalQuantity),
    longOrdersFilledFees: toDecimal(performance.orders.long.filled.totalFees),
    longOrdersPendingCount,
    longOrdersPendingValue: toDecimal(performance.orders.long.pending.totalValue),
    longOrdersTotalCount,
    longOrdersTotalValue: toDecimal(performance.orders.long.total.totalValue),

    // Order Metrics - Short
    shortOrdersFilledCount,
    shortOrdersFilledValue: toDecimal(performance.orders.short.filled.totalValue),
    shortOrdersFilledQuantity: toDecimal(performance.orders.short.filled.totalQuantity),
    shortOrdersFilledFees: toDecimal(performance.orders.short.filled.totalFees),
    shortOrdersPendingCount,
    shortOrdersPendingValue: toDecimal(performance.orders.short.pending.totalValue),
    shortOrdersTotalCount,
    shortOrdersTotalValue: toDecimal(performance.orders.short.total.totalValue),

    // Order Metrics - Other
    cancelledOrdersCount,
    rejectedOrdersCount,
    totalOrders: longOrdersTotalCount + shortOrdersTotalCount,

    // PnL Metrics
    realizedPnL: toDecimal(performance.pnl.realizedPnL),
    unrealizedPnL: toDecimal(performance.pnl.unrealizedPnL),
    totalPnL: toDecimal(performance.pnl.totalPnL),
    totalFees: toDecimal(performance.pnl.totalFees),
    netPnL: toDecimal(performance.pnl.netPnL),
    roi: toDecimal(performance.pnl.roi),
    winRate: toDecimal(performance.pnl.winRate),
    profitFactor: toDecimal(performance.pnl.profitFactor),

    // Position Metrics
    currentPosition: toDecimal(performance.position.currentPosition),
    avgEntryPrice: toDecimal(performance.position.avgEntryPrice),
    currentPrice: toDecimal(performance.position.currentPrice),
    marketValue: toDecimal(performance.position.marketValue),
    positionSide: performance.position.side || 'flat',
    leverage: toDecimal(performance.position.leverage),

    // Activity Metrics
    totalTrades: toInteger(performance.activity.totalTrades),
    winningTrades: toInteger(performance.activity.winningTrades),
    losingTrades: toInteger(performance.activity.losingTrades),
    avgTradeSize: toDecimal(performance.activity.avgTradeSize),
    avgTradeValue: toDecimal(performance.activity.avgTradeValue),
    largestWin: toDecimal(performance.activity.largestWin),
    largestLoss: toDecimal(performance.activity.largestLoss),
    avgHoldingTime: toInteger(performance.activity.avgHoldingTime),
    totalVolume: toDecimal(performance.activity.totalVolume),

    // Symbol Statistics (first symbol only for now)
    boughtQuantity: toDecimal(performance.symbols[0]?.boughtQuantity),
    boughtValue: toDecimal(performance.symbols[0]?.boughtValue),
    soldQuantity: toDecimal(performance.symbols[0]?.soldQuantity),
    soldValue: toDecimal(performance.symbols[0]?.soldValue),
    netPosition: toDecimal(performance.symbols[0]?.netPosition),
    avgBuyPrice: toDecimal(performance.symbols[0]?.avgBuyPrice),
    avgSellPrice: toDecimal(performance.symbols[0]?.avgSellPrice),
    buyOrderCount: toInteger(performance.symbols[0]?.buyOrderCount),
    sellOrderCount: toInteger(performance.symbols[0]?.sellOrderCount),

    // Time Metrics
    startTime: performance.time.startTime,
    lastOrderTime: performance.time.lastOrderTime,
    lastSignalTime: performance.time.lastSignalTime,
    totalRuntime: toInteger(performance.time.totalRuntime),
    activeTradingTime: toInteger(performance.time.activeTradingTime),

    // Risk Metrics
    maxDrawdown: toDecimal(performance.risk.maxDrawdown),
    currentDrawdown: toDecimal(performance.risk.currentDrawdown),
    sharpeRatio: toDecimal(performance.risk.sharpeRatio),
    maxPositionSize: toDecimal(performance.risk.maxPositionSize),
    totalExposure: toDecimal(performance.risk.totalExposure),
    valueAtRisk: toDecimal(performance.risk.valueAtRisk),
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
