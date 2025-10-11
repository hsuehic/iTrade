import { NextRequest, NextResponse } from 'next/server';

import { getDataManager } from '@/lib/data-manager';
import { auth } from '@/lib/auth';

// GET /api/analytics/pnl - Get overall PnL analytics
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const strategyId = searchParams.get('strategyId');

    const dataManager = await getDataManager();

    if (strategyId) {
      // Get PnL for specific strategy
      const id = parseInt(strategyId);
      if (isNaN(id)) {
        return NextResponse.json(
          { error: 'Invalid strategy ID' },
          { status: 400 }
        );
      }

      // Check ownership - need to include user for authorization
      const strategy = await dataManager.getStrategy(id, { includeUser: true });
      if (!strategy || strategy.user.id !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const pnl = await dataManager.getStrategyPnL(id);
      return NextResponse.json({ pnl });
    } else {
      // Get overall PnL for user
      const pnl = await dataManager.getOverallPnL(session.user.id);
      return NextResponse.json({ pnl });
    }
  } catch (error) {
    console.error('Error fetching PnL:', error);
    return NextResponse.json(
      { error: 'Failed to fetch PnL data' },
      { status: 500 }
    );
  }
}
