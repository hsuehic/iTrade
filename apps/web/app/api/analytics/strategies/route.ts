import { NextResponse } from 'next/server';

import {
  analyticsCacheKey,
  getAnalyticsCached,
  setAnalyticsCached,
} from '@/lib/analytics-cache';
import { getDataManager } from '@/lib/data-manager';
import { getSession } from '@/lib/auth';

export interface ExchangeGroup {
  exchange: string;
  count: number;
  totalPnl: number;
  activeCount: number;
}

interface SymbolGroup {
  symbol: string;
  normalizedSymbol?: string;
  marketType: string;
  count: number;
  totalPnl: number;
  activeCount: number;
}

interface StrategiesResponse {
  summary: {
    total: number;
    active: number;
    inactive: number;
    totalPnl: number;
    totalRealizedPnl: number;
    totalOrders: number;
    totalFilledOrders: number;
    avgFillRate: string;
  };
  topPerformers: unknown[];
  byExchange: ExchangeGroup[];
  bySymbol: SymbolGroup[];
  allStrategies: unknown[];
}

/**
 * GET /api/analytics/strategies - 获取策略分析数据
 */
export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');

    const cacheKey = analyticsCacheKey('strategies', session.user.id, {
      limit: String(limit),
    });
    const cached = getAnalyticsCached<StrategiesResponse>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const dm = await getDataManager();
    const strategyRepo = dm.getStrategyRepository();

    // Fetch strategy metadata and PnL in two queries (not N+1 per strategy)
    const [strategies, overallPnl] = await Promise.all([
      strategyRepo.findAll({ userId: session.user.id }),
      dm.getOverallPnL(session.user.id),
    ]);

    const pnlByStrategyId = new Map(overallPnl.strategies.map((s) => [s.strategyId, s]));

    const strategyStats = strategies.map((strategy) => {
      const pnl = pnlByStrategyId.get(strategy.id);
      const totalOrders = pnl?.totalOrders ?? 0;
      const filledOrders = pnl?.filledOrders ?? 0;

      return {
        id: strategy.id,
        name: strategy.name,
        symbol: strategy.symbol,
        normalizedSymbol: strategy.normalizedSymbol,
        exchange: strategy.exchange,
        status: strategy.status,
        type: strategy.type,
        marketType: strategy.marketType,
        totalPnl: pnl?.pnl ?? 0,
        realizedPnl: pnl?.realizedPnl ?? 0,
        unrealizedPnl: pnl?.unrealizedPnl ?? 0,
        totalOrders,
        filledOrders,
        fillRate:
          totalOrders > 0 ? ((filledOrders / totalOrders) * 100).toFixed(2) : '0.00',
        createdAt: strategy.createdAt,
        updatedAt: strategy.updatedAt,
      };
    });

    // Sort by PnL
    const topPerformers = [...strategyStats]
      .sort((a, b) => b.totalPnl - a.totalPnl)
      .slice(0, limit);

    // Calculate summary statistics
    const activeStrategies = strategyStats.filter((s) => s.status === 'active').length;
    const totalPnl = strategyStats.reduce((sum, s) => sum + s.totalPnl, 0);
    const totalOrders = strategyStats.reduce((sum, s) => sum + s.totalOrders, 0);
    const totalFilledOrders = strategyStats.reduce((sum, s) => sum + s.filledOrders, 0);

    const totalRealizedPnl = strategyStats.reduce((sum, s) => sum + s.realizedPnl, 0);

    // Group by exchange
    const byExchange = strategyStats.reduce((acc: Record<string, ExchangeGroup>, s) => {
      const exchange = s.exchange || 'unknown';
      if (!acc[exchange]) {
        acc[exchange] = {
          exchange,
          count: 0,
          totalPnl: 0,
          activeCount: 0,
        };
      }
      acc[exchange].count++;
      acc[exchange].totalPnl += s.totalPnl;
      if (s.status === 'active') {
        acc[exchange].activeCount++;
      }
      return acc;
    }, {});

    // Group by symbol
    const bySymbol = strategyStats.reduce((acc: Record<string, SymbolGroup>, s) => {
      const symbol = s.symbol || 'unknown';
      if (!acc[symbol]) {
        acc[symbol] = {
          symbol,
          normalizedSymbol: s.normalizedSymbol,
          marketType: s.marketType,
          count: 0,
          totalPnl: 0,
          activeCount: 0,
        };
      }
      acc[symbol].count++;
      acc[symbol].totalPnl += s.totalPnl;
      if (s.status === 'active') {
        acc[symbol].activeCount++;
      }
      return acc;
    }, {});

    const response: StrategiesResponse = {
      summary: {
        total: strategyStats.length,
        active: activeStrategies,
        inactive: strategyStats.length - activeStrategies,
        totalPnl,
        totalRealizedPnl,
        totalOrders,
        totalFilledOrders,
        avgFillRate:
          totalOrders > 0 ? ((totalFilledOrders / totalOrders) * 100).toFixed(2) : '0.00',
      },
      topPerformers,
      byExchange: Object.values(byExchange).sort(
        (a: ExchangeGroup, b: ExchangeGroup) => b.totalPnl - a.totalPnl,
      ),
      bySymbol: Object.values(bySymbol).sort(
        (a: SymbolGroup, b: SymbolGroup) => b.totalPnl - a.totalPnl,
      ),
      allStrategies: strategyStats,
    };

    setAnalyticsCached(cacheKey, response);
    return NextResponse.json(response);
  } catch (error) {
    console.error('Strategy analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch strategy analytics' },
      { status: 500 },
    );
  }
}
