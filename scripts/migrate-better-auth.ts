/**
 * migrate-better-auth.ts
 *
 * Runs better-auth's built-in migrations to create / update all auth-related
 * tables, including tables added by plugins (e.g. the `apikey` table).
 *
 * This is idempotent — safe to run multiple times or on every deploy.
 *
 * Usage (from repo root):
 *   npx tsx scripts/migrate-better-auth.ts
 *
 * Or via the web-manager package script:
 *   pnpm --filter @itrade/web-manager run migrate-auth
 *
 * Reads DB credentials from the same env variables used by the web app:
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DB
 */

import { getMigrations } from 'better-auth/db';
import { admin, apiKey, bearer } from 'better-auth/plugins';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load env from apps/web/.env (or root .env as fallback)
const envCandidates = [
  path.resolve(process.cwd(), 'apps/web/.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'apps/web/.env.local'),
];
for (const envFile of envCandidates) {
  const result = dotenv.config({ path: envFile });
  if (!result.error) {
    console.log(`✅ Loaded env from: ${envFile}`);
    break;
  }
}

// Support both individual DB_* vars and the combined POSTGRES_URL
const poolConfig = process.env.POSTGRES_URL
  ? {
      connectionString: process.env.POSTGRES_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_DB || 'itrade',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool({ ...poolConfig, connectionTimeoutMillis: 10_000 });

async function main() {
  console.log('🔧 better-auth migration starting…');
  const dbDesc = process.env.POSTGRES_URL
    ? process.env.POSTGRES_URL.replace(/:([^:@]+)@/, ':***@')
    : `${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DB}`;
  console.log(`   DB: ${dbDesc}`);

  const { runMigrations } = await getMigrations({
    database: pool,
    plugins: [
      admin(),
      bearer(),
      apiKey({
        defaultPrefix: 'itrade_',
        enableMetadata: true,
        permissions: {
          defaultPermissions: {
            read: [
              'portfolio',
              'orders',
              'strategies',
              'backtests',
              'tickers',
              'analytics',
            ],
            write: ['orders', 'strategies', 'backtests'],
            settings: ['profile', 'preferences'],
          },
        },
      }),
    ],
  });

  await runMigrations();

  console.log('✅ better-auth migrations completed successfully.');
  await pool.end();
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
