import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';

import {
  BacktestRepository,
  StrategyRepository,
  BacktestTradeEntity,
  EquityPointEntity,
} from '@itrade/data-manager';
import {
  createStrategyInstance,
  isValidStrategyType,
  type StrategyTypeKey,
} from '@itrade/strategies';
import { BacktestEngine } from '@itrade/backtesting';
import type {
  IStrategy,
  Kline,
  KlineInterval,
  BacktestTrade,
  IDataManager,
} from '@itrade/core';
import { Decimal } from 'decimal.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/backtest/[id]/run
 *
 * Triggers a backtest run for an existing config against a chosen strategy.
 *
 * Request body:
 * {
 *   strategyId:        number  (required) — DB id of the strategy to test
 *   entryTtlBars?:    number  — bars before a pending limit entry expires (default 16)
 *   stopLossPercent?: number  — engine-level SL % from entry price (default 0 = off)
 * }
 *
 * Symbol:    always read from strategyEntity.symbol (strategy owns its symbol)
 * Timeframe: strategyEntity.parameters.klineInterval → config.timeframe → '1h'
 *
 * Returns:
 * { result: { id, totalReturn, winRate, ... } }
 */
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
    const configId = parseInt(id, 10);
    if (isNaN(configId)) {
      return NextResponse.json({ error: 'Invalid config ID' }, { status: 400 });
    }

    const body = await request.json();
    const { strategyId, entryTtlBars, stopLossPercent, name } = body as {
      strategyId?: number;
      entryTtlBars?: number;
      stopLossPercent?: number;
      name?: string;
    };

    if (!strategyId) {
      return NextResponse.json(
        { error: 'strategyId is required to run a backtest' },
        { status: 400 },
      );
    }

    const dataManager = await getDataManager();
    const dataSource = dataManager.dataSource;

    const backtestRepo = new BacktestRepository(dataSource);
    const strategyRepo = new StrategyRepository(dataSource);

    // ── Load and authorise config ──────────────────────────────────────────────

    const config = await backtestRepo.findConfigById(configId);
    if (!config) {
      return NextResponse.json({ error: 'Backtest config not found' }, { status: 404 });
    }
    if (config.user?.id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // ── Load and authorise strategy ────────────────────────────────────────────

    const strategyEntity = await strategyRepo.findById(strategyId);
    if (!strategyEntity) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }
    if (strategyEntity.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Validate that the strategy type is registered in the factory.
    if (!isValidStrategyType(strategyEntity.type)) {
      return NextResponse.json(
        {
          error: `Strategy type '${strategyEntity.type}' is not supported for backtesting`,
        },
        { status: 422 },
      );
    }

    const strategyType = strategyEntity.type as StrategyTypeKey;
    const strategyExchange = strategyEntity.exchange ?? 'binance';

    // ── Build strategy factory ─────────────────────────────────────────────────

    // One isolated instance is created per symbol so that per-symbol state
    // (MA buffers, position tracking, etc.) never bleeds across symbols.
    const strategyFactory = (symbol: string): IStrategy =>
      createStrategyInstance(
        strategyType,
        {
          parameters: strategyEntity.parameters ?? {},
          symbol,
          exchange: strategyExchange,
          subscription: {
            ticker: false,
            klines: true,
            trades: false,
            orderbook: false,
            method: 'websocket',
          },
        },
        strategyEntity.id,
        strategyEntity.name,
      );

    // ── Resolve symbols and timeframe from strategy ────────────────────────────
    //
    // Symbols come exclusively from the strategy (config no longer stores them).
    // Timeframe comes from the strategy's klineInterval parameter; the config's
    // timeframe field is used only as a last-resort fallback.

    const strategyParams = (strategyEntity.parameters ?? {}) as Record<string, unknown>;

    if (!strategyEntity.symbol) {
      return NextResponse.json(
        {
          error:
            'Strategy has no symbol configured. Please set a symbol on the strategy.',
        },
        { status: 400 },
      );
    }

    const effectiveSymbols = [strategyEntity.symbol];

    // Timeframe: strategy's klineInterval takes precedence over config.timeframe.
    const effectiveTimeframe =
      typeof strategyParams.klineInterval === 'string' && strategyParams.klineInterval
        ? strategyParams.klineInterval
        : (config.timeframe ?? '1h');

    // ── Fetch Klines Lively ──────────────────────────────────────────────────
    //
    // We fetch kline data directly from Binance in-memory and bypass the local
    // database for both storage and retrieval. This ensures fresh data for every
    // run without bloating the local DB.

    const allMemoryKlines: Kline[] = [];

    const getIntervalMs = (interval: string) => {
      const amount = parseInt(interval);
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

    try {
      for (const symbol of effectiveSymbols) {
        const exchangeId = (strategyEntity.exchange || 'binance').toLowerCase();
        console.log(`[Backtest] Fetching live klines for ${symbol} from ${exchangeId}…`);

        const warmupBars = 1000;
        const intervalMs = getIntervalMs(effectiveTimeframe);
        let batchStart = new Date(config.startDate.getTime() - warmupBars * intervalMs);

        if (exchangeId === 'binance') {
          const isFutures = symbol.includes(':') || symbol.includes('_PERP');
          const binanceSymbol = (() => {
            const upper = symbol.toUpperCase();
            if (upper.includes(':')) {
              const [pair] = upper.split(':');
              return pair.replace('/', '');
            }
            return upper.replace('/', '');
          })();

          const baseUrl = isFutures
            ? 'https://fapi.binance.com'
            : 'https://api.binance.com';
          const endpoint = isFutures ? '/fapi/v1/klines' : '/api/v3/klines';
          const BATCH_SIZE = 1000;

          while (batchStart < config.endDate) {
            const url = new URL(`${baseUrl}${endpoint}`);
            url.searchParams.set('symbol', binanceSymbol);
            url.searchParams.set('interval', effectiveTimeframe);
            url.searchParams.set('limit', String(BATCH_SIZE));
            url.searchParams.set('startTime', String(batchStart.getTime()));
            url.searchParams.set('endTime', String(config.endDate.getTime()));

            const res = await fetch(url.toString());
            if (!res.ok) {
              console.warn(
                `[Backtest] Binance kline fetch failed: ${res.status} ${await res.text()}`,
              );
              break;
            }

            const raw: any[][] = await res.json();
            if (!Array.isArray(raw) || raw.length === 0) break;

            const batch: Kline[] = raw.map((k) => ({
              symbol,
              exchange: 'binance',
              interval: effectiveTimeframe as KlineInterval,
              openTime: new Date(k[0]),
              closeTime: new Date(k[6]),
              open: new Decimal(k[1]),
              high: new Decimal(k[2]),
              low: new Decimal(k[3]),
              close: new Decimal(k[4]),
              volume: new Decimal(k[5]),
              quoteVolume: new Decimal(k[7]),
              trades: k[8],
              isClosed: true,
            }));

            allMemoryKlines.push(...batch);
            const lastOpen = batch[batch.length - 1].openTime;
            batchStart = new Date(lastOpen.getTime() + 1);
            if (batch.length < BATCH_SIZE) break;
          }
        } else if (exchangeId === 'okx') {
          // OKX Implementation
          // instId: WLD/USDC:USDC -> WLD-USDC-SWAP
          const okxInstId = symbol.replace(/\//g, '-').replace(/:.*/, '-SWAP');
          const baseUrl = 'https://www.okx.com';
          const endpoint = '/api/v5/market/history-candles';
          const BATCH_SIZE = 100;

          while (batchStart < config.endDate) {
            const url = new URL(`${baseUrl}${endpoint}`);
            url.searchParams.set('instId', okxInstId);
            url.searchParams.set('bar', effectiveTimeframe);
            url.searchParams.set('limit', String(BATCH_SIZE));
            url.searchParams.set('after', String(batchStart.getTime()));

            const res = await fetch(url.toString());
            if (!res.ok) {
              console.warn(
                `[Backtest] OKX kline fetch failed: ${res.status} ${await res.text()}`,
              );
              break;
            }

            const data = await res.json();
            if (data.code !== '0' || !Array.isArray(data.data) || data.data.length === 0)
              break;

            const batch: Kline[] = data.data.map((k: string[]) => ({
              symbol,
              exchange: 'okx',
              interval: effectiveTimeframe as KlineInterval,
              openTime: new Date(parseInt(k[0])),
              closeTime: new Date(parseInt(k[0]) + intervalMs),
              open: new Decimal(k[1]),
              high: new Decimal(k[2]),
              low: new Decimal(k[3]),
              close: new Decimal(k[4]),
              volume: new Decimal(k[5]),
              quoteVolume: new Decimal(k[6]),
              trades: 0,
              isClosed: true,
            }));

            // OKX returns newest first, so we reverse it to match our chronological flow
            batch.reverse();
            allMemoryKlines.push(...batch);

            const lastOpen = batch[batch.length - 1].openTime;
            batchStart = new Date(lastOpen.getTime() + 1);
            if (batch.length < BATCH_SIZE) break;
          }
        } else {
          console.warn(`[Backtest] Live fetch not yet implemented for ${exchangeId}`);
          break;
        }

        console.log(`[Backtest] Fetched ${allMemoryKlines.length} bars for ${symbol}`);
      }
    } catch (fetchErr) {
      console.error('[Backtest] Live kline fetch failed:', fetchErr);
      return NextResponse.json(
        { error: 'Failed to fetch live kline data from exchange' },
        { status: 500 },
      );
    }

    // ── Run the backtest ───────────────────────────────────────────────────────

    const engine = new BacktestEngine();

    const backtestConfig = {
      ...config,
      symbols: effectiveSymbols,
      timeframe: effectiveTimeframe,
      entryTtlBars: entryTtlBars ?? 16,
      stopLossPercent: stopLossPercent ?? 0,
    };

    // Use a temporary MemoryDataManager that serves our live-fetched klines
    const memoryDataManager = {
      getKlines: async (sym: string, interval: string, start: Date, end: Date) => {
        return allMemoryKlines.filter(
          (k) =>
            k.symbol === sym &&
            k.interval === interval &&
            k.openTime >= start &&
            k.openTime < end,
        );
      },
    } as any as IDataManager;

    const result = await engine.runBacktest(
      strategyFactory,
      backtestConfig,
      memoryDataManager,
    );

    // ── Persist the result ─────────────────────────────────────────────────────

    const savedResult = await backtestRepo.createResult({
      configId,
      strategyId,
      name: name?.trim() || undefined,
      totalReturn: result.totalReturn.toNumber(),
      annualizedReturn: result.annualizedReturn.toNumber(),
      sharpeRatio: result.sharpeRatio.toNumber(),
      maxDrawdown: result.maxDrawdown.toNumber(),
      winRate: result.winRate.toNumber(),
      profitFactor: result.profitFactor.isFinite() ? result.profitFactor.toNumber() : 0,
      totalTrades: result.totalTrades,
      avgTradeDuration: Math.round(result.avgTradeDuration),
    });

    // Persist per-trade records
    if (result.trades.length > 0) {
      const tradeRepo = dataSource.getRepository(BacktestTradeEntity);
      const tradeEntities = result.trades.map((t: BacktestTrade) => {
        const entity = new BacktestTradeEntity();
        Object.assign(entity, {
          result: savedResult,
          symbol: t.symbol || effectiveSymbols[0] || '',
          side: t.side,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          quantity: t.quantity,
          entryTime: t.entryTime,
          exitTime: t.exitTime,
          pnl: t.pnl,
          commission: t.commission,
          duration: t.duration,
          entryCashBalance: t.entryCashBalance ?? null,
          entryPositionSize: t.entryPositionSize ?? null,
          cashBalance: t.cashBalance ?? null,
          positionSize: t.positionSize ?? null,
        });
        return entity;
      });
      await tradeRepo.save(tradeEntities);
    }

    // Persist equity curve (sampled to keep storage reasonable)
    if (result.equity.length > 0) {
      const equityRepo = dataSource.getRepository(EquityPointEntity);
      // Sample at most 2000 points to avoid excessive DB writes
      const step = Math.max(1, Math.floor(result.equity.length / 2000));
      const sampled = result.equity.filter(
        (_: { timestamp: Date; value: Decimal }, i: number) => i % step === 0,
      );
      const equityEntities = sampled.map((pt: { timestamp: Date; value: Decimal }) => {
        const entity = new EquityPointEntity();
        Object.assign(entity, {
          result: savedResult,
          timestamp: pt.timestamp,
          value: pt.value,
        });
        return entity;
      });
      await equityRepo.save(equityEntities);
    }

    // ── Respond ────────────────────────────────────────────────────────────────

    return NextResponse.json({
      result: {
        id: savedResult.id,
        configId,
        strategyId,
        totalReturn: result.totalReturn.toString(),
        annualizedReturn: result.annualizedReturn.toString(),
        sharpeRatio: result.sharpeRatio.toString(),
        maxDrawdown: result.maxDrawdown.toString(),
        winRate: result.winRate.toString(),
        profitFactor: result.profitFactor.isFinite()
          ? result.profitFactor.toString()
          : '0',
        totalTrades: result.totalTrades,
        avgTradeDuration: result.avgTradeDuration,
        createdAt: savedResult.createdAt,
      },
    });
  } catch (error) {
    console.error('Error running backtest:', error);
    return NextResponse.json(
      { error: 'Failed to run backtest', detail: (error as Error).message },
      { status: 500 },
    );
  }
}
