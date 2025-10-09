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
    const dm = new TypeOrmDataManager({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_DB || 'itrade',
      ssl: process.env.DATABASE_SSL === 'true',
      logging: ['error'],
      synchronize: true, // Auto-create tables if they don't exist
    });

    await dm.initialize();
    dataManagerInstance = dm;
    console.log('✅ DataManager initialized for Web API');
    return dm;
  })();

  return initPromise;
}
