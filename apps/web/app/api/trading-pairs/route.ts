import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import { SymbolEntity } from '@itrade/data-manager';

/**
 * Handle GET /api/trading-pairs
 * Fetch active trading pairs for common users
 */
export async function GET(request: NextRequest) {
  const session = await getSession(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dataManager = await getDataManager();
    const symbolRepo = dataManager.dataSource.getRepository(SymbolEntity);

    // Only return active symbols for regular users
    const symbols = await symbolRepo.find({
      where: { isActive: true },
      order: {
        exchange: 'ASC',
        symbol: 'ASC',
      },
    });

    return NextResponse.json(symbols);
  } catch (error) {
    console.error('[Trading Pairs API] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
