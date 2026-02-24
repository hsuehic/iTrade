import 'dotenv/config';
import 'reflect-metadata';
import { ConsoleLogger, LogLevel } from '@itrade/core';
import { TypeOrmDataManager } from '@itrade/data-manager';
import { OrderTracker } from './integration/helpers/order-tracker';
import { BotManager } from './BotManager';
import * as readline from 'readline';

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

  for (const { userId, trackers, activeStrategyIds } of allStats) {
    logger.info(`\n👤 User: ${userId}`);
    displayOrderStats(trackers, userId, activeStrategyIds);
  }
}

/**
 * Display order statistics for a single tracker
 */
function displayOrderStats(
  orderTracker: OrderTracker,
  userId: string = 'Unknown',
  activeStrategyIds?: Set<number>,
): void {
  const orderManager = orderTracker.getOrderManager();
  const grouped = orderManager.getOrdersGroupedByExchangeAndSymbol(activeStrategyIds);

  if (grouped.size === 0) {
    logger.info(`   (No orders tracked for ${userId})`);
    return;
  }

  for (const [exchange, symbolMap] of grouped) {
    logger.info(`   🏦 Exchange: ${exchange.toUpperCase()}`);

    for (const [symbol] of symbolMap) {
      const stats = orderManager.getOrderStats({ symbol, exchange, activeStrategyIds });
      logger.info(
        `      📈 ${symbol}: Total: ${stats.total} | Open: ${stats.open} | Filled: ${stats.filled}`,
      );
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
  // Interactive Mode: Key Listener
  // ============================================================
  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    process.stdin.on('keypress', (str, key) => {
      if (key.ctrl && key.name === 'c') {
        // Allow Ctrl+C to trigger standard SIGINT
        process.emit('SIGINT');
      } else if (key.name === 'd') {
        ConsoleLogger.setGlobalLevel(LogLevel.DEBUG);
        logger.info('🔍 Global Log Level switched to: DEBUG');
        logger.debug('Debug logging enabled - you will see verbose output.');
      } else if (key.name === 'i') {
        ConsoleLogger.setGlobalLevel(LogLevel.INFO);
        logger.info('ℹ️  Global Log Level switched to: INFO');
      } else if (key.name === 's') {
        displayGlobalOrderStats(botManager);
      }
    });

    logger.info('');
    logger.info('⌨️  Interactive Controls:');
    logger.info('   [d] Switch to DEBUG level');
    logger.info('   [i] Switch to INFO level');
    logger.info('   [s] Show Order Stats');
    logger.info('   [Ctrl+C] Exit');
    logger.info('');
  }

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
