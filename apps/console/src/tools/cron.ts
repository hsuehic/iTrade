#!/usr/bin/env tsx
/**
 * Cron Job for Account Polling Service
 *
 * This script continuously polls the latest account data from exchanges:
 * - Polls current balances from all configured exchanges
 * - Polls current positions from all configured exchanges
 * - Saves snapshots to database for historical tracking
 *
 * ⚠️  Run init-history.ts FIRST to initialize historical data!
 *
 * Usage:
 *   pnpm run cron
 *
 * Configuration (.env file):
 *   - ACCOUNT_POLLING_INTERVAL: Polling interval in milliseconds (default: 60000 = 1 minute)
 */

import 'reflect-metadata';
import dotenv from 'dotenv';
import { Decimal } from 'decimal.js';
import { AccountPollingService, IExchange, PollingResult } from '@itrade/core';
import {
  BinanceExchange,
  OKXExchange,
  CoinbaseExchange,
} from '@itrade/exchange-connectors';
import { TypeOrmDataManager } from '@itrade/data-manager';
import { silentLogger } from '../utils/silent-logger';

// Load environment variables
dotenv.config();

const logger = silentLogger;

type ExchangePolledEvent = {
  exchange: string;
  balances?: unknown[];
  positions?: unknown[];
};

type SnapshotSavedEvent = {
  exchange: string;
  totalBalance: Decimal;
  positionCount: number;
  availableBalance: Decimal;
  lockedBalance: Decimal;
  savingBalance?: Decimal;
  timestamp: Date;
};

// Polling interval (default: 6 seconds for testing)
const POLLING_INTERVAL = parseInt(process.env.ACCOUNT_POLLING_INTERVAL || '6000');

let dataManager: TypeOrmDataManager;
let accountPollingService: AccountPollingService;

/**
 * Initialize database and services
 */
