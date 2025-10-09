import { DataSource, Repository } from 'typeorm';
import { OrderEntity } from '../entities/Order';

export class OrderRepository {
  private repository: Repository<OrderEntity>;

  constructor(private dataSource: DataSource) {
    this.repository = dataSource.getRepository(OrderEntity);
  }

  async save(order: Partial<OrderEntity>): Promise<OrderEntity> {
    const entity = this.repository.create(order);
    return await this.repository.save(entity);
  }

  async update(id: string, updates: Partial<OrderEntity>): Promise<void> {
    await this.repository.update({ id }, updates);
  }

  async findById(id: string): Promise<OrderEntity | null> {
    return await this.repository.findOne({
      where: { id },
      relations: ['strategy', 'fills'],
    });
  }

  async findAll(filters?: {
    strategyId?: number;
    symbol?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<OrderEntity[]> {
    const query = this.repository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.strategy', 'strategy')
      .leftJoinAndSelect('order.fills', 'fills');

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

    return await query.orderBy('order.timestamp', 'DESC').getMany();
  }
}

