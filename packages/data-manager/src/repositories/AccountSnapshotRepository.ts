import { Repository, DataSource, In } from 'typeorm';
import { Decimal } from 'decimal.js';
import { Balance, Position } from '@itrade/core';

import { AccountSnapshotEntity } from '../entities/AccountSnapshot';

export interface AccountSnapshotData {
  id?: number;
  accountInfoId?: number;
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
   * get account snapshot
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
      accountInfo: data.accountInfoId ? { id: data.accountInfoId } : undefined,
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
   * get latest account snapshot
   */
  async getLatest(
    exchange: string,
    userId?: string,
  ): Promise<AccountSnapshotData | null> {
    const query = this.repository
      .createQueryBuilder('snapshot')
      .leftJoinAndSelect('snapshot.accountInfo', 'accountInfo')
      .where('LOWER(snapshot.exchange::text) = LOWER(:exchange)', { exchange });

    if (userId) {
      query
        .leftJoin('accountInfo.user', 'user')
        .andWhere('user.id = :userId', { userId });
    }

    const entity = await query.orderBy('snapshot.timestamp', 'DESC').getOne();

    return entity ? this.entityToData(entity) : null;
  }

  /**
   * get all latest account snapshots for all exchanges
   */
  async getLatestForAllExchanges(userId?: string): Promise<AccountSnapshotData[]> {
    const query = this.repository
      .createQueryBuilder('snapshot')
      .select('DISTINCT ON (LOWER(snapshot.exchange)) snapshot.*')
      .leftJoin('snapshot.accountInfo', 'accountInfo');

    if (userId) {
      query.leftJoin('accountInfo.user', 'user').where('user.id = :userId', { userId });
    }

    const rawSnapshots = await query
      .orderBy('LOWER(snapshot.exchange)')
      .addOrderBy('snapshot.timestamp', 'DESC')
      .getRawMany();

    const ids = rawSnapshots.map((s) => s.id);
    if (ids.length === 0) return [];

    const entities = await this.repository.find({
      where: { id: In(ids) },
    });
    return entities.map((e) => this.entityToData(e));
  }

  /**
   * query account snapshot history
   */
  async query(
    options: AccountSnapshotQueryOptions & { userId?: string },
  ): Promise<AccountSnapshotData[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('snapshot')
      .leftJoinAndSelect('snapshot.accountInfo', 'accountInfo');

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

    if (options.userId) {
      queryBuilder
        .leftJoin('accountInfo.user', 'user')
        .andWhere('user.id = :userId', { userId: options.userId });
    }

    queryBuilder.orderBy('snapshot.timestamp', 'DESC');

    if (options.limit) {
      queryBuilder.take(options.limit);
    }

    const entities = await queryBuilder.getMany();
    return entities.map((e) => this.entityToData(e));
  }

  /**
   * get account history snapshots (time range)
   */
  async getHistory(
    exchange: string,
    startTime: Date,
    endTime: Date,
    userId?: string,
  ): Promise<AccountSnapshotData[]> {
    const query = this.repository
      .createQueryBuilder('snapshot')
      .leftJoinAndSelect('snapshot.accountInfo', 'accountInfo')
      .where('LOWER(snapshot.exchange) = LOWER(:exchange)', { exchange })
      .andWhere('snapshot.timestamp BETWEEN :startTime AND :endTime', {
        startTime,
        endTime,
      });

    if (userId) {
      query
        .leftJoin('accountInfo.user', 'user')
        .andWhere('user.id = :userId', { userId });
    }

    const entities = await query.orderBy('snapshot.timestamp', 'ASC').getMany();

    return entities.map((e) => this.entityToData(e));
  }

  /**
   * 获取指定时间段的快照统计
   */
  async getStatistics(
    exchange: string,
    startTime: Date,
    endTime: Date,
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
      maxBalance: balances.reduce((max, b) => (b.gt(max) ? b : max), balances[0]),
      minBalance: balances.reduce((min, b) => (b.lt(min) ? b : min), balances[0]),
      avgPositionCount: Math.round(
        positionCounts.reduce((sum, c) => sum + c, 0) / positionCounts.length,
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
   * 使用数据库级别的聚合和 DISTINCT ON，避免加载大量数据到内存
   */
  async getBalanceTimeSeries(
    exchange: string,
    startTime: Date,
    endTime: Date,
    interval: 'hour' | 'day' | 'week' = 'day',
  ): Promise<Array<{ timestamp: Date; balance: Decimal }>> {
    let truncInterval: string;
    switch (interval) {
      case 'hour':
        truncInterval = 'hour';
        break;
      case 'week':
        truncInterval = 'week';
        break;
      case 'day':
      default:
        truncInterval = 'day';
        break;
    }

    // Use QueryBuilder for better portability and correct column naming
    const queryBuilder = this.repository
      .createQueryBuilder('snapshot')
      .select('snapshot.timestamp', 'timestamp')
      .addSelect('snapshot.totalBalance', 'balance')
      .where('snapshot.exchange = :exchange', { exchange })
      .andWhere('snapshot.timestamp BETWEEN :startTime AND :endTime', {
        startTime,
        endTime,
      })
      .orderBy(`date_trunc('${truncInterval}', snapshot.timestamp)`, 'ASC')
      .addOrderBy('snapshot.timestamp', 'DESC');

    // TypeORM doesn't support DISTINCT ON natively in some versions via easy methods,
    // but we can use raw query if we are careful about column names.
    // However, for recent data, a simple orderBy might be enough if we just want points.

    const rawResults = await queryBuilder.getRawMany();

    // Since we want one per interval, we filter in JS to be safe
    const result: Array<{ timestamp: Date; balance: Decimal }> = [];
    const seenIntervals = new Set<string>();

    for (const row of rawResults) {
      const date = new Date(row.timestamp);
      let key: string;

      if (truncInterval === 'day') {
        key = date.toISOString().split('T')[0];
      } else if (truncInterval === 'hour') {
        key = date.toISOString().substring(0, 13);
      } else {
        key = date.toISOString().substring(0, 10);
      }

      if (!seenIntervals.has(key)) {
        result.push({
          timestamp: date,
          balance: new Decimal(row.balance),
        });
        seenIntervals.add(key);
      }
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
