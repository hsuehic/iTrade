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
  PushNotificationRepository,
  DryRunSessionRepository,
  BacktestRepository,
} from './repositories';
export type {
  EmailPreferencesData,
  GetNotificationsOptions,
  UnreadCountResult,
  CreateDryRunSessionData,
  DryRunSessionFilters,
  DryRunSessionWithStats,
  CreateBacktestConfigData,
  BacktestConfigFilters,
  BacktestResultFilters,
  BacktestConfigWithStats,
} from './repositories';
export { AccountSnapshotRepository } from './repositories/AccountSnapshotRepository';
export type {
  AccountSnapshotData,
  AccountSnapshotQueryOptions,
} from './repositories/AccountSnapshotRepository';

// Entity exports
export { KlineEntity } from './entities/Kline';
export { DecimalTransformer, decimalTransformer } from './utils/transformers';
export { SymbolEntity } from './entities/Symbol';
export { DataQualityEntity } from './entities/DataQuality';
export { TradeEntity } from './entities/Trade';
export { OrderEntity } from './entities/Order';
export { OrderFillEntity } from './entities/OrderFill';
export { PositionEntity } from './entities/Position';
export { StrategyEntity } from './entities/Strategy';
export { StrategyStatus, MarketType } from './entities/Strategy';

export { AccountInfoEntity } from './entities/AccountInfo';
export { BalanceEntity } from './entities/Balance';
export {
  BalanceMonthEntity,
  BalanceWeekEntity,
  BalanceDayEntity,
  BalanceHourEntity,
  Balance30MinEntity,
  Balance15MinEntity,
  Balance5MinEntity,
  BalanceMinEntity,
} from './entities/BalanceHistory';
export { AccountSnapshotEntity } from './entities/AccountSnapshot';
export { BacktestConfigEntity } from './entities/BacktestConfig';
export { BacktestResultEntity } from './entities/BacktestResult';
export { BacktestTradeEntity } from './entities/BacktestTrade';
export { EquityPointEntity } from './entities/EquityPoint';
export { DryRunSessionEntity, DryRunStatus } from './entities/DryRunSession';
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
export type {
  PushNotificationCategory,
  PushTargetType,
} from './entities/PushNotificationLog';

// Constants
export {
  SupportedExchange,
  SUPPORTED_EXCHANGES,
  isValidExchange,
  getExchangeDisplayName,
} from './constants/exchanges';
export type { ExchangeName } from './constants/exchanges';

// Types and interfaces
export type {
  IDataManager,
  DataSource,
  DataQueryOptions,
  CacheOptions,
} from '@itrade/core';

export type { TypeOrmDataManagerConfig } from './TypeOrmDataManager';
