import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import {
  DryRunSessionRepository,
  StrategyRepository,
  DryRunStatus,
} from '@itrade/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/dry-run - List all dry run sessions for current user
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as DryRunStatus | null;
    const strategyId = searchParams.get('strategyId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const dataManager = await getDataManager();
    const dataSource = dataManager.dataSource;
    const dryRunRepo = new DryRunSessionRepository(dataSource);

    const sessions = await dryRunRepo.findWithStats(
      {
        userId: session.user.id,
        status: status || undefined,
        strategyId: strategyId ? parseInt(strategyId, 10) : undefined,
      },
      { limit, offset },
    );

    const total = await dryRunRepo.count({
      userId: session.user.id,
      status: status || undefined,
    });

    // Serialize Decimal values to strings for JSON response
    const serializedSessions = sessions.map((s) => ({
      ...s,
      initialBalance: s.initialBalance?.toString(),
      commission: s.commission?.toString(),
      slippage: s.slippage?.toString(),
      totalPnL: s.totalPnL?.toString(),
      latestResult: s.latestResult
        ? {
            ...s.latestResult,
            totalReturn: s.latestResult.totalReturn?.toString(),
            annualizedReturn: s.latestResult.annualizedReturn?.toString(),
            sharpeRatio: s.latestResult.sharpeRatio?.toString(),
            maxDrawdown: s.latestResult.maxDrawdown?.toString(),
            winRate: s.latestResult.winRate?.toString(),
            profitFactor: s.latestResult.profitFactor?.toString(),
          }
        : undefined,
    }));

    return NextResponse.json({
      sessions: serializedSessions,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching dry run sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dry run sessions' },
      { status: 500 },
    );
  }
}

// POST /api/dry-run - Create a new dry run session
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      strategyId,
      name,
      symbols,
      timeframe,
      initialBalance,
      commission,
      slippage,
      notes,
    } = body;

    // Validation
    if (!initialBalance) {
      return NextResponse.json({ error: 'Initial balance is required' }, { status: 400 });
    }

    const dataManager = await getDataManager();
    const dataSource = dataManager.dataSource;
    const dryRunRepo = new DryRunSessionRepository(dataSource);

    // If strategyId is provided, fetch strategy parameters snapshot
    let parametersSnapshot: Record<string, unknown> | undefined;
    let strategySymbols: string[] | undefined;
    let strategyName: string | undefined;

    if (strategyId) {
      const strategyRepo = new StrategyRepository(dataSource);
      const strategy = await strategyRepo.findById(strategyId);

      if (!strategy) {
        return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
      }

      // Verify ownership
      if (strategy.userId !== session.user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      parametersSnapshot = {
        type: strategy.type,
        parameters: strategy.parameters,
        exchange: strategy.exchange,
        symbol: strategy.symbol,
        subscription: strategy.subscription,
        initialDataConfig: strategy.initialDataConfig,
      };
      strategySymbols = strategy.symbol ? [strategy.symbol] : undefined;
      strategyName = strategy.name;
    }

    const created = await dryRunRepo.create({
      strategyId,
      name: name || strategyName || `Dry Run ${new Date().toLocaleDateString()}`,
      parametersSnapshot,
      symbols: symbols || strategySymbols,
      timeframe: timeframe || '1h',
      initialBalance,
      commission: commission || 0.001, // Default 0.1%
      slippage: slippage || 0.0005, // Default 0.05%
      notes,
      userId: session.user.id,
    });

    return NextResponse.json({
      session: {
        ...created,
        initialBalance: created.initialBalance?.toString(),
        commission: created.commission?.toString(),
        slippage: created.slippage?.toString(),
      },
    });
  } catch (error) {
    console.error('Error creating dry run session:', error);
    return NextResponse.json(
      { error: 'Failed to create dry run session' },
      { status: 500 },
    );
  }
}
