import { DataSource, Repository } from 'typeorm';

import { OrderEntity } from '../entities/Order';

export class PnLRepository {
  private repository: Repository<OrderEntity>;

  constructor(private dataSource: DataSource) {
    this.repository = dataSource.getRepository(OrderEntity);
  }

  async getStrategyPnL(strategyId: number): Promise<{
    totalPnl: number;
    realizedPnl: number;
    unrealizedPnl: number;
    totalOrders: number;
    filledOrders: number;
  }> {
    const result = await this.repository
      .createQueryBuilder('order')
      .select('COUNT(*)', 'totalOrders')
      .addSelect(
        "COUNT(CASE WHEN order.status = 'FILLED' THEN 1 END)",
        'filledOrders'
      )
      .addSelect('COALESCE(SUM(order.realizedPnl), 0)', 'realizedPnl')
      .addSelect('COALESCE(SUM(order.unrealizedPnl), 0)', 'unrealizedPnl')
      .where('order.strategyId = :strategyId', { strategyId })
      .getRawOne();

    const realizedPnl = parseFloat(result.realizedPnl || '0');
    const unrealizedPnl = parseFloat(result.unrealizedPnl || '0');

    return {
      totalPnl: realizedPnl + unrealizedPnl,
      realizedPnl,
      unrealizedPnl,
      totalOrders: parseInt(result.totalOrders || '0'),
      filledOrders: parseInt(result.filledOrders || '0'),
    };
  }

  async getOverallPnL(userId?: string): Promise<{
    totalPnl: number;
    realizedPnl: number;
    unrealizedPnl: number;
    totalOrders: number;
    strategies: Array<{
      strategyId: number;
      strategyName: string;
      pnl: number;
      realizedPnl: number;
      unrealizedPnl: number;
    }>;
  }> {
    let query = this.repository
      .createQueryBuilder('order')
      .leftJoin('order.strategy', 'strategy')
      .select('strategy.id', 'strategyId')
      .addSelect('strategy.name', 'strategyName')
      .addSelect('COALESCE(SUM(order.realizedPnl), 0)', 'realizedPnl')
      .addSelect('COALESCE(SUM(order.unrealizedPnl), 0)', 'unrealizedPnl')
      .addSelect('COUNT(*)', 'totalOrders')
      .groupBy('strategy.id')
      .addGroupBy('strategy.name');

    if (userId) {
      query = query.where('strategy.userId = :userId', { userId });
    }

    const strategyResults = await query.getRawMany();

    const strategies = strategyResults.map((row) => {
      const realizedPnl = parseFloat(row.realizedPnl || '0');
      const unrealizedPnl = parseFloat(row.unrealizedPnl || '0');
      return {
        strategyId: row.strategyId,
        strategyName: row.strategyName,
        pnl: realizedPnl + unrealizedPnl,
        realizedPnl,
        unrealizedPnl,
      };
    });

    const totalRealizedPnl = strategies.reduce(
      (sum, s) => sum + s.realizedPnl,
      0
    );
    const totalUnrealizedPnl = strategies.reduce(
      (sum, s) => sum + s.unrealizedPnl,
      0
    );
    const totalOrders = strategyResults.reduce(
      (sum, row) => sum + parseInt(row.totalOrders || '0'),
      0
    );

    return {
      totalPnl: totalRealizedPnl + totalUnrealizedPnl,
      realizedPnl: totalRealizedPnl,
      unrealizedPnl: totalUnrealizedPnl,
      totalOrders,
      strategies,
    };
  }
}
