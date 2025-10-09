import { TradingEngine, LogLevel, OrderSyncService } from '@itrade/core';
import { ConsoleLogger } from '@itrade/logger';
import { RiskManager } from '@itrade/risk-manager';
import { PortfolioManager } from '@itrade/portfolio-manager';
import { BinanceExchange } from '@itrade/exchange-connectors';
import { TypeOrmDataManager } from '@itrade/data-manager';
import { Decimal } from 'decimal.js';
import { StrategyManager } from './strategy-manager';
import { OrderTracker } from './order-tracker';

// Load environment variables (inline instead of dotenv package)
// Assuming environment variables are set via system or .env file in parent directory

const logger = new ConsoleLogger(LogLevel.DEBUG);

async function main() {
  // Initialize database connection
  logger.info('Connecting to database...');
  const dataManager = new TypeOrmDataManager({
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'itrade',
    ssl: process.env.DATABASE_SSL === 'true',
    logging: ['error'],
    synchronize: false,
  });

  await dataManager.initialize();
  logger.info('✅ Database connected');

  // Initialize components
  const riskManager = new RiskManager({
    maxDrawdown: new Decimal(20),
    maxPositionSize: new Decimal(10),
    maxDailyLoss: new Decimal(5),
  });
  const portfolioManager = new PortfolioManager(new Decimal(10000));

  // Create engine
  const engine = new TradingEngine(riskManager, portfolioManager, logger);

  // Initialize Strategy Manager
  const strategyManager = new StrategyManager(engine, dataManager, logger);

  // Initialize Order Tracker
  const orderTracker = new OrderTracker(dataManager, logger);
  await orderTracker.start();

  logger.info('📊 iTrade Console started with database-driven strategy management');

  // Add exchange
  // ⚠️ Binance Testnet 的 WebSocket 可能不稳定
  // 对于只订阅市场数据（无需 API 密钥），可以使用主网
  const USE_MAINNET_FOR_DATA = true; // 改为 true 使用主网数据流
  const binance = new BinanceExchange(!USE_MAINNET_FOR_DATA); // false = mainnet, true = testnet

  // 仅添加基本事件监听器（WebSocket 被阻断，使用 REST 轮询）
  binance.on('connected', () => {
    logger.info('✅ Exchange connected (REST API working)');
  });

  await binance.connect({
    apiKey: process.env.BINANCE_API_KEY || '',
    secretKey: process.env.BINANCE_SECRET_KEY || '',
    sandbox: !USE_MAINNET_FOR_DATA, // 与 isTestnet 保持一致
  });
  engine.addExchange('binance', binance);

  // Initialize Order Sync Service after exchange is connected
  // 每 5 秒同步一次未完成订单，确保状态更新的可靠性
  const exchanges = new Map<string, any>();
  exchanges.set('binance', binance);
  const orderSyncService = new OrderSyncService(exchanges, dataManager, {
    syncInterval: 5000,
    batchSize: 5,
    autoStart: false,
  });
  
  // 监听事件并输出日志
  orderSyncService.on('info', (msg) => logger.info(msg));
  orderSyncService.on('warn', (msg) => logger.warn(msg));
  orderSyncService.on('error', (err) => logger.error('OrderSyncService error:', err as Error));
  orderSyncService.on('debug', (msg) => logger.debug(msg));
  
  await orderSyncService.start();

  // const coinbase = new CoinbaseExchange();
  // await coinbase.connect({
  //   apiKey: process.env.COINBASE_API_KEY || '',
  //   secretKey: process.env.COINBASE_SECRET_KEY || '',
  //   sandbox: true, // Use testnet for safety
  // });
  // engine.addExchange('coinbase', coinbase);

  // Start trading engine
  await engine.start();

  // Start strategy manager (loads strategies from database)
  await strategyManager.start();

  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('🚀 iTrade Trading System is LIVE');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('📊 Active strategies are loaded from database');
  logger.info('🔄 Monitoring for strategy updates every second');
  logger.info('📈 Performance reports every 60 seconds');
  logger.info('💼 Orders will be tracked and saved to database');
  logger.info('🔄 Order sync running every 5 seconds for reliability');
  logger.info('🛡️  Protection against WebSocket failures enabled');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Setup enhanced event monitoring
  const { EventBus } = await import('@itrade/core');
  const eventBus = EventBus.getInstance();

  // Track strategy signals with enhanced logging
  eventBus.onStrategySignal((signal) => {
    logger.info(
      `🎯 SIGNAL: ${signal.strategyName} - ${signal.action} ${signal.symbol} @ ${signal.price}`
    );
    logger.info(`   📊 Confidence: ${((signal.confidence || 0) * 100).toFixed(1)}%`);
    logger.info(`   💭 Reason: ${signal.reason}`);
  });

  // Track order lifecycle
  eventBus.onOrderCreated((data) => {
    logger.info(
      `📝 ORDER CREATED: ${data.order.side} ${data.order.quantity} ${data.order.symbol} @ ${data.order.price || 'MARKET'}`
    );
    logger.info(`   Order ID: ${data.order.id}`);
  });

  eventBus.onOrderFilled((data) => {
    logger.info(`✅ ORDER FILLED: ${data.order.id}`);
    logger.info(
      `   Executed: ${data.order.executedQuantity} @ avg ${data.order.cummulativeQuoteQuantity?.div(data.order.executedQuantity || 1)}`
    );
  });

  eventBus.onOrderPartiallyFilled((data) => {
    logger.info(
      `⏳ ORDER PARTIAL FILL: ${data.order.id} - ${data.order.executedQuantity}/${data.order.quantity}`
    );
  });

  eventBus.onOrderCancelled((data) => {
    logger.info(`❌ ORDER CANCELLED: ${data.order.id}`);
  });

  eventBus.onOrderRejected((data) => {
    logger.error(`🚫 ORDER REJECTED: ${data.order.id}`);
  });

  // Keep the process running
  process.on('SIGINT', async () => {
    logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('🛑 Shutting down gracefully...');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      await orderSyncService.stop();
      logger.info('✅ Order sync service stopped');
      
      await strategyManager.stop();
      logger.info('✅ Strategy manager stopped');
      
      await orderTracker.stop?.();
      logger.info('✅ Order tracker stopped');
      
      await engine.stop();
      logger.info('✅ Trading engine stopped');
      
      await binance.disconnect();
      logger.info('✅ Exchange disconnected');
      
      await dataManager.close();
      logger.info('✅ Database connection closed');
      
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.info('👋 Goodbye!');
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    } catch (error) {
      logger.error('Error during shutdown:', error as Error);
    }
    
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM signal, shutting down...');
    process.emit('SIGINT' as any);
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    process.emit('SIGINT' as any);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason as Error);
  });
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
