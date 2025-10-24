/**
 * Coinbase WebSocket Test (Refactored)
 * Tests all features for both spot and perpetual using BaseExchangeTest
 */

import { CoinbaseExchange } from '@itrade/exchange-connectors';
import type { IExchange } from '@itrade/core';
import { BaseExchangeTest, type ExchangeCredentials } from './BaseExchangeTest';

class CoinbaseWebSocketTest extends BaseExchangeTest {
  constructor() {
    super('Coinbase', 30); // 30 second timeout (faster for Coinbase)
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
    const coinbase = exchange as CoinbaseExchange;

    // Spot ticker
    coinbase.on('ticker', (symbol: string, ticker: any) => {
      if (symbol === 'BTC/USDC' && !this.results.spot.ticker) {
        this.logger.info(`📊 [TICKER] ${symbol}: $${ticker.price}`);
        this.results.spot.ticker = true;
      }
    });

    // Spot orderbook
    coinbase.on('orderbook', (symbol: string, orderbook: any) => {
      if (symbol === 'BTC/USDC' && !this.results.spot.orderbook) {
        this.logger.info(
          `📚 [ORDERBOOK] ${symbol}: Bid $${orderbook.bids[0]?.price}, Ask $${orderbook.asks[0]?.price}`,
        );
        this.results.spot.orderbook = true;
      }
    });

    // Spot trades
    coinbase.on('trade', (symbol: string, trade: any) => {
      if (symbol === 'BTC/USDC' && !this.results.spot.trades) {
        this.logger.info(`💱 [TRADE] ${symbol}: ${trade.side} $${trade.price}`);
        this.results.spot.trades = true;
      }
    });

    // Spot klines
    coinbase.on('kline', (symbol: string, kline: any) => {
      if (symbol === 'BTC/USDC' && !this.results.spot.klines) {
        this.logger.info(`📈 [KLINE] ${symbol}: O:$${kline.open} C:$${kline.close}`);
        this.results.spot.klines = true;
      }
    });

    // Perpetual ticker
    coinbase.on('ticker', (symbol: string, ticker: any) => {
      if (symbol === 'BTC/USDC:USDC' && !this.results.futures.ticker) {
        this.logger.info(`📊 [TICKER] ${symbol}: $${ticker.price}`);
        this.results.futures.ticker = true;
      }
    });

    // Perpetual orderbook
    coinbase.on('orderbook', (symbol: string, orderbook: any) => {
      if (symbol === 'BTC/USDC:USDC' && !this.results.futures.orderbook) {
        this.logger.info(
          `📚 [ORDERBOOK] ${symbol}: Bid $${orderbook.bids[0]?.price}, Ask $${orderbook.asks[0]?.price}`,
        );
        this.results.futures.orderbook = true;
      }
    });

    // Perpetual trades
    coinbase.on('trade', (symbol: string, trade: any) => {
      if (symbol === 'BTC/USDC:USDC' && !this.results.futures.trades) {
        this.logger.info(`💱 [TRADE] ${symbol}: ${trade.side} $${trade.price}`);
        this.results.futures.trades = true;
      }
    });

    // Perpetual klines
    coinbase.on('kline', (symbol: string, kline: any) => {
      if (symbol === 'BTC/USDC:USDC' && !this.results.futures.klines) {
        this.logger.info(`📈 [KLINE] ${symbol}: O:$${kline.open} C:$${kline.close}`);
        this.results.futures.klines = true;
      }
    });

    // User Data - Orders
    coinbase.on('orderUpdate', (symbol: string, order: any) => {
      if (!this.results.userData.orders) {
        this.logger.info(`📦 [ORDER] ${symbol}: ${order.status}`);
        this.results.userData.orders = true;
      }
    });

    // User Data - Balance
    coinbase.on('accountUpdate', (_exchange: string, balances: any[]) => {
      if (!this.results.userData.balance) {
        this.logger.info(`💰 [BALANCE] Received ${balances.length} balances`);
        this.results.userData.balance = true;
      }
    });

    // User Data - Positions
    coinbase.on('positionUpdate', (_exchange: string, positions: any[]) => {
      if (!this.results.userData.positions) {
        this.logger.info(`📍 [POSITION] Received ${positions.length} positions`);
        this.results.userData.positions = true;
      }
    });
  }

  protected async subscribeToMarketData(
    exchange: IExchange,
    spotSymbol: string,
    perpetualSymbol: string,
  ): Promise<void> {
    const coinbase = exchange as CoinbaseExchange;

    // Subscribe to spot
    await coinbase.subscribeToTicker(spotSymbol);
    await coinbase.subscribeToOrderBook(spotSymbol);
    await coinbase.subscribeToTrades(spotSymbol);
    await coinbase.subscribeToKlines(spotSymbol, '1m');

    // Subscribe to perpetual
    await coinbase.subscribeToTicker(perpetualSymbol);
    await coinbase.subscribeToOrderBook(perpetualSymbol);
    await coinbase.subscribeToTrades(perpetualSymbol);
    await coinbase.subscribeToKlines(perpetualSymbol, '1m');

    this.logger.info('📡 Subscribed to all market data channels\n');
  }

  async run(): Promise<void> {
    this.logger.info('🧪 Starting Coinbase WebSocket Test\n');
    this.logger.info('Testing: Spot + Perpetual + User Data');
    this.logger.info('Symbols: BTC/USDC (spot), BTC/USDC:USDC (perpetual)\n');

    const coinbase = new CoinbaseExchange();

    try {
      // Connect
      const credentials = this.getCredentials();
      if (credentials) {
        await coinbase.connect(credentials);
        this.logger.info('✅ Connected to Coinbase (with credentials)\n');
      } else {
        this.logger.info('✅ Coinbase initialized (public data only)\n');
      }

      // Setup event listeners
      this.setupEventListeners(coinbase);

      // Subscribe to market data
      this.logger.info('🟢 ===== SUBSCRIBING TO SPOT MARKET DATA =====\n');
      this.logger.info('🔵 ===== SUBSCRIBING TO PERPETUAL MARKET DATA =====\n');
      await this.subscribeToMarketData(coinbase, 'BTC/USDC', 'BTC/USDC:USDC');

      // Subscribe to user data if credentials available
      if (credentials) {
        this.logger.info('\n👤 ===== SUBSCRIBING TO USER DATA =====\n');
        await coinbase.subscribeToUserData();
        this.logger.info('📡 Subscribed to user data (orders, balance, positions)');
      }

      // Start check interval and timeout
      this.startCheckInterval();
      this.startMaxTimeout();
    } catch (error) {
      this.logger.error('Test failed with error:', error as Error);
      this.cleanup(coinbase, 1);
    }
  }
}

// Run test if executed directly
if (require.main === module) {
  const test = new CoinbaseWebSocketTest();
  test.run();
}

export { CoinbaseWebSocketTest };
