/**
 * 📊 Strategy Performance Tracking System
 *
 * This module defines comprehensive performance metrics for trading strategies.
 * Performance data is tracked in real-time and persisted to the database.
 */

import { Decimal } from 'decimal.js';

/**
 * Order statistics by status
 */
export interface OrderStatistics {
  /** Total count of orders in this category */
  count: number;
  /** Total value (quantity * price) of orders */
  totalValue: Decimal;
  /** Total quantity across all orders */
  totalQuantity: Decimal;
  /** Total fees paid for these orders */
  totalFees: Decimal;
}

/**
 * Detailed order metrics broken down by type and status
 */
export interface OrderMetrics {
  /** Long (BUY) orders */
  long: {
    /** Filled long orders */
    filled: OrderStatistics;
    /** Pending long orders (NEW, PARTIALLY_FILLED) */
    pending: OrderStatistics;
    /** Total long orders (filled + pending + cancelled) */
    total: OrderStatistics;
  };

  /** Short (SELL) orders */
  short: {
    /** Filled short orders */
    filled: OrderStatistics;
    /** Pending short orders (NEW, PARTIALLY_FILLED) */
    pending: OrderStatistics;
    /** Total short orders (filled + pending + cancelled) */
    total: OrderStatistics;
  };

  /** Cancelled orders (both long and short) */
  cancelled: OrderStatistics;

  /** Rejected orders (both long and short) */
  rejected: OrderStatistics;
}

/**
 * Symbol/Token trading statistics
 */
export interface SymbolStatistics {
  /** Symbol identifier (e.g., "BTC/USDT") */
  symbol: string;
  /** Total quantity bought */
  boughtQuantity: Decimal;
  /** Total value of bought orders */
  boughtValue: Decimal;
  /** Total quantity sold */
  soldQuantity: Decimal;
  /** Total value of sold orders */
  soldValue: Decimal;
  /** Net position (bought - sold) */
  netPosition: Decimal;
  /** Average buy price */
  avgBuyPrice: Decimal;
  /** Average sell price */
  avgSellPrice: Decimal;
  /** Number of buy orders */
  buyOrderCount: number;
  /** Number of sell orders */
  sellOrderCount: number;
}

/**
 * Profit and Loss metrics
 */
export interface PnLMetrics {
  /** Realized profit/loss from closed positions */
  realizedPnL: Decimal;
  /** Unrealized profit/loss from open positions */
  unrealizedPnL: Decimal;
  /** Total PnL (realized + unrealized) */
  totalPnL: Decimal;
  /** Total fees paid across all orders */
  totalFees: Decimal;
  /** Net PnL after fees */
  netPnL: Decimal;
  /** Return on investment (%) */
  roi: Decimal;
  /** Win rate (%) - percentage of profitable trades */
  winRate: Decimal;
  /** Profit factor - ratio of gross profit to gross loss */
  profitFactor: Decimal;
}

/**
 * Position tracking metrics
 */
export interface PositionMetrics {
  /** Current open position quantity */
  currentPosition: Decimal;
  /** Average entry price for current position */
  avgEntryPrice: Decimal;
  /** Current market price */
  currentPrice: Decimal;
  /** Market value of current position */
  marketValue: Decimal;
  /** Unrealized PnL on current position */
  unrealizedPnL: Decimal;
  /** Position side (long/short/flat) */
  side: 'long' | 'short' | 'flat';
  /** Leverage used (1 for spot trading) */
  leverage: Decimal;
}

/**
 * Trading activity metrics
 */
export interface ActivityMetrics {
  /** Total number of trades executed */
  totalTrades: number;
  /** Number of winning trades */
  winningTrades: number;
  /** Number of losing trades */
  losingTrades: number;
  /** Average trade size (quantity) */
  avgTradeSize: Decimal;
  /** Average trade value (in quote currency) */
  avgTradeValue: Decimal;
  /** Largest winning trade */
  largestWin: Decimal;
  /** Largest losing trade */
  largestLoss: Decimal;
  /** Average holding time (in seconds) */
  avgHoldingTime: number;
  /** Total trading volume (sum of all order values) */
  totalVolume: Decimal;
}

/**
 * Time-based performance tracking
 */
export interface TimeMetrics {
  /** Strategy start time */
  startTime: Date;
  /** Last update time */
  lastUpdateTime: Date;
  /** Last order execution time */
  lastOrderTime?: Date;
  /** Last signal generation time */
  lastSignalTime?: Date;
  /** Total runtime in seconds */
  totalRuntime: number;
  /** Active trading time (excluding pauses) in seconds */
  activeTradingTime: number;
}

/**
 * Risk metrics
 */
export interface RiskMetrics {
  /** Maximum drawdown (%) */
  maxDrawdown: Decimal;
  /** Current drawdown (%) */
  currentDrawdown: Decimal;
  /** Sharpe ratio (risk-adjusted return) */
  sharpeRatio: Decimal;
  /** Maximum position size reached */
  maxPositionSize: Decimal;
  /** Total exposure (sum of open position values) */
  totalExposure: Decimal;
  /** Value at Risk (VaR) - estimated maximum loss */
  valueAtRisk: Decimal;
}

/**
 * 🎯 Complete Strategy Performance Metrics
 *
 * This is the main interface that aggregates all performance data.
 * It provides a comprehensive view of strategy performance and is
 * used throughout the system for tracking, reporting, and analysis.
 */
export interface StrategyPerformance {
  /** Strategy identifier */
  strategyId?: number;

  /** Strategy name */
  strategyName?: string;

  /** Symbol being traded */
  symbol: string;

  /** Exchange name */
  exchange: string;

  /** Order metrics (long/short, filled/pending) */
  orders: OrderMetrics;

