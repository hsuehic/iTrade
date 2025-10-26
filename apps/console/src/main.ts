import 'reflect-metadata';
import { ConsoleLogger, TradingEngine, LogLevel, IExchange } from '@itrade/core';
import { RiskManager } from '@itrade/risk-manager';
import { PortfolioManager } from '@itrade/portfolio-manager';
import {
  BinanceExchange,
  CoinbaseExchange,
  OKXExchange,
} from '@itrade/exchange-connectors';
import { TypeOrmDataManager } from '@itrade/data-manager';
import { Decimal } from 'decimal.js';
import * as dotenv from 'dotenv';
import { StrategyManager } from './integration/helpers/strategy-manager';
import { OrderTracker } from './integration/helpers/order-tracker';
import { BalanceTracker } from './integration/helpers/balance-tracker';
import { PositionTracker } from './integration/helpers/position-tracker';

// Load environment variables from .env file
dotenv.config();

/**
 * iTrade Console Application - Main Entry Point
 *
 * 功能架构：
 * 1. 初始化 TradingEngine
 * 2. 添加交易所（Binance, OKX, Coinbase）
 * 3. 初始化数据库连接
 * 4. 启动 StrategyManager（自动加载和管理策略，支持多用户）
 * 5. 启动 OrderTracker（监听订单事件并持久化，带 debounce）
 * 6. 启动 BalanceTracker（监听余额更新并持久化，带 debounce）
 * 7. 启动 PositionTracker（监听持仓更新并持久化，带 debounce）
 * 8. 优雅关闭处理
 *
 * 多用户支持：
 * - 通过环境变量 USER_ID 指定当前用户
 * - 只加载该用户的策略
 * - 适合多用户系统部署
 */

const logger = new ConsoleLogger(LogLevel.INFO);

