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

    const result = await backtestRepo.findResultById(resultId, {
      includeTrades,
      includeEquity,
      includeStrategy: true,
    });

    if (!result) {
      return NextResponse.json({ error: 'Result not found' }, { status: 404 });
    }

    // Verify ownership through config -> user
    if (result.config?.user?.id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get trades and equity separately if requested
    let trades = result.trades || [];
    let equity = result.equity || [];

    if (includeTrades && !result.trades) {
      trades = await backtestRepo.getTrades(resultId, { limit: 1000 });
    }

    if (includeEquity && !result.equity) {
      equity = await backtestRepo.getEquityPoints(resultId);
    }

    // Serialize Decimal values
    const serialized = {
      ...result,
      totalReturn: result.totalReturn?.toString(),
      annualizedReturn: result.annualizedReturn?.toString(),
      sharpeRatio: result.sharpeRatio?.toString(),
      maxDrawdown: result.maxDrawdown?.toString(),
      winRate: result.winRate?.toString(),
      profitFactor: result.profitFactor?.toString(),
      trades: trades.map((t) => ({
        ...t,
        entryPrice: t.entryPrice?.toString(),
        exitPrice: t.exitPrice?.toString(),
        quantity: t.quantity?.toString(),
        pnl: t.pnl?.toString(),
        commission: t.commission?.toString(),
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

    if (result.config?.user?.id !== session.user.id) {
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