  /** Symbol/token trading statistics */
  symbols: SymbolStatistics[];

  /** Profit and loss metrics */
  pnl: PnLMetrics;

  /** Current position metrics */
  position: PositionMetrics;

  /** Trading activity metrics */
  activity: ActivityMetrics;

  /** Time-based metrics */
  time: TimeMetrics;

  /** Risk metrics */
  risk: RiskMetrics;

  /** Custom metadata (strategy-specific) */
  metadata?: Record<string, unknown>;
}

/**
 * Factory function to create an empty StrategyPerformance object
 * with all metrics initialized to zero/default values
 */
export function createEmptyPerformance(
  symbol: string,
  exchange: string,
  strategyId?: number,
  strategyName?: string,
): StrategyPerformance {
  const now = new Date();
  const zero = new Decimal(0);

  return {
    strategyId,
    strategyName,
    symbol,
    exchange,

    orders: {
      long: {
        filled: {
          count: 0,
          totalValue: zero,
          totalQuantity: zero,
          totalFees: zero,
        },
        pending: {
          count: 0,
          totalValue: zero,
          totalQuantity: zero,
          totalFees: zero,
        },
        total: {
          count: 0,
          totalValue: zero,
          totalQuantity: zero,
          totalFees: zero,
        },
      },
      short: {
        filled: {
          count: 0,
          totalValue: zero,
          totalQuantity: zero,
          totalFees: zero,
        },
        pending: {
          count: 0,
          totalValue: zero,
          totalQuantity: zero,
          totalFees: zero,
        },
        total: {
          count: 0,
          totalValue: zero,
          totalQuantity: zero,
          totalFees: zero,
        },
      },
      cancelled: {
        count: 0,
        totalValue: zero,
        totalQuantity: zero,
        totalFees: zero,
      },
      rejected: {
        count: 0,
        totalValue: zero,
        totalQuantity: zero,
        totalFees: zero,
      },
    },

    symbols: [
      {
        symbol,
        boughtQuantity: zero,
        boughtValue: zero,
        soldQuantity: zero,
        soldValue: zero,
        netPosition: zero,
        avgBuyPrice: zero,
        avgSellPrice: zero,
        buyOrderCount: 0,
        sellOrderCount: 0,
      },
    ],

    pnl: {
      realizedPnL: zero,
      unrealizedPnL: zero,
      totalPnL: zero,
      totalFees: zero,
      netPnL: zero,
      roi: zero,
      winRate: zero,
      profitFactor: zero,
    },

    position: {
      currentPosition: zero,
      avgEntryPrice: zero,
      currentPrice: zero,
      marketValue: zero,
      unrealizedPnL: zero,
      side: 'flat',
      leverage: new Decimal(1),
    },

    activity: {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      avgTradeSize: zero,
      avgTradeValue: zero,
      largestWin: zero,
      largestLoss: zero,
      avgHoldingTime: 0,
      totalVolume: zero,
    },

    time: {
      startTime: now,
      lastUpdateTime: now,
      totalRuntime: 0,
      activeTradingTime: 0,
    },

    risk: {
      maxDrawdown: zero,
      currentDrawdown: zero,
      sharpeRatio: zero,
      maxPositionSize: zero,
      totalExposure: zero,
      valueAtRisk: zero,
    },

    metadata: {},
  };
}

/**
 * Serializable version of StrategyPerformance for database storage
 * Converts Decimal to string for JSON serialization
 */
export interface StrategyPerformanceJSON {
  strategyId?: number;
  strategyName?: string;
  symbol: string;
  exchange: string;
  orders: any; // Simplified for JSON
  symbols: any[]; // Simplified for JSON
  pnl: any; // Simplified for JSON
  position: any; // Simplified for JSON
  activity: any; // Simplified for JSON
  time: {
    startTime: string;
    lastUpdateTime: string;
    lastOrderTime?: string;
    lastSignalTime?: string;
    totalRuntime: number;
    activeTradingTime: number;
  };
  risk: any; // Simplified for JSON
  metadata?: Record<string, unknown>;
}

/**
 * Convert StrategyPerformance to JSON-serializable format
 */
export function performanceToJSON(perf: StrategyPerformance): StrategyPerformanceJSON {
  return {
    strategyId: perf.strategyId,
    strategyName: perf.strategyName,
    symbol: perf.symbol,
    exchange: perf.exchange,
    orders: JSON.parse(
      JSON.stringify(perf.orders, (_, v) => (v instanceof Decimal ? v.toString() : v)),
    ),
    symbols: JSON.parse(
      JSON.stringify(perf.symbols, (_, v) => (v instanceof Decimal ? v.toString() : v)),
    ),
    pnl: JSON.parse(
      JSON.stringify(perf.pnl, (_, v) => (v instanceof Decimal ? v.toString() : v)),
    ),
    position: JSON.parse(
      JSON.stringify(perf.position, (_, v) => (v instanceof Decimal ? v.toString() : v)),
    ),
    activity: JSON.parse(
      JSON.stringify(perf.activity, (_, v) => (v instanceof Decimal ? v.toString() : v)),
    ),
    time: {
      startTime: perf.time.startTime.toISOString(),
      lastUpdateTime: perf.time.lastUpdateTime.toISOString(),
      lastOrderTime: perf.time.lastOrderTime?.toISOString(),
      lastSignalTime: perf.time.lastSignalTime?.toISOString(),
      totalRuntime: perf.time.totalRuntime,
      activeTradingTime: perf.time.activeTradingTime,
    },
    risk: JSON.parse(
      JSON.stringify(perf.risk, (_, v) => (v instanceof Decimal ? v.toString() : v)),
    ),
    metadata: perf.metadata,
  };
}
