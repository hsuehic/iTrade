import { NextRequest, NextResponse } from 'next/server';

import { getClientIp, getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import { notifyConfigChange } from '@/lib/console-notify';
import {
  parseStrategyId,
  pgErrorCode,
  validateStrategyUpdates,
} from '@/lib/admin-strategy-validation';

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
 * GET /api/admin/strategies/[id] — admin-only. Single strategy with owner
 * (id/name/email) and its cached performance row.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const session = await getSession(request);
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const strategyId = parseStrategyId(id);
    if (strategyId === null) {
      return NextResponse.json({ error: 'Invalid strategy ID' }, { status: 400 });
    }

    const dm = await getDataManager();
    const strategy = await dm.getStrategy(strategyId, {
      includeUser: true,
      includePerformance: true,
    });
    if (!strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    return NextResponse.json({ strategy });
  } catch (error) {
    console.error('[Admin Strategies] Failed to fetch strategy:', error);
    return NextResponse.json({ error: 'Failed to fetch strategy' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/strategies/[id] — admin-only. Edits ANY user's strategy.
 *
 * Same guard as the user-facing route: an ACTIVE strategy cannot be edited
 * (stop it first) so a live strategy's parameters never change underneath the
 * running console instance.
 *
 * Every write is recorded in `audit_logs` (actor = admin, target = owner).
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
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

    const dm = await getDataManager();
    const strategy = await dm.getStrategy(strategyId, { includeUser: true });
    if (!strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    if (strategy.status === 'active') {
      return NextResponse.json(
        { error: 'Cannot edit active strategy. Stop it first.' },
        { status: 400 },
      );
    }

    // `status` is rejected here by validateStrategyUpdates — a PATCH that both
    // changed parameters and flipped a stopped strategy back to active would
    // bypass the "active strategies are immutable" guard above.
    const body = await request.json().catch(() => null);
    const validated = validateStrategyUpdates(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    const { updates } = validated;

    // Renaming: check the case-insensitive collision BEFORE writing so the two
    // rename paths agree. The unique (userId, name) index is case-sensitive, so
    // it would happily accept "Foo" alongside "foo" — exactly the pair the
    // clone flow rejects.
    if (updates.name && updates.name.toLowerCase() !== strategy.name.toLowerCase()) {
      const clash = await dm.strategyNameExistsForUser(strategy.userId, updates.name);
      if (clash) {
        return NextResponse.json(
          { error: 'A strategy with this name already exists for this user' },
          { status: 409 },
        );
      }
    }

    await dm.updateStrategy(strategyId, updates);

    // Audit: the admin acted directly on another user's strategy.
    try {
      await dm.createAuditLog({
        actorId: admin.id,
        actorEmail: admin.email ?? null,
        targetUserId: strategy.userId,
        action: 'strategy.update',
        metadata: { strategyId, updates, via: 'admin.strategy-management' },
        ipAddress: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent'),
      });
    } catch (e) {
      console.error('[Admin Strategies] audit log failed (update):', e);
    }

    // Wake the console for the OWNER of the strategy (not the admin).
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
    console.error('[Admin Strategies] Failed to update strategy:', error);

    // Renaming onto an existing name for the same owner hits the unique
    // (userId, name) index — surface it as 409, like the user-facing routes.
    if (pgErrorCode(error) === '23505') {
      return NextResponse.json(
        { error: 'A strategy with this name already exists for this user' },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: 'Failed to update strategy' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/strategies/[id] — admin-only. Deletes ANY user's strategy.
 * Active strategies must be stopped first (parity with the user-facing route).
 * Cascade cleanup of performance/state/orders/backtests/dry-runs is handled by
 * TypeOrmDataManager.deleteStrategy.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
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

    const dm = await getDataManager();
    const strategy = await dm.getStrategy(strategyId, { includeUser: true });
    if (!strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    if (strategy.status === 'active') {
      return NextResponse.json(
        { error: 'Cannot delete active strategy. Stop it first.' },
        { status: 400 },
      );
    }

    await dm.deleteStrategy(strategyId);

    try {
      await dm.createAuditLog({
        actorId: admin.id,
        actorEmail: admin.email ?? null,
        targetUserId: strategy.userId,
        action: 'strategy.delete',
        metadata: { strategyId, name: strategy.name, via: 'admin.strategy-management' },
        ipAddress: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent'),
      });
    } catch (e) {
      console.error('[Admin Strategies] audit log failed (delete):', e);
    }

    // Wake the console (owner-scoped) so the live instance is torn down.
    void notifyConfigChange({
      kind: 'strategy',
      userId: strategy.userId,
      strategyId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Admin Strategies] Failed to delete strategy:', error);
    return NextResponse.json({ error: 'Failed to delete strategy' }, { status: 500 });
  }
}
