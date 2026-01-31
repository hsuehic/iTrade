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
  }

  private async upsert(
    repo: Repository<any>,
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
          } as any,
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
  ): Promise<any[]> {
    let repo: Repository<any>;

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
      .leftJoin('balance.accountInfo', 'account')
      .where('LOWER(account.exchange::text) = LOWER(:exchange)', { exchange })
      .andWhere('balance.period >= :start', { start: startTime })
      .andWhere('balance.period <= :end', { end: endTime });

    if (userId) {
      query.leftJoin('account.user', 'user').andWhere('user.id = :userId', { userId });
    }

    const results = await query.orderBy('balance.period', 'ASC').getMany();

    return results.map((r) => ({
      timestamp: r.period,
      balance: r.total, // Return total balance
      free: r.free,
      locked: r.locked,
    }));
  }
}
