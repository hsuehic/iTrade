import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import { DryRunSessionRepository } from '@itrade/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/dry-run/[id] - Get a specific dry run session with details
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
    const sessionId = parseInt(id, 10);

    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const includeResults = searchParams.get('results') === 'true';
    const includeTrades = searchParams.get('trades') === 'true';

    const dataManager = await getDataManager();
    const dataSource = dataManager.dataSource;
    const dryRunRepo = new DryRunSessionRepository(dataSource);

    const dryRunSession = await dryRunRepo.findById(sessionId, {
      includeResults,
      includeTrades,
      includeStrategy: true,
    });

    if (!dryRunSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Verify ownership through the user relation
    if (dryRunSession.user?.id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Serialize Decimal values
    const serialized = {
      ...dryRunSession,
      initialBalance: dryRunSession.initialBalance?.toString(),
      commission: dryRunSession.commission?.toString(),
      slippage: dryRunSession.slippage?.toString(),
      results: dryRunSession.results?.map((r) => ({
        ...r,
        totalReturn: r.totalReturn?.toString(),
        annualizedReturn: r.annualizedReturn?.toString(),
        sharpeRatio: r.sharpeRatio?.toString(),
        maxDrawdown: r.maxDrawdown?.toString(),
        winRate: r.winRate?.toString(),
        profitFactor: r.profitFactor?.toString(),
      })),
      trades: dryRunSession.trades?.map((t) => ({
        ...t,
        entryPrice: t.entryPrice?.toString(),
        exitPrice: t.exitPrice?.toString(),
        quantity: t.quantity?.toString(),
        pnl: t.pnl?.toString(),
        commission: t.commission?.toString(),
      })),
    };

    return NextResponse.json({ session: serialized });
  } catch (error) {
    console.error('Error fetching dry run session:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dry run session' },
      { status: 500 },
    );
  }
}

// PATCH /api/dry-run/[id] - Update a dry run session
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
    const sessionId = parseInt(id, 10);

    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 });
    }

    const body = await request.json();
    const { name, notes } = body;

    const dataManager = await getDataManager();
    const dataSource = dataManager.dataSource;
    const dryRunRepo = new DryRunSessionRepository(dataSource);

    // Verify session exists and user owns it
    const existing = await dryRunRepo.findById(sessionId, { includeStrategy: true });
    if (!existing) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (existing.user?.id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await dryRunRepo.update(sessionId, {
      ...(name && { name }),
      ...(notes !== undefined && { notes }),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating dry run session:', error);
    return NextResponse.json(
      { error: 'Failed to update dry run session' },
      { status: 500 },
    );
  }
}

// DELETE /api/dry-run/[id] - Delete a dry run session
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
    const sessionId = parseInt(id, 10);

    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 });
    }

    const dataManager = await getDataManager();
    const dataSource = dataManager.dataSource;
    const dryRunRepo = new DryRunSessionRepository(dataSource);

    // Verify session exists and user owns it
    const existing = await dryRunRepo.findById(sessionId, { includeStrategy: true });
    if (!existing) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (existing.user?.id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await dryRunRepo.delete(sessionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting dry run session:', error);
    return NextResponse.json(
      { error: 'Failed to delete dry run session' },
      { status: 500 },
    );
  }
}
