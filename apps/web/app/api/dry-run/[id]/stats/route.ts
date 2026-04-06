import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import { getPaperTradingManager } from '@/lib/services/paper-trading-manager-instance';
import { DryRunSessionRepository } from '@itrade/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/dry-run/[id]/stats - Get real-time statistics for paper trading session
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

    const dataManager = await getDataManager();
    const dataSource = dataManager.dataSource;
    const dryRunRepo = new DryRunSessionRepository(dataSource);

    // Verify session exists and user owns it
    const existing = await dryRunRepo.findById(sessionId);
    if (!existing) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (existing.user?.id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const paperTradingManager = await getPaperTradingManager();
    const isRunning = paperTradingManager.isSessionRunning(sessionId);

    if (!isRunning) {
      // Return basic session info for non-running sessions
      return NextResponse.json({
        isRunning: false,
        sessionId,
        status: existing.status,
        initialBalance: existing.initialBalance?.toString(),
        commission: existing.commission?.toString(),
        slippage: existing.slippage?.toString(),
        startTime: existing.startTime,
        endTime: existing.endTime,
        stats: null,
      });
    }

    // Get real-time statistics for running session
    const stats = await paperTradingManager.getSessionStats(sessionId);

    return NextResponse.json({
      isRunning: true,
      sessionId,
      status: 'running',
      initialBalance: existing.initialBalance?.toString(),
      commission: existing.commission?.toString(),
      slippage: existing.slippage?.toString(),
      startTime: existing.startTime,
      endTime: null,
      stats: {
        totalOrders: stats.totalOrders,
        totalTrades: stats.totalTrades,
        totalVolume: stats.totalVolume,
        totalCommission: stats.totalCommission,
        currentValue: stats.currentValue,
        pnl: stats.pnl,
        pnlPercent: stats.pnlPercent,
        // Calculate additional metrics
        winRate: stats.totalTrades > 0 ? '0.00' : '0.00', // TODO: Calculate from trades
        maxDrawdown: '0.00', // TODO: Calculate from equity curve
        sharpeRatio: '0.00', // TODO: Calculate from returns
      },
    });
  } catch (error) {
    console.error('Error fetching paper trading stats:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to fetch session statistics',
        details: errorMessage,
      },
      { status: 500 },
    );
  }
}
