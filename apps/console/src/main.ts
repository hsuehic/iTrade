import 'dotenv/config';
import 'reflect-metadata';
import { ConsoleLogger, LogLevel } from '@itrade/core';
import { TypeOrmDataManager } from '@itrade/data-manager';
import { BotManager } from './BotManager';

/**
 * iTrade Console Application - Main Entry Point
 *
 * Multi-User Mode:
 * - Automatically loads all active users from database
 * - Creates a separate BotInstance for each user
 * - Each bot manages its own exchanges, strategies, and trackers
 * - Refreshes user list on a configurable interval to detect new accounts
 */

const logger = new ConsoleLogger(LogLevel.INFO);

async function main() {
  // ============================================================
  // Step 1: Initialize Database Connection
  // ============================================================
  const dataManager = new TypeOrmDataManager({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DB || 'itrade',
    synchronize: false, // Use migrations in production
    logging: process.env.DB_LOGGING === 'true' ? ['error', 'warn'] : false,
    poolSize: 20,
  });

  await dataManager.initialize();

  // ============================================================
  // Step 2: Initialize Bot Manager
  // ============================================================
  const botManager = new BotManager(dataManager, logger);
  await botManager.start();

  // ============================================================
  // Graceful Shutdown Handler
  // ============================================================
  const shutdown = async () => {
    await botManager.stop();
    await dataManager.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep process alive
}

// Start the application
main().catch((error) => {
  logger.error('Console startup failed', error instanceof Error ? error : { error });
  process.exit(1);
});
