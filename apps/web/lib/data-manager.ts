// IMPORTANT: Import reflect-metadata FIRST before any TypeORM-related imports
// This is critical for production builds where bundler may reorder imports
import 'reflect-metadata';
import { TypeOrmDataManager } from '@itrade/data-manager';

// Use globalThis to persist across module reloads in production
// This prevents issues with Next.js module caching in serverless environments
declare global {
  var __dataManagerInstance: TypeOrmDataManager | undefined;

  var __dataManagerInitPromise: Promise<TypeOrmDataManager> | undefined;
}

/**
 * Why NOT to gate the singleton on entity class-reference equality.
 *
 * Next.js (Turbopack) production builds can end up with MULTIPLE module
 * instances of this file — one per bundle graph (e.g. the server bundle used
 * by route handlers and the SSR bundle used for page rendering). Each module
 * instance imports its own copy of the entity classes from
 * `@itrade/data-manager`, so `m.target === EntityClass` comparisons across
 * bundle graphs are ALWAYS false even though both copies describe the exact
 * same entities/tables.
 *
 * The previous class-reference "staleness" check misread this as a stale
 * singleton and re-initialized a brand-new DataSource (pg Pool) on every
 * cross-bundle call — without destroying the old one. Every abandoned pool
 * then held its connections open forever (pg-pool never closes idle clients
 * below the configured `min`), leaking 2+ Postgres connections per re-init
 * until the server hit max_connections ("sorry, too many clients already",
 * 53300) and every DB-backed API route 500'd. Observed in production:
 * 106 re-init warnings and 66 permanently-idle connections in ~43h.
 *
 * Entity metadata identity is only a genuine concern in Next dev-mode HMR,
 * where a module can be reloaded in place. The table-name check below covers
 * that case correctly: HMR-reloaded entities register the same table names,
 * so the singleton stays; a genuinely missing entity (the real staleness
 * case) is still detected and re-initialized.
 */
const REQUIRED_ENTITY_TABLES = [
  'backtest_configs', // representative of the backtest domain
  'dry_run_sessions', // representative of the dry-run domain
] as const;

/**
 * Get or create the global DataManager instance
 *
 * Uses globalThis for persistence across Next.js serverless function invocations.
 * This ensures proper prototype chains are maintained in production builds.
 */
export async function getDataManager(): Promise<TypeOrmDataManager> {
  // Check if already initialized (persisted in globalThis for production)
  const existingInstance = globalThis.__dataManagerInstance;
  if (existingInstance) {
    // Verify the instance is functional and has all required entity tables
    // registered. Compare by TABLE NAME (stable across module/bundle copies)
    // rather than class reference (which differs per bundle graph in
    // Turbopack production builds — see the note above).
    const hasMethods = typeof existingInstance.getAccountInfoRepository === 'function';
    const hasCurrentEntityRefs =
      existingInstance.dataSource?.isInitialized &&
      REQUIRED_ENTITY_TABLES.every((tableName) =>
        existingInstance.dataSource?.entityMetadatas?.some(
          (m: { tableName?: string }) => m.tableName === tableName,
        ),
      );

    if (!hasMethods || !hasCurrentEntityRefs) {
      console.warn(
        '⚠️ DataManager singleton is stale (entity refs changed or missing). Re-initializing...',
      );
      // Destroy the old DataSource FIRST so its pool's Postgres connections
      // are actually closed — otherwise the abandoned pool leaks connections
      // (pg-pool never closes idle clients below the configured `min`, so an
      // undestroyed pool pins `min` connections forever).
      const staleInstance = existingInstance;
      const staleInitPromise = globalThis.__dataManagerInitPromise;
      await staleInstance.dataSource?.destroy().catch((err: unknown) => {
        console.warn('⚠️ Failed to destroy stale DataManager DataSource:', err);
      });
      // COMPARE-AND-CLEAR: only clear the globals if they still point at the
      // stale instance we just destroyed. A concurrent request may have
      // already completed its own re-initialization while we were awaiting
      // destroy() — blindly clearing here would orphan that fresh instance
      // (leaking its pool) and force yet another re-init.
      if (globalThis.__dataManagerInstance === staleInstance) {
        globalThis.__dataManagerInstance = undefined;
      }
      if (globalThis.__dataManagerInitPromise === staleInitPromise) {
        globalThis.__dataManagerInitPromise = undefined;
      }
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
