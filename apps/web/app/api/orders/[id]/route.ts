import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getDataManager } from '@/lib/data-manager';
import { getSession } from '@/lib/auth';
import { cancelUserOrder, modifyUserOrder } from '@/lib/services/order-execution-service';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const updateOrderSchema = z
  .object({
    quantity: z.union([z.string(), z.number()]).optional(),
    price: z.union([z.string(), z.number()]).optional(),
    stopPrice: z.union([z.string(), z.number()]).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.quantity === undefined &&
      data.price === undefined &&
      data.stopPrice === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Quantity, price, or stopPrice is required',
        path: ['quantity'],
      });
    }
    if (data.quantity !== undefined) {
      const quantity = Number(data.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Quantity must be a positive number',
          path: ['quantity'],
        });
      }
    }
    if (data.price !== undefined) {
      const price = Number(data.price);
      if (!Number.isFinite(price) || price <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Price must be a positive number',
          path: ['price'],
        });
      }
    }
  });

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

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid update payload', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { id } = await context.params;
    const order = await modifyUserOrder(session.user.id, id, parsed.data);
    return NextResponse.json({ order });
  } catch (error) {
    console.error('Failed to update order:', error);
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
          ? `Failed to update order: ${exchangeMessage}`
          : 'Failed to update order',
      },
      { status: 500 },
    );
  }
}
