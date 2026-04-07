import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import { BacktestRepository } from '@itrade/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/backtest/results/[resultId] - Get detailed result with trades and equity
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resultId: string }> },
) {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { resultId: id } = await params;
    const resultId = parseInt(id, 10);

    if (isNaN(resultId)) {
      return NextResponse.json({ error: 'Invalid result ID' }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const includeTrades = searchParams.get('trades') === 'true';
    const includeEquity = searchParams.get('equity') === 'true';

    const dataManager = await getDataManager();
    const dataSource = dataManager.dataSource;
    const backtestRepo = new BacktestRepository(dataSource);

    // Fetch result WITHOUT trades/equity relations — joining all three large
    // tables in one query causes a cartesian product that times out.
    // Strategy + config + config.user is fast; trades and equity are fetched
    // via separate focused queries below.
    const result = await backtestRepo.findResultById(resultId, {
      includeTrades: false,
      includeEquity: false,
      includeStrategy: true,
    });

    if (!result) {
      return NextResponse.json({ error: 'Result not found' }, { status: 404 });
    }

    // Verify ownership: load config with user relation explicitly.
    const config = result.config?.id
      ? await backtestRepo.findConfigById(result.config.id)
      : null;
    if (!config || config.user?.id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Fetch trades and equity via dedicated queries (no cartesian product).
    const [trades, equity] = await Promise.all([
      includeTrades
        ? backtestRepo.getTrades(resultId, { limit: 10000 })
        : Promise.resolve([]),
      includeEquity ? backtestRepo.getEquityPoints(resultId) : Promise.resolve([]),
    ]);

    // Serialize Decimal values
    const serialized = {
      ...result,
      totalReturn: result.totalReturn?.toString(),
      annualizedReturn: result.annualizedReturn?.toString(),
      sharpeRatio: result.sharpeRatio?.toString(),
      maxDrawdown: result.maxDrawdown?.toString(),
      winRate: result.winRate?.toString(),
      profitFactor: result.profitFactor?.toString(),
      // Sort trades chronologically (entryTime ASC) for a natural display order
      trades: [...trades]
        .sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime())
        .map((t) => ({
          ...t,
          entryPrice: t.entryPrice?.toString(),
          exitPrice: t.exitPrice?.toString(),
          quantity: t.quantity?.toString(),
          pnl: t.pnl?.toString(),
          commission: t.commission?.toString(),
          entryCashBalance: t.entryCashBalance?.toString() ?? null,
          entryPositionSize: t.entryPositionSize?.toString() ?? null,
          cashBalance: t.cashBalance?.toString() ?? null,
          positionSize: t.positionSize?.toString() ?? null,
        })),
      equity: equity.map((e) => ({
        timestamp: e.timestamp,
        value: e.value?.toString(),
      })),
      config: result.config
        ? {
            ...result.config,
            initialBalance: result.config.initialBalance?.toString(),
            commission: result.config.commission?.toString(),
            slippage: result.config.slippage?.toString(),
          }
        : undefined,
    };

    return NextResponse.json({ result: serialized });
  } catch (error) {
    console.error('Error fetching backtest result:', error);
    return NextResponse.json(
      { error: 'Failed to fetch backtest result' },
      { status: 500 },
    );
  }
}

// DELETE /api/backtest/results/[resultId] - Delete a specific result
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ resultId: string }> },
) {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { resultId: id } = await params;
    const resultId = parseInt(id, 10);

    if (isNaN(resultId)) {
      return NextResponse.json({ error: 'Invalid result ID' }, { status: 400 });
    }

    const dataManager = await getDataManager();
    const dataSource = dataManager.dataSource;
    const backtestRepo = new BacktestRepository(dataSource);

    // Verify result exists and user owns it
    const result = await backtestRepo.findResultById(resultId);
    if (!result) {
      return NextResponse.json({ error: 'Result not found' }, { status: 404 });
    }

    const config = result.config?.id
      ? await backtestRepo.findConfigById(result.config.id)
      : null;
    if (!config || config.user?.id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await backtestRepo.deleteResult(resultId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting backtest result:', error);
    return NextResponse.json(
      { error: 'Failed to delete backtest result' },
      { status: 500 },
    );
  }
}