async function initialize() {
  logger.info('🚀 Initializing Account Polling Cron Job...');

  // Initialize database
  dataManager = new TypeOrmDataManager({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DB || 'itrade',
    ssl: process.env.DB_SSL === 'true',
    logging: ['error'],
    synchronize: true, // Auto-create tables
  });

  await dataManager.initialize();
  logger.info('✅ Database connected');

  // Initialize exchanges
  const exchanges = new Map<string, IExchange>();
  const USE_TESTNET = false; // 使用主网

  // Binance
  if (process.env.BINANCE_API_KEY && process.env.BINANCE_SECRET_KEY) {
    try {
      const binance = new BinanceExchange(USE_TESTNET);
      await binance.connect({
        apiKey: process.env.BINANCE_API_KEY,
        secretKey: process.env.BINANCE_SECRET_KEY,
        sandbox: USE_TESTNET,
      });
      exchanges.set('binance', binance);
      logger.info('✅ Binance exchange initialized');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`⚠️  Failed to initialize Binance: ${message}`);
    }
  } else {
    logger.warn('⚠️  Binance API credentials not found in environment variables');
  }

  // OKX
  if (
    process.env.OKX_API_KEY &&
    process.env.OKX_SECRET_KEY &&
    process.env.OKX_PASSPHRASE
  ) {
    try {
      const okx = new OKXExchange(USE_TESTNET);
      await okx.connect({
        apiKey: process.env.OKX_API_KEY,
        secretKey: process.env.OKX_SECRET_KEY,
        passphrase: process.env.OKX_PASSPHRASE,
        sandbox: USE_TESTNET,
      });
      exchanges.set('okx', okx);
      logger.info('✅ OKX exchange initialized');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`⚠️  Failed to initialize OKX: ${message}`);
    }
  } else {
    logger.info('ℹ️  OKX API credentials not configured (optional)');
  }

  // Coinbase
  if (process.env.COINBASE_API_KEY && process.env.COINBASE_SECRET_KEY) {
    try {
      const coinbase = new CoinbaseExchange();
      await coinbase.connect({
        apiKey: process.env.COINBASE_API_KEY,
        secretKey: process.env.COINBASE_SECRET_KEY,
        sandbox: USE_TESTNET,
      });
      exchanges.set('coinbase', coinbase);
      logger.info('✅ Coinbase exchange initialized');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`⚠️  Failed to initialize Coinbase: ${message}`);
    }
  } else {
    logger.info('ℹ️  Coinbase API credentials not configured (optional)');
  }

  if (exchanges.size === 0) {
    logger.error('❌ No exchanges configured. Please set API credentials in .env file.');
    process.exit(1);
  }

  // Initialize Account Polling Service
  accountPollingService = new AccountPollingService(
    {
      pollingInterval: POLLING_INTERVAL,
      enablePersistence: true,
      exchanges: Array.from(exchanges.keys()),
      retryAttempts: 3,
      retryDelay: 5000,
    },
    logger,
  );

  // Set data manager
  accountPollingService.setDataManager(dataManager);

  // Register all exchanges with their AccountInfo ID
  const userId = process.env.USER_ID;
  const accountInfoRepo = dataManager.getAccountInfoRepository();

  for (const [name, exchange] of exchanges) {
    let accountInfoId: number | undefined;

    if (userId) {
      // Ensure AccountInfo exists for this user/exchange
      await accountInfoRepo.upsert(
        {
          userId,
          exchange: name,
          accountId: name, // Using exchange name as accountId for simple cron setup
          canTrade: true,
          canWithdraw: true,
          canDeposit: true,
          updateTime: new Date(),
          isActive: true,
        },
        ['userId', 'exchange'],
      );

      const accountInfo = await accountInfoRepo.findOne({
        where: { userId, exchange: name },
      });
      accountInfoId = accountInfo?.id;
    }

    accountPollingService.registerExchange(name, exchange, { accountInfoId });
  }

  // Setup event listeners
  accountPollingService.on('started', () => {
    logger.info('✅ Account polling service started');
  });

  accountPollingService.on('pollingComplete', (results: PollingResult[]) => {
    const successCount = results.filter((r) => r.success).length;
    logger.info(
      `📊 Polling completed: ${successCount}/${results.length} exchanges successful`,
    );
  });

  accountPollingService.on('exchangePolled', (data: ExchangePolledEvent) => {
    logger.debug(
      `✅ ${data.exchange}: ${data.balances?.length || 0} balances, ${data.positions?.length || 0} positions`,
    );
  });

  accountPollingService.on('snapshotSaved', async (snapshot: SnapshotSavedEvent) => {
    logger.info(
      `💾 ${snapshot.exchange} snapshot saved: Equity=${snapshot.totalBalance.toFixed(2)}, Positions=${snapshot.positionCount}`,
    );

    // Sync to Balance History Tables
    const userId = process.env.USER_ID;
    if (!userId) {
      logger.debug('⚠️ Skipping balance history sync: USER_ID not set');
      return;
    }

    try {
      const accountInfoRepo = dataManager.getAccountInfoRepository();
      const accountInfo = await accountInfoRepo.findOne({
        where: { userId, exchange: snapshot.exchange },
      });

      if (accountInfo) {
        await dataManager.updateBalanceHistory(
          accountInfo,
          snapshot.availableBalance,
          snapshot.lockedBalance,
          snapshot.totalBalance,
          snapshot.timestamp,
          snapshot.savingBalance, // New saving balance
        );
        logger.info(`✅ Synced balance history for ${snapshot.exchange}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Failed to sync balance history: ${message}`);
    }
  });

  accountPollingService.on('error', (error: Error) => {
    logger.error(`❌ Polling error: ${error.message}`);
  });

  logger.info(`✅ Account Polling Service initialized`);
  logger.info(`⏱️  Polling interval: ${POLLING_INTERVAL / 1000}s`);
}

/**
 * Main function
 */
async function main() {
  try {
    // Initialize services
    await initialize();

    // Start continuous polling
    logger.info('🔄 Starting continuous account polling...');
    await accountPollingService.start();

    logger.info('✅ Account polling service started successfully!');
    logger.info(`⏱️  Polling every ${POLLING_INTERVAL / 1000} seconds`);
    logger.info('📊 Latest data will be saved to database automatically');
    logger.info('💡 Press Ctrl+C to stop');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Failed to start account polling: ${message}`);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('\n🛑 Stopping cron job...');

  if (accountPollingService) {
    await accountPollingService.stop();
  }

  if (dataManager) {
    await dataManager.close();
  }

  logger.info('✅ Cron job stopped gracefully');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('\n🛑 Stopping cron job...');

  if (accountPollingService) {
    await accountPollingService.stop();
  }

  if (dataManager) {
    await dataManager.close();
  }

  logger.info('✅ Cron job stopped gracefully');
  process.exit(0);
});

// Start the cron job
main().catch((error) => {
  logger.error(`❌ Fatal error: ${error.message}`);
  process.exit(1);
});
