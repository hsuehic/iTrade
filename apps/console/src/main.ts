import 'reflect-metadata';
import { ConsoleLogger, LogLevel } from '@itrade/core';
import { TypeOrmDataManager } from '@itrade/data-manager';
import * as dotenv from 'dotenv';
import { OrderTracker } from './integration/helpers/order-tracker';
import { BotManager } from './BotManager';

// Load environment variables from .env file
dotenv.config();

/**
 * iTrade Console Application - Main Entry Point
 *
 * Multi-User Mode:
 * - Automatically loads all active users from database
 * - Creates a separate BotInstance for each user
 * - Each bot manages its own exchanges, strategies, and trackers
 * - Refreshes user list every 5 minutes to detect new accounts
 */

const logger = new ConsoleLogger(LogLevel.INFO);

/**
 * Display order statistics for all active bots
 */
function displayGlobalOrderStats(botManager: BotManager): void {
  const allStats = botManager.getAllOrderStats();

  if (allStats.length === 0) {
    logger.info('📊 No active bots running.');
    return;
  }

  logger.info('');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info(`📊 Global Order Statistics (${allStats.length} Users)`);
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const { userId, trackers } of allStats) {
    logger.info(`\n👤 User: ${userId}`);
    displayOrderStats(trackers, userId);
  }
}

/**
 * Display order statistics for a single tracker
 */
function displayOrderStats(orderTracker: OrderTracker, userId: string = 'Unknown'): void {
  const orderManager = orderTracker.getOrderManager();
  const grouped = orderManager.getOrdersGroupedByExchangeAndSymbol();

  if (grouped.size === 0) {
    logger.info(`   (No orders tracked for ${userId})`);
    return;
  }

  let totalOrders = 0;

  for (const [exchange, symbolMap] of grouped) {
    logger.info(`   🏦 Exchange: ${exchange.toUpperCase()}`);

    for (const [symbol, orders] of symbolMap) {
      const stats = orderManager.getOrderStats({ exchange, symbol });
      logger.info(
        `      📈 ${symbol}: Total: ${stats.total} | Open: ${stats.open} | Filled: ${stats.filled}`,
      );
      totalOrders += orders.length;
    }
  }
}

async function main() {
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('🚀 iTrade Console Application - Multi-User Mode');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ============================================================
  // Step 1: Initialize Database Connection
  // ============================================================
  logger.info('📦 Step 1: Initializing database connection...');

  const dataManager = new TypeOrmDataManager({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'itrade',
    synchronize: false, // Use migrations in production
    logging: process.env.DB_LOGGING === 'true' ? ['error', 'warn'] : false,
    poolSize: 20,
  });

  await dataManager.initialize();
  logger.info('✅ Database connected\n');

  // ============================================================
  // Step 2: Initialize Bot Manager
  // ============================================================
  const botManager = new BotManager(dataManager, logger);
  await botManager.start();

  // ============================================================
  // Setup Periodic Order Stats Display (every 5 minutes)
  // ============================================================
  const ORDER_STATS_INTERVAL = 5 * 60 * 1000; // 5 minutes
  const orderStatsTimer = setInterval(() => {
    displayGlobalOrderStats(botManager);
  }, ORDER_STATS_INTERVAL);

  // Display initial stats after 30 seconds
  setTimeout(() => {
    displayGlobalOrderStats(botManager);
  }, 30000);

  // ============================================================
  // Graceful Shutdown Handler
  // ============================================================
  const shutdown = async () => {
    logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('🛑 Shutting down...');

    clearInterval(orderStatsTimer);
    await botManager.stop();
    await dataManager.close();

    logger.info('👋 Shutdown complete.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep process alive
}

// Start the application
main().catch((error) => {
  logger.error('❌ Fatal error during startup:', error);
  process.exit(1);
});
