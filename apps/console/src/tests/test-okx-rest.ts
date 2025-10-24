/**
 * OKX REST API Test (Refactored)
 * Tests market data and account endpoints using BaseRESTTest
 */

import { OKXExchange } from '@itrade/exchange-connectors';
import type { IExchange } from '@itrade/core';
import { BaseRESTTest, type ExchangeCredentials } from './BaseRESTTest';

class OKXRESTTest extends BaseRESTTest {
  constructor() {
    super('OKX');
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

  protected async testMarketData(
    exchange: IExchange,
    spotSymbol: string,
    perpetualSymbol: string,
  ): Promise<void> {
    const okx = exchange as OKXExchange;

    // Test Ticker
    try {
      this.logger.info(`\n📊 Testing getTicker for ${spotSymbol}...`);
      const ticker = await okx.getTicker(spotSymbol);
      if (ticker && ticker.price) {
        this.logger.info(`  ✅ Price: $${ticker.price}`);
        this.results.marketData.ticker = true;
      }
    } catch (error) {
      this.logger.error('  ❌ getTicker failed:', error as Error);
    }

    // Test OrderBook
    try {
      this.logger.info(`\n📚 Testing getOrderBook for ${spotSymbol}...`);
      const orderbook = await okx.getOrderBook(spotSymbol);
      if (orderbook && orderbook.bids.length > 0 && orderbook.asks.length > 0) {
        this.logger.info(
          `  ✅ Bids: ${orderbook.bids.length}, Asks: ${orderbook.asks.length}`,
        );
        this.results.marketData.orderbook = true;
      }
    } catch (error) {
      this.logger.error('  ❌ getOrderBook failed:', error as Error);
    }

    // Test Trades
    try {
      this.logger.info(`\n💱 Testing getTrades for ${spotSymbol}...`);
      const trades = await okx.getTrades(spotSymbol);
      if (trades && trades.length > 0) {
        this.logger.info(`  ✅ Received ${trades.length} trades`);
        this.results.marketData.trades = true;
      }
    } catch (error) {
      this.logger.error('  ❌ getTrades failed:', error as Error);
    }

    // Test Klines
    try {
      this.logger.info(`\n📈 Testing getKlines for ${spotSymbol}...`);
      const klines = await okx.getKlines(spotSymbol, '1m');
      if (klines && klines.length > 0) {
        this.logger.info(`  ✅ Received ${klines.length} klines`);
        this.results.marketData.klines = true;
      }
    } catch (error) {
      this.logger.error('  ❌ getKlines failed:', error as Error);
    }
  }

  protected async testAccountData(exchange: IExchange): Promise<void> {
    const okx = exchange as OKXExchange;

    // Test Account Info
    try {
      this.logger.info('\n👤 Testing getAccountInfo...');
      const accountInfo = await okx.getAccountInfo();
      if (accountInfo) {
        this.logger.info('  ✅ Account info retrieved');
        this.results.accountData.accountInfo = true;
      }
    } catch (error) {
      this.logger.error('  ❌ getAccountInfo failed:', error as Error);
    }

    // Test Balances
    try {
      this.logger.info('\n💰 Testing getBalances...');
      const balances = await okx.getBalances();
      if (balances && balances.length > 0) {
        this.logger.info(`  ✅ Received ${balances.length} balances`);
        this.results.accountData.balances = true;
      }
    } catch (error) {
      this.logger.error('  ❌ getBalances failed:', error as Error);
    }

    // Test Open Orders
    try {
      this.logger.info('\n📋 Testing getOpenOrders...');
      const openOrders = await okx.getOpenOrders();
      if (openOrders !== undefined) {
        this.logger.info(`  ✅ Received ${openOrders.length} open orders`);
        this.results.accountData.openOrders = true;
      }
    } catch (error) {
      this.logger.error('  ❌ getOpenOrders failed:', error as Error);
    }

    // Test Order History
    try {
      this.logger.info('\n📜 Testing getOrderHistory for BTC/USDT...');
      const orderHistory = await okx.getOrderHistory('BTC/USDT');
      if (orderHistory !== undefined) {
        this.logger.info(`  ✅ Received ${orderHistory.length} orders in history`);
        this.results.accountData.orderHistory = true;
      }
    } catch (error) {
      this.logger.error('  ❌ getOrderHistory failed:', error as Error);
    }
  }

  async run(): Promise<void> {
    this.logger.info('🧪 Starting OKX REST API Test\n');
    this.logger.info('Testing: Market Data + Account Data\n');

    const okx = new OKXExchange();

    try {
      // Connect
      const credentials = this.getCredentials();
      if (credentials) {
        await okx.connect(credentials);
        this.logger.info('✅ Connected to OKX (with credentials)\n');
      } else {
        await okx.connect({} as ExchangeCredentials);
        this.logger.info('✅ Connected to OKX (public data only)\n');
      }

      // Test market data
      this.logger.info('═══════════════════════════════════════════');
      this.logger.info('📈 TESTING MARKET DATA ENDPOINTS');
      this.logger.info('═══════════════════════════════════════════');
      await this.testMarketData(okx, 'BTC/USDT', 'BTC/USDT:USDT');

      // Test account data if credentials available
      if (credentials) {
        this.logger.info('\n═══════════════════════════════════════════');
        this.logger.info('👤 TESTING ACCOUNT DATA ENDPOINTS');
        this.logger.info('═══════════════════════════════════════════');
        await this.testAccountData(okx);
      }

      // Print summary
      this.printSummary();

      // Cleanup
      this.cleanup(okx, 0);
    } catch (error) {
      this.logger.error('Test failed with error:', error as Error);
      this.cleanup(okx, 1);
    }
  }
}

// Run test if executed directly
if (require.main === module) {
  const test = new OKXRESTTest();
  test.run();
}

export { OKXRESTTest };
