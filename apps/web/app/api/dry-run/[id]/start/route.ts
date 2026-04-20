import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import { getPaperTradingManager } from '@/lib/services/paper-trading-manager-instance';
import { DryRunSessionRepository, DryRunStatus } from '@itrade/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST /api/dry-run/[id]/start - Start paper trading session
export async function POST(
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

    const userId = (session.user as { id?: string } | undefined)?.id;
    if (!userId || existing.user?.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check if session is already running
    if (existing.status === DryRunStatus.RUNNING) {
      return NextResponse.json({ error: 'Session is already running' }, { status: 400 });
    }

    // Check if session is completed (cannot restart completed sessions)
    if (existing.status === DryRunStatus.COMPLETED) {
      return NextResponse.json(
        { error: 'Cannot restart completed session' },
        { status: 400 },
      );
    }

    // Start the paper trading session
    const paperTradingManager = await getPaperTradingManager();
    await paperTradingManager.startSession(sessionId, userId);

    return NextResponse.json({
      success: true,
      message: 'Paper trading session started successfully',
      sessionId,
      status: DryRunStatus.RUNNING,
    });
  } catch (error) {
    console.error('Error starting paper trading session:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const status = errorMessage.includes('already running') ? 400 : 500;

    return NextResponse.json(
      {
        error: 'Failed to start paper trading session',
        details: errorMessage,
      },
      { status },
    );
  }
}
