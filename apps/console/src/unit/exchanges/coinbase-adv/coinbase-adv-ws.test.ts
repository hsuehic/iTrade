/**
 * Coinbase Advanced Trade WebSocket Test
 * Tests all features for both spot and perpetual using BaseExchangeTest
 * Based on coinbase-api library
 */

import { CoinbaseAdvancedExchange } from '@itrade/exchange-connectors';
import type { IExchange } from '@itrade/core';
import { BaseExchangeTest, type ExchangeCredentials } from '../base/BaseExchangeTest';

class CoinbaseAdvancedWebSocketTest extends BaseExchangeTest {
  constructor() {
    super('Coinbase Advanced', 30); // 30 second timeout
  }

  protected getCredentials(): ExchangeCredentials | null {
    const apiKey = process.env.COINBASE_API_KEY;
    const secretKey = process.env.COINBASE_SECRET_KEY;

    if (apiKey && secretKey) {
      return { apiKey, secretKey };
    }
    return null;
  }

  protected setupEventListeners(exchange: IExchange): void {
    const coinbaseAdv = exchange as CoinbaseAdvancedExchange;

    // Spot ticker
    coinbaseAdv.on('ticker', (symbol: string, ticker: any) => {
      if (symbol === 'BTC/USD' && !this.results.spot.ticker) {
        this.logger.info(`📊 [TICKER] ${symbol}: $${ticker.price}`);
        this.results.spot.ticker = true;
      }
    });

    // Spot orderbook
    coinbaseAdv.on('orderBook', (symbol: string, orderbook: any) => {
      if (symbol === 'BTC/USD' && !this.results.spot.orderbook) {
        this.logger.info(
          `📚 [ORDERBOOK] ${symbol}: Bid $${orderbook.bids[0]?.[0]}, Ask $${orderbook.asks[0]?.[0]}`,
        );
        this.results.spot.orderbook = true;
      }
    });

    // Spot trades
    coinbaseAdv.on('trade', (symbol: string, trade: any) => {
      if (symbol === 'BTC/USD' && !this.results.spot.trades) {
        this.logger.info(`💱 [TRADE] ${symbol}: ${trade.side} $${trade.price}`);
        this.results.spot.trades = true;
      }
    });

    // Spot klines
    coinbaseAdv.on('kline', (symbol: string, kline: any) => {
      if (symbol === 'BTC/USD' && !this.results.spot.klines) {
        this.logger.info(`📈 [KLINE] ${symbol}: O:$${kline.open} C:$${kline.close}`);
        this.results.spot.klines = true;
      }
    });

    // Perpetual ticker
    coinbaseAdv.on('ticker', (symbol: string, ticker: any) => {
      if (symbol === 'BTC/USDC:USDC' && !this.results.futures.ticker) {
        this.logger.info(`📊 [TICKER] ${symbol}: $${ticker.price}`);
        this.results.futures.ticker = true;
      }
    });

    // Perpetual orderbook
    coinbaseAdv.on('orderBook', (symbol: string, orderbook: any) => {
      if (symbol === 'BTC/USDC:USDC' && !this.results.futures.orderbook) {
        this.logger.info(
          `📚 [ORDERBOOK] ${symbol}: Bid $${orderbook.bids[0]?.[0]}, Ask $${orderbook.asks[0]?.[0]}`,
        );
        this.results.futures.orderbook = true;
      }
    });

    // Perpetual trades
    coinbaseAdv.on('trade', (symbol: string, trade: any) => {
      if (symbol === 'BTC/USDC:USDC' && !this.results.futures.trades) {
        this.logger.info(`💱 [TRADE] ${symbol}: ${trade.side} $${trade.price}`);
        this.results.futures.trades = true;
      }
    });

    // Perpetual klines
    coinbaseAdv.on('kline', (symbol: string, kline: any) => {
      if (symbol === 'BTC/USDC:USDC' && !this.results.futures.klines) {
        this.logger.info(`📈 [KLINE] ${symbol}: O:$${kline.open} C:$${kline.close}`);
        this.results.futures.klines = true;
      }
    });

    // User Data - Orders
    coinbaseAdv.on('orderUpdate', (data: any) => {
      if (!this.results.userData.orders) {
        this.logger.info(`📦 [ORDER] ${data.symbol}: ${data.order.status}`);
        this.results.userData.orders = true;
      }
    });

    // User Data - Balance
    coinbaseAdv.on('accountUpdate', (data: any) => {
      if (!this.results.userData.balance) {
        this.logger.info(`💰 [BALANCE] Received ${data.balances.length} balances`);
        this.results.userData.balance = true;
      }
    });

    // User Data - Positions
    coinbaseAdv.on('positionUpdate', (data: any) => {
      if (!this.results.userData.positions) {
        this.logger.info(`📍 [POSITION] Received ${data.positions.length} positions`);
        this.results.userData.positions = true;
      }
    });
  }

