import { NextRequest, NextResponse } from 'next/server';
import { type StrategyStatus } from '@itrade/data-manager';

import { getDataManager } from '@/lib/data-manager';
import { getSession } from '@/lib/auth';
import { logIfImpersonating } from '@/lib/audit-log';
import { buildStrategyLiveDetail } from '@/lib/strategy-detail-payload';
import { notifyConfigChange } from '@/lib/console-notify';
import { StrategyParameters } from '@itrade/core';

// Unrealized PnL on this route is computed live from the current market
// price (see getCurrentPrice() below) — force-dynamic + revalidate:0 keep
// Next.js from serving a cached response with a stale price snapshot.
// Matches the convention already applied to /api/strategies (list route).
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET /api/strategies/:id - Get single strategy
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    const id = parseInt(params.id);

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid strategy ID' }, { status: 400 });
    }

    const dataManager = await getDataManager();
    // Include user for ownership check
    const strategy = await dataManager.getStrategy(id, {
      includeUser: true,
      includePerformance: true,
    });

    if (!strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    // Check ownership
    if (strategy.user.id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Live performance + position summary. Shared with the admin detail route
    // so both audiences get the identical payload shape.
    const { rebuiltPerformance, positionSummary } = await buildStrategyLiveDetail(
      dataManager,
      strategy,
    );

    return NextResponse.json({ strategy, rebuiltPerformance, positionSummary });
  } catch (error) {
    console.error('Error fetching strategy:', error);
    return NextResponse.json({ error: 'Failed to fetch strategy' }, { status: 500 });
  }
}

// PATCH /api/strategies/:id - Update strategy
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    const id = parseInt(params.id);

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid strategy ID' }, { status: 400 });
    }

    const dataManager = await getDataManager();
    // Include user for ownership check
    const strategy = await dataManager.getStrategy(id, { includeUser: true });

    if (!strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    // Check ownership
    if (strategy.user.id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Don't allow editing active strategies — consistent with the UI guard
    // on the list/detail Edit buttons. Users must stop the strategy first.
    if (strategy.status === 'active') {
      return NextResponse.json(
        { error: 'Cannot edit active strategy. Stop it first.' },
        { status: 400 },
      );
    }

    const body = await request.json();
    const {
      name,
      description,
      type,
      status,
      exchange,
      symbol,
      parameters,
      initialDataConfig,
      subscription,
    } = body;

    interface StrategyUpdates {
      name?: string;
      description?: string;
      type?: string; // Strategy class name (e.g., "MovingAverageStrategy")
      status?: StrategyStatus;
      exchange?: string;
      symbol?: string;
      parameters?: StrategyParameters;
      initialDataConfig?: Record<string, unknown>;
      subscription?: Record<string, unknown>;
    }

    const updates: StrategyUpdates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (type !== undefined) updates.type = type;
    if (status !== undefined) updates.status = status;
    if (exchange !== undefined) updates.exchange = exchange;
    if (symbol !== undefined) updates.symbol = symbol;
    if (parameters !== undefined) updates.parameters = parameters;
    if (initialDataConfig !== undefined) updates.initialDataConfig = initialDataConfig;
    if (subscription !== undefined) updates.subscription = subscription;

    await dataManager.updateStrategy(id, updates);

    await logIfImpersonating({
      request,
      session,
      action: 'strategy.update',
      metadata: { strategyId: id, updates },
    });

    // Wake console: covers both status flips and param changes (defensive — see plan)
    void notifyConfigChange({
      kind: 'strategy',
      userId: session.user.id,
      strategyId: id,
    });

    // No need to include user in response
    const updatedStrategy = await dataManager.getStrategy(id);
    return NextResponse.json({ strategy: updatedStrategy });
  } catch (error) {
    console.error('Error updating strategy:', error);
    return NextResponse.json({ error: 'Failed to update strategy' }, { status: 500 });
  }
}

// DELETE /api/strategies/:id - Delete strategy
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    const id = parseInt(params.id);

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid strategy ID' }, { status: 400 });
    }

    const dataManager = await getDataManager();
    // Include user for ownership check
    const strategy = await dataManager.getStrategy(id, { includeUser: true });

    if (!strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    // Check ownership
    if (strategy.user.id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Don't allow deletion of active strategies
    if (strategy.status === 'active') {
      return NextResponse.json(
        { error: 'Cannot delete active strategy. Stop it first.' },
        { status: 400 },
      );
    }

    await dataManager.deleteStrategy(id);

    await logIfImpersonating({
      request,
      session,
      action: 'strategy.delete',
      metadata: { strategyId: id, name: strategy.name },
    });

    // Wake console to remove any live instance of this strategy
    void notifyConfigChange({
      kind: 'strategy',
      userId: session.user.id,
      strategyId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting strategy:', error);
    return NextResponse.json({ error: 'Failed to delete strategy' }, { status: 500 });
  }
}
