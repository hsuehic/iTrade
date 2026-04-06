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
import type { IStrategy } from '@itrade/core';

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
    const { strategyId, entryTtlBars, stopLossPercent } = body as {
      strategyId?: number;
      entryTtlBars?: number;
      stopLossPercent?: number;
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

    // ── Run the backtest ───────────────────────────────────────────────────────

    const engine = new BacktestEngine();

    const backtestConfig = {
      ...config,
      symbols: effectiveSymbols,
      timeframe: effectiveTimeframe,
      entryTtlBars: entryTtlBars ?? 16,
      stopLossPercent: stopLossPercent ?? 0,
    };

    const result = await engine.runBacktest(strategyFactory, backtestConfig, dataManager);

    // ── Persist the result ─────────────────────────────────────────────────────

    const savedResult = await backtestRepo.createResult({
      configId,
      strategyId,
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
      const tradeEntities = result.trades.map((t) => {
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
      const sampled = result.equity.filter((_, i) => i % step === 0);
      const equityEntities = sampled.map((pt) => {
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
