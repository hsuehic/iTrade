import { DataSource, Repository } from 'typeorm';
import { Decimal } from 'decimal.js';

import { DryRunSessionEntity, DryRunStatus } from '../entities/DryRunSession';
import { DryRunResultEntity } from '../entities/DryRunResult';
import { DryRunTradeEntity } from '../entities/DryRunTrade';

export interface CreateDryRunSessionData {
  strategyId?: number;
  name?: string;
  parametersSnapshot?: Record<string, unknown>;
  symbols?: string[];
  timeframe?: string;
  initialBalance: string | number;
  commission?: string | number;
  slippage?: string | number;
  notes?: string;
  userId: string;
}

export interface DryRunSessionFilters {
  userId?: string;
  strategyId?: number;
  status?: DryRunStatus;
  startDate?: Date;
  endDate?: Date;
}

export interface DryRunSessionWithStats extends DryRunSessionEntity {
  tradesCount?: number;
  totalPnL?: Decimal;
  latestResult?: DryRunResultEntity;
}

export class DryRunSessionRepository {
  private repository: Repository<DryRunSessionEntity>;
  private resultRepository: Repository<DryRunResultEntity>;
  private tradeRepository: Repository<DryRunTradeEntity>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(DryRunSessionEntity);
    this.resultRepository = dataSource.getRepository(DryRunResultEntity);
    this.tradeRepository = dataSource.getRepository(DryRunTradeEntity);
  }

  async create(data: CreateDryRunSessionData): Promise<DryRunSessionEntity> {
    const result = await this.repository.insert({
      strategy: data.strategyId ? { id: data.strategyId } : undefined,
      name: data.name,
      parametersSnapshot: data.parametersSnapshot,
      startTime: new Date(),
      status: DryRunStatus.RUNNING,
      symbols: data.symbols,
      timeframe: data.timeframe,
      initialBalance: new Decimal(data.initialBalance),
      commission: data.commission ? new Decimal(data.commission) : new Decimal(0),
      slippage: data.slippage ? new Decimal(data.slippage) : undefined,
      notes: data.notes,
      user: { id: data.userId },
    } as Parameters<Repository<DryRunSessionEntity>['insert']>[0]);

    const insertedId = result.identifiers[0]?.id;
    if (!insertedId) {
      throw new Error('Failed to create dry run session: no ID returned');
    }

    const created = await this.repository.findOne({
      where: { id: insertedId },
      relations: ['strategy'],
    });
    if (!created) {
      throw new Error('Failed to fetch created dry run session');
    }

    return created;
  }

  async findById(
    id: number,
    options?: {
      includeResults?: boolean;
      includeTrades?: boolean;
      includeStrategy?: boolean;
    },
  ): Promise<DryRunSessionEntity | null> {
    // Always load 'user' so ownership checks work in every API route
    const relations: string[] = ['user'];
    if (options?.includeStrategy) relations.push('strategy');
    if (options?.includeResults) relations.push('results');
    if (options?.includeTrades) relations.push('trades');

    return await this.repository.findOne({
      where: { id },
      relations,
    });
  }

  async findAll(
    filters?: DryRunSessionFilters,
    options?: { limit?: number; offset?: number; includeStrategy?: boolean },
  ): Promise<DryRunSessionEntity[]> {
    const query = this.repository.createQueryBuilder('session');

    if (options?.includeStrategy) {
      query.leftJoinAndSelect('session.strategy', 'strategy');
    }

    if (filters?.userId) {
      query.andWhere('session.userId = :userId', { userId: filters.userId });
    }
    if (filters?.strategyId) {
      query.andWhere('session.strategyId = :strategyId', {
        strategyId: filters.strategyId,
      });
    }
    if (filters?.status) {
      query.andWhere('session.status = :status', { status: filters.status });
    }
    if (filters?.startDate) {
      query.andWhere('session.startTime >= :startDate', { startDate: filters.startDate });
    }
    if (filters?.endDate) {
      query.andWhere('session.startTime <= :endDate', { endDate: filters.endDate });
    }

    query.orderBy('session.createdAt', 'DESC');

    if (options?.limit) {
      query.take(options.limit);
    }
    if (options?.offset) {
      query.skip(options.offset);
    }

    return await query.getMany();
  }

  async findWithStats(
    filters?: DryRunSessionFilters,
    options?: { limit?: number; offset?: number },
  ): Promise<DryRunSessionWithStats[]> {
    const sessions = await this.findAll(filters, {
      ...options,
      includeStrategy: true,
    });

    if (sessions.length === 0) return [];

    const sessionIds = sessions.map((s) => s.id);

    // Fetch counts and PnLs in bulk using QueryBuilder for performance
    const stats = await this.tradeRepository
      .createQueryBuilder('trade')
      .select('trade.sessionId', 'sessionId')
      .addSelect('COUNT(*)', 'tradesCount')
      .addSelect('SUM(trade.pnl)', 'totalPnL')
      .where('trade.sessionId IN (:...ids)', { ids: sessionIds })
      .groupBy('trade.sessionId')
      .getRawMany();

    // Fetch latest results for these sessions
    // To get strictly the LATEST result per session in one query is complex in plain SQL/TypeORM,
    // so we fetch all results for these sessions and pick the latest in JS (since results are few per session)
    const allResults = await this.resultRepository
      .createQueryBuilder('result')
      .where('result.sessionId IN (:...ids)', { ids: sessionIds })
      .orderBy('result.createdAt', 'DESC')
      .getMany();

    // Map stats back
    const statsMap = new Map(
      stats.map((s) => [
        parseInt(s.sessionId, 10),
        {
          tradesCount: parseInt(s.tradesCount, 10),
          totalPnL: new Decimal(s.totalPnL || 0),
        },
      ]),
    );

    // Map latest results back
    const resultMap = new Map<number, DryRunResultEntity>();
    for (const res of allResults) {
      const sessionId = (res as { sessionId?: number }).sessionId;
      if (sessionId && !resultMap.has(sessionId)) {
        resultMap.set(sessionId, res);
      }
    }

    return sessions.map((session) => {
      const s = statsMap.get(session.id);
      return {
        ...session,
        tradesCount: s?.tradesCount || 0,
        totalPnL: s?.totalPnL || new Decimal(0),
        latestResult: resultMap.get(session.id),
      };
    });
  }

  async update(id: number, updates: Partial<DryRunSessionEntity>): Promise<void> {
    await this.repository.update(
      { id },
      updates as Parameters<Repository<DryRunSessionEntity>['update']>[1],
    );
  }

  async updateStatus(id: number, status: DryRunStatus, endTime?: Date): Promise<void> {
    const updates: Partial<DryRunSessionEntity> = { status };
    if (endTime || status === DryRunStatus.COMPLETED || status === DryRunStatus.FAILED) {
      updates.endTime = endTime || new Date();
    }
    await this.repository.update(
      { id },
      updates as Parameters<Repository<DryRunSessionEntity>['update']>[1],
    );
  }

  async stop(id: number): Promise<void> {
    await this.updateStatus(id, DryRunStatus.COMPLETED, new Date());
  }

  async cancel(id: number): Promise<void> {
    await this.updateStatus(id, DryRunStatus.CANCELED, new Date());
  }

  async delete(id: number): Promise<void> {
    await this.repository.delete({ id });
  }

  async getResults(sessionId: number): Promise<DryRunResultEntity[]> {
    return await this.resultRepository.find({
      where: { session: { id: sessionId } },
      order: { createdAt: 'DESC' },
    });
  }

  async getTrades(
    sessionId: number,
    options?: { limit?: number; offset?: number },
  ): Promise<DryRunTradeEntity[]> {
    const query = this.tradeRepository
      .createQueryBuilder('trade')
      .where('trade.sessionId = :sessionId', { sessionId })
      .orderBy('trade.entryTime', 'DESC');

    if (options?.limit) query.take(options.limit);
    if (options?.offset) query.skip(options.offset);

    return await query.getMany();
  }

  async count(filters?: DryRunSessionFilters): Promise<number> {
    const query = this.repository.createQueryBuilder('session');

    if (filters?.userId) {
      query.andWhere('session.userId = :userId', { userId: filters.userId });
    }
    if (filters?.status) {
      query.andWhere('session.status = :status', { status: filters.status });
    }

    return await query.getCount();
  }
}
