// IMPORTANT: Import reflect-metadata FIRST before any TypeORM-related imports
// This is critical for production builds where bundler may reorder imports
import 'reflect-metadata';
import {
  TypeOrmDataManager,
  BacktestConfigEntity,
  DryRunSessionEntity,
} from '@itrade/data-manager';

// Use globalThis to persist across module reloads in production
// This prevents issues with Next.js module caching in serverless environments
declare global {
  var __dataManagerInstance: TypeOrmDataManager | undefined;

  var __dataManagerInitPromise: Promise<TypeOrmDataManager> | undefined;
}

/**
 * Entity classes that MUST be registered in the DataSource.
 *
 * We compare by class-reference equality (not table name strings) so that
 * Next.js HMR reloads — which create new class objects for the same file —
 * are correctly detected as stale. A table-name-only check would pass even
 * after HMR replaced the class reference, causing EntityMetadataNotFoundError.
 */
const REQUIRED_ENTITY_CLASSES = [
  BacktestConfigEntity, // representative of the backtest domain
  DryRunSessionEntity, // representative of the dry-run domain
];

/**
 * Get or create the global DataManager instance
 *
 * Uses globalThis for persistence across Next.js serverless function invocations.
 * This ensures proper class prototype chains are maintained in production builds.
 */
export async function getDataManager(): Promise<TypeOrmDataManager> {
  // Check if already initialized (persisted in globalThis for production)
  const existingInstance = globalThis.__dataManagerInstance;
  if (existingInstance) {
    // Verify the instance has required methods AND that the DataSource has
    // up-to-date class references for all required entity domains.
    // Class-reference equality catches both:
    //   (a) entities added after the singleton was first created, and
    //   (b) HMR reloads that produce new class objects for unchanged files.
    const hasMethods = typeof existingInstance.getAccountInfoRepository === 'function';
    const hasCurrentEntityRefs =
      existingInstance.dataSource?.isInitialized &&
      REQUIRED_ENTITY_CLASSES.every((EntityClass) =>
        existingInstance.dataSource?.entityMetadatas?.some(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (m: any) => m.target === EntityClass,
        ),
      );

    if (!hasMethods || !hasCurrentEntityRefs) {
      console.warn(
        '⚠️ DataManager singleton is stale (entity refs changed or missing). Re-initializing...',
      );
      globalThis.__dataManagerInstance = undefined;
      globalThis.__dataManagerInitPromise = undefined;
    } else {
      return existingInstance;
    }
  }

  // If initialization is already in progress, wait for it
  if (globalThis.__dataManagerInitPromise) {
    return globalThis.__dataManagerInitPromise;
  }

  // Start initialization
  globalThis.__dataManagerInitPromise = (async () => {
    const isDevelopment = process.env.NODE_ENV !== 'production';

    const dm = new TypeOrmDataManager({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_DB || 'itrade',
      ssl: process.env.DATABASE_SSL === 'true',
      logging: isDevelopment ? ['error', 'warn'] : false,
      synchronize: false, // ⚠️ NEVER use true in production - use migrations instead

      // Connection pool optimization
      poolSize: 10, // Maximum connections
      extra: {
        max: 10, // Maximum pool size
        min: 2, // Minimum pool size
        idleTimeoutMillis: 30000, // Close idle connections after 30s
        connectionTimeoutMillis: 5000, // Connection timeout 5s
        statement_timeout: 10000, // Query timeout 10s (safe with indexes)
      },

      // Performance optimizations
      // cache: {
      //   type: 'database',
      //   duration: 30000, // Cache queries for 30 seconds
      // },

      // Disable automatic transaction for better performance
      maxQueryExecutionTime: 5000, // Log slow queries over 5s
    });

    await dm.initialize();
    globalThis.__dataManagerInstance = dm;

    if (isDevelopment) {
      console.log('✅ DataManager initialized for Web API');
    }

    return dm;
  })();

  return globalThis.__dataManagerInitPromise;
}
