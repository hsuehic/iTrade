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
 * Get or create the global DataManager instance
 *
 * Uses globalThis for persistence across Next.js module instances.
 * Next.js production builds can inline MULTIPLE copies of this module (one
 * per route bundle); globalThis is the only storage shared across those
 * copies — the same pattern Prisma officially recommends for Next.js.
 *
 * Cross-bundle entity-class identity is guaranteed WITHOUT runtime patches:
 * production builds use webpack (see `--webpack` in package.json scripts),
 * whose externals function (see next.config.ts) externalizes `@itrade/*`
 * workspace packages. The external `require('@itrade/data-manager')`
 * resolves through the Node module cache to a SINGLE module instance, so
 * every bundle graph shares the same entity classes and the singleton
 * created by any copy serves all of them.
 */
export async function getDataManager(): Promise<TypeOrmDataManager> {
  const existingInstance = globalThis.__dataManagerInstance;
  if (existingInstance) {
    // Self-healing check: a destroyed/unusable DataSource (e.g. DB restart)
    // must re-initialize instead of serving errors forever. Destroy the old
    // DataSource FIRST so its pool's Postgres connections are actually
    // closed — otherwise the abandoned pool leaks connections (pg-pool never
    // closes idle clients below the configured `min`).
    const hasMethods = typeof existingInstance.getAccountInfoRepository === 'function';
    const isUsable = existingInstance.dataSource?.isInitialized === true;

    if (!hasMethods || !isUsable) {
      console.warn(
        '⚠️ DataManager singleton is unusable (DataSource not initialized). Re-initializing...',
      );
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
