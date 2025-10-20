import 'reflect-metadata';
import { DataSource, Repository, LessThanOrEqual } from 'typeorm';
import { IDataManager, Kline } from '@itrade/core';

import { KlineEntity } from './entities/Kline';
import { SymbolEntity } from './entities/Symbol';
import { DataQualityEntity } from './entities/DataQuality';
import { TradeEntity } from './entities/Trade';
import { OrderEntity } from './entities/Order';
import { OrderFillEntity } from './entities/OrderFill';
import { PositionEntity } from './entities/Position';
import { StrategyEntity } from './entities/Strategy';
import { StrategyStateEntity } from './entities/StrategyState';
import { AccountInfoEntity } from './entities/AccountInfo';
import { BalanceEntity } from './entities/Balance';
import { BacktestConfigEntity } from './entities/BacktestConfig';
import { BacktestResultEntity } from './entities/BacktestResult';
import { BacktestTradeEntity } from './entities/BacktestTrade';
import { EquityPointEntity } from './entities/EquityPoint';
import { DryRunSessionEntity } from './entities/DryRunSession';
import { DryRunOrderEntity } from './entities/DryRunOrder';
import { DryRunOrderFillEntity } from './entities/DryRunOrderFill';
import { DryRunTradeEntity } from './entities/DryRunTrade';
import { DryRunResultEntity } from './entities/DryRunResult';
import { AccountSnapshotEntity } from './entities/AccountSnapshot';
import { EmailPreferencesEntity } from './entities/EmailPreferences';
import { User } from './entities/User';
import { Account } from './entities/Account';
import { Session } from './entities/Session';
import {
  StrategyRepository,
  OrderRepository,
  PnLRepository,
  EmailPreferencesRepository,
} from './repositories';
import {
  AccountSnapshotRepository,
  AccountSnapshotData,
} from './repositories/AccountSnapshotRepository';

export interface TypeOrmDataManagerConfig {
  type: 'postgres' | 'mysql';
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl?: boolean;
  logging?:
  | boolean
  | 'all'
  | ('query' | 'schema' | 'error' | 'warn' | 'info' | 'log' | 'migration')[];
  synchronize?: boolean;
  migrationsRun?: boolean;
  extra?: any;
  // Performance optimization options
  poolSize?: number;
  cache?:
  | boolean
  | {
    type?: 'database' | 'redis';
    duration?: number;
    options?: any;
  };
  maxQueryExecutionTime?: number;
}

export class TypeOrmDataManager implements IDataManager {
  private dataSource!: DataSource;
  private klineRepository!: Repository<KlineEntity>;
  private symbolRepository!: Repository<SymbolEntity>;
  private dataQualityRepository!: Repository<DataQualityEntity>;

  // Domain repositories
  private strategyRepository!: StrategyRepository;
  private orderRepository!: OrderRepository;
  private pnlRepository!: PnLRepository;
  private accountSnapshotRepository!: AccountSnapshotRepository;
  private emailPreferencesRepository!: EmailPreferencesRepository;

  // Dry run repositories (initialized on demand via dataSource)
  // Using inline repository lookups to avoid expanding class members excessively
  private isInitialized = false;

  constructor (private config: TypeOrmDataManagerConfig) { }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.dataSource = new DataSource({
      type: this.config.type,
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      password: this.config.password,
      database: this.config.database,
      ssl: this.config.ssl,
      synchronize: this.config.synchronize ?? false,
      migrationsRun: this.config.migrationsRun ?? true,
      logging: this.config.logging ?? false,
      poolSize: this.config.poolSize,
      cache: this.config.cache,
      maxQueryExecutionTime: this.config.maxQueryExecutionTime,
      entities: [
        KlineEntity,
        SymbolEntity,
        DataQualityEntity,
        TradeEntity,
        OrderEntity,
        OrderFillEntity,
        PositionEntity,
        StrategyEntity,
        StrategyStateEntity,
        AccountInfoEntity,
        BalanceEntity,
        AccountSnapshotEntity,
        BacktestConfigEntity,
        BacktestResultEntity,
        BacktestTradeEntity,
        EquityPointEntity,
        // Auth and user management entities
        User,
        Account,
        Session,
        EmailPreferencesEntity,
        // Dry Run entities
        DryRunSessionEntity,
        DryRunOrderEntity,
        DryRunOrderFillEntity,
        DryRunTradeEntity,
        DryRunResultEntity,
      ],
      extra: this.config.extra || {},
    });

