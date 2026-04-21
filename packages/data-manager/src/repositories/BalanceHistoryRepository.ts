import { DataSource, Repository } from 'typeorm';
import { Decimal } from 'decimal.js';
import { AccountInfoEntity } from '../entities/AccountInfo';
import {
  BalanceMonthEntity,
  BalanceWeekEntity,
  BalanceDayEntity,
  BalanceHourEntity,
  Balance30MinEntity,
  Balance15MinEntity,
  Balance5MinEntity,
  BalanceMinEntity,
} from '../entities/BalanceHistory';

type BalanceHistoryEntity =
  | BalanceMonthEntity
  | BalanceWeekEntity
  | BalanceDayEntity
  | BalanceHourEntity
  | Balance30MinEntity
  | Balance15MinEntity
  | Balance5MinEntity
  | BalanceMinEntity;

const MAX_ROWS_PER_ACCOUNT: Record<string, number> = {
  balance_min: 100,
  balance_5min: 100,
  balance_15min: 100,
  balance_30min: 100,
  balance_hour: 100,
  balance_day: 365,
  balance_week: 104,
  balance_month: 120,
};

export class BalanceHistoryRepository {
  private monthRepo: Repository<BalanceMonthEntity>;
  private weekRepo: Repository<BalanceWeekEntity>;
  private dayRepo: Repository<BalanceDayEntity>;
  private hourRepo: Repository<BalanceHourEntity>;
  private min30Repo: Repository<Balance30MinEntity>;
  private min15Repo: Repository<Balance15MinEntity>;
  private min5Repo: Repository<Balance5MinEntity>;
  private minRepo: Repository<BalanceMinEntity>;

  constructor(private dataSource: DataSource) {
    this.monthRepo = dataSource.getRepository(BalanceMonthEntity);
    this.weekRepo = dataSource.getRepository(BalanceWeekEntity);
    this.dayRepo = dataSource.getRepository(BalanceDayEntity);
    this.hourRepo = dataSource.getRepository(BalanceHourEntity);
    this.min30Repo = dataSource.getRepository(Balance30MinEntity);
    this.min15Repo = dataSource.getRepository(Balance15MinEntity);
    this.min5Repo = dataSource.getRepository(Balance5MinEntity);
    this.minRepo = dataSource.getRepository(BalanceMinEntity);
  }

  async updateBalance(
    accountInfo: AccountInfoEntity,
    free: Decimal,
    locked: Decimal,
    saving: Decimal,
    total: Decimal,
    timestamp: Date = new Date(),
  ): Promise<void> {
    const jobs = [
      this.upsert(
        this.monthRepo,
        accountInfo,
        free,
        locked,
        saving,
        total,
        this.getStartOfMonth(timestamp),
      ),
      this.upsert(
        this.weekRepo,
        accountInfo,
        free,
        locked,
        saving,
        total,
        this.getStartOfWeek(timestamp),
      ),
      this.upsert(
        this.dayRepo,
        accountInfo,
        free,
        locked,
        saving,
        total,
        this.getStartOfDay(timestamp),
      ),
      this.upsert(
        this.hourRepo,
        accountInfo,
        free,
        locked,
        saving,
        total,
        this.getStartOfHour(timestamp),
      ),
      this.upsert(
        this.min30Repo,
        accountInfo,
        free,
        locked,
        saving,
        total,
        this.getStartOfMinuteInterval(timestamp, 30),
      ),
      this.upsert(
        this.min15Repo,
        accountInfo,
        free,
        locked,
        saving,
        total,
        this.getStartOfMinuteInterval(timestamp, 15),
      ),
      this.upsert(
        this.min5Repo,
        accountInfo,
        free,
        locked,
        saving,
        total,
        this.getStartOfMinuteInterval(timestamp, 5),
      ),
      this.upsert(
        this.minRepo,
        accountInfo,
        free,
        locked,
        saving,
        total,
        this.getStartOfMinuteInterval(timestamp, 1),
      ),
    ];
    await Promise.all(jobs);

    // Enforce retention: trim old rows in background (fire-and-forget)
    this.enforceRetention(accountInfo.id).catch(() => {});
  }

  /**
   * Delete rows exceeding MAX_ROWS_PER_ACCOUNT for a single account
   * across all history tables.
   */
  private async enforceRetention(accountInfoId: number): Promise<void> {
    const tableRepoMap: [string, Repository<BalanceHistoryEntity>][] = [
      ['balance_min', this.minRepo],
      ['balance_5min', this.min5Repo],
      ['balance_15min', this.min15Repo],
      ['balance_30min', this.min30Repo],
      ['balance_hour', this.hourRepo],
      ['balance_day', this.dayRepo],
      ['balance_week', this.weekRepo],
      ['balance_month', this.monthRepo],
    ];

    for (const [tableName, repo] of tableRepoMap) {
      const maxRows = MAX_ROWS_PER_ACCOUNT[tableName] ?? 100;
      await this.trimTable(repo, tableName, accountInfoId, maxRows);
    }
  }

