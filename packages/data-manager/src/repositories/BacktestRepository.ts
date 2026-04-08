import { DataSource, Repository } from 'typeorm';
import { Decimal } from 'decimal.js';

import { BacktestConfigEntity } from '../entities/BacktestConfig';
import { BacktestResultEntity } from '../entities/BacktestResult';
import { BacktestTradeEntity } from '../entities/BacktestTrade';
import { EquityPointEntity } from '../entities/EquityPoint';

export interface CreateBacktestConfigData {
  /** Optional human-readable label for this configuration. */
  name?: string;
  startDate: Date;
  endDate: Date;
  initialBalance: string | number;
  commission: string | number;
  slippage?: string | number;
  /** Symbols come from strategy at run-time; optional in config. */
  symbols?: string[];
  /** Fallback timeframe; strategy's klineInterval takes precedence when running. */
  timeframe?: string;
  userId: string;
}

export interface RunBacktestData {
  configId: number;
  strategyId?: number;
}

export interface BacktestConfigFilters {
  userId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface BacktestResultFilters {
  configId?: number;
  strategyId?: number;
  minReturn?: number;
  maxDrawdown?: number;
}

export interface BacktestConfigWithStats extends BacktestConfigEntity {
  resultsCount?: number;
  bestResult?: BacktestResultEntity;
  latestResult?: BacktestResultEntity;
}

export class BacktestRepository {
  private configRepository: Repository<BacktestConfigEntity>;
  private resultRepository: Repository<BacktestResultEntity>;
  private tradeRepository: Repository<BacktestTradeEntity>;
  private equityRepository: Repository<EquityPointEntity>;

  constructor(dataSource: DataSource) {
    this.configRepository = dataSource.getRepository(BacktestConfigEntity);
    this.resultRepository = dataSource.getRepository(BacktestResultEntity);
    this.tradeRepository = dataSource.getRepository(BacktestTradeEntity);
    this.equityRepository = dataSource.getRepository(EquityPointEntity);
  }

  // Config CRUD operations
  async createConfig(data: CreateBacktestConfigData): Promise<BacktestConfigEntity> {
    const result = await this.configRepository.insert({
      name: data.name || undefined,
      startDate: data.startDate,
      endDate: data.endDate,
      initialBalance: new Decimal(data.initialBalance),
      commission: new Decimal(data.commission),
      slippage: data.slippage ? new Decimal(data.slippage) : undefined,
      // Provide safe defaults so the INSERT works even if the DB column is still NOT NULL
      // (i.e. before the schema sync that makes them nullable has been run).
      // The run endpoint always overrides symbols/timeframe from the strategy anyway.
      symbols: data.symbols ?? [],
      timeframe: data.timeframe ?? '1h',
      user: { id: data.userId },
    } as any);

    const insertedId = result.identifiers[0]?.id;
    if (!insertedId) {
      throw new Error('Failed to create backtest config: no ID returned');
    }

    const created = await this.configRepository.findOne({
      where: { id: insertedId },
    });
    if (!created) {
      throw new Error('Failed to fetch created backtest config');
    }

    return created;
  }

  async findConfigById(
    id: number,
    options?: { includeResults?: boolean },
  ): Promise<BacktestConfigEntity | null> {
    const relations: string[] = ['user'];
    if (options?.includeResults) {
      relations.push('results');
      relations.push('results.strategy'); // include strategy name on each result
    }

    return await this.configRepository.findOne({
      where: { id },
      relations,
      order: options?.includeResults ? { results: { createdAt: 'DESC' } } : undefined,
    });
  }

  async findAllConfigs(
    filters?: BacktestConfigFilters,
    options?: { limit?: number; offset?: number },
  ): Promise<BacktestConfigEntity[]> {
    const query = this.configRepository.createQueryBuilder('config');

    if (filters?.userId) {
      query.andWhere('config.userId = :userId', { userId: filters.userId });
    }
    if (filters?.startDate) {
      query.andWhere('config.startDate >= :startDate', { startDate: filters.startDate });
    }
    if (filters?.endDate) {
      query.andWhere('config.endDate <= :endDate', { endDate: filters.endDate });
    }

    query.orderBy('config.startDate', 'DESC');

    if (options?.limit) query.take(options.limit);
    if (options?.offset) query.skip(options.offset);

    return await query.getMany();
  }

  async findConfigsWithStats(
    filters?: BacktestConfigFilters,
    options?: { limit?: number; offset?: number },
  ): Promise<BacktestConfigWithStats[]> {
    const configs = await this.findAllConfigs(filters, options);

    if (configs.length === 0) return [];

    const configIds = configs.map((c) => c.id);

    // Fetch result counts in bulk
    const counts = await this.resultRepository
      .createQueryBuilder('result')
      .select('result.configId', 'configId')
      .addSelect('COUNT(*)', 'resultsCount')
      .where('result.configId IN (:...ids)', { ids: configIds })
      .groupBy('result.configId')
      .getRawMany();

    // Fetch all results for these configs to find best and latest in JS
    // This is safer and easier than complex window functions in TypeORM
    const allResults = await this.resultRepository
      .createQueryBuilder('result')
      .leftJoinAndSelect('result.strategy', 'strategy')
      .where('result.configId IN (:...ids)', { ids: configIds })
      .orderBy('result.totalReturn', 'DESC') // Order by return for bestResult
      .getMany();

    // Map stats back
    const countMap = new Map(
      counts.map((c) => [parseInt(c.configId, 10), parseInt(c.resultsCount, 10)]),
    );

    // Track best and latest for each config
    const bestResults = new Map<number, BacktestResultEntity>();
    const latestResults = new Map<number, BacktestResultEntity>();

    for (const res of allResults) {
      const configId = (res as any).configId;
      if (!configId) continue;

      // First one we see is the best (due to ORDER BY totalReturn DESC)
      if (!bestResults.has(configId)) {
        bestResults.set(configId, res);
      }

      // Track latest by comparing createdAt
      const currentLatest = latestResults.get(configId);
      if (!currentLatest || res.createdAt > currentLatest.createdAt) {
        latestResults.set(configId, res);
      }
    }

    return configs.map((config) => ({
      ...config,
      resultsCount: countMap.get(config.id) || 0,
      bestResult: bestResults.get(config.id),
      latestResult: latestResults.get(config.id),
    }));
  }

