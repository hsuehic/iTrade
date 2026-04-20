import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import { SymbolEntity } from '@itrade/data-manager';

/**
 * Handle GET /api/admin/trading-pairs
 * Fetch all trading pairs
 */
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dataManager = await getDataManager();
    const symbolRepo = dataManager.dataSource.getRepository(SymbolEntity);

    const symbols = await symbolRepo.find({
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

/**
 * Handle POST /api/admin/trading-pairs
 * Add a new trading pair
 */
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await request.json();
    const dataManager = await getDataManager();
    const symbolRepo = dataManager.dataSource.getRepository(SymbolEntity);

    // Validate required fields
    if (!data.symbol || !data.baseAsset || !data.quoteAsset || !data.exchange) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newSymbol = symbolRepo.create({
      symbol: data.symbol,
      baseAsset: data.baseAsset,
      quoteAsset: data.quoteAsset,
      exchange: data.exchange,
      type: data.type || 'spot',
      name: data.name,
      isActive: data.isActive !== undefined ? data.isActive : true,
      baseAssetPrecision: data.baseAssetPrecision || 8,
      quoteAssetPrecision: data.quoteAssetPrecision || 8,
    });

    await symbolRepo.save(newSymbol);

    return NextResponse.json(newSymbol);
  } catch (error) {
    console.error('[Trading Pairs API] POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
