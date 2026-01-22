import { DataSource, Repository } from 'typeorm';
import { normalizeSymbol, detectMarketType } from '@itrade/utils';

import { StrategyEntity, StrategyStatus, MarketType } from '../entities/Strategy';

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
    parameters?: any;
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
    } as any);

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
    options?: { includeUser?: boolean },
  ): Promise<StrategyEntity | null> {
    // Don't join by default - only if explicitly requested
    if (options?.includeUser) {
      return await this.repository.findOne({
        where: { id },
        relations: ['user'],
      });
    }

    return await this.repository.findOne({
      where: { id },
    });
  }

  async findAll(filters?: {
    userId?: string;
    status?: string;
    exchange?: string;
    includeUser?: boolean; // Control whether to load user relation
  }): Promise<StrategyEntity[]> {
    const query = this.repository.createQueryBuilder('strategy');

    // Only join user if explicitly requested
    if (filters?.includeUser) {
      query.leftJoinAndSelect('strategy.user', 'user');
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

    // Use cache for frequently accessed queries
    return await query
      .orderBy('strategy.createdAt', 'DESC')
      .cache(30000) // Cache for 30 seconds
      .getMany();
  }

  async update(id: number, updates: Partial<StrategyEntity>): Promise<void> {
    const updateData: any = { ...updates };

    // Re-compute normalizedSymbol and marketType if symbol or exchange is being updated
    if (updateData.symbol || updateData.exchange) {
      // Fetch existing strategy to get current values
      const existing = await this.repository.findOne({ where: { id } });
      if (existing) {
        const symbol = updateData.symbol || existing.symbol;
        const exchange = updateData.exchange || existing.exchange;
        if (symbol && exchange) {
          updateData.normalizedSymbol = normalizeSymbol(symbol, exchange);
          updateData.marketType = detectMarketType(symbol);
        }
      }
    }

    await this.repository.update({ id }, updateData);
  }

  async delete(id: number): Promise<void> {
    await this.repository.delete({ id });
  }

  async updateStatus(id: number, status: string, errorMessage?: string): Promise<void> {
    const updates: any = {
      status,
      lastExecutionTime: new Date(),
    };
    if (errorMessage !== undefined) {
      updates.errorMessage = errorMessage;
    }
    await this.repository.update({ id }, updates);
  }
}
