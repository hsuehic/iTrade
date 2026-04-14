import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import { BacktestRepository } from '@itrade/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_LIMIT = 1500;
const BINANCE_BATCH_SIZE = 1000;
const OKX_BATCH_SIZE = 100;

const isValidSymbol = (symbol: string) => /^[A-Za-z0-9/_:-]+$/.test(symbol);
const isValidInterval = (interval: string) => /^\d+[smhdwMy]$/.test(interval);

const toOkxBar = (interval: string) => {
  if (interval.endsWith('h')) return interval.replace('h', 'H');
  if (interval.endsWith('d')) return interval.replace('d', 'D');
  if (interval.endsWith('w')) return interval.replace('w', 'W');
  return interval;
};

const getIntervalMs = (interval: string) => {
  const amount = parseInt(interval, 10);
  const unit = interval.replace(String(amount), '');
  switch (unit) {
    case 'm':
      return amount * 60 * 1000;
    case 'h':
      return amount * 60 * 60 * 1000;
    case 'd':
      return amount * 24 * 60 * 60 * 1000;
    case 'w':
      return amount * 7 * 24 * 60 * 60 * 1000;
    default:
      return 60 * 1000;
  }
};

const resolveBinanceSymbol = (symbol: string) => {
  const upper = symbol.toUpperCase();
  if (upper.includes(':')) {
    const [pair] = upper.split(':');
    return pair.replace('/', '');
  }
  return upper.replace('/', '');
};