    await this.dataSource.initialize();

    this.klineRepository = this.dataSource.getRepository(KlineEntity);
    this.symbolRepository = this.dataSource.getRepository(SymbolEntity);
    this.dataQualityRepository =
      this.dataSource.getRepository(DataQualityEntity);

    // Initialize domain repositories
    this.strategyRepository = new StrategyRepository(this.dataSource);
    this.orderRepository = new OrderRepository(this.dataSource);
    this.pnlRepository = new PnLRepository(this.dataSource);
    this.accountSnapshotRepository = new AccountSnapshotRepository(
      this.dataSource
    );
    this.emailPreferencesRepository = new EmailPreferencesRepository(
      this.dataSource
    );

    this.isInitialized = true;
  }

  async close(): Promise<void> {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
      this.isInitialized = false;
    }
  }

  async getKlines(
    symbol: string,
    interval: string,
    startTime: Date,
    endTime: Date,
    limit?: number
  ): Promise<Kline[]> {
    this.ensureInitialized();

    const queryBuilder = this.klineRepository
      .createQueryBuilder('kline')
      .where('kline.symbol = :symbol', { symbol })
      .andWhere('kline.interval = :interval', { interval })
      .andWhere('kline.openTime >= :startTime', { startTime })
      .andWhere('kline.openTime <= :endTime', { endTime })
      .orderBy('kline.openTime', 'ASC');

    if (limit) {
      queryBuilder.limit(limit);
    }

    const entities = await queryBuilder.getMany();

    return entities.map((entity) => this.entityToKline(entity));
  }

  async saveKlines(
    symbol: string,
    interval: string,
    klines: Kline[]
  ): Promise<void> {
    if (klines.length === 0) return;

    this.ensureInitialized();

    const entities = klines.map((kline) => this.klineToEntity(kline));

    // Use upsert to handle duplicates
    await this.klineRepository.upsert(entities, {
      conflictPaths: ['symbol', 'interval', 'openTime'],
      skipUpdateIfNoValuesChanged: true,
    });

    // Update data quality metrics
    await this.updateDataQuality(symbol, interval);
  }

  async batchSaveKlines(
    klinesData: { symbol: string; interval: string; klines: Kline[] }[]
  ): Promise<void> {
    this.ensureInitialized();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const {
        symbol: _symbol,
        interval: _interval,
        klines,
      } of klinesData) {
        if (klines.length === 0) continue;

        const entities = klines.map((kline) => this.klineToEntity(kline));

        await queryRunner.manager.upsert(KlineEntity, entities, {
          conflictPaths: ['symbol', 'interval', 'openTime'],
          skipUpdateIfNoValuesChanged: true,
        });
      }

      await queryRunner.commitTransaction();

      // Update data quality for all symbols
      for (const { symbol, interval } of klinesData) {
        await this.updateDataQuality(symbol, interval);
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getLatestKlines(
    symbols: string[],
    interval: string,
    limit: number = 1
  ): Promise<Map<string, Kline[]>> {
    this.ensureInitialized();

    const results = new Map<string, Kline[]>();

    for (const symbol of symbols) {
      const entities = await this.klineRepository.find({
        where: { symbol, interval },
        order: { openTime: 'DESC' },
        take: limit,
      });

      results.set(
        symbol,
        entities.map((entity) => this.entityToKline(entity))
      );
    }

    return results;
  }

  async validateData(symbol: string, interval: string): Promise<boolean> {
    this.ensureInitialized();

    const count = await this.klineRepository.count({
      where: { symbol, interval },
    });

    return count > 0;
  }

  async cleanData(symbol: string, interval: string): Promise<number> {
    this.ensureInitialized();

    // Find and remove duplicates
    const duplicateQuery = `
      DELETE k1 FROM klines k1
      INNER JOIN klines k2 
      WHERE k1.id > k2.id 
      AND k1.symbol = k2.symbol 
      AND k1.interval = k2.interval 
      AND k1.openTime = k2.openTime
    `;

    const result = await this.dataSource.query(duplicateQuery);
    const deletedCount = result.affectedRows || 0;

    // Update data quality after cleanup
    await this.updateDataQuality(symbol, interval);

    return deletedCount;
  }

  async getAvailableSymbols(): Promise<string[]> {
    this.ensureInitialized();

    const entities = await this.symbolRepository.find({
      where: { isActive: true },
      select: ['symbol'],
      order: { symbol: 'ASC' },
    });

    return entities.map((entity) => entity.symbol);
  }

  async getAvailableIntervals(symbol: string): Promise<string[]> {
    this.ensureInitialized();

    const intervals = await this.klineRepository
      .createQueryBuilder('kline')
      .select('DISTINCT kline.interval', 'interval')
      .where('kline.symbol = :symbol', { symbol })
      .getRawMany();

    return intervals.map((row) => row.interval).sort();
  }

  async addSymbol(symbolData: {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    exchange?: string;
    baseAssetPrecision?: number;
    quoteAssetPrecision?: number;
    orderTypes?: string[];
    timeInForces?: string[];
    filters?: any;
  }): Promise<void> {
    this.ensureInitialized();

    const entity = this.symbolRepository.create({
      symbol: symbolData.symbol,
      baseAsset: symbolData.baseAsset,
      quoteAsset: symbolData.quoteAsset,
      exchange: symbolData.exchange || 'binance',
      baseAssetPrecision: symbolData.baseAssetPrecision || 8,
      quoteAssetPrecision: symbolData.quoteAssetPrecision || 8,
      orderTypes: symbolData.orderTypes,
      timeInForces: symbolData.timeInForces,
      filters: symbolData.filters
        ? JSON.stringify(symbolData.filters)
        : undefined,
    });

    await this.symbolRepository.save(entity);
  }

  async getDataQualityMetrics(
    symbol: string,
    interval: string
  ): Promise<{
    totalRecords: number;
    missingCandles: number;
    duplicateCandles: number;
    dataCompleteness: number;
    firstCandleTime?: Date;
    lastCandleTime?: Date;
    lastUpdate?: Date;
    avgGapMinutes: number;
    maxGapMinutes: number;
    issues: string[];
  }> {
    this.ensureInitialized();

    const quality = await this.dataQualityRepository.findOne({
      where: { symbol, interval },
    });

    if (!quality) {
      // Calculate and store quality metrics if not exists
      await this.updateDataQuality(symbol, interval);
      return this.getDataQualityMetrics(symbol, interval);
    }

    return {
      totalRecords: quality.totalRecords,
      missingCandles: quality.missingCandles,
      duplicateCandles: quality.duplicateCandles,
      dataCompleteness: quality.completenessPercent,
      firstCandleTime: quality.firstCandleTime,
      lastCandleTime: quality.lastCandleTime,
      lastUpdate: quality.lastUpdateTime,
      avgGapMinutes: quality.avgGapMinutes,
      maxGapMinutes: quality.maxGapMinutes,
      issues: quality.issues ? JSON.parse(quality.issues) : [],
    };
  }

  async saveTrades(symbol: string, trades: any[]): Promise<void> {
    // TODO: Implement trades storage with TypeORM entity
    console.warn(
      `saveTrades not yet implemented for TypeOrmDataManager. Symbol: ${symbol}, trades: ${trades.length}`
    );
  }

  async getTrades(
    symbol: string,
    startTime: Date,
    endTime: Date,
    limit?: number
  ): Promise<any[]> {
    // TODO: Implement trades retrieval with TypeORM entity
    console.warn(
      `getTrades not yet implemented for TypeOrmDataManager. Symbol: ${symbol}, range: ${startTime} - ${endTime}, limit: ${limit}`
    );
    return [];
  }

  // -------------------- Dry Run helpers --------------------
  async createDryRunSession(session: {
    strategyId?: number;
    name?: string;
    parametersSnapshot?: Record<string, unknown>;
    startTime: Date;
    timeframe?: string;
    symbols?: string[];
    initialBalance: number | string | import('decimal.js').Decimal;
    commission?: number | string | import('decimal.js').Decimal;
    slippage?: number | string | import('decimal.js').Decimal;
    notes?: string;
    userId: string;
  }): Promise<DryRunSessionEntity> {
    this.ensureInitialized();

    const sessionRepo = this.dataSource.getRepository(DryRunSessionEntity);
    const entity = sessionRepo.create({
      name: session.name,
      parametersSnapshot: session.parametersSnapshot,
      startTime: session.startTime,
      timeframe: session.timeframe,
      symbols: session.symbols,
      initialBalance: session.initialBalance,
      commission: session.commission ?? 0,
      slippage: session.slippage,
      notes: session.notes,
    });

    if (session.strategyId) {
      entity.strategy = { id: session.strategyId } as StrategyEntity;
    }

    // Associate required user
    (entity as any).user = {
      id: session.userId,
    } as unknown as import('./entities/User').User;

    return await sessionRepo.save(entity);
  }

  async completeDryRunSession(
    sessionId: number,
    endTime: Date,
    status: 'completed' | 'failed' | 'canceled' = 'completed'
  ): Promise<void> {
    this.ensureInitialized();
    const repo = this.dataSource.getRepository(DryRunSessionEntity);
    await repo.update(
      { id: sessionId },
      { endTime, status: status as unknown as DryRunSessionEntity['status'] }
    );
  }

  async saveDryRunOrders(
    sessionId: number,
    orders: Array<
      Omit<
        DryRunOrderEntity,
        'internalId' | 'session' | 'createdAt' | 'updatedAt'
      >
    >
  ): Promise<void> {
    this.ensureInitialized();
    if (orders.length === 0) return;

    const repo = this.dataSource.getRepository(DryRunOrderEntity);
    const entities = orders.map((o) => ({
      ...o,
      session: { id: sessionId } as unknown as DryRunSessionEntity,
    }));
    await repo.save(entities as unknown as DryRunOrderEntity[]);
  }

  async saveDryRunOrderFills(
    fills: Array<
      Omit<DryRunOrderFillEntity, 'internalId' | 'createdAt' | 'updatedAt'>
    >
  ): Promise<void> {
    this.ensureInitialized();
    if (fills.length === 0) return;

    const repo = this.dataSource.getRepository(DryRunOrderFillEntity);
    await repo.save(fills as unknown as DryRunOrderFillEntity[]);
  }

  async saveDryRunTrades(
    sessionId: number,
    trades: Array<Omit<DryRunTradeEntity, 'id' | 'session'>>
  ): Promise<void> {
    this.ensureInitialized();
    if (trades.length === 0) return;

    const repo = this.dataSource.getRepository(DryRunTradeEntity);
    const entities = trades.map((t) => ({
      ...t,
      session: { id: sessionId } as unknown as DryRunSessionEntity,
    }));
    await repo.save(entities as unknown as DryRunTradeEntity[]);
  }

  async saveDryRunResult(
    sessionId: number,
    result: Omit<DryRunResultEntity, 'id' | 'session' | 'createdAt'>
  ): Promise<DryRunResultEntity> {
    this.ensureInitialized();
    const repo = this.dataSource.getRepository(DryRunResultEntity);
    const entity = repo.create({
      ...(result as unknown as DryRunResultEntity),
      session: { id: sessionId } as unknown as DryRunSessionEntity,
    });
    return await repo.save(entity);
  }

  async deleteOldData(
    symbol: string,
    interval: string,
    olderThan: Date
  ): Promise<number> {
    this.ensureInitialized();

    const result = await this.klineRepository.delete({
      symbol,
      interval,
      openTime: LessThanOrEqual(olderThan),
    });

    return result.affected || 0;
  }

  async getDataSizeStats(): Promise<{
    totalRecords: number;
    uniqueSymbols: number;
    uniqueIntervals: number;
    oldestRecord?: Date;
    newestRecord?: Date;
    databaseSizeMB?: number;
  }> {
    this.ensureInitialized();

    const [totalRecords, symbols, intervals, oldest, newest] =
      await Promise.all([
        this.klineRepository.count(),
        this.klineRepository
          .createQueryBuilder('kline')
          .select('COUNT(DISTINCT kline.symbol)', 'count')
          .getRawOne(),
        this.klineRepository
          .createQueryBuilder('kline')
          .select('COUNT(DISTINCT kline.interval)', 'count')
          .getRawOne(),
        this.klineRepository.findOne({ order: { openTime: 'ASC' } }),
        this.klineRepository.findOne({ order: { openTime: 'DESC' } }),
      ]);

    return {
      totalRecords,
      uniqueSymbols: parseInt(symbols.count),
      uniqueIntervals: parseInt(intervals.count),
      oldestRecord: oldest?.openTime,
      newestRecord: newest?.openTime,
    };
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error(
        'TypeOrmDataManager not initialized. Call initialize() first.'
      );
    }
  }

  private entityToKline(entity: KlineEntity): Kline {
    return {
      symbol: entity.symbol,
      interval: entity.interval,
      openTime: entity.openTime,
      closeTime: entity.closeTime,
      open: entity.open,
      high: entity.high,
      low: entity.low,
      close: entity.close,
      volume: entity.volume,
      quoteVolume: entity.quoteVolume,
      trades: entity.trades,
      takerBuyBaseVolume: entity.takerBuyBaseVolume,
      takerBuyQuoteVolume: entity.takerBuyQuoteVolume,
    };
  }

  private klineToEntity(kline: Kline): Partial<KlineEntity> {
    return {
      symbol: kline.symbol,
      interval: kline.interval,
      openTime: kline.openTime,
      closeTime: kline.closeTime,
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
      volume: kline.volume,
      quoteVolume: kline.quoteVolume,
      trades: kline.trades,
      takerBuyBaseVolume: kline.takerBuyBaseVolume,
      takerBuyQuoteVolume: kline.takerBuyQuoteVolume,
    };
  }

  private async updateDataQuality(
    symbol: string,
    interval: string
  ): Promise<void> {
    const stats = await this.calculateDataQualityStats(symbol, interval);

    await this.dataQualityRepository.upsert(
      {
        symbol,
        interval,
        ...stats,
      },
      ['symbol', 'interval']
    );
  }

  private async calculateDataQualityStats(
    symbol: string,
    interval: string
  ): Promise<Partial<DataQualityEntity>> {
    const klines = await this.klineRepository.find({
      where: { symbol, interval },
      order: { openTime: 'ASC' },
    });

    if (klines.length === 0) {
      return {
        totalRecords: 0,
        missingCandles: 0,
        duplicateCandles: 0,
        completenessPercent: 0,
      };
    }

    const totalRecords = klines.length;
    const firstCandle = klines[0];
    const lastCandle = klines[klines.length - 1];

    // Calculate expected candles based on interval
    const intervalMs = this.intervalToMilliseconds(interval);
    const expectedCandles =
      Math.floor(
        (lastCandle.openTime.getTime() - firstCandle.openTime.getTime()) /
        intervalMs
      ) + 1;

    const missingCandles = Math.max(0, expectedCandles - totalRecords);
    const completenessPercent =
      expectedCandles > 0 ? (totalRecords / expectedCandles) * 100 : 100;

    // Calculate gaps
    const gaps: number[] = [];
    for (let i = 1; i < klines.length; i++) {
      const expectedNextTime = klines[i - 1].openTime.getTime() + intervalMs;
      const actualTime = klines[i].openTime.getTime();
      const gapMs = actualTime - expectedNextTime;

      if (gapMs > 0) {
        gaps.push(Math.floor(gapMs / (1000 * 60))); // Convert to minutes
      }
    }

    const avgGapMinutes =
      gaps.length > 0
        ? Math.floor(gaps.reduce((a, b) => a + b, 0) / gaps.length)
        : 0;
    const maxGapMinutes = gaps.length > 0 ? Math.max(...gaps) : 0;

    return {
      totalRecords,
      missingCandles,
      duplicateCandles: 0, // Would need more complex query to detect
      completenessPercent: Math.round(completenessPercent * 100) / 100,
      firstCandleTime: firstCandle.openTime,
      lastCandleTime: lastCandle.openTime,
      lastUpdateTime: new Date(),
      avgGapMinutes,
      maxGapMinutes,
    };
  }

  private intervalToMilliseconds(interval: string): number {
    const match = interval.match(/^(\d+)([smhdwMy])$/);
    if (!match) {
      throw new Error(`Invalid interval format: ${interval}`);
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      case 'w':
        return value * 7 * 24 * 60 * 60 * 1000;
      case 'M':
        return value * 30 * 24 * 60 * 60 * 1000; // Approximation
      case 'y':
        return value * 365 * 24 * 60 * 60 * 1000; // Approximation
      default:
        throw new Error(`Unknown interval unit: ${unit}`);
    }
  }

  // -------------------- Strategy Management --------------------
  // Delegating to StrategyRepository

  async createStrategy(data: {
    name: string;
    description?: string;
    type: string;
    status?: string;
    exchange?: string;
    symbol?: string;
    parameters?: any;
    userId: string;
  }): Promise<StrategyEntity> {
    this.ensureInitialized();
    return await this.strategyRepository.create(data);
  }

  async getStrategy(
    id: number,
    options?: { includeUser?: boolean }
  ): Promise<StrategyEntity | null> {
    this.ensureInitialized();
    return await this.strategyRepository.findById(id, options);
  }

  async getStrategies(filters?: {
    userId?: string;
    status?: string;
    exchange?: string;
    includeUser?: boolean;
  }): Promise<StrategyEntity[]> {
    this.ensureInitialized();
    return await this.strategyRepository.findAll(filters);
  }

  async updateStrategy(
    id: number,
    updates: Partial<StrategyEntity>
  ): Promise<void> {
    this.ensureInitialized();
    await this.strategyRepository.update(id, updates);
  }

  async deleteStrategy(id: number): Promise<void> {
    this.ensureInitialized();
    await this.strategyRepository.delete(id);
  }

  async updateStrategyStatus(
    id: number,
    status: string,
    errorMessage?: string
  ): Promise<void> {
    this.ensureInitialized();
    await this.strategyRepository.updateStatus(id, status, errorMessage);
  }

  // -------------------- Order Management --------------------
  // Delegating to OrderRepository

  async saveOrder(order: Partial<OrderEntity>): Promise<OrderEntity> {
    this.ensureInitialized();
    return await this.orderRepository.save(order);
  }

  async updateOrder(id: string, updates: Partial<OrderEntity>): Promise<void> {
    this.ensureInitialized();
    await this.orderRepository.update(id, updates);
  }

  async getOrder(id: string): Promise<OrderEntity | null> {
    this.ensureInitialized();
    return await this.orderRepository.findById(id);
  }

  async getOrders(filters?: {
    strategyId?: number;
    symbol?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    includeStrategy?: boolean;
    includeFills?: boolean;
  }): Promise<OrderEntity[]> {
    this.ensureInitialized();
    return await this.orderRepository.findAll(filters);
  }

  // -------------------- PnL Analytics --------------------
  // Delegating to PnLRepository

  async getStrategyPnL(strategyId: number): Promise<{
    totalPnl: number;
    realizedPnl: number;
    unrealizedPnl: number;
    totalOrders: number;
    filledOrders: number;
  }> {
    this.ensureInitialized();
    return await this.pnlRepository.getStrategyPnL(strategyId);
  }

  async getOverallPnL(userId?: string): Promise<{
    totalPnl: number;
    realizedPnl: number;
    unrealizedPnl: number;
    totalOrders: number;
    strategies: Array<{
      strategyId: number;
      strategyName: string;
      pnl: number;
      realizedPnl: number;
      unrealizedPnl: number;
    }>;
  }> {
    this.ensureInitialized();
    return await this.pnlRepository.getOverallPnL(userId);
  }

  // -------------------- Account Snapshot Methods --------------------
  // For AccountPollingService integration

  async saveAccountSnapshot(data: AccountSnapshotData): Promise<void> {
    this.ensureInitialized();
    await this.accountSnapshotRepository.save(data);
  }

  async getLatestAccountSnapshot(
    exchange: string
  ): Promise<AccountSnapshotData | null> {
    this.ensureInitialized();
    return await this.accountSnapshotRepository.getLatest(exchange);
  }

  async getAccountSnapshotHistory(
    exchange: string,
    startTime: Date,
    endTime: Date
  ): Promise<AccountSnapshotData[]> {
    this.ensureInitialized();
    return await this.accountSnapshotRepository.getHistory(
      exchange,
      startTime,
      endTime
    );
  }

  async getAccountSnapshotStatistics(
    exchange: string,
    startTime: Date,
    endTime: Date
  ) {
    this.ensureInitialized();
    return await this.accountSnapshotRepository.getStatistics(
      exchange,
      startTime,
      endTime
    );
  }

  async getBalanceTimeSeries(
    exchange: string,
    startTime: Date,
    endTime: Date,
    interval: 'hour' | 'day' | 'week' = 'day'
  ) {
    this.ensureInitialized();
    return await this.accountSnapshotRepository.getBalanceTimeSeries(
      exchange,
      startTime,
      endTime,
      interval
    );
  }

  // Get AccountSnapshotRepository for advanced queries
  getAccountSnapshotRepository(): AccountSnapshotRepository {
    this.ensureInitialized();
    return this.accountSnapshotRepository;
  }

  // Get StrategyRepository for advanced queries
  getStrategyRepository(): StrategyRepository {
    this.ensureInitialized();
    return this.strategyRepository;
  }

  // Get OrderRepository for advanced queries
  getOrderRepository(): OrderRepository {
    this.ensureInitialized();
    return this.orderRepository;
  }

  // Get PnLRepository for advanced queries
  getPnLRepository(): PnLRepository {
    this.ensureInitialized();
    return this.pnlRepository;
  }

  // Get EmailPreferencesRepository for advanced queries
  getEmailPreferencesRepository(): EmailPreferencesRepository {
    this.ensureInitialized();
    return this.emailPreferencesRepository;
  }
}
