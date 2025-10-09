// IMPORTANT: Import reflect-metadata first, before TypeORM
import 'reflect-metadata';
import { TypeOrmDataManager } from '@itrade/data-manager';

let dataManager: TypeOrmDataManager | null = null;
let initializationPromise: Promise<TypeOrmDataManager> | null = null;

export async function getDataManager(): Promise<TypeOrmDataManager> {
  // Return existing instance if already initialized
  if (dataManager) {
    return dataManager;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start new initialization
  initializationPromise = (async () => {
    try {
      const newDataManager = new TypeOrmDataManager({
        type: 'postgres',
        host: process.env.DATABASE_HOST || 'localhost',
        port: parseInt(process.env.DATABASE_PORT || '5432'),
        username: process.env.DATABASE_USER || 'postgres',
        password: process.env.DATABASE_PASSWORD || 'postgres',
        database: process.env.DATABASE_NAME || 'itrade',
        ssl: process.env.DATABASE_SSL === 'true',
        logging: process.env.NODE_ENV === 'development' ? ['error'] : false,
        synchronize: false, // Don't auto-sync in production
      });

      await newDataManager.initialize();
      dataManager = newDataManager;
      return dataManager;
    } catch (error) {
      // Reset promise on error so it can be retried
      initializationPromise = null;
      throw error;
    }
  })();

  return initializationPromise;
}

