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
    const strategyId = searchParams.get('strategyId');
    const symbol = searchParams.get('symbol');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    interface OrderFilters {
      strategyId?: number;
      symbol?: string;
      status?: string;
      startDate?: Date;
      endDate?: Date;
      userId?: string;
    }

    const filters: OrderFilters = {};
    if (strategyId) {
      const id = parseInt(strategyId);
      if (isNaN(id)) {
        return NextResponse.json({ error: 'Invalid strategy ID' }, { status: 400 });
      }
      filters.strategyId = id;
    }
    if (symbol) filters.symbol = symbol;
    if (status) filters.status = status;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    filters.userId = session.user.id;

    const dataManager = await getDataManager();
    const orders = await dataManager.getOrders(filters);

    return NextResponse.json({ orders });
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}
