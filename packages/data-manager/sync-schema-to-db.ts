import 'reflect-metadata';
import { config } from 'dotenv';

import { TypeOrmDataManager } from './src/TypeOrmDataManager';

config();

/**
 * TypeORM Schema Synchronization Script
 *
 * This script synchronizes the database schema with entity definitions.
 *
 * What it does:
 * - Creates/updates all tables from entity classes
 * - Adds all indexes defined with @Index() decorators
 * - Updates foreign key relationships
 *
 * Usage:
 *   npx tsx sync-scheme-to-db.ts
 *
 * Note: In production, consider using migrations for more control.
 */

const configuration = {
  type: 'postgres' as const,
  host: process.env.DB_HOST!,
  port: parseInt(process.env.DB_PORT!),
  username: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_DB!,
  synchronize: true, // Auto-sync schema with entities
};
console.log(configuration);
const dataManager = new TypeOrmDataManager(configuration);

async function main() {
  try {
    await dataManager.initialize();
    console.log('✅ Database schema synchronized successfully.');
  } catch (err) {
    console.error('❌ Failed to synchronize schema:', err);
    process.exitCode = 1;
  } finally {
    try {
      await dataManager.close();
    } catch (err) {
      console.log(err);
    }
  }
}

void main();
