import { NextRequest, NextResponse } from 'next/server';
import { getDataManager } from '@/lib/db';
import { auth } from '@/lib/auth';
import { StrategyType, StrategyStatus } from '@itrade/data-manager';

// GET /api/strategies - List all strategies for current user
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

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
    return NextResponse.json(
      { error: 'Failed to fetch strategies' },
      { status: 500 }
    );
  }
}

// POST /api/strategies - Create new strategy
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, type, exchange, symbol, parameters } = body;

    if (!name || !type || !symbol) {
      return NextResponse.json(
        { error: 'Missing required fields: name, type, symbol' },
        { status: 400 }
      );
    }

    // Validate strategy type
    if (!Object.values(StrategyType).includes(type)) {
      return NextResponse.json(
        { error: 'Invalid strategy type' },
        { status: 400 }
      );
    }

    const dataManager = await getDataManager();
    const strategy = await dataManager.createStrategy({
      name,
      description,
      type,
      status: StrategyStatus.STOPPED,
      exchange,
      symbol,
      parameters,
      userId: session.user.id,
    });

    return NextResponse.json({ strategy }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating strategy:', error);

    // Check for unique constraint violation
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Strategy with this name already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create strategy' },
      { status: 500 }
    );
  }
}

