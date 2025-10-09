import { DataSource, Repository } from 'typeorm';
import { StrategyEntity } from '../entities/Strategy';

export class StrategyRepository {
  private repository: Repository<StrategyEntity>;

  constructor(private dataSource: DataSource) {
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
    userId: string;
  }): Promise<StrategyEntity> {
    const { userId, ...strategyData } = data;
    const entity = this.repository.create(strategyData as any);
    (entity as any).user = { id: userId };

    const saved = await this.repository.save(entity);
    return Array.isArray(saved) ? saved[0] : saved;
  }

  async findById(id: number): Promise<StrategyEntity | null> {
    return await this.repository.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  async findAll(filters?: {
    userId?: string;
    status?: string;
    exchange?: string;
  }): Promise<StrategyEntity[]> {
    const query = this.repository
      .createQueryBuilder('strategy')
      .leftJoinAndSelect('strategy.user', 'user');

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
    await this.repository.update({ id }, updates);
  }

  async delete(id: number): Promise<void> {
    await this.repository.delete({ id });
  }

  async updateStatus(
    id: number,
    status: string,
    errorMessage?: string
  ): Promise<void> {
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