  async updateConfig(id: number, updates: Partial<BacktestConfigEntity>): Promise<void> {
    await this.configRepository.update({ id }, updates as any);
  }

  async deleteConfig(id: number): Promise<void> {
    await this.configRepository.delete({ id });
  }

  // Result operations
  async createResult(data: {
    configId: number;
    strategyId?: number;
    name?: string;
    totalReturn: string | number;
    annualizedReturn: string | number;
    sharpeRatio: string | number;
    maxDrawdown: string | number;
    winRate: string | number;
    profitFactor: string | number;
    totalTrades: number;
    avgTradeDuration: number;
  }): Promise<BacktestResultEntity> {
    const result = await this.resultRepository.insert({
      config: { id: data.configId },
      strategy: data.strategyId ? { id: data.strategyId } : undefined,
      name: data.name || undefined,
      totalReturn: new Decimal(data.totalReturn),
      annualizedReturn: new Decimal(data.annualizedReturn),
      sharpeRatio: new Decimal(data.sharpeRatio),
      maxDrawdown: new Decimal(data.maxDrawdown),
      winRate: new Decimal(data.winRate),
      profitFactor: new Decimal(data.profitFactor),
      totalTrades: data.totalTrades,
      avgTradeDuration: data.avgTradeDuration,
    } as any);

    const insertedId = result.identifiers[0]?.id;
    if (!insertedId) {
      throw new Error('Failed to create backtest result: no ID returned');
    }

    const created = await this.resultRepository.findOne({
      where: { id: insertedId },
      relations: ['config', 'strategy'],
    });
    if (!created) {
      throw new Error('Failed to fetch created backtest result');
    }

    return created;
  }

  async findResultById(
    id: number,
    options?: {
      includeTrades?: boolean;
      includeEquity?: boolean;
      includeStrategy?: boolean;
    },
  ): Promise<BacktestResultEntity | null> {
    // Always include config.user so ownership checks work
    const relations: string[] = ['config', 'config.user'];
    if (options?.includeStrategy) relations.push('strategy');
    if (options?.includeTrades) relations.push('trades');
    if (options?.includeEquity) relations.push('equity');

    return await this.resultRepository.findOne({
      where: { id },
      relations,
    });
  }

  async findResults(
    filters?: BacktestResultFilters,
    options?: { limit?: number; offset?: number; includeStrategy?: boolean },
  ): Promise<BacktestResultEntity[]> {
    const query = this.resultRepository
      .createQueryBuilder('result')
      .leftJoinAndSelect('result.config', 'config');

    if (options?.includeStrategy) {
      query.leftJoinAndSelect('result.strategy', 'strategy');
    }

    if (filters?.configId) {
      query.andWhere('result.configId = :configId', { configId: filters.configId });
    }
    if (filters?.strategyId) {
      query.andWhere('result.strategyId = :strategyId', {
        strategyId: filters.strategyId,
      });
    }
    if (filters?.minReturn !== undefined) {
      query.andWhere('result.totalReturn >= :minReturn', {
        minReturn: filters.minReturn,
      });
    }
    if (filters?.maxDrawdown !== undefined) {
      query.andWhere('result.maxDrawdown <= :maxDrawdown', {
        maxDrawdown: filters.maxDrawdown,
      });
    }

    query.orderBy('result.createdAt', 'DESC');

    if (options?.limit) query.take(options.limit);
    if (options?.offset) query.skip(options.offset);

    return await query.getMany();
  }

  async deleteResult(id: number): Promise<void> {
    await this.resultRepository.delete({ id });
  }

  // Trade operations
  async getTrades(
    resultId: number,
    options?: { limit?: number; offset?: number },
  ): Promise<BacktestTradeEntity[]> {
    const query = this.tradeRepository
      .createQueryBuilder('trade')
      .where('trade.resultId = :resultId', { resultId })
      .orderBy('trade.entryTime', 'DESC');

    if (options?.limit) query.take(options.limit);
    if (options?.offset) query.skip(options.offset);

    return await query.getMany();
  }

  async getEquityPoints(resultId: number): Promise<EquityPointEntity[]> {
    return await this.equityRepository.find({
      where: { result: { id: resultId } },
      order: { timestamp: 'ASC' },
    });
  }

  // Statistics
  async countConfigs(filters?: BacktestConfigFilters): Promise<number> {
    const query = this.configRepository.createQueryBuilder('config');

    if (filters?.userId) {
      query.andWhere('config.userId = :userId', { userId: filters.userId });
    }

    return await query.getCount();
  }

  async countResults(configId: number): Promise<number> {
    return await this.resultRepository.count({
      where: { config: { id: configId } },
    });
  }

  // Compare results
  async compareResults(resultIds: number[]): Promise<BacktestResultEntity[]> {
    return await this.resultRepository.find({
      where: resultIds.map((id) => ({ id })),
      relations: ['config', 'strategy'],
      order: { totalReturn: 'DESC' },
    });
  }
}
