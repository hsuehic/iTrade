import { DataSource, Repository } from 'typeorm';
import { normalizeSymbol, detectMarketType } from '@itrade/utils';

import { StrategyEntity, StrategyStatus, MarketType } from '../entities/Strategy';
import { StrategyPerformanceEntity } from '../entities/StrategyPerformance';

export class StrategyRepository {
  private repository: Repository<StrategyEntity>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(StrategyEntity);
  }

  async create(data: {
    name: string;
    description?: string;
    type: string;
    status?: string;
    exchange?: string;
    symbol?: string;
    parameters?: Record<string, unknown>;
    initialDataConfig?: Record<string, unknown>;
    subscription?: Record<string, unknown>;
    userId: string;
  }): Promise<StrategyEntity> {
    // Automatically compute normalizedSymbol and marketType if symbol and exchange are provided
    let normalizedSymbol: string | undefined;
    let marketType: MarketType | undefined;
    if (data.symbol && data.exchange) {
      normalizedSymbol = normalizeSymbol(data.symbol, data.exchange);
      marketType = detectMarketType(data.symbol) as MarketType;
    }

    // Use insert() to bypass entity instantiation entirely
    // This avoids TypeORM's cyclic dependency detection in Next.js production builds

    const result = await this.repository.insert({
      name: data.name,
      description: data.description,
      type: data.type,
      status: (data.status as StrategyStatus) || StrategyStatus.STOPPED,
      exchange: data.exchange,
      symbol: data.symbol,
      normalizedSymbol,
      marketType,
      parameters: data.parameters,
      initialDataConfig: data.initialDataConfig,
      subscription: data.subscription,
      userId: data.userId,
    } as Parameters<Repository<StrategyEntity>['insert']>[0]);

    // Get the inserted ID and fetch the complete entity
    const insertedId = result.identifiers[0]?.id;
    if (!insertedId) {
      throw new Error('Failed to create strategy: no ID returned');
    }

    // Use findOne which doesn't trigger cyclic dependency
    const created = await this.repository.findOne({ where: { id: insertedId } });
    if (!created) {
      throw new Error('Failed to fetch created strategy');
    }

    return created;
  }

  async findById(
    id: number,
    options?: { includeUser?: boolean; includePerformance?: boolean },
  ): Promise<StrategyEntity | null> {
    const query = this.repository
      .createQueryBuilder('strategy')
      .where('strategy.id = :id', { id });

    if (options?.includeUser) {
      // PERF: select ONLY the columns callers actually need (ownership checks
      // read strategy.user.id). leftJoinAndSelect would pull every user column
      // — including `user.image`, which stores the avatar as a base64 data URL
      // and can be multiple MB. That turned GET /api/strategies/:id into a
      // 3.3 MB response (nginx then spilled it to disk: "an upstream response
      // is buffered to a temporary file") on every poll of the strategy page.
      query.leftJoin('strategy.user', 'user').addSelect(['user.id', 'user.name']);
    }

    if (options?.includePerformance) {
      // Use leftJoinAndMapOne because StrategyEntity doesn't have the decorator
      // to avoid circular module dependencies (ReferenceError in Next.js production)
      query.leftJoinAndMapOne(
        'strategy.performance',
        StrategyPerformanceEntity,
        'performance',
        'performance.strategyId = strategy.id',
      );
    }

    return await query.getOne();
  }

  async findAll(filters?: {
    userId?: string;
    status?: string;
    exchange?: string;
    includeUser?: boolean; // Control whether to load user relation
    includePerformance?: boolean; // Control whether to load performance relation
  }): Promise<StrategyEntity[]> {
    const query = this.repository.createQueryBuilder('strategy');

    // Only join user if explicitly requested — and never select user.image
    // (base64 avatar, can be several MB). See findById for details.
    if (filters?.includeUser) {
      query.leftJoin('strategy.user', 'user').addSelect(['user.id', 'user.name']);
    }

    // Only join performance if explicitly requested
    if (filters?.includePerformance) {
      // Use leftJoinAndMapOne because StrategyEntity doesn't have the decorator
      // to avoid circular module dependencies (ReferenceError in Next.js production)
      query.leftJoinAndMapOne(
        'strategy.performance',
        StrategyPerformanceEntity,
        'performance',
        'performance.strategyId = strategy.id',
      );
    }

    if (filters?.userId) {
      query.andWhere('strategy.userId = :userId', { userId: filters.userId });
    }
    if (filters?.status) {
      query.andWhere('strategy.status = :status', { status: filters.status });
    }
    if (filters?.exchange) {
      query.andWhere('strategy.exchange = :exchange', {
        exchange: filters.exchange,
      });
    }

    return await query.orderBy('strategy.createdAt', 'DESC').getMany();
  }

  async update(id: number, updates: Partial<StrategyEntity>): Promise<void> {
    const updateData: Partial<StrategyEntity> = { ...updates };

    // Re-compute normalizedSymbol and marketType if symbol or exchange is being updated
    if (updateData.symbol || updateData.exchange) {
      // Fetch existing strategy to get current values
      const existing = await this.repository.findOne({ where: { id } });
      if (existing) {
        const symbol = updateData.symbol || existing.symbol;
        const exchange = updateData.exchange || existing.exchange;
        if (symbol && exchange) {
          updateData.normalizedSymbol = normalizeSymbol(symbol, exchange);
          updateData.marketType = detectMarketType(symbol) as MarketType;
        }
      }
    }

    await this.repository.update(
      { id },
      updateData as Parameters<Repository<StrategyEntity>['update']>[1],
    );
  }

  async delete(id: number): Promise<void> {
    await this.repository.delete({ id });
  }

  async updateStatus(
    id: number,
    status: StrategyStatus,
    errorMessage?: string,
  ): Promise<void> {
    const updates: Partial<StrategyEntity> = {
      status,
      lastExecutionTime: new Date(),
    };
    if (errorMessage !== undefined) {
      updates.errorMessage = errorMessage;
    }
    await this.repository.update(
      { id },
      updates as Parameters<Repository<StrategyEntity>['update']>[1],
    );
  }
}
