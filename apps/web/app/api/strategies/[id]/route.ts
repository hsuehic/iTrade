import { NextRequest, NextResponse } from 'next/server';

import { getDataManager } from '@/lib/db';
import { auth } from '@/lib/auth';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET /api/strategies/:id - Get single strategy
export async function GET(request: NextRequest, context: RouteContext) {
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
      return NextResponse.json(
        { error: 'Invalid strategy ID' },
        { status: 400 }
      );
    }

    const dataManager = await getDataManager();
    const strategy = await dataManager.getStrategy(id);

    if (!strategy) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    // Check ownership
    if (strategy.user.id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ strategy });
  } catch (error) {
    console.error('Error fetching strategy:', error);
    return NextResponse.json(
      { error: 'Failed to fetch strategy' },
      { status: 500 }
    );
  }
}

// PATCH /api/strategies/:id - Update strategy
export async function PATCH(request: NextRequest, context: RouteContext) {
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
      return NextResponse.json(
        { error: 'Invalid strategy ID' },
        { status: 400 }
      );
    }

    const dataManager = await getDataManager();
    const strategy = await dataManager.getStrategy(id);

    if (!strategy) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    // Check ownership
    if (strategy.user.id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, type, status, exchange, symbol, parameters } =
      body;

    interface StrategyUpdates {
      name?: string;
      description?: string;
      type?: string;
      status?: string;
      exchange?: string;
      symbol?: string;
      parameters?: Record<string, unknown>;
    }

    const updates: StrategyUpdates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (type !== undefined) updates.type = type;
    if (status !== undefined) updates.status = status;
    if (exchange !== undefined) updates.exchange = exchange;
    if (symbol !== undefined) updates.symbol = symbol;
    if (parameters !== undefined) updates.parameters = parameters;

    await dataManager.updateStrategy(id, updates);

    const updatedStrategy = await dataManager.getStrategy(id);
    return NextResponse.json({ strategy: updatedStrategy });
  } catch (error) {
    console.error('Error updating strategy:', error);
    return NextResponse.json(
      { error: 'Failed to update strategy' },
      { status: 500 }
    );
  }
}

// DELETE /api/strategies/:id - Delete strategy
export async function DELETE(request: NextRequest, context: RouteContext) {
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
      return NextResponse.json(
        { error: 'Invalid strategy ID' },
        { status: 400 }
      );
    }

    const dataManager = await getDataManager();
    const strategy = await dataManager.getStrategy(id);

    if (!strategy) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    // Check ownership
    if (strategy.user.id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Don't allow deletion of active strategies
    if (strategy.status === 'active') {
      return NextResponse.json(
        { error: 'Cannot delete active strategy. Stop it first.' },
        { status: 400 }
      );
    }

    await dataManager.deleteStrategy(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting strategy:', error);
    return NextResponse.json(
      { error: 'Failed to delete strategy' },
      { status: 500 }
    );
  }
}
