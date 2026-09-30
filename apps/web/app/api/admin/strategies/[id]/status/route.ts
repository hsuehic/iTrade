import { NextRequest, NextResponse } from 'next/server';
import { StrategyStatus } from '@itrade/data-manager';

import { getClientIp, getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import { notifyConfigChange } from '@/lib/console-notify';
import { isPlainObject, parseStrategyId } from '@/lib/admin-strategy-validation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function isAdminSession(session: Awaited<ReturnType<typeof getSession>>): boolean {
  if (!session?.user) return false;
  const role = (session.user as { role?: string | null }).role;
  return role === 'admin';
}

/**
 * POST /api/admin/strategies/[id]/status — admin-only. Start / stop / pause ANY
 * user's strategy. Body: { status: 'active' | 'stopped' | 'paused' | 'error' }.
 *
 * Records an audit entry and notifies the console with the OWNER's userId so the
 * live instance reacts immediately.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getSession(request);
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = session!.user as { id: string; email?: string };

  try {
    const { id } = await context.params;
    const strategyId = parseStrategyId(id);
    if (strategyId === null) {
      return NextResponse.json({ error: 'Invalid strategy ID' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    if (!isPlainObject(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const status = body.status as StrategyStatus | undefined;

    // Enum parity with the user-facing status route: `paused` and `error` are
    // legitimate console states (the engine writes `error` itself), so admins
    // may set the same set the product already models.
    if (!status || !Object.values(StrategyStatus).includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be: active, stopped, paused, or error' },
        { status: 400 },
      );
    }

    const dm = await getDataManager();
    const strategy = await dm.getStrategy(strategyId, { includeUser: true });
    if (!strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    // No-op transition: skip the write, the audit entry and the console notify.
    // Re-read with performance so the response shape matches the normal path.
    if (strategy.status === status) {
      const unchanged = await dm.getStrategy(strategyId, {
        includeUser: true,
        includePerformance: true,
      });
      return NextResponse.json({ strategy: unchanged });
    }

    await dm.updateStrategyStatus(strategyId, status);

    try {
      await dm.createAuditLog({
        actorId: admin.id,
        actorEmail: admin.email ?? null,
        targetUserId: strategy.userId,
        action: 'strategy.status-update',
        metadata: {
          strategyId,
          statusChange: { from: strategy.status, to: status },
          via: 'admin.strategy-management',
        },
        ipAddress: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent'),
      });
    } catch (e) {
      console.error('[Admin Strategies] audit log failed (status):', e);
    }

    void notifyConfigChange({
      kind: 'strategy',
      userId: strategy.userId,
      strategyId,
    });

    const updated = await dm.getStrategy(strategyId, {
      includeUser: true,
      includePerformance: true,
    });
    return NextResponse.json({ strategy: updated });
  } catch (error) {
    console.error('[Admin Strategies] Failed to update status:', error);
    return NextResponse.json(
      { error: 'Failed to update strategy status' },
      { status: 500 },
    );
  }
}
