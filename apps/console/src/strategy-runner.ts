import { TradingEngine, LogLevel, IStrategy } from '@itrade/core';
import { ConsoleLogger } from '@itrade/logger';
import { RiskManager } from '@itrade/risk-manager';
import { PortfolioManager } from '@itrade/portfolio-manager';
import {
  BinanceExchange,
  CoinbaseExchange,
  OKXExchange,
} from '@itrade/exchange-connectors';
import { Decimal } from 'decimal.js';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const logger = new ConsoleLogger(LogLevel.INFO);

export async function run(strategies: Map<string, IStrategy>) {
  // Initialize components
  const riskManager = new RiskManager({
    maxDrawdown: new Decimal(20),
    maxPositionSize: new Decimal(10),
    maxDailyLoss: new Decimal(5),
  });
  const portfolioManager = new PortfolioManager(new Decimal(10000));

  // Create engine
  const engine = new TradingEngine(riskManager, portfolioManager, logger);

  logger.info('📊 iTrade Console started with database-driven strategy management');

  // Initialize exchanges dynamically based on database strategies
  const exchanges = new Map<string, any>();
  const USE_MAINNET_FOR_DATA = true; // Use mainnet for market data

  if (process.env.BINANCE_API_KEY && process.env.BINANCE_SECRET_KEY) {
    // Initialize Binance (most common)
    try {
      const binance = new BinanceExchange(!USE_MAINNET_FOR_DATA);
      binance.on('connected', () => {
        logger.info('✅ Binance exchange connected');
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
      logger.error('Failed to initialize Binance exchange', error as Error);
    }
  }
  // Initialize Coinbase (if credentials available)
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
      logger.error('Failed to initialize Coinbase exchange', error as Error);
    }
  }

  // Initialize OKX (if credentials available)
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
      logger.error('Failed to initialize OKX exchange', error as Error);
    }
  }

  logger.info(
    `📡 Initialized ${exchanges.size} exchange(s): ${Array.from(exchanges.keys()).join(', ')}`,
  );

  // Start trading engine
  await engine.start();
  for (let [name, strategy] of strategies) {
    engine.addStrategy(name, strategy);
  }

  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('🚀 iTrade Trading System is LIVE');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('📊 Active strategies are loaded from database');
  logger.info('🔄 Monitoring for strategy updates every second');
  logger.info('📈 Performance reports every 60 seconds');
  logger.info('💼 Orders will be tracked and saved to database');
  logger.info('🔄 Order sync running every 5 seconds for reliability');
  logger.info(
    '💰 Account polling service active (polling interval: ' +
      parseInt(process.env.ACCOUNT_POLLING_INTERVAL || '60000') / 1000 +
      's)',
  );
  logger.info('🛡️  Protection against WebSocket failures enabled');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Setup enhanced event monitoring
  const { EventBus } = await import('@itrade/core');
  const eventBus = EventBus.getInstance();

  // Track strategy signals with enhanced logging
  eventBus.onStrategySignal((signal) => {
    logger.info(
      `🎯 SIGNAL: ${signal.strategyName} - ${signal.action} ${signal.symbol} @ ${signal.price}`,
    );
    logger.info(`   📊 Confidence: ${((signal.confidence || 0) * 100).toFixed(1)}%`);
    logger.info(`   💭 Reason: ${signal.reason}`);
  });

  // Track order lifecycle
  eventBus.onOrderCreated((data) => {
    logger.info(
      `📝 ORDER CREATED: ${data.order.side} ${data.order.quantity} ${data.order.symbol} @ ${data.order.price || 'MARKET'}`,
    );
    logger.info(`   Order ID: ${data.order.id}`);
  });

  eventBus.onOrderFilled((data) => {
    logger.info(`✅ ORDER FILLED: ${data.order.id}`);
    logger.info(
      `   Executed: ${data.order.executedQuantity} @ avg ${data.order.cummulativeQuoteQuantity?.div(data.order.executedQuantity || 1)}`,
    );
  });

  eventBus.onOrderPartiallyFilled((data) => {
    logger.info(
      `⏳ ORDER PARTIAL FILL: ${data.order.id} - ${data.order.executedQuantity}/${data.order.quantity}`,
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
      await engine.stop();
      logger.info('✅ Trading engine stopped');

      // Disconnect all exchanges
      for (const [name, exchange] of exchanges) {
        try {
          await exchange.disconnect();
          logger.info(`✅ ${name} exchange disconnected`);
        } catch (err) {
          logger.error(`Failed to disconnect ${name}:`, err as Error);
        }
      }

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
  eventBus.onTickerUpdate((data) => {
    console.log(data);
    logger.info(`🔍 TICKER: ${data.symbol} - ${data.ticker.price.toString()}`);
  });
  eventBus.onOrderBookUpdate((data) => {
    console.log(data);
    logger.info(
      `🔍 ORDER BOOK: ${data.symbol} - ${data.orderbook.asks[0][0].toString()}`,
    );
  });
  eventBus.onTradeUpdate((data) => {
    console.log(data);
    logger.info(`🔍 TRADE: ${data.symbol} - ${data.trade.price}`);
  });
  eventBus.onKlineUpdate((data) => {
    console.log(data);
    logger.info(`🔍 KLINE: ${data.symbol} - ${data.kline.close}`);
  });
}
