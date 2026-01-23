import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import { BacktestRepository } from '@itrade/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/backtest/[id]/results - Get all results for a backtest config
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const configId = parseInt(id, 10);

    if (isNaN(configId)) {
      return NextResponse.json({ error: 'Invalid config ID' }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const dataManager = await getDataManager();
    const dataSource = dataManager.dataSource;
    const backtestRepo = new BacktestRepository(dataSource);

    // Verify config exists and user owns it
    const config = await backtestRepo.findConfigById(configId);
    if (!config) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    if (config.user?.id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const results = await backtestRepo.findResults(
      { configId },
      { limit, offset, includeStrategy: true },
    );

    const total = await backtestRepo.countResults(configId);

    // Serialize Decimal values
    const serializedResults = results.map((r) => ({
      ...r,
      totalReturn: r.totalReturn?.toString(),
      annualizedReturn: r.annualizedReturn?.toString(),
      sharpeRatio: r.sharpeRatio?.toString(),
      maxDrawdown: r.maxDrawdown?.toString(),
      winRate: r.winRate?.toString(),
      profitFactor: r.profitFactor?.toString(),
    }));

    return NextResponse.json({
      results: serializedResults,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching backtest results:', error);
    return NextResponse.json(
      { error: 'Failed to fetch backtest results' },
      { status: 500 },
    );
  }
}
