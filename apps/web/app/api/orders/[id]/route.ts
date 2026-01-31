import { NextRequest, NextResponse } from 'next/server';

import { getDataManager } from '@/lib/data-manager';
import { getSession } from '@/lib/auth';
import { cancelUserOrder } from '@/lib/services/order-execution-service';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const dataManager = await getDataManager();
    const order = await dataManager.getOrder(id);

    if (!order || order.userId !== session.user.id) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error('Failed to fetch order:', error);
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const order = await cancelUserOrder(session.user.id, id);
    return NextResponse.json({ order });
  } catch (error) {
    console.error('Failed to cancel order:', error);
    const response =
      error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { status?: number; data?: unknown } }).response
        : undefined;
    const status = response?.status;
    const responseData = response?.data as
      | { code?: string; msg?: string; message?: string }
      | undefined;
    const exchangeMessage =
      responseData?.msg || responseData?.message || responseData?.code;
    if (status === 401) {
      return NextResponse.json(
        {
          error: exchangeMessage
            ? `Unauthorized: ${exchangeMessage}`
            : 'Unauthorized: check exchange API credentials or demo mode',
        },
        { status: 401 },
      );
    }
    return NextResponse.json(
      {
        error: exchangeMessage
          ? `Failed to cancel order: ${exchangeMessage}`
          : 'Failed to cancel order',
      },
      { status: 500 },
    );
  }
}