const toOkxInstId = (symbol: string, marketType?: string | null) => {
  if (symbol.includes('-SWAP') || symbol.includes('-FUTURES')) {
    return symbol;
  }
  const normalized = symbol.replace(/\//g, '-');
  if (marketType === 'spot') return normalized.replace(/:.*/, '');
  if (marketType === 'perpetual' || marketType === 'futures' || symbol.includes(':')) {
    return normalized.replace(/:.*/, '-SWAP');
  }
  return normalized.replace(/:.*/, '');
};

const inferExchange = (symbol: string, exchange?: string | null) => {
  if (exchange) return exchange.toLowerCase();
  if (symbol.includes('-') || symbol.includes(':')) return 'okx';
  return 'binance';
};

// GET /api/backtest/results/[resultId]/klines - Get kline data for a result
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resultId: string }> },
) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const debug = searchParams.has('debug');
    const host = request.headers.get('host') ?? '';
    const allowDebugBypass =
      debug && (process.env.NODE_ENV !== 'production' || host.includes('localhost'));
    const session = await getSession(request);
    if (!session?.user?.id && !allowDebugBypass) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { resultId: id } = await params;
    const resultId = parseInt(id, 10);

    if (isNaN(resultId)) {
      return NextResponse.json({ error: 'Invalid result ID' }, { status: 400 });
    }

    const dataManager = await getDataManager();
    const dataSource = dataManager.dataSource;
    const backtestRepo = new BacktestRepository(dataSource);

    const result = await backtestRepo.findResultById(resultId, {
      includeEquity: false,
      includeTrades: false,
      includeStrategy: true,
    });

    if (!result) {
      return NextResponse.json({ error: 'Result not found' }, { status: 404 });
    }

    const config = result.config?.id
      ? await backtestRepo.findConfigById(result.config.id)
      : null;

    if (!config || (!allowDebugBypass && config.user?.id !== session?.user?.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const symbolParam = searchParams.get('symbol')?.trim();
    const intervalParam = searchParams.get('interval')?.trim();
    const limitParam = searchParams.get('limit');

    const availableSymbols =
      config.symbols && config.symbols.length > 0
        ? config.symbols
        : result.strategy?.symbol
          ? [result.strategy.symbol]
          : [];

    const symbol = symbolParam ?? availableSymbols[0];

    if (!symbol) {
      return NextResponse.json(
        { error: 'Missing symbol for kline data' },
        { status: 400 },
      );
    }

    if (!isValidSymbol(symbol)) {
      return NextResponse.json({ error: 'Invalid symbol format' }, { status: 400 });
    }

    if (symbolParam && config.symbols?.length && !config.symbols.includes(symbol)) {
      return NextResponse.json(
        { error: 'Symbol not in backtest config' },
        { status: 400 },
      );
    }

    const strategyInterval =
      result.strategy?.parameters &&
      typeof (result.strategy.parameters as Record<string, unknown>).klineInterval ===
        'string'
        ? ((result.strategy.parameters as Record<string, unknown>)
            .klineInterval as string)
        : null;

    const interval = intervalParam ?? strategyInterval ?? config.timeframe ?? '1h';

    if (!isValidInterval(interval)) {
      return NextResponse.json({ error: 'Invalid interval format' }, { status: 400 });
    }

    if (!config.startDate || !config.endDate) {
      return NextResponse.json(
        { error: 'Backtest date range unavailable' },
        { status: 400 },
      );
    }

    const parsedLimit = limitParam ? parseInt(limitParam, 10) : MAX_LIMIT;
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT)
      : MAX_LIMIT;

    const strategyExchange = result.strategy?.exchange?.toLowerCase() ?? null;
    const preferOkx = strategyExchange
      ? strategyExchange === 'okx'
      : symbol.includes(':');
    const exchangeId = strategyExchange ?? inferExchange(symbol, null);
    const marketType = result.strategy?.marketType?.toString() ?? null;
    const intervalMs = getIntervalMs(interval);
    const endDate = config.endDate;
    const minStart = config.startDate;
    const targetStart = new Date(
      Math.max(minStart.getTime(), endDate.getTime() - intervalMs * limit),
    );

    let klines: Array<{
      openTime: Date;
      closeTime: Date;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }> = [];
    let binanceMeta: { count: number; error?: string } | null = null;
    let okxMeta: { count: number; error?: string } | null = null;

    const fetchBinanceKlines = async () => {
      const isFutures =
        marketType === 'perpetual' ||
        marketType === 'futures' ||
        symbol.includes(':') ||
        symbol.includes('_PERP');
      const binanceSymbol =
        result.strategy?.normalizedSymbol?.trim() || resolveBinanceSymbol(symbol);
      const baseUrl = isFutures ? 'https://fapi.binance.com' : 'https://api.binance.com';
      const endpoint = isFutures ? '/fapi/v1/klines' : '/api/v3/klines';

      const url = new URL(`${baseUrl}${endpoint}`);
      url.searchParams.set('symbol', binanceSymbol);
      url.searchParams.set('interval', interval);
      url.searchParams.set('limit', String(Math.min(BINANCE_BATCH_SIZE, limit)));
      url.searchParams.set('startTime', String(targetStart.getTime()));

      let res = await fetch(url.toString());
      if (!res.ok) {
        return { error: `Failed to fetch Binance klines (${res.status})`, data: [] };
      }

      let raw: Array<
        [number, string, string, string, string, string, number, string, number]
      > = await res.json();
      if (raw.length === 0) {
        const fallbackUrl = new URL(`${baseUrl}${endpoint}`);
        fallbackUrl.searchParams.set('symbol', binanceSymbol);
        fallbackUrl.searchParams.set('interval', interval);
        fallbackUrl.searchParams.set(
          'limit',
          String(Math.min(BINANCE_BATCH_SIZE, limit)),
        );
        res = await fetch(fallbackUrl.toString());
        if (res.ok) {
          raw = await res.json();
        }
      }

      const data = raw
        .map((k) => ({
          openTime: new Date(k[0]),
          closeTime: new Date(k[6]),
          open: k[1],
          high: k[2],
          low: k[3],
          close: k[4],
          volume: k[5],
        }))
        .filter((k) => k.openTime <= endDate);
      return { data };
    };

    const fetchOkxKlines = async () => {
      const instId = toOkxInstId(symbol, marketType);
      const baseUrl = 'https://www.okx.com';
      const endpoint = '/api/v5/market/history-candles';

      const url = new URL(`${baseUrl}${endpoint}`);
      url.searchParams.set('instId', instId);
      url.searchParams.set('bar', toOkxBar(interval));
      url.searchParams.set('limit', String(Math.min(OKX_BATCH_SIZE, limit)));
      url.searchParams.set('after', String(endDate.getTime()));

      const res = await fetch(url.toString());
      if (!res.ok) {
        return { error: `Failed to fetch OKX klines (${res.status})`, data: [] };
      }

      const data = await res.json();
      if (data.code !== '0' || !Array.isArray(data.data) || data.data.length === 0) {
        return { error: 'No OKX kline data found', data: [] };
      }

      const parsed = data.data
        .map((k: string[]) => ({
          openTime: new Date(parseInt(k[0], 10)),
          closeTime: new Date(parseInt(k[0], 10) + intervalMs),
          open: k[1],
          high: k[2],
          low: k[3],
          close: k[4],
          volume: k[5],
        }))
        .filter((k) => k.openTime <= endDate && k.openTime >= targetStart)
        .reverse();
      return { data: parsed };
    };

    if (exchangeId === 'binance') {
      const resultBinance = await fetchBinanceKlines();
      binanceMeta = { count: resultBinance.data.length, error: resultBinance.error };
      klines = resultBinance.data;
      if (klines.length === 0 && (symbol.includes('-') || symbol.includes(':'))) {
        const okxResult = await fetchOkxKlines();
        okxMeta = { count: okxResult.data.length, error: okxResult.error };
        klines = okxResult.data;
        if (klines.length === 0 && okxResult.error) {
          return NextResponse.json({ error: okxResult.error }, { status: 404 });
        }
      } else if (klines.length === 0 && resultBinance.error) {
        return NextResponse.json({ error: resultBinance.error }, { status: 502 });
      }
    } else if (exchangeId === 'okx') {
      const okxResult = await fetchOkxKlines();
      okxMeta = { count: okxResult.data.length, error: okxResult.error };
      klines = okxResult.data;
      if (klines.length === 0 && okxResult.error) {
        const binanceResult = await fetchBinanceKlines();
        binanceMeta = { count: binanceResult.data.length, error: binanceResult.error };
        klines = binanceResult.data;
        if (klines.length === 0) {
          return NextResponse.json({ error: okxResult.error }, { status: 404 });
        }
      }
    } else {
      return NextResponse.json(
        { error: `Exchange ${exchangeId} does not support public klines` },
        { status: 400 },
      );
    }

    const serialized = klines.map((kline) => ({
      openTime: kline.openTime,
      closeTime: kline.closeTime,
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
      volume: kline.volume,
    }));

    return NextResponse.json({
      symbol,
      interval,
      klines: serialized,
      truncated: serialized.length === limit,
      debug: debug
        ? {
            exchangeId,
            preferOkx,
            marketType,
            startTime: targetStart.toISOString(),
            endTime: endDate.toISOString(),
            limit,
            binance: binanceMeta,
            okx: okxMeta,
          }
        : undefined,
    });
  } catch (error) {
    console.error('Error fetching backtest klines:', error);
    return NextResponse.json({ error: 'Failed to fetch kline data' }, { status: 500 });
  }
}
