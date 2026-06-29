import 'reflect-metadata';
import { config } from 'dotenv';

import { TypeOrmDataManager } from './src/index';

// Load environment variables
config();

const SCRIPT_TIMEOUT_MS = 120_000; // 2 minutes hard limit

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
  synchronize: true,
  logging: false,
  ssl: false,
  extra: {
    connectionTimeoutMillis: 15_000,
    query_timeout: 30_000,
    statement_timeout: 30_000,
    idle_in_transaction_session_timeout: 30_000,
  },
};

console.log('📋 Database configuration:');
console.log({
  safeConfig: {
    host: configuration.host,
    port: configuration.port,
    user: configuration.username,
    database: configuration.database,
  },
});
const dataManager = new TypeOrmDataManager(configuration);

async function main() {
  const killTimer = setTimeout(() => {
    console.error(
      '❌ Schema migration timed out after',
      SCRIPT_TIMEOUT_MS / 1000,
      'seconds',
    );
    process.exit(1);
  }, SCRIPT_TIMEOUT_MS);
  killTimer.unref();

  try {
    console.log('🔄 Initializing database connection...');
    await dataManager.initialize();
    console.log('✅ Database schema synchronized successfully.');

    // ── Help-KB pgvector bootstrap ─────────────────────────────────────────
    // TypeORM doesn't know the pgvector `vector` type, so the embedding
    // column + index are managed here with raw SQL. All statements are
    // idempotent so it is safe to run on every deploy.
    //
    // Index choice: HNSW (not IVFFlat).
    //
    // IVFFlat clusters vectors into `lists` buckets at build time via k-means.
    // It requires at least `lists` rows before it can build meaningful clusters;
    // below that threshold every query falls back to a full sequential scan.
    // With lists=100 and a KB table that only holds ~20-50 rows, the index is
    // never engaged — which is exactly why queries became slow after seeding.
    //
    // HNSW builds a navigable graph that grows incrementally as rows are
    // inserted. It works correctly regardless of when the index is created or
    // how few rows exist, and it needs no per-session probe tuning.
    console.log('🔄 Bootstrapping pgvector for help_articles…');
    await dataManager.dataSource.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await dataManager.dataSource.query(
      `ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS embedding vector(768)`,
    );

    // Drop the old IVFFlat index if it exists — it was built on empty/sparse
    // data and is ineffective for a small KB table.
    await dataManager.dataSource.query(
      `DROP INDEX IF EXISTS help_articles_embedding_idx`,
    );

    await dataManager.dataSource.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE schemaname = current_schema()
            AND indexname = 'help_articles_embedding_hnsw_idx'
        ) THEN
          CREATE INDEX help_articles_embedding_hnsw_idx
            ON help_articles
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64);
        END IF;
      END$$;
    `);
    console.log('✅ pgvector ready (extension + embedding column + HNSW index).');
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
    clearTimeout(killTimer);
    process.exit(process.exitCode ?? 0);
  }
}

void main();
