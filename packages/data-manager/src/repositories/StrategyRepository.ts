import { DataSource, Repository } from 'typeorm';
import { normalizeSymbol, detectMarketType } from '@itrade/utils';

import { StrategyEntity } from '../entities/Strategy';

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
    initialData?: Record<string, unknown>;
    subscription?: Record<string, unknown>;
    userId: string;
  }): Promise<StrategyEntity> {
    const { userId, ...strategyData } = data;

    // Automatically compute normalizedSymbol and marketType if symbol and exchange are provided
    const entityData: any = { ...strategyData };
    if (entityData.symbol && entityData.exchange) {
      entityData.normalizedSymbol = normalizeSymbol(
        entityData.symbol,
        entityData.exchange,
      );
      entityData.marketType = detectMarketType(entityData.symbol);
    }

    const entity = this.repository.create(entityData);
    (entity as any).user = { id: userId };

    const saved = await this.repository.save(entity);
    return Array.isArray(saved) ? saved[0] : saved;
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
