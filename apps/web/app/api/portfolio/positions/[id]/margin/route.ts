import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSession } from '@/lib/auth';
import { logIfImpersonating } from '@/lib/audit-log';
import { adjustPositionMargin } from '@/lib/services/order-execution-service';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const marginAdjustmentSchema = z.object({
  type: z.enum(['add', 'reduce']),
  amount: z.union([z.string(), z.number()]).refine((value) => {
    const num = Number(value);
    return Number.isFinite(num) && num > 0;
  }, 'Amount must be a positive number'),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const positionId = Number(id);
    if (!Number.isInteger(positionId)) {
      return NextResponse.json({ error: 'Invalid position id' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = marginAdjustmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid margin adjustment payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await adjustPositionMargin(session.user.id, positionId, parsed.data);

    await logIfImpersonating({
      request,
      session,
      action: 'position.adjustMargin',
      metadata: { positionId, type: parsed.data.type, amount: parsed.data.amount },
    });

    return NextResponse.json({
      symbol: result.symbol,
      type: result.type,
      amount: result.amount.toString(),
      marginMode: result.marginMode,
      newIsolatedMargin: result.newIsolatedMargin?.toString(),
      maxAmount: result.maxAmount?.toString() ?? null,
      minAmount: result.minAmount?.toString() ?? null,
    });
  } catch (error) {
    console.error('Failed to adjust position margin:', error);

    const response =
      error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { status?: number; data?: unknown } }).response
        : undefined;
    const status = response?.status;
    const responseData = response?.data as
      | { code?: string; msg?: string; message?: string }
      | undefined;
    const exchangeMessage = responseData?.msg || responseData?.message;

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

    const message =
      exchangeMessage || (error instanceof Error ? error.message : undefined);

    // Known client-side validation errors → 400, everything else → 500
    const isClientError =
      message === 'Position not found' ||
      message === 'Unauthorized' ||
      message === 'Margin can only be adjusted for isolated-margin positions' ||
      message === 'Amount must be a positive number' ||
      (typeof message === 'string' &&
        message.endsWith('does not support margin adjustment'));

    return NextResponse.json(
      { error: message || 'Failed to adjust margin' },
      { status: isClientError ? 400 : 500 },
    );
  }
}
