import { Decimal } from 'decimal.js';
import {
  IStrategy,
  Kline,
  StrategyResult,
  OrderSide,
  BacktestResult,
} from '@itrade/core';
import {
  TypeOrmDataManager,
  TypeOrmDataManagerConfig,
} from '@itrade/data-manager';
import { DryRunOrderEntity, DryRunTradeEntity } from '@itrade/data-manager';

export interface DryRunRunOptions {
  userId: string;
  strategy?: { id: number };
  name?: string;
  notes?: string;
}

export class DryRunEngine {
  constructor(private readonly dataManager: TypeOrmDataManager) {}

  static fromConfig(config: TypeOrmDataManagerConfig): DryRunEngine {
    const dm = new TypeOrmDataManager(config);
    return new DryRunEngine(dm as unknown as TypeOrmDataManager);
  }

  async run(
    strategy: IStrategy,
    params: {
      symbols: string[];
      timeframe: string;
      startDate: Date;
      endDate: Date;
      initialBalance: Decimal;
      commission: Decimal;
      slippage?: Decimal;
    },
    options: DryRunRunOptions
  ): Promise<BacktestResult> {
    await this.dataManager.initialize();

    // Create session
    const session = await (this.dataManager as any).createDryRunSession({
      strategyId: options.strategy?.id,
      name: options.name,
      parametersSnapshot: strategy.parameters,
      startTime: params.startDate,
      timeframe: params.timeframe,
      symbols: params.symbols,
      initialBalance: params.initialBalance,
      commission: params.commission,
      slippage: params.slippage,
      notes: options.notes,
      userId: options.userId,
    });

    // State
    let balance = new Decimal(params.initialBalance);
    const equity: Array<{ timestamp: Date; value: Decimal }> = [
      { timestamp: params.startDate, value: balance },
    ];

    const trades: any[] = [];

    // Iterate symbols and klines
    for (const symbol of params.symbols) {
      const klines: Kline[] = await (this.dataManager as any).getKlines(
        symbol,
        params.timeframe,
        params.startDate,
        params.endDate
      );

      for (const k of klines) {
        const result: StrategyResult = await strategy.analyze({ klines: [k] });
        if (result.action === 'hold' || !result.quantity) {
          equity.push({ timestamp: k.closeTime, value: balance });
          continue;
        }

        const side = result.action === 'buy' ? OrderSide.BUY : OrderSide.SELL;
        const price = result.price ?? k.close;
        const commission = price.mul(result.quantity).mul(params.commission);

        // Persist order
        const order: Partial<DryRunOrderEntity> = {
          id: `${symbol}_${k.closeTime.getTime()}`,
          clientOrderId: undefined,
          session,
          symbol,
          side: side as any,
          type: 'MARKET' as any,
          quantity: result.quantity as any,
          price: price as any,
          stopPrice: undefined,
          status: 'FILLED' as any,
          timeInForce: 'GTC' as any,
          timestamp: k.closeTime,
          updateTime: k.closeTime,
          executedQuantity: result.quantity as any,
          cummulativeQuoteQuantity: price.mul(result.quantity) as any,
          fills: [],
        };
        await (this.dataManager as any).dataSource
          .getRepository(DryRunOrderEntity)
          .save(order as DryRunOrderEntity);

        // Update equity
        if (side === OrderSide.BUY) {
          const cost = price.mul(result.quantity).add(commission);
          balance = balance.sub(cost);
        } else {
          const proceeds = price.mul(result.quantity).sub(commission);
          balance = balance.add(proceeds);
        }
        equity.push({ timestamp: k.closeTime, value: balance });

        // Persist trade if sell (close)
        if (side === OrderSide.SELL) {
          const pnl = price.mul(result.quantity).sub(commission);
          const trade: Partial<DryRunTradeEntity> = {
            session,
            symbol,
            side: OrderSide.SELL as any,
            entryPrice: price as any,
            exitPrice: price as any,
            quantity: result.quantity as any,
            entryTime: k.openTime,
            exitTime: k.closeTime,
            pnl: pnl as any,
            commission: commission as any,
            duration: 1,
          };
          await (this.dataManager as any).dataSource
            .getRepository(DryRunTradeEntity)
            .save(trade as DryRunTradeEntity);
          trades.push(trade);
        }
      }
    }

    // Compute simple metrics
    const result: BacktestResult = {
      totalReturn: balance
        .sub(params.initialBalance)
        .div(params.initialBalance),
      annualizedReturn: new Decimal(0),
      sharpeRatio: new Decimal(0),
      maxDrawdown: new Decimal(0),
      winRate: new Decimal(0),
      profitFactor: new Decimal(0),
      totalTrades: trades.length,
      avgTradeDuration:
        trades.reduce((sum, t) => sum + (t as any).duration || 0, 0) /
        (trades.length || 1),
      equity,
      trades: trades as any,
    } as BacktestResult;

    // Persist result
    await (this.dataManager as any).saveDryRunResult(session.id, result as any);

    await this.dataManager.close();
    return result;
  }
}
