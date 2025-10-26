/**
 * Base class for exchange REST API tests
 * Handles common logic: env loading, metrics, results, display
 */

import * as dotenv from 'dotenv';
import { ConsoleLogger, LogLevel } from '@itrade/core';
import type {
  IExchange,
  ExchangeCredentials as CoreExchangeCredentials,
} from '@itrade/core';

// Load environment variables
dotenv.config();

export interface RESTTestMetrics {
  marketData: {
    ticker: boolean;
    orderbook: boolean;
    trades: boolean;
    klines: boolean;
    symbolInfo: boolean;
  };
  accountData: {
    accountInfo: boolean;
    balances: boolean;
    openOrders: boolean;
    orderHistory: boolean;
  };
}

// Use the core ExchangeCredentials type
export type ExchangeCredentials = CoreExchangeCredentials;

export abstract class BaseRESTTest {
  protected logger: ConsoleLogger;
  protected results: RESTTestMetrics;
  protected startTime: number;
  protected exchangeName: string;

  constructor(exchangeName: string) {
    this.logger = new ConsoleLogger(LogLevel.INFO);
    this.exchangeName = exchangeName;
    this.startTime = Date.now();
    this.results = this.initializeResults();
  }

  /**
   * Initialize test results structure
   */
  protected initializeResults(): RESTTestMetrics {
    return {
      marketData: {
        ticker: false,
        orderbook: false,
        trades: false,
        klines: false,
        symbolInfo: false,
      },
      accountData: {
        accountInfo: false,
        balances: false,
        openOrders: false,
        orderHistory: false,
      },
    };
  }

  /**
   * Get credentials from environment variables
   */
  protected abstract getCredentials(): ExchangeCredentials | null;

  /**
   * Check if credentials are available
   */
  protected hasCredentials(): boolean {
    const creds = this.getCredentials();
    return !!(creds?.apiKey && creds?.secretKey);
  }

  /**
   * Test market data endpoints
   */
  protected abstract testMarketData(
    exchange: IExchange,
    spotSymbol: string,
    futuresSymbol: string,
  ): Promise<void>;

  /**
   * Test account data endpoints
   */
  protected abstract testAccountData(exchange: IExchange): Promise<void>;

  /**
   * Print test summary
   */
  protected printSummary(): void {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);

    this.logger.info('\n' + '='.repeat(60));
    this.logger.info('📊 REST API TEST RESULTS');
    this.logger.info('='.repeat(60));

    // Market Data
    this.logger.info('\n📈 MARKET DATA:');
    this.logger.info(
      `  Ticker:     ${this.results.marketData.ticker ? '✅ PASS' : '❌ FAIL'}`,
    );
    this.logger.info(
      `  OrderBook:  ${this.results.marketData.orderbook ? '✅ PASS' : '❌ FAIL'}`,
    );
    this.logger.info(
      `  Trades:     ${this.results.marketData.trades ? '✅ PASS' : '❌ FAIL'}`,
    );
    this.logger.info(
      `  Klines:     ${this.results.marketData.klines ? '✅ PASS' : '❌ FAIL'}`,
    );
    this.logger.info(
      `  SymbolInfo: ${this.results.marketData.symbolInfo ? '✅ PASS' : '❌ FAIL'}`,
    );

    // Account Data
    const hasCredentials = this.hasCredentials();
    if (hasCredentials) {
      this.logger.info('\n👤 ACCOUNT DATA:');
      this.logger.info(
        `  Account:   ${this.results.accountData.accountInfo ? '✅ PASS' : '❌ FAIL'}`,
      );
      this.logger.info(
        `  Balances:  ${this.results.accountData.balances ? '✅ PASS' : '❌ FAIL'}`,
      );
      this.logger.info(
        `  Open Orders: ${this.results.accountData.openOrders ? '✅ PASS' : '❌ FAIL'}`,
      );
      this.logger.info(
        `  Order History: ${this.results.accountData.orderHistory ? '✅ PASS' : '❌ FAIL'}`,
      );
    } else {
      this.logger.info('\n👤 ACCOUNT DATA: ⏭️  SKIPPED (no credentials)');
    }

    // Calculate totals
    const totalMarketDataTests = 5; // ticker, orderbook, trades, klines, symbolInfo
    const totalAccountDataTests = hasCredentials ? 4 : 0;
    const totalTests = totalMarketDataTests + totalAccountDataTests;

    const passedMarketDataTests = Object.values(this.results.marketData).filter(
      Boolean,
    ).length;
    const passedAccountDataTests = hasCredentials
      ? Object.values(this.results.accountData).filter(Boolean).length
      : 0;
    const passedTests = passedMarketDataTests + passedAccountDataTests;

    this.logger.info('\n' + '='.repeat(60));
    this.logger.info(`⏱️  Duration: ${duration}s`);
    this.logger.info(`📈 Overall: ${passedTests}/${totalTests} tests passed`);
    this.logger.info('='.repeat(60));

    if (passedTests === totalTests) {
      this.logger.info(
        `\n🎉 ALL TESTS PASSED! ${this.exchangeName} REST API working perfectly!`,
      );
    } else {
      this.logger.warn('\n⚠️  Some tests failed. Review logs above for details.');
    }
  }

  /**
   * Cleanup and exit
   */
  protected cleanup(exchange: IExchange, exitCode: number = 0): void {
    exchange.disconnect().finally(() => {
      this.logger.info('✅ Test complete!\n');
      process.exit(exitCode);
    });
  }

  /**
   * Main test execution method (to be implemented by subclasses)
   */
  abstract run(): Promise<void>;
}
