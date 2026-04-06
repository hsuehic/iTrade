import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import { getPaperTradingManager } from '@/lib/services/paper-trading-manager-instance';
import { DryRunSessionRepository } from '@itrade/data-manager';
import { OrderSide, OrderType, TradeMode } from '@itrade/core';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const manualOrderSchema = z
  .object({
    symbol: z.string().min(3).max(30),
    side: z.nativeEnum(OrderSide),
    type: z.nativeEnum(OrderType),
    quantity: z.union([z.string(), z.number()]).transform((val) => Number(val)),
    price: z
      .union([z.string(), z.number()])
      .transform((val) => Number(val))
      .optional(),
    tradeMode: z.nativeEnum(TradeMode).optional(),
    leverage: z.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    // Validate quantity
    if (!Number.isFinite(data.quantity) || data.quantity <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Quantity must be a positive number',
        path: ['quantity'],
      });
    }

    // Validate price for limit orders
    if (data.type === OrderType.LIMIT) {
      if (!data.price || !Number.isFinite(data.price) || data.price <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Price must be a positive number for limit orders',
          path: ['price'],
        });
      }
    }
  });

// GET /api/dry-run/[id]/orders - Get orders for paper trading session
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const sessionId = parseInt(id, 10);

    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 });
    }

    const dataManager = await getDataManager();
    const dataSource = dataManager.dataSource;
    const dryRunRepo = new DryRunSessionRepository(dataSource);

    // Verify session exists and user owns it
    const existing = await dryRunRepo.findById(sessionId);
    if (!existing) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (existing.user?.id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get orders for this session
    const orders = (await dataManager.getDryRunOrders?.(sessionId)) || [];

    return NextResponse.json({
      orders: orders.map((order) => ({
        ...order,
        quantity: order.quantity?.toString(),
        price: order.price?.toString(),
        executedQuantity: order.executedQuantity?.toString(),
        cummulativeQuoteQuantity: order.cummulativeQuoteQuantity?.toString(),
        commission: order.commission?.toString(),
      })),
    });
  } catch (error) {
    console.error('Error fetching paper trading orders:', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}

// POST /api/dry-run/[id]/orders - Place manual order in paper trading session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const sessionId = parseInt(id, 10);

    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = manualOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid order payload',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const dataManager = await getDataManager();
    const dataSource = dataManager.dataSource;
    const dryRunRepo = new DryRunSessionRepository(dataSource);

    // Verify session exists and user owns it
    const existing = await dryRunRepo.findById(sessionId);
    if (!existing) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (existing.user?.id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check if session is running
    const paperTradingManager = await getPaperTradingManager();
    if (!paperTradingManager.isSessionRunning(sessionId)) {
      return NextResponse.json(
        { error: 'Session is not running. Please start the session first.' },
        { status: 400 },
      );
    }

    console.info('[Paper Trading] Manual order submission', {
      userId: session.user.id,
      sessionId,
      symbol: parsed.data.symbol,
      side: parsed.data.side,
      type: parsed.data.type,
      quantity: parsed.data.quantity,
      price: parsed.data.price ?? null,
      tradeMode: parsed.data.tradeMode ?? null,
      leverage: parsed.data.leverage ?? null,
    });

    // Execute manual order through paper trading engine
    const order = await paperTradingManager.executeManualOrder(sessionId, {
      symbol: parsed.data.symbol,
      side: parsed.data.side,
      type: parsed.data.type,
      quantity: parsed.data.quantity,
      price: parsed.data.price,
      tradeMode: parsed.data.tradeMode,
      leverage: parsed.data.leverage,
    });

    return NextResponse.json({
      order: {
        ...order,
        quantity: order.quantity?.toString(),
        price: order.price?.toString(),
        executedQuantity: order.executedQuantity?.toString(),
        cummulativeQuoteQuantity: order.cummulativeQuoteQuantity?.toString(),
        commission: order.commission?.toString(),
      },
    });
  } catch (error) {
    console.error('Failed to place paper trading order:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check for specific error types
    if (errorMessage.includes('not running')) {
      return NextResponse.json(
        { error: 'Session is not running. Please start the session first.' },
        { status: 400 },
      );
    }

    if (errorMessage.includes('insufficient')) {
      return NextResponse.json(
        { error: 'Insufficient balance for this order' },
        { status: 400 },
      );
    }

    if (errorMessage.includes('risk manager')) {
      return NextResponse.json(
        { error: 'Order rejected by risk management rules' },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to place order',
        details: errorMessage,
      },
      { status: 500 },
    );
  }
}