async function main(userId?: string) {
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('🚀 iTrade Console Application Starting...');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (userId) {
    logger.info(`👤 User ID: ${userId}`);
  } else {
    logger.warn('⚠️  No User ID provided - running in single-user mode');
  }
  logger.info('');

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
    cache: {
      type: 'database',
      duration: 30000, // 30 seconds cache
    },
  });

  await dataManager.initialize();
  logger.info('✅ Database connected\n');

  // ============================================================
  // Step 2: Initialize Trading Components
  // ============================================================
  logger.info('📦 Step 2: Initializing trading components...');

  const riskManager = new RiskManager({
    maxDrawdown: new Decimal(20),
    maxPositionSize: new Decimal(10),
    maxDailyLoss: new Decimal(5),
  });

  const portfolioManager = new PortfolioManager(new Decimal(10000));

  const engine = new TradingEngine(riskManager, portfolioManager, logger);

  logger.info('✅ TradingEngine initialized\n');

  // ============================================================
  // Step 3: Initialize and Add Exchanges
  // ============================================================
  logger.info('📦 Step 3: Initializing exchanges...');

  const exchanges = new Map<string, IExchange>();
  const USE_MAINNET_FOR_DATA = true; // Use mainnet for market data

  // Initialize Binance
  if (process.env.BINANCE_API_KEY && process.env.BINANCE_SECRET_KEY) {
    try {
      const binance = new BinanceExchange(!USE_MAINNET_FOR_DATA);
      binance.on('connected', () => {
        logger.info('✅ Binance WebSocket connected');
      });
      await binance.connect({
        apiKey: process.env.BINANCE_API_KEY || '',
        secretKey: process.env.BINANCE_SECRET_KEY || '',
        sandbox: !USE_MAINNET_FOR_DATA,
      });
      await engine.addExchange('binance', binance);
      exchanges.set('binance', binance);
      logger.info('✅ Binance exchange initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Binance exchange', error as Error);
    }
  }

  // Initialize OKX
  if (
    process.env.OKX_API_KEY &&
    process.env.OKX_SECRET_KEY &&
    process.env.OKX_PASSPHRASE
  ) {
    try {
      const okx = new OKXExchange(!USE_MAINNET_FOR_DATA);
      await okx.connect({
        apiKey: process.env.OKX_API_KEY,
        secretKey: process.env.OKX_SECRET_KEY,
        passphrase: process.env.OKX_PASSPHRASE,
        sandbox: !USE_MAINNET_FOR_DATA,
      });
      await engine.addExchange('okx', okx);
      exchanges.set('okx', okx);
      logger.info('✅ OKX exchange initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize OKX exchange', error as Error);
    }
  }

  // Initialize Coinbase
  if (process.env.COINBASE_API_KEY && process.env.COINBASE_SECRET_KEY) {
    try {
      const coinbase = new CoinbaseExchange();
      await coinbase.connect({
        apiKey: process.env.COINBASE_API_KEY,
        secretKey: process.env.COINBASE_SECRET_KEY,
        sandbox: !USE_MAINNET_FOR_DATA,
      });
      await engine.addExchange('coinbase', coinbase);
      exchanges.set('coinbase', coinbase);
      logger.info('✅ Coinbase exchange initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Coinbase exchange', error as Error);
    }
  }

  if (exchanges.size === 0) {
    logger.error(
      '❌ No exchanges initialized. Please check your API credentials in .env file.',
    );
    process.exit(1);
  }

  logger.info(
    `✅ ${exchanges.size} exchange(s) initialized: ${Array.from(exchanges.keys()).join(', ')}\n`,
  );

  // ============================================================
  // Step 4: Initialize Trackers (Order, Balance, Position)
  // ============================================================
  logger.info('📦 Step 4: Initializing trackers...');

  const orderTracker = new OrderTracker(dataManager, logger);
  await orderTracker.start();

  const balanceTracker = new BalanceTracker(dataManager, logger);
  await balanceTracker.start();

  const positionTracker = new PositionTracker(dataManager, logger);
  await positionTracker.start();

  logger.info('✅ All trackers initialized\n');

  // ============================================================
  // Step 5: Initialize Strategy Manager
  // ============================================================
  logger.info('📦 Step 5: Initializing strategy manager...');

  const strategyManager = new StrategyManager(engine, dataManager, logger, userId);
  await strategyManager.start();

  logger.info('✅ Strategy manager initialized\n');

  // ============================================================
  // Step 6: Start Trading Engine
  // ============================================================
  logger.info('📦 Step 6: Starting trading engine...');

  await engine.start();

  logger.info('✅ Trading engine started\n');

  // ============================================================
  // Startup Complete
  // ============================================================
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('🚀 iTrade Trading System is LIVE');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (userId) {
    logger.info(`👤 User: ${userId}`);
  }
  logger.info(`📡 Exchanges: ${exchanges.size} connected`);
  logger.info(
    `📊 Strategies: Loaded from database (auto-managed${userId ? ' for user' : ''})`,
  );
  logger.info(`💾 Order Tracking: Active (partial fill debounce: 1s)`);
  logger.info(`💰 Balance Tracking: Active (debounce: 2s per exchange)`);
  logger.info(`📈 Position Tracking: Active (debounce: 2s per symbol)`);
  logger.info(`🔄 Strategy Sync: Every 10 minutes`);
  logger.info(`📊 Performance Reports: Every 10 minutes`);
  logger.info(`💾 State Backup: Every 1 minute`);
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  logger.info('Press Ctrl+C to stop the application\n');

  // ============================================================
  // Graceful Shutdown Handler
  // ============================================================
  const shutdown = async () => {
    logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('🛑 Shutting down gracefully...');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
      // Stop strategy manager (will backup states and remove strategies)
      logger.info('1. Stopping strategy manager...');
      await strategyManager.stop();
      logger.info('   ✅ Strategy manager stopped\n');

      // Stop trackers
      logger.info('2. Stopping trackers...');
      await orderTracker.stop();
      await balanceTracker.stop();
      await positionTracker.stop();
      logger.info('   ✅ Trackers stopped\n');

      // Stop trading engine
      logger.info('3. Stopping trading engine...');
      await engine.stop();
      logger.info('   ✅ Trading engine stopped\n');

      // Disconnect all exchanges
      logger.info('4. Disconnecting exchanges...');
      for (const [name, exchange] of exchanges) {
        try {
          await exchange.disconnect();
          logger.info(`   ✅ ${name} disconnected`);
        } catch (err) {
          logger.error(`   ❌ Failed to disconnect ${name}:`, err as Error);
        }
      }
      logger.info('   ✅ All exchanges disconnected\n');

      // Close database connection
      logger.info('5. Closing database connection...');
      await dataManager.close();
      logger.info('   ✅ Database connection closed\n');

      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.info('👋 Shutdown complete. Goodbye!');
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    } catch (error) {
      logger.error('❌ Error during shutdown:', error as Error);
    }

    process.exit(0);
  };

  // Handle shutdown signals
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('❌ Uncaught exception:', error);
    shutdown();
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('❌ Unhandled rejection:', reason as Error);
  });
}

// Start the application
// Read userId from environment variable
const userId = process.env.USER_ID;

if (!userId) {
  logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.warn('⚠️  WARNING: No USER_ID environment variable set');
  logger.warn('⚠️  Running in single-user mode (all strategies will be loaded)');
  logger.warn('⚠️  For multi-user deployment, set USER_ID in .env file');
  logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main(userId).catch((error) => {
  logger.error('❌ Fatal error during startup:', error);
  process.exit(1);
});
