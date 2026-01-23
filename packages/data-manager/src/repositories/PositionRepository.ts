import { DataSource, Repository } from 'typeorm';

import { PositionEntity } from '../entities/Position';

export interface PositionFilters {
  userId?: string;
  exchange?: string;
  symbol?: string;
  side?: 'long' | 'short';
  minQuantity?: number;
}

export class PositionRepository {
  private repository: Repository<PositionEntity>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(PositionEntity);
  }

  async save(position: Partial<PositionEntity>): Promise<PositionEntity> {
    // Use upsert to handle duplicate positions elegantly
    // If position with same user+exchange+symbol exists, update it; otherwise insert new one
    await this.repository.upsert(position as any, {
      conflictPaths: ['user', 'exchange', 'symbol'],
      skipUpdateIfNoValuesChanged: true,
    });

    // Fetch and return the upserted position
    return (await this.repository.findOne({
      where: {
        symbol: position.symbol!,
        exchange: position.exchange!,
      },
    }))!;
  }

  async update(id: number, updates: Partial<PositionEntity>): Promise<void> {
    await this.repository.update({ id }, updates as any);
  }

  async findById(id: number): Promise<PositionEntity | null> {
    return await this.repository.findOne({
      where: { id },
    });
  }

  async findAll(filters?: PositionFilters): Promise<PositionEntity[]> {
    const query = this.repository.createQueryBuilder('position');

    // Join user to filter by userId
    query.leftJoin('position.user', 'user');

    if (filters?.userId) {
      query.andWhere('user.id = :userId', { userId: filters.userId });
    }
    if (filters?.exchange) {
      query.andWhere('position.exchange = :exchange', { exchange: filters.exchange });
    }
    if (filters?.symbol) {
      query.andWhere('position.symbol = :symbol', { symbol: filters.symbol });
    }
    if (filters?.side) {
      query.andWhere('position.side = :side', { side: filters.side });
    }
    if (filters?.minQuantity !== undefined) {
      query.andWhere('position.quantity >= :minQuantity', {
        minQuantity: filters.minQuantity,
      });
    }

    // Add cache for better performance
    return await query
      .orderBy('position.timestamp', 'DESC')
      .cache(30000) // Cache for 30 seconds
      .getMany();
  }

  async findByExchange(exchange: string, userId?: string): Promise<PositionEntity[]> {
    return await this.findAll({ exchange, userId });
  }

  async findBySymbol(symbol: string, userId?: string): Promise<PositionEntity[]> {
    return await this.findAll({ symbol, userId });
  }

  async delete(id: number): Promise<void> {
    await this.repository.delete({ id });
  }

  async deleteBySymbol(symbol: string, exchange: string, userId?: string): Promise<void> {
    const query = this.repository
      .createQueryBuilder()
      .delete()
      .from(PositionEntity)
      .where('symbol = :symbol', { symbol })
      .andWhere('exchange = :exchange', { exchange });

    if (userId) {
      query.andWhere('userId = :userId', { userId });
    }

    await query.execute();
  }

  async getExchanges(userId?: string): Promise<string[]> {
    const query = this.repository
      .createQueryBuilder('position')
      .select('DISTINCT position.exchange', 'exchange');

    if (userId) {
      query.leftJoin('position.user', 'user').andWhere('user.id = :userId', { userId });
    }

    const result = await query.getRawMany();
    return result.map((r) => r.exchange);
  }

  async getSymbols(userId?: string, exchange?: string): Promise<string[]> {
    const query = this.repository
      .createQueryBuilder('position')
      .select('DISTINCT position.symbol', 'symbol');

    if (userId) {
      query.leftJoin('position.user', 'user').andWhere('user.id = :userId', { userId });
    }

    if (exchange) {
      query.andWhere('position.exchange = :exchange', { exchange });
    }

    const result = await query.getRawMany();
    return result.map((r) => r.symbol);
  }
}
