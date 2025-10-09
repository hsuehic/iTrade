import { TypeOrmDataManager } from '@itrade/data-manager';

let dataManager: TypeOrmDataManager | null = null;

export async function getDataManager(): Promise<TypeOrmDataManager> {
  if (!dataManager) {
    dataManager = new TypeOrmDataManager({
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

    await dataManager.initialize();
  }

  return dataManager;
}

