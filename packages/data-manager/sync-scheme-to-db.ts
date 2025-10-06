import { config } from 'dotenv';

import { TypeOrmDataManager } from './src/TypeOrmDataManager';

config();

const configuration = {
  type: 'postgres' as const,
  host: process.env.DB_HOST!,
  port: parseInt(process.env.DB_PORT!),
  username: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_DB!,
  synchronize: true,
};
console.log(configuration);
const dataManager = new TypeOrmDataManager(configuration);

async function main() {
  try {
    await dataManager.initialize();
    console.log('Database schema synchronized successfully.');
  } catch (err) {
    console.error('Failed to synchronize schema:', err);
    process.exitCode = 1;
  } finally {
    try {
      await dataManager.close();
    } catch (_) {}
  }
}

void main();
