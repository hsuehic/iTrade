import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logIfImpersonating } from '@/lib/audit-log';
import { getSession } from '@/lib/auth';
import { mapTradeModeError } from '@/lib/trade-mode-errors';
import {
  getSymbolTradeMode,
  setSymbolTradeMode,
} from '@/lib/services/trade-mode-service';

const tradeModeSchema = z.object({
  exchange: z.string().min(1),
  symbol: z.string().min(1),
  tradeMode: z.enum(['isolated', 'cross']),
});

const tradeModeQuerySchema = z.object({
  exchange: z.string().min(1),
  symbol: z.string().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = tradeModeQuerySchema.safeParse({
      exchange: searchParams.get('exchange') ?? '',
      symbol: searchParams.get('symbol') ?? '',
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'exchange and symbol are required', code: 'invalid-input' },
        { status: 400 },
      );
    }

    const result = await getSymbolTradeMode(
      session.user.id,
      parsed.data.exchange,
      parsed.data.symbol,
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to read trade mode:', error);
    const mapped = mapTradeModeError(error);
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Request body must be valid JSON', code: 'invalid-input' },
        { status: 400 },
      );
    }

    const parsed = tradeModeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'exchange, symbol and tradeMode (isolated|cross) are required',
          code: 'invalid-input',
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const result = await setSymbolTradeMode(session.user.id, parsed.data);

    // The switch already succeeded on the exchange, so a failed audit write must
    // not turn the response into a 502 that reads like the switch failed.
    try {
      await logIfImpersonating({
        request,
        session,
        action: 'exchange.setTradeMode',
        metadata: {
          exchange: parsed.data.exchange,
          symbol: parsed.data.symbol,
          tradeMode: parsed.data.tradeMode,
          changed: result.changed,
        },
      });
    } catch (auditError) {
      console.error('Failed to write the setTradeMode audit log:', auditError);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to switch trade mode:', error);
    const mapped = mapTradeModeError(error);
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status },
    );
  }
}
