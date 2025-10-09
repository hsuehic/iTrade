import { TradingEngine, LogLevel } from '@itrade/core';
import { ConsoleLogger } from '@itrade/logger';
import { RiskManager } from '@itrade/risk-manager';
import { PortfolioManager } from '@itrade/portfolio-manager';
import { MovingAverageStrategy } from '@itrade/strategies';
import { BinanceExchange } from '@itrade/exchange-connectors';
import { Decimal } from 'decimal.js';

const logger = new ConsoleLogger(LogLevel.DEBUG); // 改为 DEBUG 级别查看详细日志
async function main() {
  // Initialize components
  const riskManager = new RiskManager({
    maxDrawdown: new Decimal(20),
    maxPositionSize: new Decimal(10),
    maxDailyLoss: new Decimal(5),
  });
  const portfolioManager = new PortfolioManager(new Decimal(10000));

  // Create engine
  const engine = new TradingEngine(riskManager, portfolioManager, logger);

  // Add strategy
  // Note: Use standard format 'BTC/USDT' - it will be automatically converted
  // to exchange-specific format (Binance: 'BTCUSDT', Coinbase: 'BTC-USDT')
  const symbol = 'BTC/USDT';
  const strategy = new MovingAverageStrategy({
    fastPeriod: 3, // 减少到 3（更快收集数据）
    slowPeriod: 5, // 减少到 5（只需 5 个数据点）
    threshold: 0.001, // 降低阈值（0.1% 更容易触发）
    symbol,
    subscription: {
      ticker: true,
      klines: true,
    },
  });
  engine.addStrategy('ma-strategy', strategy);

  logger.info('📊 Strategy configured: FastMA=3, SlowMA=5, Threshold=0.1%');
  logger.info('   (Will start analyzing after receiving 5 ticker updates)');

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

  // const coinbase = new CoinbaseExchange();
  // await coinbase.connect({
  //   apiKey: process.env.COINBASE_API_KEY || '',
  //   secretKey: process.env.COINBASE_SECRET_KEY || '',
  //   sandbox: true, // Use testnet for safety
  // });
  // engine.addExchange('coinbase', coinbase);

  // Start trading
  await engine.start();

  // 🔥 Critical: Subscribe to market data to receive ticker updates
  // Without this, the strategy will never receive data and won't generate signals
  logger.info(`Subscribing to ticker data for ${symbol}...`);
  logger.info(
    `Using ${USE_MAINNET_FOR_DATA ? 'MAINNET' : 'TESTNET'} for market data`
  );

  // ⚠️ WebSocket 连接被阻断（ECONNRESET）
  // 使用 REST API 轮询作为替代方案
  logger.warn(
    '⚠️  WebSocket appears to be blocked. Using REST API polling instead...'
  );

  let tickerCount = 0;
  const pollInterval = setInterval(async () => {
    try {
      const ticker = await binance.getTicker(symbol);
      tickerCount++;
      logger.info(
        `📈 Ticker #${tickerCount}: ${symbol} = ${ticker.price.toString()}`
      );

      // 手动触发 onTicker（使用新的类型安全方法）
      logger.debug(`🔍 Calling engine.onTicker for ${symbol}`);
      await engine.onTicker(symbol, ticker, 'binance');

      // 查看策略状态（调试用）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const maStrategy = engine.getStrategy('ma-strategy') as any;
      if (maStrategy && maStrategy.priceHistory) {
        const historyLength = maStrategy.priceHistory.length;
        logger.info(`📊 Strategy collected ${historyLength}/5 data points`);

        if (historyLength >= 5) {
          const fastMA = maStrategy.getFastMA();
          const slowMA = maStrategy.getSlowMA();
          const position = maStrategy.getCurrentPosition();
          const fastValue = fastMA.toNumber();
          const slowValue = slowMA.toNumber();
          const diff = (((fastValue - slowValue) / slowValue) * 100).toFixed(4);
          logger.info(
            `📈 FastMA=${fastValue.toFixed(2)}, SlowMA=${slowValue.toFixed(2)}, Diff=${diff}%, Position=${position}`
          );
        }
      }
    } catch (error) {
      logger.error('❌ Failed in polling loop:', error as Error);
    }
  }, 1000); // 每秒轮询一次

  // 清理函数
  process.on('SIGINT', () => {
    clearInterval(pollInterval);
  });

  logger.info('Trading system is running...');
  logger.info('Waiting for market data and strategy signals...');

  // 添加策略信号监听
  const { EventBus } = await import('@itrade/core');
  const eventBus = EventBus.getInstance();

  eventBus.onStrategySignal((signal) => {
    logger.info(
      `🎯 Strategy Signal: ${signal.action} ${signal.symbol} @ ${signal.price} (confidence: ${signal.confidence})`
    );
    logger.info(`   Reason: ${signal.reason}`);
  });

  // Keep the process running
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await engine.stop();
    await binance.disconnect();
    process.exit(0);
  });
}

main().catch(logger.error);
