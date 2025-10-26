/**
 * Base class for exchange WebSocket and REST API tests
 * Handles common logic: env loading, metrics, results, display, and exit
 */

import * as dotenv from 'dotenv';
import { ConsoleLogger, LogLevel } from '@itrade/core';
import type {
  IExchange,
  ExchangeCredentials as CoreExchangeCredentials,
} from '@itrade/core';

// Load environment variables
dotenv.config();

export interface TestMetrics {
  spot: {
    ticker: boolean;
    orderbook: boolean;
    trades: boolean;
    klines: boolean;
  };
  futures: {
    ticker: boolean;
    orderbook: boolean;
    trades: boolean;
    klines: boolean;
  };
  userData: {
    orders: boolean;
    balance: boolean;
    positions: boolean;
  };
}

// Use the core ExchangeCredentials type
export type ExchangeCredentials = CoreExchangeCredentials;

export abstract class BaseExchangeTest {
  protected logger: ConsoleLogger;
  protected results: TestMetrics;
  protected startTime: number;
  protected maxTimeout: number;
  protected timeoutId?: NodeJS.Timeout;
  protected checkInterval?: NodeJS.Timeout;
  protected exchangeName: string;

  constructor(exchangeName: string, maxTimeoutSeconds: number = 60) {
    this.logger = new ConsoleLogger(LogLevel.INFO);
    this.exchangeName = exchangeName;
    this.maxTimeout = maxTimeoutSeconds * 1000;
    this.startTime = Date.now();
    this.results = this.initializeResults();
  }

  /**
   * Initialize test results structure
   */
  protected initializeResults(): TestMetrics {
    return {
      spot: {
        ticker: false,
        orderbook: false,
        trades: false,
        klines: false,
      },
      futures: {
        ticker: false,
        orderbook: false,
        trades: false,
        klines: false,
      },
      userData: {
        orders: false,
        balance: false,
        positions: false,
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
   * Setup event listeners for the exchange
   */
  protected abstract setupEventListeners(exchange: IExchange): void;

  /**
   * Subscribe to market data
   */
  protected abstract subscribeToMarketData(
    exchange: IExchange,
    spotSymbol: string,
    futuresSymbol: string,
  ): Promise<void>;

  /**
   * Check if all tests have passed
   */
  protected checkAllTestsPassed(): boolean {
    const spotComplete = Object.values(this.results.spot).every(Boolean);
    const futuresComplete = Object.values(this.results.futures).every(Boolean);
    const hasCredentials = this.hasCredentials();
    const userDataComplete = hasCredentials
      ? Object.values(this.results.userData).every(Boolean)
      : true;

    if (spotComplete && futuresComplete && userDataComplete) {
      this.logger.info('\n✅ All tests passed! Auto-exiting...');
      this.printSummaryAndExit();
      return true;
    }
    return false;
  }

  /**
   * Start the check interval
   */
  protected startCheckInterval(): void {
    this.checkInterval = setInterval(() => {
      this.checkAllTestsPassed();
    }, 1000);
  }

  /**
   * Start the maximum timeout timer
   */
  protected startMaxTimeout(): void {
    this.timeoutId = setTimeout(() => {
      this.logger.warn(`\n⏰ Maximum timeout (${this.maxTimeout / 1000}s) reached!`);
      this.printSummaryAndExit();
    }, this.maxTimeout);
  }

  /**
   * Print test summary and exit
   */
  protected printSummaryAndExit(): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
    if (this.timeoutId) clearTimeout(this.timeoutId);

    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);

    this.logger.info('\n' + '='.repeat(60));
    this.logger.info('📊 TEST RESULTS SUMMARY');
    this.logger.info('='.repeat(60));

    // Spot Market Data
    this.logger.info('\n🟢 SPOT:');
    this.logger.info(`  Ticker:    ${this.results.spot.ticker ? '✅ PASS' : '❌ FAIL'}`);
    this.logger.info(
      `  OrderBook: ${this.results.spot.orderbook ? '✅ PASS' : '❌ FAIL'}`,
    );
    this.logger.info(`  Trades:    ${this.results.spot.trades ? '✅ PASS' : '❌ FAIL'}`);
    this.logger.info(`  Klines:    ${this.results.spot.klines ? '✅ PASS' : '❌ FAIL'}`);

    // Futures Market Data
    this.logger.info('\n🔵 FUTURES/PERPETUAL:');
    this.logger.info(
      `  Ticker:    ${this.results.futures.ticker ? '✅ PASS' : '❌ FAIL'}`,
    );
    this.logger.info(
      `  OrderBook: ${this.results.futures.orderbook ? '✅ PASS' : '❌ FAIL'}`,
    );
    this.logger.info(
      `  Trades:    ${this.results.futures.trades ? '✅ PASS' : '❌ FAIL'}`,
    );
    this.logger.info(
      `  Klines:    ${this.results.futures.klines ? '✅ PASS' : '❌ FAIL'}`,
    );

    // User Data
    const hasCredentials = this.hasCredentials();
    if (hasCredentials) {
      this.logger.info('\n👤 USER DATA:');
      this.logger.info(
        `  Orders:    ${this.results.userData.orders ? '✅ PASS' : '❌ FAIL'}`,
      );
      this.logger.info(
        `  Balance:   ${this.results.userData.balance ? '✅ PASS' : '❌ FAIL'}`,
      );
      this.logger.info(
        `  Positions: ${this.results.userData.positions ? '✅ PASS' : '❌ FAIL'}`,
      );
    } else {
      this.logger.info('\n👤 USER DATA: ⏭️  SKIPPED (no credentials)');
    }

    // Calculate totals
    const totalMarketDataTests = 8;
    const totalUserDataTests = hasCredentials ? 3 : 0;
    const totalTests = totalMarketDataTests + totalUserDataTests;

    const passedMarketDataTests =
      Object.values(this.results.spot).filter(Boolean).length +
      Object.values(this.results.futures).filter(Boolean).length;
    const passedUserDataTests = hasCredentials
      ? Object.values(this.results.userData).filter(Boolean).length
      : 0;
    const passedTests = passedMarketDataTests + passedUserDataTests;

    this.logger.info('\n' + '='.repeat(60));
    this.logger.info(`⏱️  Duration: ${duration}s`);
    this.logger.info(`📈 Overall: ${passedTests}/${totalTests} tests passed`);
    this.logger.info('='.repeat(60));

    if (passedTests === totalTests) {
      this.logger.info(
        `\n🎉 ALL TESTS PASSED! ${this.exchangeName} WebSocket working perfectly!`,
      );
    } else {
      this.logger.warn('\n⚠️  Some tests failed. Review logs above for details.');
    }

    this.logger.info('\n🔌 Closing WebSocket connections...');
    process.exit(0);
  }

  /**
   * Cleanup and exit
   */
  protected cleanup(exchange: IExchange, exitCode: number = 0): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
    if (this.timeoutId) clearTimeout(this.timeoutId);

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
