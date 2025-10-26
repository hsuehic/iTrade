/**
 * OKX WebSocket Test (Refactored)
 * Tests all features for both spot and perpetual using BaseExchangeTest
 */

import { OKXExchange } from '@itrade/exchange-connectors';
import type { IExchange } from '@itrade/core';
import { BaseExchangeTest, type ExchangeCredentials } from '../base/BaseExchangeTest';

class OKXWebSocketTest extends BaseExchangeTest {
  constructor() {
    super('OKX', 60); // 60 second timeout
  }

  protected getCredentials(): ExchangeCredentials | null {
    const apiKey = process.env.OKX_API_KEY;
    const secretKey = process.env.OKX_SECRET_KEY;
    const passphrase = process.env.OKX_PASSPHRASE;

    if (apiKey && secretKey && passphrase) {
      return { apiKey, secretKey, passphrase };
    }
    return null;
  }

  protected setupEventListeners(exchange: IExchange): void {
    const okx = exchange as OKXExchange;

    // Spot ticker
    okx.on('ticker', (symbol: string, ticker: any) => {
      if (symbol === 'BTC/USDT' && !this.results.spot.ticker) {
        this.logger.info(`📊 [TICKER] ${symbol}: $${ticker.price}`);
        this.results.spot.ticker = true;
      }
    });

    // Spot orderbook
    okx.on('orderbook', (symbol: string, orderbook: any) => {
      if (symbol === 'BTC/USDT' && !this.results.spot.orderbook) {
        this.logger.info(
          `📚 [ORDERBOOK] ${symbol}: Bid $${orderbook.bids[0]?.price}, Ask $${orderbook.asks[0]?.price}`,
        );
        this.results.spot.orderbook = true;
      }
    });

    // Spot trades
    okx.on('trade', (symbol: string, trade: any) => {
      if (symbol === 'BTC/USDT' && !this.results.spot.trades) {
        this.logger.info(`💱 [TRADE] ${symbol}: ${trade.side} $${trade.price}`);
        this.results.spot.trades = true;
      }
    });

    // Spot klines
    okx.on('kline', (symbol: string, kline: any) => {
      if (symbol === 'BTC/USDT' && !this.results.spot.klines) {
        this.logger.info(`📈 [KLINE] ${symbol}: O:$${kline.open} C:$${kline.close}`);
        this.results.spot.klines = true;
      }
    });

    // Perpetual ticker
    okx.on('ticker', (symbol: string, ticker: any) => {
      if (symbol === 'BTC/USDT:USDT' && !this.results.futures.ticker) {
        this.logger.info(`📊 [TICKER] ${symbol}: $${ticker.price}`);
        this.results.futures.ticker = true;
      }
    });

    // Perpetual orderbook
    okx.on('orderbook', (symbol: string, orderbook: any) => {
      if (symbol === 'BTC/USDT:USDT' && !this.results.futures.orderbook) {
        this.logger.info(
          `📚 [ORDERBOOK] ${symbol}: Bid $${orderbook.bids[0]?.price}, Ask $${orderbook.asks[0]?.price}`,
        );
        this.results.futures.orderbook = true;
      }
    });

    // Perpetual trades
    okx.on('trade', (symbol: string, trade: any) => {
      if (symbol === 'BTC/USDT:USDT' && !this.results.futures.trades) {
        this.logger.info(`💱 [TRADE] ${symbol}: ${trade.side} $${trade.price}`);
        this.results.futures.trades = true;
      }
    });

    // Perpetual klines
    okx.on('kline', (symbol: string, kline: any) => {
      if (symbol === 'BTC/USDT:USDT' && !this.results.futures.klines) {
        this.logger.info(`📈 [KLINE] ${symbol}: O:$${kline.open} C:$${kline.close}`);
        this.results.futures.klines = true;
      }
    });

    // User Data - Orders
    okx.on('orderUpdate', (symbol: string, order: any) => {
      if (!this.results.userData.orders) {
        this.logger.info(`📦 [ORDER] ${symbol}: ${order.status}`);
        this.results.userData.orders = true;
      }
    });

    // User Data - Balance
    okx.on('accountUpdate', (_exchange: string, balances: any[]) => {
      if (!this.results.userData.balance) {
        this.logger.info(`💰 [BALANCE] Received ${balances.length} balances`);
        this.results.userData.balance = true;
      }
    });

    // User Data - Positions
    okx.on('positionUpdate', (_exchange: string, positions: any[]) => {
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
    const okx = exchange as OKXExchange;

    // Subscribe to spot
    await okx.subscribeToTicker(spotSymbol);
    await okx.subscribeToOrderBook(spotSymbol);
    await okx.subscribeToTrades(spotSymbol);
    await okx.subscribeToKlines(spotSymbol, '1m');

    // Subscribe to perpetual
    await okx.subscribeToTicker(perpetualSymbol);
    await okx.subscribeToOrderBook(perpetualSymbol);
    await okx.subscribeToTrades(perpetualSymbol);
    await okx.subscribeToKlines(perpetualSymbol, '1m');

    this.logger.info('📡 Subscribed to all market data channels\n');
  }

  async run(): Promise<void> {
    this.logger.info('🧪 Starting OKX WebSocket Test\n');
    this.logger.info('Testing: Spot + Perpetual + User Data');
    this.logger.info('Symbols: BTC/USDT (spot), BTC/USDT:USDT (perpetual)\n');

    const okx = new OKXExchange();

    try {
      // Connect
      const credentials = this.getCredentials();
      if (credentials) {
        await okx.connect(credentials);
        this.logger.info('✅ Connected to OKX (with credentials)\n');
      } else {
        this.logger.info('✅ OKX initialized (public data only)\n');
      }

      // Setup event listeners
      this.setupEventListeners(okx);

      // Subscribe to market data
      this.logger.info('🟢 ===== SUBSCRIBING TO SPOT MARKET DATA =====\n');
      this.logger.info('🔵 ===== SUBSCRIBING TO PERPETUAL MARKET DATA =====\n');
      await this.subscribeToMarketData(okx, 'BTC/USDT', 'BTC/USDT:USDT');

      // Subscribe to user data if credentials available
      if (credentials) {
        this.logger.info('\n👤 ===== SUBSCRIBING TO USER DATA =====\n');
        await okx.subscribeToUserData();
        this.logger.info('📡 Subscribed to user data (orders, balance, positions)');
      }

      // Start check interval and timeout
      this.startCheckInterval();
      this.startMaxTimeout();
    } catch (error) {
      this.logger.error('Test failed with error:', error as Error);
      this.cleanup(okx, 1);
    }
  }
}

// Run test if executed directly
if (require.main === module) {
  const test = new OKXWebSocketTest();
  test.run();
}

export { OKXWebSocketTest };
