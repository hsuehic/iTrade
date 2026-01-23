import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import { BacktestRepository } from '@itrade/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/backtest - List all backtest configs for current user
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const dataManager = await getDataManager();
    const dataSource = dataManager.dataSource;
    const backtestRepo = new BacktestRepository(dataSource);

    const configs = await backtestRepo.findConfigsWithStats(
      { userId: session.user.id },
      { limit, offset },
    );

    const total = await backtestRepo.countConfigs({ userId: session.user.id });

    // Serialize Decimal values to strings for JSON response
    const serializedConfigs = configs.map((c) => ({
      ...c,
      initialBalance: c.initialBalance?.toString(),
      commission: c.commission?.toString(),
      slippage: c.slippage?.toString(),
      bestResult: c.bestResult
        ? {
            ...c.bestResult,
            totalReturn: c.bestResult.totalReturn?.toString(),
            annualizedReturn: c.bestResult.annualizedReturn?.toString(),
            sharpeRatio: c.bestResult.sharpeRatio?.toString(),
            maxDrawdown: c.bestResult.maxDrawdown?.toString(),
            winRate: c.bestResult.winRate?.toString(),
            profitFactor: c.bestResult.profitFactor?.toString(),
          }
        : undefined,
      latestResult: c.latestResult
        ? {
            ...c.latestResult,
            totalReturn: c.latestResult.totalReturn?.toString(),
            annualizedReturn: c.latestResult.annualizedReturn?.toString(),
            sharpeRatio: c.latestResult.sharpeRatio?.toString(),
            maxDrawdown: c.latestResult.maxDrawdown?.toString(),
            winRate: c.latestResult.winRate?.toString(),
            profitFactor: c.latestResult.profitFactor?.toString(),
          }
        : undefined,
    }));

    return NextResponse.json({
      configs: serializedConfigs,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching backtest configs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch backtest configs' },
      { status: 500 },
    );
  }
}

// POST /api/backtest - Create a new backtest config
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      startDate,
      endDate,
      initialBalance,
      commission,
      slippage,
      symbols,
      timeframe,
    } = body;

    // Validation
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Start date and end date are required' },
        { status: 400 },
      );
    }

    if (!initialBalance) {
      return NextResponse.json({ error: 'Initial balance is required' }, { status: 400 });
    }

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json(
        { error: 'At least one symbol is required' },
        { status: 400 },
      );
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }

    if (start >= end) {
      return NextResponse.json(
        { error: 'Start date must be before end date' },
        { status: 400 },
      );
    }

    const dataManager = await getDataManager();
    const dataSource = dataManager.dataSource;
    const backtestRepo = new BacktestRepository(dataSource);

    const created = await backtestRepo.createConfig({
      startDate: start,
      endDate: end,
      initialBalance,
      commission: commission || 0.001, // Default 0.1%
      slippage,
      symbols,
      timeframe: timeframe || '1h',
      userId: session.user.id,
    });

    return NextResponse.json({
      config: {
        ...created,
        initialBalance: created.initialBalance?.toString(),
        commission: created.commission?.toString(),
        slippage: created.slippage?.toString(),
      },
    });
  } catch (error) {
    console.error('Error creating backtest config:', error);
    return NextResponse.json(
      { error: 'Failed to create backtest config' },
      { status: 500 },
    );
  }
}
