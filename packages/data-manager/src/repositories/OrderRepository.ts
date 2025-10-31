import { DataSource, Repository } from 'typeorm';

import { OrderEntity } from '../entities/Order';

export class OrderRepository {
  private repository: Repository<OrderEntity>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(OrderEntity);
  }

  async save(order: Partial<OrderEntity>): Promise<OrderEntity> {
    // Use upsert to handle duplicate orders elegantly (single DB operation)
    // If order with same ID exists, update it; otherwise insert new one
    await this.repository.upsert(order as any, {
      conflictPaths: ['id'], // Unique constraint on 'id' column
      skipUpdateIfNoValuesChanged: true, // Skip update if values haven't changed
    });

    // Fetch and return the upserted order
    return (await this.repository.findOne({ where: { id: order.id! } }))!;
  }

  async update(id: string, updates: Partial<OrderEntity>): Promise<void> {
    await this.repository.update({ id }, updates as any);
  }

  async findById(
    id: string,
    options?: { includeStrategy?: boolean; includeFills?: boolean },
  ): Promise<OrderEntity | null> {
    const relations: string[] = [];

    // Only join if explicitly requested
    if (options?.includeStrategy) relations.push('strategy');
    if (options?.includeFills) relations.push('fills');

    return await this.repository.findOne({
      where: { id },
      relations: relations.length > 0 ? relations : undefined,
    });
  }

  async findAll(filters?: {
    strategyId?: number;
    symbol?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    includeStrategy?: boolean;
    includeFills?: boolean;
  }): Promise<OrderEntity[]> {
    const query = this.repository.createQueryBuilder('order');

    // Only join if explicitly requested (performance optimization)
    if (filters?.includeStrategy) {
      query.leftJoinAndSelect('order.strategy', 'strategy');
    }
    if (filters?.includeFills) {
      query.leftJoinAndSelect('order.fills', 'fills');
    }

    if (filters?.strategyId) {
      query.andWhere('order.strategyId = :strategyId', {
        strategyId: filters.strategyId,
      });
    }
    if (filters?.symbol) {
      query.andWhere('order.symbol = :symbol', { symbol: filters.symbol });
    }
    if (filters?.status) {
      query.andWhere('order.status = :status', { status: filters.status });
    }
    if (filters?.startDate) {
      query.andWhere('order.timestamp >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters?.endDate) {
      query.andWhere('order.timestamp <= :endDate', {
        endDate: filters.endDate,
      });
    }

    // Add cache for better performance
    return await query
      .orderBy('order.timestamp', 'DESC')
      .cache(30000) // Cache for 30 seconds
      .getMany();
  }
}
