/**
 * Binance WebSocket Test (Refactored)
 * Tests all features for both spot and futures using BaseExchangeTest
 */

import { BinanceExchange } from '@itrade/exchange-connectors';
import type { IExchange } from '@itrade/core';
import { BaseExchangeTest, type ExchangeCredentials } from '../base/BaseExchangeTest';

class BinanceWebSocketTest extends BaseExchangeTest {
  constructor() {
    super('Binance', 60); // 60 second timeout
  }

  protected getCredentials(): ExchangeCredentials | null {
    const apiKey = process.env.BINANCE_API_KEY;
    const secretKey = process.env.BINANCE_SECRET_KEY;

    if (apiKey && secretKey) {
      return { apiKey, secretKey };
    }
    return null;
  }

  protected setupEventListeners(exchange: IExchange): void {
    const binance = exchange as BinanceExchange;

    // Spot ticker
    binance.on('ticker', (symbol: string, ticker: any) => {
      if (symbol === 'BTC/USDT' && !this.results.spot.ticker) {
        this.logger.info(`📊 [TICKER] ${symbol}: $${ticker.price}`);
        this.results.spot.ticker = true;
      }
    });

    // Spot orderbook
    binance.on('orderbook', (symbol: string, orderbook: any) => {
      if (symbol === 'BTC/USDT' && !this.results.spot.orderbook) {
        this.logger.info(
          `📚 [ORDERBOOK] ${symbol}: Bid $${orderbook.bids[0]?.price}, Ask $${orderbook.asks[0]?.price}`,
        );
        this.results.spot.orderbook = true;
      }
    });

    // Spot trades
    binance.on('trade', (symbol: string, trade: any) => {
      if (symbol === 'BTC/USDT' && !this.results.spot.trades) {
        this.logger.info(`💱 [TRADE] ${symbol}: ${trade.side} $${trade.price}`);
        this.results.spot.trades = true;
      }
    });

    // Spot klines
    binance.on('kline', (symbol: string, kline: any) => {
      if (symbol === 'BTC/USDT' && !this.results.spot.klines) {
        this.logger.info(`📈 [KLINE] ${symbol}: O:$${kline.open} C:$${kline.close}`);
        this.results.spot.klines = true;
      }
    });

    // Futures ticker
    binance.on('ticker', (symbol: string, ticker: any) => {
      if (symbol === 'BTC/USDT:USDT' && !this.results.futures.ticker) {
        this.logger.info(`📊 [TICKER] ${symbol}: $${ticker.price}`);
        this.results.futures.ticker = true;
      }
    });

    // Futures orderbook
    binance.on('orderbook', (symbol: string, orderbook: any) => {
      if (symbol === 'BTC/USDT:USDT' && !this.results.futures.orderbook) {
        this.logger.info(
          `📚 [ORDERBOOK] ${symbol}: Bid $${orderbook.bids[0]?.price}, Ask $${orderbook.asks[0]?.price}`,
        );
        this.results.futures.orderbook = true;
      }
    });

    // Futures trades
    binance.on('trade', (symbol: string, trade: any) => {
      if (symbol === 'BTC/USDT:USDT' && !this.results.futures.trades) {
        this.logger.info(`💱 [TRADE] ${symbol}: ${trade.side} $${trade.price}`);
        this.results.futures.trades = true;
      }
    });

    // Futures klines
    binance.on('kline', (symbol: string, kline: any) => {
      if (symbol === 'BTC/USDT:USDT' && !this.results.futures.klines) {
        this.logger.info(`📈 [KLINE] ${symbol}: O:$${kline.open} C:$${kline.close}`);
        this.results.futures.klines = true;
      }
    });

    // User Data - Orders
    binance.on('orderUpdate', (symbol: string, order: any) => {
      if (!this.results.userData.orders) {
        this.logger.info(`📦 [ORDER] ${symbol}: ${order.status}`);
        this.results.userData.orders = true;
      }
    });

    // User Data - Balance
    binance.on('accountUpdate', (_exchange: string, balances: any[]) => {
      if (!this.results.userData.balance) {
        this.logger.info(`💰 [BALANCE] Received ${balances.length} balances`);
        this.results.userData.balance = true;
      }
    });

    // User Data - Positions
    binance.on('positionUpdate', (_exchange: string, positions: any[]) => {
      if (!this.results.userData.positions) {
        this.logger.info(`📍 [POSITION] Received ${positions.length} positions`);
        this.results.userData.positions = true;
      }
    });
  }

  protected async subscribeToMarketData(
    exchange: IExchange,
    spotSymbol: string,
    futuresSymbol: string,
  ): Promise<void> {
    const binance = exchange as BinanceExchange;

    // Subscribe to spot
    await binance.subscribeToTicker(spotSymbol);
    await binance.subscribeToOrderBook(spotSymbol);
    await binance.subscribeToTrades(spotSymbol);
    await binance.subscribeToKlines(spotSymbol, '1m');

    // Subscribe to futures
    await binance.subscribeToTicker(futuresSymbol);
    await binance.subscribeToOrderBook(futuresSymbol);
    await binance.subscribeToTrades(futuresSymbol);
    await binance.subscribeToKlines(futuresSymbol, '1m');

    this.logger.info('📡 Subscribed to all market data channels\n');
  }

  async run(): Promise<void> {
    this.logger.info('🧪 Starting Binance WebSocket Test\n');
    this.logger.info('Testing: Spot + Futures + User Data');
    this.logger.info('Symbols: BTC/USDT (spot), BTC/USDT:USDT (futures)\n');

    const binance = new BinanceExchange();

    try {
      // Connect
      const credentials = this.getCredentials();
      if (credentials) {
        await binance.connect(credentials);
        this.logger.info('✅ Connected to Binance (with credentials)\n');
      } else {
        this.logger.info('✅ Binance initialized (public data only)\n');
      }

      // Setup event listeners
      this.setupEventListeners(binance);

      // Subscribe to market data
      this.logger.info('🟢 ===== SUBSCRIBING TO SPOT MARKET DATA =====\n');
      this.logger.info('🔵 ===== SUBSCRIBING TO FUTURES MARKET DATA =====\n');
      await this.subscribeToMarketData(binance, 'BTC/USDT', 'BTC/USDT:USDT');

      // Subscribe to user data if credentials available
      if (credentials) {
        this.logger.info('\n👤 ===== SUBSCRIBING TO USER DATA =====\n');
        await binance.subscribeToUserData();
        this.logger.info('📡 Subscribed to user data (orders, balance, positions)');
      }

      // Start check interval and timeout
      this.startCheckInterval();
      this.startMaxTimeout();
    } catch (error) {
      this.logger.error('Test failed with error:', error as Error);
      this.cleanup(binance, 1);
    }
  }
}

// Run test if executed directly
if (require.main === module) {
  const test = new BinanceWebSocketTest();
  test.run();
}

export { BinanceWebSocketTest };
