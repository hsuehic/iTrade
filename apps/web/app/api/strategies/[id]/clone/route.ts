import { NextRequest, NextResponse } from 'next/server';
import { StrategyStatus } from '@itrade/data-manager';

import { getDataManager } from '@/lib/data-manager';
import { getSession } from '@/lib/auth';
import { logIfImpersonating } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST /api/strategies/:id/clone - Clone an existing strategy
//
// Creates a new strategy with the same configuration (type, exchange, symbol,
// parameters, initialDataConfig, subscription, description) as the original.
// The cloned strategy:
//   - Name: `clone_{original_strategy_name}`
//   - Status: STOPPED (never auto-starts)
//   - Ownership: same user as the original strategy
export async function POST(request: NextRequest, context: RouteContext) {
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

    // Fetch the source strategy with user for ownership check
    const sourceStrategy = await dataManager.getStrategy(id, {
      includeUser: true,
    });

    if (!sourceStrategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    // Check ownership
    if (sourceStrategy.user.id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const clonedName = `clone_${sourceStrategy.name}`;

    // Check for name collision — if clone_<name> already exists, return 409
    const userStrategies = await dataManager.getStrategies({
      userId: session.user.id,
    });
    const nameExists = userStrategies.some(
      (s) => s.name.toLowerCase() === clonedName.toLowerCase(),
    );

    if (nameExists) {
      return NextResponse.json(
        { error: `A strategy with the name "${clonedName}" already exists` },
        { status: 409 },
      );
    }

    // Create the cloned strategy with all parameters from the original,
    // but with status STOPPED and name prefixed with `clone_`.
    const clonedStrategy = await dataManager.createStrategy({
      name: clonedName,
      description: sourceStrategy.description,
      type: sourceStrategy.type,
      status: StrategyStatus.STOPPED,
      exchange: sourceStrategy.exchange,
      symbol: sourceStrategy.symbol,
      parameters: sourceStrategy.parameters,
      initialDataConfig: sourceStrategy.initialDataConfig,
      subscription: sourceStrategy.subscription,
      userId: session.user.id,
    });

    await logIfImpersonating({
      request,
      session,
      action: 'strategy.clone',
      metadata: {
        sourceStrategyId: id,
        sourceStrategyName: sourceStrategy.name,
        clonedStrategyId: clonedStrategy.id,
        clonedStrategyName: clonedStrategy.name,
      },
    });

    return NextResponse.json({ strategy: clonedStrategy }, { status: 201 });
  } catch (error) {
    console.error('Error cloning strategy:', error);

    // Check for unique constraint violation (PostgreSQL error code 23505)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === '23505'
    ) {
      return NextResponse.json(
        { error: 'Strategy with this name already exists' },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to clone strategy',
        details:
          process.env.NODE_ENV === 'development' &&
          error &&
          typeof error === 'object' &&
          'message' in error
            ? (error as { message: string }).message
            : undefined,
      },
      { status: 500 },
    );
  }
}
