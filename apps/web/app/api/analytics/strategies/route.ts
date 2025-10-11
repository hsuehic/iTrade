import { NextResponse } from 'next/server';

import { getDataManager } from '@/lib/data-manager';

/**
 * GET /api/analytics/strategies - 获取策略分析数据
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');

    const dm = await getDataManager();
    const strategyRepo = dm.getStrategyRepository();

    // Get all strategies with performance data
    const strategies = await strategyRepo.findAll();

    // Calculate performance for each strategy
    const strategyStats = await Promise.all(
      strategies.map(async (strategy) => {
        const pnl = await dm.getStrategyPnL(strategy.id);

        return {
          id: strategy.id,
          name: strategy.name,
          symbol: strategy.symbol,
          normalizedSymbol: strategy.normalizedSymbol,
          exchange: strategy.exchange,
          status: strategy.status,
          type: strategy.type,
          marketType: strategy.marketType,
          totalPnl: pnl.totalPnl || 0,
          realizedPnl: pnl.realizedPnl || 0,
          unrealizedPnl: pnl.unrealizedPnl || 0,
          totalOrders: pnl.totalOrders || 0,
          filledOrders: pnl.filledOrders || 0,
          fillRate:
            pnl.totalOrders > 0
              ? ((pnl.filledOrders / pnl.totalOrders) * 100).toFixed(2)
              : '0.00',
          // TODO: Add initialCapital field to StrategyEntity to calculate ROI
          // roi: strategy.initialCapital && strategy.initialCapital > 0
          //   ? ((pnl.totalPnl / strategy.initialCapital) * 100).toFixed(2)
          //   : '0.00',
          createdAt: strategy.createdAt,
          updatedAt: strategy.updatedAt,
        };
      })
    );

    // Sort by PnL
    const topPerformers = [...strategyStats]
      .sort((a, b) => b.totalPnl - a.totalPnl)
      .slice(0, limit);

    // Calculate summary statistics
    const activeStrategies = strategyStats.filter(
      (s) => s.status === 'active'
    ).length;
    const totalPnl = strategyStats.reduce((sum, s) => sum + s.totalPnl, 0);
    const totalOrders = strategyStats.reduce(
      (sum, s) => sum + s.totalOrders,
      0
    );
    const totalFilledOrders = strategyStats.reduce(
      (sum, s) => sum + s.filledOrders,
      0
    );

    interface ExchangeGroup {
      exchange: string;
      count: number;
      totalPnl: number;
      activeCount: number;
    }

    // Group by exchange
    const byExchange = strategyStats.reduce(
      (acc: Record<string, ExchangeGroup>, s) => {
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
      },
      {}
    );

    interface SymbolGroup {
      symbol: string;
      normalizedSymbol?: string;
      marketType: string;
      count: number;
      totalPnl: number;
      activeCount: number;
    }

    // Group by symbol
    const bySymbol = strategyStats.reduce(
      (acc: Record<string, SymbolGroup>, s) => {
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
      },
      {}
    );

    return NextResponse.json({
      summary: {
        total: strategyStats.length,
        active: activeStrategies,
        inactive: strategyStats.length - activeStrategies,
        totalPnl,
        totalOrders,
        totalFilledOrders,
        avgFillRate:
          totalOrders > 0
            ? ((totalFilledOrders / totalOrders) * 100).toFixed(2)
            : '0.00',
      },
      topPerformers,
      byExchange: Object.values(byExchange).sort(
        (a: ExchangeGroup, b: ExchangeGroup) => b.totalPnl - a.totalPnl
      ),
      bySymbol: Object.values(bySymbol).sort(
        (a: SymbolGroup, b: SymbolGroup) => b.totalPnl - a.totalPnl
      ),
      allStrategies: strategyStats,
    });
  } catch (error) {
    console.error('Strategy analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch strategy analytics' },
      { status: 500 }
    );
  }
}
