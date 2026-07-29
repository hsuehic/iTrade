import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSession } from '@/lib/auth';
import { logIfImpersonating } from '@/lib/audit-log';
import {
  adjustPositionMargin,
  getPositionMarginLimits,
} from '@/lib/services/order-execution-service';

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

function parsePositionId(id: string): number | null {
  const positionId = Number(id);
  return Number.isInteger(positionId) ? positionId : null;
}

function mapMarginError(error: unknown) {
  const response =
    error && typeof error === 'object' && 'response' in error
      ? (error as { response?: { status?: number; data?: unknown } }).response
      : undefined;
  const status = response?.status;
  const responseData = response?.data as
    | { code?: string; msg?: string; message?: string }
    | undefined;
  const exchangeMessage = responseData?.msg || responseData?.message;
  const message = exchangeMessage || (error instanceof Error ? error.message : undefined);

  const isClientError =
    message === 'Position not found' ||
    message === 'Position not found on exchange' ||
    message === 'Unauthorized' ||
    message === 'Margin can only be adjusted for isolated-margin positions' ||
    message === 'Amount must be a positive number' ||
    (typeof message === 'string' &&
      message.endsWith('does not support margin adjustment'));

  return {
    status: status === 401 ? 401 : isClientError ? 400 : 500,
    message:
      status === 401
        ? exchangeMessage
          ? `Unauthorized: ${exchangeMessage}`
          : 'Unauthorized: check exchange API credentials or demo mode'
        : message || 'Failed to adjust margin',
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const positionId = parsePositionId(id);
    if (positionId === null) {
      return NextResponse.json({ error: 'Invalid position id' }, { status: 400 });
    }

    const limits = await getPositionMarginLimits(session.user.id, positionId);

    return NextResponse.json({
      maxAdd: limits.maxAdd.toString(),
      maxReduce: limits.maxReduce.toString(),
      currentMargin: limits.currentMargin?.toString() ?? null,
      marginAsset: limits.marginAsset,
    });
  } catch (error) {
    console.error('Failed to fetch position margin limits:', error);
    const mapped = mapMarginError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const positionId = parsePositionId(id);
    if (positionId === null) {
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
    const mapped = mapMarginError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
