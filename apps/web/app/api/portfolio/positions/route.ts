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

    interface PositionFilters {
      userId: string;
      exchange?: string;
      symbol?: string;
      side?: 'long' | 'short';
      minQuantity?: number;
    }

    const filters: PositionFilters = {
      userId: session.user.id,
    };

    if (exchange && exchange !== 'all') {
      filters.exchange = exchange;
    }
    if (symbol) {
      filters.symbol = symbol;
    }
    if (side) {
      filters.side = side;
    }
    if (minQuantity) {
      const qty = parseFloat(minQuantity);
      if (!isNaN(qty)) {
        filters.minQuantity = qty;
      }
    }

    const dataManager = await getDataManager();
    const positionRepository = dataManager.getPositionRepository();
    const positions = await positionRepository.findAll(filters);

    // Get available exchanges and symbols for filtering
    const [exchanges, symbols] = await Promise.all([
      positionRepository.getExchanges(session.user.id),
      positionRepository.getSymbols(session.user.id, exchange || undefined),
    ]);

    // Convert Decimal to string for JSON serialization
    const serializedPositions = positions.map((pos) => ({
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
        pos.avgPrice.gt(0) && pos.quantity.gt(0)
          ? pos.unrealizedPnl.div(pos.avgPrice.mul(pos.quantity)).mul(100).toFixed(2)
          : '0.00',
    }));

    return NextResponse.json({
      positions: serializedPositions,
      summary: {
        totalPositions: positions.length,
        exchanges,
        symbols,
        totalUnrealizedPnl: positions
          .reduce((sum, pos) => sum + parseFloat(pos.unrealizedPnl.toString()), 0)
          .toFixed(2),
      },
    });
  } catch (error) {
    console.error('Failed to fetch positions:', error);
    return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 });
  }
}
