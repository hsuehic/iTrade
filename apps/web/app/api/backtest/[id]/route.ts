import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import { BacktestRepository } from '@itrade/data-manager';
import type { BacktestConfigEntity } from '@itrade/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/backtest/[id] - Get a specific backtest config with results
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
    const includeResults = searchParams.get('results') === 'true';

    const dataManager = await getDataManager();
    const dataSource = dataManager.dataSource;
    const backtestRepo = new BacktestRepository(dataSource);

    const config = await backtestRepo.findConfigById(configId, { includeResults });

    if (!config) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    // Verify ownership through user relation
    if (config.user?.id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Serialize Decimal values
    const serialized = {
      ...config,
      initialBalance: config.initialBalance?.toString(),
      commission: config.commission?.toString(),
      slippage: config.slippage?.toString(),
      results: config.results?.map((r) => ({
        ...r,
        totalReturn: r.totalReturn?.toString(),
        annualizedReturn: r.annualizedReturn?.toString(),
        sharpeRatio: r.sharpeRatio?.toString(),
        maxDrawdown: r.maxDrawdown?.toString(),
        winRate: r.winRate?.toString(),
        profitFactor: r.profitFactor?.toString(),
      })),
    };

    return NextResponse.json({ config: serialized });
  } catch (error) {
    console.error('Error fetching backtest config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch backtest config' },
      { status: 500 },
    );
  }
}

// PATCH /api/backtest/[id] - Update a backtest config
export async function PATCH(
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

    const dataManager = await getDataManager();
    const dataSource = dataManager.dataSource;
    const backtestRepo = new BacktestRepository(dataSource);

    // Verify config exists and user owns it
    const existing = await backtestRepo.findConfigById(configId);
    if (!existing) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    if (existing.user?.id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Build update object
    const updates: Partial<BacktestConfigEntity> = {};
    if (startDate) updates.startDate = new Date(startDate);
    if (endDate) updates.endDate = new Date(endDate);
    if (initialBalance !== undefined) updates.initialBalance = initialBalance;
    if (commission !== undefined) updates.commission = commission;
    if (slippage !== undefined) updates.slippage = slippage;
    if (symbols) updates.symbols = symbols;
    if (timeframe) updates.timeframe = timeframe;

    await backtestRepo.updateConfig(configId, updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating backtest config:', error);
    return NextResponse.json(
      { error: 'Failed to update backtest config' },
      { status: 500 },
    );
  }
}

// DELETE /api/backtest/[id] - Delete a backtest config
export async function DELETE(
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

    const dataManager = await getDataManager();
    const dataSource = dataManager.dataSource;
    const backtestRepo = new BacktestRepository(dataSource);

    // Verify config exists and user owns it
    const existing = await backtestRepo.findConfigById(configId);
    if (!existing) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    if (existing.user?.id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await backtestRepo.deleteConfig(configId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting backtest config:', error);
    return NextResponse.json(
      { error: 'Failed to delete backtest config' },
      { status: 500 },
    );
  }
}