  private async trimTable(
    repo: Repository<BalanceHistoryEntity>,
    tableName: string,
    accountInfoId: number,
    maxRows: number,
  ): Promise<void> {
    try {
      const count = await repo.count({
        where: { accountInfo: { id: accountInfoId } },
      });
      if (count <= maxRows) return;

      await this.dataSource.query(
        `DELETE FROM "${tableName}" WHERE id IN (
          SELECT id FROM "${tableName}"
          WHERE account_info_id = $1
          ORDER BY period ASC
          LIMIT $2
        )`,
        [accountInfoId, count - maxRows],
      );
    } catch {
      // Non-critical: retention failure should not break balance updates
    }
  }

  /**
   * One-time bulk cleanup: enforce retention for ALL accounts across all tables.
   */
  async purgeAllExcess(): Promise<Record<string, number>> {
    const tables = [
      'balance_min',
      'balance_5min',
      'balance_15min',
      'balance_30min',
      'balance_hour',
      'balance_day',
      'balance_week',
      'balance_month',
    ];
    const result: Record<string, number> = {};

    for (const tableName of tables) {
      const maxRows = MAX_ROWS_PER_ACCOUNT[tableName] ?? 100;
      const deleted = await this.dataSource.query(
        `DELETE FROM "${tableName}" WHERE id IN (
          SELECT id FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                     PARTITION BY account_info_id
                     ORDER BY period DESC
                   ) AS rn
            FROM "${tableName}"
          ) ranked
          WHERE rn > $1
        )`,
        [maxRows],
      );
      result[tableName] = deleted[1] ?? 0;
    }
    return result;
  }

  private async upsert(
    repo: Repository<BalanceHistoryEntity>,
    accountInfo: AccountInfoEntity,
    free: Decimal,
    locked: Decimal,
    saving: Decimal,
    total: Decimal,
    period: Date,
  ) {
    try {
      await repo.upsert(
        {
          accountInfo: { id: accountInfo.id },
          free,
          locked,
          saving,
          total,
          period,
        },
        ['accountInfo', 'period'], // TypeORM should handle relation translation, but if not we might need 'accountInfoId'
      );
    } catch (error) {
      console.error(`[BalanceHistoryRepository] Error in upsert:`, error);
      // Fallback: try with explicit id if relation name fails
      try {
        await repo.upsert(
          {
            account_info_id: accountInfo.id,
            free,
            locked,
            saving,
            total,
            period,
          } as Record<string, unknown>,
          ['account_info_id', 'period'],
        );
      } catch (innerError) {
        console.error(
          `[BalanceHistoryRepository] Fallback upsert also failed:`,
          innerError,
        );
      }
    }
  }

  private getStartOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private getStartOfWeek(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    const diff = result.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    result.setDate(diff);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private getStartOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private getStartOfHour(date: Date): Date {
    const result = new Date(date);
    result.setMinutes(0, 0, 0);
    return result;
  }

  private getStartOfMinuteInterval(date: Date, minutes: number): Date {
    const result = new Date(date);
    const m = Math.floor(result.getMinutes() / minutes) * minutes;
    result.setMinutes(m, 0, 0);
    return result;
  }

  // Add method to get time series for charts
  async getBalanceTimeSeries(
    exchange: string,
    startTime: Date,
    endTime: Date,
    interval: 'minute' | '5min' | 'hour' | 'day' | 'week',
    userId?: string,
  ): Promise<
    Array<{
      timestamp: Date;
      balance: Decimal;
      free: Decimal;
      locked: Decimal;
    }>
  > {
    let repo: Repository<BalanceHistoryEntity>;

    // Choose appropriate table based on interval
    switch (interval) {
      case 'minute':
        repo = this.minRepo;
        break;
      case '5min':
        repo = this.min5Repo;
        break;
      case 'hour':
        repo = this.hourRepo;
        break;
      case 'week':
        repo = this.weekRepo;
        break;
      case 'day':
      default:
        repo = this.dayRepo;
        break;
    }

    const query = repo
      .createQueryBuilder('balance')
      .leftJoinAndSelect('balance.accountInfo', 'account')
      .where('LOWER(account.exchange::text) = LOWER(:exchange)', { exchange })
      .andWhere('balance.period >= :start', { start: startTime })
      .andWhere('balance.period <= :end', { end: endTime });

    if (userId) {
      query.andWhere('account.userId = :userId', { userId });
    }

    const results = await query.orderBy('balance.period', 'ASC').getMany();

    return results.map((r) => ({
      timestamp: r.period,
      balance: r.total,
      free: r.free,
      locked: r.locked,
      accountId: r.accountInfo.id,
    }));
  }
}
