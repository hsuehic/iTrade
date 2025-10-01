// Data Manager - Historical data and market data management with TypeORM
export { FileDataManager } from './FileDataManager';
export { TypeOrmDataManager } from './TypeOrmDataManager';
export { CacheManager } from './CacheManager';
export { MigrationHelper } from './MigrationHelper';

// Entity exports
export { KlineEntity, DecimalTransformer } from './entities/KlineEntity';
export { SymbolEntity } from './entities/SymbolEntity';
export { DataQualityEntity } from './entities/DataQualityEntity';

// Types and interfaces
export type {
  IDataManager,
  DataSource,
  DataQueryOptions,
  CacheOptions,
} from '@crypto-trading/core';

export type { TypeOrmDataManagerConfig } from './TypeOrmDataManager';
