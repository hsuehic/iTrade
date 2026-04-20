import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import { getPaperTradingManager } from '@/lib/services/paper-trading-manager-instance';
import { DryRunSessionRepository, DryRunStatus } from '@itrade/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST /api/dry-run/[id]/status - Update dry run session status (start/stop/cancel)
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

    const body = await request.json();
    const { action } = body;

    if (!['start', 'stop', 'cancel', 'complete', 'fail'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: start, stop, cancel, complete, or fail' },
        { status: 400 },
      );
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

    const paperTradingManager = await getPaperTradingManager();

    // Handle actions with paper trading integration
    let newStatus: DryRunStatus;
    let message: string;

    switch (action) {
      case 'start':
        if (existing.status === DryRunStatus.RUNNING) {
          return NextResponse.json(
            { error: 'Session is already running' },
            { status: 400 },
          );
        }

        // Start paper trading session
        await paperTradingManager.startSession(sessionId, (session.user as any).id);
        newStatus = DryRunStatus.RUNNING;
        message = 'Paper trading session started successfully';
        break;

      case 'stop':
      case 'complete':
        if (existing.status !== DryRunStatus.RUNNING) {
          return NextResponse.json({ error: 'Session is not running' }, { status: 400 });
        }

        // Stop paper trading session
        if (paperTradingManager.isSessionRunning(sessionId)) {
          await paperTradingManager.stopSession(sessionId);
        }
        newStatus = DryRunStatus.COMPLETED;
        message = 'Paper trading session stopped successfully';
        break;

      case 'cancel':
        // Stop paper trading session if running
        if (paperTradingManager.isSessionRunning(sessionId)) {
          await paperTradingManager.stopSession(sessionId);
        }
        newStatus = DryRunStatus.CANCELED;
        message = 'Paper trading session cancelled';
        break;

      case 'fail':
        // Stop paper trading session if running
        if (paperTradingManager.isSessionRunning(sessionId)) {
          await paperTradingManager.stopSession(sessionId);
        }
        newStatus = DryRunStatus.FAILED;
        message = 'Paper trading session marked as failed';
        break;

      default:
        newStatus = DryRunStatus.COMPLETED;
        message = 'Paper trading session completed';
    }

    return NextResponse.json({
      success: true,
      status: newStatus,
      message,
    });
  } catch (error) {
    console.error('Error updating dry run status:', error);
    return NextResponse.json(
      { error: 'Failed to update dry run status' },
      { status: 500 },
    );
  }
}
