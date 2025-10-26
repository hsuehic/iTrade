/**
 * Binance REST API Test (Refactored)
 * Tests market data and account endpoints using BaseRESTTest
 */

import { BinanceExchange } from '@itrade/exchange-connectors';
import type { IExchange } from '@itrade/core';
import { BaseRESTTest, type ExchangeCredentials } from '../base/BaseRESTTest';

class BinanceRESTTest extends BaseRESTTest {
  constructor() {
    super('Binance');
  }

  protected getCredentials(): ExchangeCredentials | null {
    const apiKey = process.env.BINANCE_API_KEY;
    const secretKey = process.env.BINANCE_SECRET_KEY;

    if (apiKey && secretKey) {
      return { apiKey, secretKey };
    }
    return null;
  }

  protected async testMarketData(
    exchange: IExchange,
    spotSymbol: string,
    futuresSymbol: string,
  ): Promise<void> {
    const binance = exchange as BinanceExchange;

    // Test Ticker
    try {
      this.logger.info(`\n📊 Testing getTicker for ${spotSymbol}...`);
      const ticker = await binance.getTicker(spotSymbol);
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
      const orderbook = await binance.getOrderBook(spotSymbol);
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
      const trades = await binance.getTrades(spotSymbol);
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
      const klines = await binance.getKlines(spotSymbol, '1m');
      if (klines && klines.length > 0) {
        this.logger.info(`  ✅ Received ${klines.length} klines`);
        this.results.marketData.klines = true;
      }
    } catch (error) {
      this.logger.error('  ❌ getKlines failed:', error as Error);
    }

    // Test SymbolInfo
    try {
      this.logger.info(`\n🔍 Testing getSymbolInfo for ${spotSymbol}...`);
      const symbolInfo = await binance.getSymbolInfo(spotSymbol);
      if (symbolInfo) {
        this.logger.info(`  ✅ Symbol: ${symbolInfo.symbol}`);
        this.logger.info(
          `  ✅ Base: ${symbolInfo.baseAsset}, Quote: ${symbolInfo.quoteAsset}`,
        );
        this.logger.info(
          `  ✅ Price Precision: ${symbolInfo.pricePrecision}, Quantity Precision: ${symbolInfo.quantityPrecision}`,
        );
        this.logger.info(
          `  ✅ Min Quantity: ${symbolInfo.minQuantity.toString()}, Tick Size: ${symbolInfo.tickSize.toString()}`,
        );
        this.logger.info(
          `  ✅ Market: ${symbolInfo.market}, Status: ${symbolInfo.status}`,
        );
        this.results.marketData.symbolInfo = true;
      }
    } catch (error) {
      this.logger.error('  ❌ getSymbolInfo failed:', error as Error);
    }
  }

  protected async testAccountData(exchange: IExchange): Promise<void> {
    const binance = exchange as BinanceExchange;

    // Test Account Info
    try {
      this.logger.info('\n👤 Testing getAccountInfo...');
      const accountInfo = await binance.getAccountInfo();
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
      const balances = await binance.getBalances();
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
      const openOrders = await binance.getOpenOrders();
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
      const orderHistory = await binance.getOrderHistory('BTC/USDT');
      if (orderHistory !== undefined) {
        this.logger.info(`  ✅ Received ${orderHistory.length} orders in history`);
        this.results.accountData.orderHistory = true;
      }
    } catch (error) {
      this.logger.error('  ❌ getOrderHistory failed:', error as Error);
    }
  }

  async run(): Promise<void> {
    this.logger.info('🧪 Starting Binance REST API Test\n');
    this.logger.info('Testing: Market Data + Account Data\n');

    const binance = new BinanceExchange();

    try {
      // Connect
      const credentials = this.getCredentials();
      if (credentials) {
        await binance.connect(credentials);
        this.logger.info('✅ Connected to Binance (with credentials)\n');
      } else {
        await binance.connect({} as ExchangeCredentials);
        this.logger.info('✅ Connected to Binance (public data only)\n');
      }

      // Test market data
      this.logger.info('═══════════════════════════════════════════');
      this.logger.info('📈 TESTING MARKET DATA ENDPOINTS');
      this.logger.info('═══════════════════════════════════════════');
      await this.testMarketData(binance, 'BTC/USDT', 'BTC/USDT:USDT');

      // Test account data if credentials available
      if (credentials) {
        this.logger.info('\n═══════════════════════════════════════════');
        this.logger.info('👤 TESTING ACCOUNT DATA ENDPOINTS');
        this.logger.info('═══════════════════════════════════════════');
        await this.testAccountData(binance);
      }

      // Print summary
      this.printSummary();

      // Cleanup
      this.cleanup(binance, 0);
    } catch (error) {
      this.logger.error('Test failed with error:', error as Error);
      this.cleanup(binance, 1);
    }
  }
}

// Run test if executed directly
if (require.main === module) {
  const test = new BinanceRESTTest();
  test.run();
}

export { BinanceRESTTest };
