import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getDataManager } from '@/lib/data-manager';
import { getSession } from '@/lib/auth';
import { executeManualOrder } from '@/lib/services/order-execution-service';
import { ExchangeId, SUPPORTED_QUOTE_CURRENCIES, parseSymbol } from '@/lib/exchanges';
import { isValidExchange } from '@itrade/data-manager';
import { OrderSide, OrderType, TradeMode } from '@itrade/core';

const splitCompactSymbol = (symbol: string, quotes: readonly string[]) => {
  const sortedQuotes = [...quotes].sort((a, b) => b.length - a.length);
  for (const quote of sortedQuotes) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      return {
        base: symbol.slice(0, symbol.length - quote.length),
        quote,
      };
    }
  }
  return null;
};

const normalizeDashSymbol = (symbol: string) => {
  const upper = symbol.toUpperCase();
  if (upper.endsWith('-SWAP')) {
    const withoutSwap = upper.replace('-SWAP', '');
    const parts = withoutSwap.split('-');
    if (parts.length >= 2) {
      const quote = parts[parts.length - 1];
      const base = parts.slice(0, -1).join('-');
      return `${base}/${quote}:${quote}`;
    }
  }

  if (upper.endsWith('-PERP-INTX')) {
    const base = upper.replace('-PERP-INTX', '');
    return `${base}/USDC:USDC`;
  }

  const parts = upper.split('-');
  if (parts.length >= 2) {
    const quote = parts[parts.length - 1];
    const base = parts.slice(0, -1).join('-');
    return `${base}/${quote}`;
  }

  return symbol;
};

const normalizeOrderSymbol = (exchange: string, rawSymbol: string) => {
  let symbol = rawSymbol.trim().toUpperCase();
  if (!symbol) {
    throw new Error('Symbol is required');
  }

  if (symbol.includes('/')) {
    return symbol;
  }

  if (symbol.includes('-')) {
    return normalizeDashSymbol(symbol);
  }

  const quoteCurrencies =
    SUPPORTED_QUOTE_CURRENCIES[exchange as ExchangeId] ||
    SUPPORTED_QUOTE_CURRENCIES.binance;
  const split = splitCompactSymbol(symbol, quoteCurrencies);
  if (!split) {
    throw new Error('Symbol format is invalid for selected exchange');
  }

  return `${split.base}/${split.quote}`;
};

const toPerpetualSymbol = (symbol: string) => {
  if (symbol.includes(':')) return symbol;
  const { base, quote } = parseSymbol(symbol);
  if (!base || !quote) {
    throw new Error('Symbol must include a quote currency (e.g., BTC/USDT)');
  }
  return `${base}/${quote}:${quote}`;
};

const positionActionSchema = z.enum([
  'OPEN_LONG',
  'OPEN_SHORT',
  'CLOSE_LONG',
  'CLOSE_SHORT',
]);

const orderSchema = z
  .object({
    exchange: z.string().min(1),
    symbol: z.string().min(3).max(30),
    side: z.nativeEnum(OrderSide),
    type: z.nativeEnum(OrderType),
    quantity: z.union([z.string(), z.number()]),
    price: z.union([z.string(), z.number()]).optional(),
    tradeMode: z.nativeEnum(TradeMode).optional(),
    leverage: z.number().int().positive().optional(),
    positionAction: positionActionSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (!isValidExchange(data.exchange)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid exchange',
        path: ['exchange'],
      });
    }
    try {
      const normalized = normalizeOrderSymbol(data.exchange, data.symbol);
      const isPerpetual = normalized.includes(':');
      if (isPerpetual) {
        toPerpetualSymbol(normalized);
      }
      if (data.positionAction && !isPerpetual) {
        throw new Error('Position action is only supported for perpetual symbols');
      }
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          error instanceof Error
            ? error.message
            : 'Symbol format is invalid for selected exchange',
        path: ['symbol'],
      });
    }
    const quantity = Number(data.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Quantity must be a positive number',
        path: ['quantity'],
      });
    }
    if (data.type === OrderType.LIMIT) {
      const price = Number(data.price);
      if (!Number.isFinite(price) || price <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Price must be a positive number for limit orders',
          path: ['price'],
        });
      }
    }

    if (data.positionAction) {
      const expectedSide =
        data.positionAction === 'OPEN_LONG' || data.positionAction === 'CLOSE_SHORT'
          ? OrderSide.BUY
          : OrderSide.SELL;
      if (data.side !== expectedSide) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Position action does not match side',
          path: ['positionAction'],
        });
      }
    }
  });

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const strategyId = searchParams.get('strategyId');
    const symbol = searchParams.get('symbol');
    const exchange = searchParams.get('exchange');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    interface OrderFilters {
      strategyId?: number;
      symbol?: string;
      exchange?: string;
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
    if (exchange) filters.exchange = exchange;
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

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = orderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid order payload', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    let normalizedSymbol = normalizeOrderSymbol(parsed.data.exchange, parsed.data.symbol);
    if (normalizedSymbol.includes(':')) {
      normalizedSymbol = toPerpetualSymbol(normalizedSymbol);
    }

    console.info('[Orders] Manual order submission', {
      userId: session.user.id,
      exchange: parsed.data.exchange,
      symbol: normalizedSymbol,
      side: parsed.data.side,
      type: parsed.data.type,
      quantity: parsed.data.quantity,
      price: parsed.data.price ?? null,
      tradeMode: parsed.data.tradeMode ?? null,
      leverage: parsed.data.leverage ?? null,
      positionAction: parsed.data.positionAction ?? null,
    });

    const order = await executeManualOrder(session.user.id, {
      exchange: parsed.data.exchange,
      symbol: normalizedSymbol,
      side: parsed.data.side,
      type: parsed.data.type,
      quantity: parsed.data.quantity,
      price: parsed.data.price,
      tradeMode: parsed.data.tradeMode,
      leverage: parsed.data.leverage,
      positionAction: parsed.data.positionAction,
    });

    return NextResponse.json({ order });
  } catch (error) {
    console.error('Failed to place order:', error);
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
          ? `Failed to place order: ${exchangeMessage}`
          : 'Failed to place order',
      },
      { status: 500 },
    );
  }
}
