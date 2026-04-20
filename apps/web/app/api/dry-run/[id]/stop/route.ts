import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import { getPaperTradingManager } from '@/lib/services/paper-trading-manager-instance';
import { DryRunSessionRepository, DryRunStatus } from '@itrade/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST /api/dry-run/[id]/stop - Stop paper trading session
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

    if (existing.user?.id !== (session.user as any).id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check if session is running
    const paperTradingManager = await getPaperTradingManager();
    if (!paperTradingManager.isSessionRunning(sessionId)) {
      return NextResponse.json({ error: 'Session is not running' }, { status: 400 });
    }

    // Stop the paper trading session
    await paperTradingManager.stopSession(sessionId);

    return NextResponse.json({
      success: true,
      message: 'Paper trading session stopped successfully',
      sessionId,
      status: DryRunStatus.COMPLETED,
    });
  } catch (error) {
    console.error('Error stopping paper trading session:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to stop paper trading session',
        details: errorMessage,
      },
      { status: 500 },
    );
  }
}
