import { NextRequest, NextResponse } from 'next/server';
import { StrategyStatus } from '@itrade/data-manager';

import { getDataManager } from '@/lib/data-manager';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/strategies - List all strategies for current user
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const exchange = searchParams.get('exchange') || undefined;

    const dataManager = await getDataManager();
    const strategies = await dataManager.getStrategies({
      userId: session.user.id,
      status,
      exchange,
    });

    return NextResponse.json({ strategies });
  } catch (error) {
    console.error('Error fetching strategies:', error);
    return NextResponse.json({ error: 'Failed to fetch strategies' }, { status: 500 });
  }
}

// POST /api/strategies - Create new strategy
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      description,
      type,
      exchange,
      symbol,
      parameters,
      initialDataConfig,
      subscription,
    } = body;

    if (!name || !type || !symbol) {
      return NextResponse.json(
        { error: 'Missing required fields: name, type, symbol' },
        { status: 400 },
      );
    }

    // Type is now a free-form string (strategy class name)
    // No validation needed as TypeORM will store any valid string

    const dataManager = await getDataManager();
    const strategy = await dataManager.createStrategy({
      name,
      description,
      type,
      status: StrategyStatus.STOPPED,
      exchange,
      symbol,
      parameters,
      initialDataConfig,
      subscription,
      userId: session.user.id,
    });

    return NextResponse.json({ strategy }, { status: 201 });
  } catch (error) {
    console.error('Error creating strategy:', error);

    // Log full error details for debugging
    if (error && typeof error === 'object') {
      console.error('Error details:', JSON.stringify(error, null, 2));
    }

    // Check for unique constraint violation (PostgreSQL error code 23505)
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return NextResponse.json(
        { error: 'Strategy with this name already exists' },
        { status: 409 },
      );
    }

    // Check for duplicate key error message (alternative check)
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string' &&
      error.message.includes('duplicate key value')
    ) {
      return NextResponse.json(
        { error: 'Strategy with this name already exists' },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to create strategy',
        details:
          process.env.NODE_ENV === 'development' &&
          error &&
          typeof error === 'object' &&
          'message' in error
            ? error.message
            : undefined,
      },
      { status: 500 },
    );
  }
}
