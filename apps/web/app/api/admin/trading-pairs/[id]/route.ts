import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import { SymbolEntity } from '@itrade/data-manager';

/**
 * Handle PATCH /api/admin/trading-pairs/[id]
 * Update a trading pair
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(request);
  const { id } = await params;

  if (!session || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await request.json();
    const dataManager = await getDataManager();
    const symbolRepo = dataManager.dataSource.getRepository(SymbolEntity);

    const symbol = await symbolRepo.findOne({ where: { id: parseInt(id) } });

    if (!symbol) {
      return NextResponse.json({ error: 'Trading pair not found' }, { status: 404 });
    }

    // Update fields
    if (data.symbol) symbol.symbol = data.symbol;
    if (data.baseAsset) symbol.baseAsset = data.baseAsset;
    if (data.quoteAsset) symbol.quoteAsset = data.quoteAsset;
    if (data.exchange) symbol.exchange = data.exchange;
    if (data.type) symbol.type = data.type;
    if (data.name !== undefined) symbol.name = data.name;
    if (data.isActive !== undefined) symbol.isActive = data.isActive;
    if (data.baseAssetPrecision !== undefined)
      symbol.baseAssetPrecision = data.baseAssetPrecision;
    if (data.quoteAssetPrecision !== undefined)
      symbol.quoteAssetPrecision = data.quoteAssetPrecision;

    await symbolRepo.save(symbol);

    return NextResponse.json(symbol);
  } catch (error) {
    console.error('[Trading Pairs API] PATCH error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * Handle DELETE /api/admin/trading-pairs/[id]
 * Delete a trading pair
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(request);
  const { id } = await params;

  if (!session || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dataManager = await getDataManager();
    const symbolRepo = dataManager.dataSource.getRepository(SymbolEntity);

    const result = await symbolRepo.delete(parseInt(id));

    if (result.affected === 0) {
      return NextResponse.json({ error: 'Trading pair not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Trading Pairs API] DELETE error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
