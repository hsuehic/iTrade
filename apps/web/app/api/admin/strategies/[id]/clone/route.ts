import { NextRequest, NextResponse } from 'next/server';
import { StrategyStatus } from '@itrade/data-manager';

import { getClientIp, getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import { notifyConfigChange } from '@/lib/console-notify';
import {
  cloneNameCandidate,
  isPlainObject,
  parseStrategyId,
  pgErrorCode,
  validateStrategyName,
} from '@/lib/admin-strategy-validation';

/** How many `_copyN` suffixes to try before giving up and returning 409. */
const MAX_CLONE_NAME_ATTEMPTS = 99;

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
 * POST /api/admin/strategies/[id]/clone — admin-only. Clones a strategy owned by
 * ANY user into ANOTHER user's account.
 *
 * Body:
 * - targetUserId (required) — the user who will own the clone
 * - name?        — clone name (default: the source strategy's name). If the name
 *                  is already taken by the target user the clone is suffixed
 *                  `_copy`, `_copy2`, … so the request never fails on collision;
 *                  the response reports the name actually used.
 * - start?       — when true, create the clone as ACTIVE (default: STOPPED)
 *
 * Ownership of the clone belongs to `targetUserId`. Name collisions are scoped
 * to the target user (the strategies table has a unique (user, name) index) and
 * checked case-insensitively before the insert.
 *
 * NOTE: `start: true` requires the target user to have at least one ACTIVE
 * bound exchange account — otherwise the engine could never run the strategy,
 * so the request is rejected (400) instead of creating a dead ACTIVE row.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getSession(request);
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = session!.user as { id: string; email?: string };

  try {
    const { id } = await context.params;
    const sourceId = parseStrategyId(id);
    if (sourceId === null) {
      return NextResponse.json({ error: 'Invalid strategy ID' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    if (!isPlainObject(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const targetUserId =
      typeof body.targetUserId === 'string' ? body.targetUserId.trim() : '';
    const start = body.start === true;
    const nameOverride = body.name === undefined ? '' : body.name;
    const named = validateStrategyName(nameOverride);
    if (nameOverride !== '' && !named.ok) {
      return NextResponse.json({ error: named.error }, { status: 400 });
    }

    if (!targetUserId) {
      return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
    }

    const dm = await getDataManager();
    const source = await dm.getStrategy(sourceId, { includeUser: true });
    if (!source) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    // Validate the target user explicitly rather than inferring "user does not
    // exist" from a foreign-key violation at insert time — TypeORM wraps driver
    // errors, so that inference never actually fired.
    if (!(await dm.userExists(targetUserId))) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    // Starting a strategy for a user with no active exchange account creates an
    // ACTIVE row the engine can never run. The UI already disables the toggle,
    // but it fails open when the owners lookup fails, so enforce it here.
    if (start && !(await dm.userHasActiveExchangeAccount(targetUserId))) {
      return NextResponse.json(
        {
          error: 'Target user has no bound exchange account; create the clone as STOPPED',
        },
        { status: 400 },
      );
    }

    // Clone names: the dialog pre-fills the SOURCE strategy's name and lets the
    // admin edit it. Either way a collision is resolved by suffixing
    // (`_copy`, `_copy2`, …) instead of failing, so the clone always lands under
    // a usable name — the response reports the name actually used.
    // Collisions are per owner and case-insensitive ("Foo" and "foo" collide);
    // the unique (userId, name) index stays the final arbiter under concurrency
    // (-> 23505 -> 409 below).
    const baseName = named.ok ? named.name : source.name;
    let clonedName = '';
    for (let attempt = 0; attempt <= MAX_CLONE_NAME_ATTEMPTS; attempt += 1) {
      const candidate = cloneNameCandidate(baseName, attempt);
      if (!(await dm.strategyNameExistsForUser(targetUserId, candidate))) {
        clonedName = candidate;
        break;
      }
    }
    if (!clonedName) {
      return NextResponse.json(
        {
          error: `Could not derive a free strategy name for the target user after ${MAX_CLONE_NAME_ATTEMPTS} suffixes (${MAX_CLONE_NAME_ATTEMPTS + 1} candidates including the original name)`,
        },
        { status: 409 },
      );
    }

    // Copy list: name / description / type / exchange / symbol / parameters /
    // initialDataConfig / subscription. `createStrategy` re-derives
    // normalizedSymbol and marketType from symbol+exchange (see
    // StrategyRepository.create), so the clone keeps the source's spot/perp
    // semantics. Deliberately NOT copied: id, status (except the `start` flag),
    // runtime state, performance, orders, timestamps.
    let cloned;
    try {
      cloned = await dm.createStrategy({
        name: clonedName,
        description: source.description,
        type: source.type,
        status: start ? StrategyStatus.ACTIVE : StrategyStatus.STOPPED,
        exchange: source.exchange,
        symbol: source.symbol,
        parameters: source.parameters as Record<string, unknown> | undefined,
        initialDataConfig: source.initialDataConfig,
        subscription: source.subscription,
        userId: targetUserId,
      });
    } catch (err) {
      // 23503 = foreign_key_violation → the target user vanished mid-request.
      if (pgErrorCode(err) === '23503') {
        return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
      }
      throw err;
    }

    try {
      await dm.createAuditLog({
        actorId: admin.id,
        actorEmail: admin.email ?? null,
        targetUserId,
        action: 'strategy.clone',
        metadata: {
          sourceStrategyId: sourceId,
          sourceStrategyName: source.name,
          sourceOwnerUserId: source.userId,
          clonedStrategyId: cloned.id,
          clonedStrategyName: cloned.name,
          started: start,
          via: 'admin.strategy-management',
        },
        ipAddress: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent'),
      });
    } catch (e) {
      console.error('[Admin Strategies] audit log failed (clone):', e);
    }

    // Notify the console for the TARGET owner (covers the `start` case).
    void notifyConfigChange({
      kind: 'strategy',
      userId: targetUserId,
      strategyId: cloned.id,
    });

    return NextResponse.json({ strategy: cloned }, { status: 201 });
  } catch (error) {
    console.error('[Admin Strategies] Failed to clone strategy:', error);

    if (pgErrorCode(error) === '23505') {
      return NextResponse.json(
        { error: 'Strategy with this name already exists' },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: 'Failed to clone strategy' }, { status: 500 });
  }
}
