import 'reflect-metadata';
import { config } from 'dotenv';

import { TypeOrmDataManager } from './src/index';

// Load environment variables
config();

console.log('🔧 Schema Migration Starting...');
console.log('Environment check:');
console.log('- NODE_ENV:', process.env.NODE_ENV);
console.log('- DB_HOST:', process.env.DB_HOST);
console.log('- DB_PORT:', process.env.DB_PORT);
console.log('- DB_USER:', process.env.DB_USER);
console.log('- DB_DB:', process.env.DB_DB);
console.log('- DB_PASSWORD:', process.env.DB_PASSWORD ? '[REDACTED]' : 'NOT SET');

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

// Validate required environment variables
const requiredEnvVars = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_DB'];
const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  process.exit(1);
}

const configuration = {
  type: 'postgres' as const,
  host: process.env.DB_HOST!,
  port: parseInt(process.env.DB_PORT!),
  username: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_DB!,
  synchronize: true, // Auto-sync schema with entities
  logging: false, // Disable verbose logging during migration
};

console.log('📋 Database configuration:');
console.log({
  ...configuration,
  password: '[REDACTED]',
});
const dataManager = new TypeOrmDataManager(configuration);

async function main() {
  try {
    console.log('🔄 Initializing database connection...');
    await dataManager.initialize();
    console.log('✅ Database schema synchronized successfully.');
  } catch (err) {
    console.error('❌ Failed to synchronize schema:');
    if (err instanceof Error) {
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
    } else {
      console.error('Unknown error:', err);
    }
    process.exitCode = 1;
  } finally {
    try {
      console.log('🔄 Closing database connection...');
      await dataManager.close();
      console.log('✅ Database connection closed.');
    } catch (err) {
      console.error('⚠️ Error closing database connection:', err);
    }
  }
}

void main();
