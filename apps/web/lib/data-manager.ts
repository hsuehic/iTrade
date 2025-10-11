import { TypeOrmDataManager } from '@itrade/data-manager';

let dataManagerInstance: TypeOrmDataManager | null = null;
let initPromise: Promise<TypeOrmDataManager> | null = null;

/**
 * Get or create the global DataManager instance
 */
export async function getDataManager(): Promise<TypeOrmDataManager> {
  if (dataManagerInstance) {
    return dataManagerInstance;
  }

  // If initialization is already in progress, wait for it
  if (initPromise) {
    return initPromise;
  }

  // Start initialization
  initPromise = (async () => {
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
      cache: {
        type: 'database',
        duration: 30000, // Cache queries for 30 seconds
      },

      // Disable automatic transaction for better performance
      maxQueryExecutionTime: 5000, // Log slow queries over 5s
    });

    await dm.initialize();
    dataManagerInstance = dm;

    if (isDevelopment) {
      console.log('✅ DataManager initialized for Web API');
    }

    return dm;
  })();

  return initPromise;
}
