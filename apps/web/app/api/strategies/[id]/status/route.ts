import { NextRequest, NextResponse } from 'next/server';
import { StrategyStatus } from '@itrade/data-manager';

import { getDataManager } from '@/lib/data-manager';
import { auth } from '@/lib/auth';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST /api/strategies/:id/status - Update strategy status (start/stop)
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    const id = parseInt(params.id);

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid strategy ID' }, { status: 400 });
    }

    const body = await request.json();
    const { status } = body;

    // Validate status
    if (!Object.values(StrategyStatus).includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be: active, stopped, paused, or error' },
        { status: 400 },
      );
    }

    const dataManager = await getDataManager();
    // Include user relation for ownership check
    const strategy = await dataManager.getStrategy(id, { includeUser: true });

    if (!strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    // Check ownership
    if (!strategy.user || strategy.user.id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await dataManager.updateStrategyStatus(id, status);

    const updatedStrategy = await dataManager.getStrategy(id);
    return NextResponse.json({ strategy: updatedStrategy });
  } catch (error) {
    console.error('Error updating strategy status:', error);
    return NextResponse.json(
      { error: 'Failed to update strategy status' },
      { status: 500 },
    );
  }
}
