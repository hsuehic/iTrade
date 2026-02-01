import { NextRequest, NextResponse } from 'next/server';

import { getDataManager } from '@/lib/data-manager';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const exchange = searchParams.get('exchange');
    const symbol = searchParams.get('symbol');
    const side = searchParams.get('side') as 'long' | 'short' | null;
    const minQuantity = searchParams.get('minQuantity');

    const dataManager = await getDataManager();
    const positionRepository = dataManager.getPositionRepository();
    
    // Fetch all user positions once for both data and metadata (exchanges/symbols)
    const allUserPositions = await positionRepository.findAll({ userId: session.user.id });
    
    // Core filter: always exclude zero quantity positions
    const activeUserPositions = allUserPositions.filter((pos) => !pos.quantity.isZero());
    
    // Apply optional filters
    let filteredPositions = activeUserPositions;
    
    if (exchange && exchange !== 'all') {
      filteredPositions = filteredPositions.filter((pos) => pos.exchange === exchange);
    }
    if (symbol) {
      filteredPositions = filteredPositions.filter((pos) => pos.symbol === symbol);
    }
    if (side) {
      filteredPositions = filteredPositions.filter((pos) => pos.side === side);
    }
    if (minQuantity) {
      const qty = parseFloat(minQuantity);
      if (!isNaN(qty)) {
        filteredPositions = filteredPositions.filter((pos) => pos.quantity.abs().gte(qty));
      }
    }

    // Get available exchanges and symbols for filtering (only from active positions)
    const exchanges = Array.from(new Set(activeUserPositions.map((p) => p.exchange))).sort();
    const symbols = Array.from(
      new Set(
        activeUserPositions
          .filter((p) => !exchange || exchange === 'all' || p.exchange === exchange)
          .map((p) => p.symbol),
      ),
    ).sort();

    // Convert Decimal to string for JSON serialization
    const serializedPositions = filteredPositions.map((pos) => ({
      id: pos.id,
      symbol: pos.symbol,
      exchange: pos.exchange,
      side: pos.side,
      quantity: pos.quantity.toString(),
      avgPrice: pos.avgPrice.toString(),
      markPrice: pos.markPrice.toString(),
      unrealizedPnl: pos.unrealizedPnl.toString(),
      leverage: pos.leverage.toString(),
      timestamp: pos.timestamp,
      createdAt: pos.createdAt,
      updatedAt: pos.updatedAt,
      // Calculate market value
      marketValue: pos.quantity.mul(pos.markPrice).toString(),
      // Calculate PnL percentage
      pnlPercentage:
        pos.avgPrice.gt(0) && pos.quantity.abs().gt(0)
          ? pos.unrealizedPnl.div(pos.avgPrice.mul(pos.quantity.abs())).mul(100).toFixed(2)
          : '0.00',
    }));

    return NextResponse.json({
      positions: serializedPositions,
      summary: {
        totalPositions: filteredPositions.length,
        exchanges,
        symbols,
        totalUnrealizedPnl: filteredPositions
          .reduce((sum, pos) => sum + parseFloat(pos.unrealizedPnl.toString()), 0)
          .toFixed(2),
      },
    });
  } catch (error) {
    console.error('Failed to fetch positions:', error);
    return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 });
  }
}
