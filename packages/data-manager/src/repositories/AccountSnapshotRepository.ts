import { Repository, DataSource } from 'typeorm';
import { Decimal } from 'decimal.js';
import { Balance, Position } from '@itrade/core';

import { AccountSnapshotEntity } from '../entities/AccountSnapshot';

export interface AccountSnapshotData {
  id?: number;
  exchange: string;
  timestamp: Date;
  totalBalance: Decimal;
  availableBalance: Decimal;
  lockedBalance: Decimal;
  totalPositionValue: Decimal;
  unrealizedPnl: Decimal;
  positionCount: number;
  balances: Balance[];
  positions: Position[];
}

export interface AccountSnapshotQueryOptions {
  exchange?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
}

/**
 * AccountSnapshotRepository - 账户快照数据仓库
 *
 * 提供账户快照的 CRUD 操作
 */
export class AccountSnapshotRepository {
  private repository: Repository<AccountSnapshotEntity>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(AccountSnapshotEntity);
  }

  /**
   * 保存账户快照
   */
  async save(data: AccountSnapshotData): Promise<AccountSnapshotEntity> {
    const entity = this.repository.create({
      exchange: data.exchange,
      timestamp: data.timestamp,
      totalBalance: data.totalBalance,
      availableBalance: data.availableBalance,
      lockedBalance: data.lockedBalance,
      totalPositionValue: data.totalPositionValue,
      unrealizedPnl: data.unrealizedPnl,
      positionCount: data.positionCount,
      balances: data.balances.map((b) => ({
        asset: b.asset,
        free: b.free.toString(),
        locked: b.locked.toString(),
        total: b.total.toString(),
      })),
      positions: data.positions.map((p) => ({
        symbol: p.symbol,
        side: p.side,
        quantity: p.quantity.toString(),
        avgPrice: p.avgPrice.toString(),
        markPrice: p.markPrice.toString(),
        unrealizedPnl: p.unrealizedPnl.toString(),
        leverage: p.leverage.toString(),
        timestamp: p.timestamp.toISOString(),
      })),
    });

    return await this.repository.save(entity);
  }

  /**
   * 获取最新的账户快照
   */
  async getLatest(exchange: string): Promise<AccountSnapshotData | null> {
    const entity = await this.repository.findOne({
      where: { exchange },
      order: { timestamp: 'DESC' },
    });

    return entity ? this.entityToData(entity) : null;
  }

  /**
   * 获取所有交易所的最新快照
   */
  async getLatestForAllExchanges(): Promise<AccountSnapshotData[]> {
    const exchanges = await this.repository
      .createQueryBuilder('snapshot')
      .select('DISTINCT snapshot.exchange', 'exchange')
      .getRawMany();

    const results: AccountSnapshotData[] = [];

    for (const { exchange } of exchanges) {
      const latest = await this.getLatest(exchange);
      if (latest) {
        results.push(latest);
      }
    }

    return results;
  }

  /**
   * 查询账户快照历史
   */
  async query(
    options: AccountSnapshotQueryOptions
  ): Promise<AccountSnapshotData[]> {
    const queryBuilder = this.repository.createQueryBuilder('snapshot');

    if (options.exchange) {
      queryBuilder.andWhere('snapshot.exchange = :exchange', {
        exchange: options.exchange,
      });
    }

    if (options.startTime) {
      queryBuilder.andWhere('snapshot.timestamp >= :startTime', {
        startTime: options.startTime,
      });
    }

    if (options.endTime) {
      queryBuilder.andWhere('snapshot.timestamp <= :endTime', {
        endTime: options.endTime,
      });
    }

    queryBuilder.orderBy('snapshot.timestamp', 'DESC');

    if (options.limit) {
      queryBuilder.take(options.limit);
    }

    const entities = await queryBuilder.getMany();
    return entities.map((e) => this.entityToData(e));
  }

  /**
   * 获取账户历史快照（时间范围）
   */
  async getHistory(
    exchange: string,
    startTime: Date,
    endTime: Date
  ): Promise<AccountSnapshotData[]> {
    // Use QueryBuilder for better performance with indexes
    const entities = await this.repository
      .createQueryBuilder('snapshot')
      .where('snapshot.exchange = :exchange', { exchange })
      .andWhere('snapshot.timestamp BETWEEN :startTime AND :endTime', {
        startTime,
        endTime,
      })
      .orderBy('snapshot.timestamp', 'ASC')
      .cache(30000) // Cache for 30 seconds
      .getMany();

    return entities.map((e) => this.entityToData(e));
  }

  /**
   * 获取指定时间段的快照统计
   */
  async getStatistics(
    exchange: string,
    startTime: Date,
    endTime: Date
  ): Promise<{
    count: number;
    avgBalance: Decimal;
    maxBalance: Decimal;
    minBalance: Decimal;
    avgPositionCount: number;
    maxPositionCount: number;
    totalPnl: Decimal;
  }> {
    const snapshots = await this.getHistory(exchange, startTime, endTime);

    if (snapshots.length === 0) {
      return {
        count: 0,
        avgBalance: new Decimal(0),
        maxBalance: new Decimal(0),
        minBalance: new Decimal(0),
        avgPositionCount: 0,
        maxPositionCount: 0,
        totalPnl: new Decimal(0),
      };
    }

    const balances = snapshots.map((s) => s.totalBalance);
    const positionCounts = snapshots.map((s) => s.positionCount);
    const pnls = snapshots.map((s) => s.unrealizedPnl);

    return {
      count: snapshots.length,
      avgBalance: balances
        .reduce((sum, b) => sum.add(b), new Decimal(0))
        .div(balances.length),
      maxBalance: balances.reduce(
        (max, b) => (b.gt(max) ? b : max),
        balances[0]
      ),
      minBalance: balances.reduce(
        (min, b) => (b.lt(min) ? b : min),
        balances[0]
      ),
      avgPositionCount: Math.round(
        positionCounts.reduce((sum, c) => sum + c, 0) / positionCounts.length
      ),
      maxPositionCount: Math.max(...positionCounts),
      totalPnl: pnls.reduce((sum, p) => sum.add(p), new Decimal(0)),
    };
  }

  /**
   * 删除旧的快照（数据清理）
   */
  async deleteOlderThan(days: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .where('timestamp < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected || 0;
  }

  /**
   * 删除指定交易所的所有快照
   */
  async deleteByExchange(exchange: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .where('exchange = :exchange', { exchange })
      .execute();

    return result.affected || 0;
  }

  /**
   * 获取账户余额时间序列数据（用于图表）
   */
  async getBalanceTimeSeries(
    exchange: string,
    startTime: Date,
    endTime: Date,
    interval: 'hour' | 'day' | 'week' = 'day'
  ): Promise<Array<{ timestamp: Date; balance: Decimal }>> {
    const snapshots = await this.getHistory(exchange, startTime, endTime);

    if (interval === 'hour' || snapshots.length <= 100) {
      return snapshots.map((s) => ({
        timestamp: s.timestamp,
        balance: s.totalBalance,
      }));
    }

    // 按天或周聚合
    const groupedData: Map<string, AccountSnapshotData[]> = new Map();

    snapshots.forEach((snapshot) => {
      let key: string;

      if (interval === 'day') {
        key = snapshot.timestamp.toISOString().split('T')[0];
      } else {
        // week
        const date = new Date(snapshot.timestamp);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
      }

      if (!groupedData.has(key)) {
        groupedData.set(key, []);
      }
      groupedData.get(key)!.push(snapshot);
    });

    // 取每组的最后一个快照
    const result: Array<{ timestamp: Date; balance: Decimal }> = [];
    for (const [, group] of groupedData) {
      const lastSnapshot = group[group.length - 1];
      result.push({
        timestamp: lastSnapshot.timestamp,
        balance: lastSnapshot.totalBalance,
      });
    }

    return result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * 将实体转换为数据对象
   */
  private entityToData(entity: AccountSnapshotEntity): AccountSnapshotData {
    return {
      id: entity.id,
      exchange: entity.exchange,
      timestamp: entity.timestamp,
      totalBalance: entity.totalBalance,
      availableBalance: entity.availableBalance,
      lockedBalance: entity.lockedBalance,
      totalPositionValue: entity.totalPositionValue,
      unrealizedPnl: entity.unrealizedPnl,
      positionCount: entity.positionCount,
      balances: entity.balances.map((b) => ({
        asset: b.asset,
        free: new Decimal(b.free),
        locked: new Decimal(b.locked),
        total: new Decimal(b.total),
      })),
      positions: entity.positions.map((p) => ({
        symbol: p.symbol,
        side: p.side,
        quantity: new Decimal(p.quantity),
        avgPrice: new Decimal(p.avgPrice),
        markPrice: new Decimal(p.markPrice),
        unrealizedPnl: new Decimal(p.unrealizedPnl),
        leverage: new Decimal(p.leverage),
        timestamp: new Date(p.timestamp),
      })),
    };
  }
}
