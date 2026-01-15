// Data Manager - Historical data and market data management with TypeORM
import 'reflect-metadata';

export { FileDataManager } from './FileDataManager';
export { TypeOrmDataManager } from './TypeOrmDataManager';
export { CacheManager } from './CacheManager';
export { MigrationHelper } from './MigrationHelper';

// Repositories
export {
  StrategyRepository,
  OrderRepository,
  PnLRepository,
  EmailPreferencesRepository,
  PushDeviceRepository,
} from './repositories';
export type { EmailPreferencesData } from './repositories';
export { AccountSnapshotRepository } from './repositories/AccountSnapshotRepository';
export type {
  AccountSnapshotData,
  AccountSnapshotQueryOptions,
} from './repositories/AccountSnapshotRepository';

// Entity exports
export { KlineEntity, DecimalTransformer } from './entities/Kline';
export { SymbolEntity } from './entities/Symbol';
export { DataQualityEntity } from './entities/DataQuality';
export { TradeEntity } from './entities/Trade';
export { OrderEntity } from './entities/Order';
export { OrderFillEntity } from './entities/OrderFill';
export { PositionEntity } from './entities/Position';
export { StrategyEntity } from './entities/Strategy';
export { StrategyStatus, MarketType } from './entities/Strategy';
export { StrategyStateEntity } from './entities/StrategyState';
export { AccountInfoEntity } from './entities/AccountInfo';
export { BalanceEntity } from './entities/Balance';
export { AccountSnapshotEntity } from './entities/AccountSnapshot';
export { BacktestConfigEntity } from './entities/BacktestConfig';
export { BacktestResultEntity } from './entities/BacktestResult';
export { BacktestTradeEntity } from './entities/BacktestTrade';
export { EquityPointEntity } from './entities/EquityPoint';
export { DryRunSessionEntity } from './entities/DryRunSession';
export { DryRunOrderEntity } from './entities/DryRunOrder';
export { DryRunOrderFillEntity } from './entities/DryRunOrderFill';
export { DryRunTradeEntity } from './entities/DryRunTrade';
export { DryRunResultEntity } from './entities/DryRunResult';
export { EmailPreferencesEntity } from './entities/EmailPreferences';
export { User } from './entities/User';
export {
  PushDeviceEntity,
  PushEnvironment,
  PushPlatform,
  PushProvider,
} from './entities/PushDevice';
export { PushNotificationLogEntity } from './entities/PushNotificationLog';

// Types and interfaces
export type {
  IDataManager,
  DataSource,
  DataQueryOptions,
  CacheOptions,
} from '@itrade/core';

export type { TypeOrmDataManagerConfig } from './TypeOrmDataManager';
