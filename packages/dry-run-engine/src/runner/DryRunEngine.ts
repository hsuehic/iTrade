import { Decimal } from 'decimal.js';
import {
  IStrategy,
  Kline,
  isOrderResult,
  normalizeAnalyzeResult,
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
  BacktestResult,
  BacktestTrade,
} from '@itrade/core';
import {
  DryRunOrderEntity,
  DryRunTradeEntity,
  TypeOrmDataManager,
  TypeOrmDataManagerConfig,
} from '@itrade/data-manager';

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
    options: DryRunRunOptions,
  ): Promise<BacktestResult> {
    await this.dataManager.initialize();

    // Create session
    const session = await this.dataManager.createDryRunSession({
      strategyId: options.strategy?.id,
      name: options.name,
      parametersSnapshot: strategy.config as unknown as Record<string, unknown>,
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

    const trades: BacktestTrade[] = [];
    const ordersToSave: Array<
      Omit<DryRunOrderEntity, 'internalId' | 'session' | 'createdAt' | 'updatedAt'>
    > = [];
    const tradesToSave: Array<Omit<DryRunTradeEntity, 'id' | 'session'>> = [];

    // Iterate symbols and klines
    for (const symbol of params.symbols) {
      const klines: Kline[] = await this.dataManager.getKlines(
        symbol,
        params.timeframe,
        params.startDate,
        params.endDate,
      );

      for (const k of klines) {
        const results = normalizeAnalyzeResult(await strategy.analyze({ klines: [k] }));

        for (const result of results) {
          if (!isOrderResult(result) || !result.quantity) {
            continue;
          }

          const side = result.action === 'buy' ? OrderSide.BUY : OrderSide.SELL;
          const price = result.price ?? k.close;
          const commission = price.mul(result.quantity).mul(params.commission);

          // Persist order
          const order: Omit<
            DryRunOrderEntity,
            'internalId' | 'session' | 'createdAt' | 'updatedAt'
          > = {
            id: `${symbol}_${k.closeTime.getTime()}_${side}`, // Added side to uniqueness to avoid collision if mulitple orders
            clientOrderId: undefined,
            symbol,
            side,
            type: OrderType.MARKET,
            quantity: result.quantity,
            price,
            stopPrice: undefined,
            status: OrderStatus.FILLED,
            timeInForce: TimeInForce.GTC,
            timestamp: k.closeTime,
            updateTime: k.closeTime,
            executedQuantity: result.quantity,
            cummulativeQuoteQuantity: price.mul(result.quantity),
            fills: [],
          };
          ordersToSave.push(order);

          // Update equity
          if (side === OrderSide.BUY) {
            const cost = price.mul(result.quantity).add(commission);
            balance = balance.sub(cost);
          } else {
            const proceeds = price.mul(result.quantity).sub(commission);
            balance = balance.add(proceeds);
          }

          // Persist trade if sell (close)
          if (side === OrderSide.SELL) {
            const pnl = price.mul(result.quantity).sub(commission);
            const trade: BacktestTrade = {
              symbol,
              side: OrderSide.SELL,
              entryPrice: price,
              exitPrice: price,
              quantity: result.quantity,
              entryTime: k.openTime,
              exitTime: k.closeTime,
              pnl,
              commission,
              duration: 1,
            };
            trades.push(trade);
            tradesToSave.push(trade);
          }
        }

        // Record equity after processing all potential signals for this kline
        equity.push({ timestamp: k.closeTime, value: balance });
      }
    }

    // Compute simple metrics
    const result: BacktestResult = {
      totalReturn: balance.sub(params.initialBalance).div(params.initialBalance),
      annualizedReturn: new Decimal(0),
      sharpeRatio: new Decimal(0),
      maxDrawdown: new Decimal(0),
      winRate: new Decimal(0),
      profitFactor: new Decimal(0),
      totalTrades: trades.length,
      avgTradeDuration:
        trades.reduce((sum, trade) => sum + trade.duration, 0) / (trades.length || 1),
      equity,
      trades,
    } as BacktestResult;

    // Persist result
    await this.dataManager.saveDryRunOrders(session.id, ordersToSave);
    await this.dataManager.saveDryRunTrades(session.id, tradesToSave);
    await this.dataManager.saveDryRunResult(session.id, result);

    await this.dataManager.close();
    return result;
  }
}
