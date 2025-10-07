// Data Manager - Historical data and market data management with TypeORM
export { FileDataManager } from './FileDataManager';
export { TypeOrmDataManager } from './TypeOrmDataManager';
export { CacheManager } from './CacheManager';
export { MigrationHelper } from './MigrationHelper';

// Entity exports
export { KlineEntity, DecimalTransformer } from './entities/Kline';
export { SymbolEntity } from './entities/Symbol';
export { DataQualityEntity } from './entities/DataQuality';
export { TradeEntity } from './entities/Trade';
export { OrderEntity } from './entities/Order';
export { OrderFillEntity } from './entities/OrderFill';
export { PositionEntity } from './entities/Position';
export { StrategyEntity } from './entities/Strategy';
export { AccountInfoEntity } from './entities/AccountInfo';
export { BalanceEntity } from './entities/Balance';
export { BacktestConfigEntity } from './entities/BacktestConfig';
export { BacktestResultEntity } from './entities/BacktestResult';
export { BacktestTradeEntity } from './entities/BacktestTrade';
export { EquityPointEntity } from './entities/EquityPoint';
export { DryRunSessionEntity } from './entities/DryRunSession';
export { DryRunOrderEntity } from './entities/DryRunOrder';
export { DryRunOrderFillEntity } from './entities/DryRunOrderFill';
export { DryRunTradeEntity } from './entities/DryRunTrade';
export { DryRunResultEntity } from './entities/DryRunResult';

// Types and interfaces
export type {
  IDataManager,
  DataSource,
  DataQueryOptions,
  CacheOptions,
} from '@crypto-trading/core';

export type { TypeOrmDataManagerConfig } from './TypeOrmDataManager';