  protected async subscribeToMarketData(
    exchange: IExchange,
    spotSymbol: string,
    perpetualSymbol: string,
  ): Promise<void> {
    const coinbaseAdv = exchange as CoinbaseAdvancedExchange;

    // Subscribe to spot
    await coinbaseAdv.subscribeToTicker(spotSymbol);
    await coinbaseAdv.subscribeToOrderBook(spotSymbol);
    await coinbaseAdv.subscribeToTrades(spotSymbol);
    await coinbaseAdv.subscribeToKlines(spotSymbol, '1m');

    // Subscribe to perpetual
    await coinbaseAdv.subscribeToTicker(perpetualSymbol);
    await coinbaseAdv.subscribeToOrderBook(perpetualSymbol);
    await coinbaseAdv.subscribeToTrades(perpetualSymbol);
    await coinbaseAdv.subscribeToKlines(perpetualSymbol, '1m');

    this.logger.info('📡 Subscribed to all market data channels\n');
  }

  async run(): Promise<void> {
    this.logger.info('🧪 Starting Coinbase Advanced WebSocket Test\n');
    this.logger.info('Testing: Spot + Perpetual + User Data');
    this.logger.info('Symbols: BTC/USD (spot), BTC/USDC:USDC (perpetual)');
    this.logger.info('Library: coinbase-api\n');

    const coinbaseAdv = new CoinbaseAdvancedExchange();

    try {
      // Connect
      const credentials = this.getCredentials();
      if (credentials) {
        await coinbaseAdv.connect(credentials);
        this.logger.info('✅ Connected to Coinbase Advanced (with credentials)\n');
      } else {
        this.logger.info('✅ Coinbase Advanced initialized (public data only)\n');
      }

      // Setup event listeners
      this.setupEventListeners(coinbaseAdv);

      // Subscribe to market data
      this.logger.info('🟢 ===== SUBSCRIBING TO SPOT MARKET DATA =====\n');
      this.logger.info('🔵 ===== SUBSCRIBING TO PERPETUAL MARKET DATA =====\n');
      await this.subscribeToMarketData(coinbaseAdv, 'BTC/USD', 'BTC/USDC:USDC');

      // Subscribe to user data if credentials available
      if (credentials) {
        this.logger.info('\n👤 ===== SUBSCRIBING TO USER DATA =====\n');
        await coinbaseAdv.subscribeToUserData();
        this.logger.info('📡 Subscribed to user data (orders, balance, positions)');
      }

      // Start check interval and timeout
      this.startCheckInterval();
      this.startMaxTimeout();
    } catch (error) {
      this.logger.error('Test failed with error:', error as Error);
      this.cleanup(coinbaseAdv, 1);
    }
  }
}

// Run test if executed directly
if (require.main === module) {
  const test = new CoinbaseAdvancedWebSocketTest();
  test.run();
}

export { CoinbaseAdvancedWebSocketTest };
