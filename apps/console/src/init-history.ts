#!/usr/bin/env node
/**
 * Initialize Historical Account Snapshots
 *
 * This script fetches current account data from all configured exchanges
 * and creates initial snapshots in the database.
 *
 * ⚠️  Run this ONCE to initialize historical data.
 *
 * Usage:
 *   cd apps/console && \
 *   NODE_ENV=development \
 *   TS_NODE_PROJECT=tsconfig.build.json \
 *   TS_NODE_FILES=true \
 *   NODE_OPTIONS="--conditions=source" \
 *   node -r ts-node/register \
 *        -r tsconfig-paths/register \
 *        -r reflect-metadata \
 *        src/init-history.ts
 */

import 'reflect-metadata';
import dotenv from 'dotenv';
import { LogLevel } from '@itrade/core';
import { ConsoleLogger } from '@itrade/logger';
import {
  BinanceExchange,
  OKXExchange,
  CoinbaseExchange,
} from '@itrade/exchange-connectors';
import { TypeOrmDataManager } from '@itrade/data-manager';
import { Decimal } from 'decimal.js';

// Load environment variables
dotenv.config();

function trimOrEmpty(v?: string) {
  return (v ?? '').trim();
}

function mask(value?: string) {
  if (!value) return '(empty)';
  if (value.length <= 6) return '*'.repeat(value.length);
  return value.slice(0, 3) + '***' + value.slice(-3);
}

const BINANCE_API_KEY = trimOrEmpty(process.env.BINANCE_API_KEY);
const BINANCE_SECRET_KEY = trimOrEmpty(process.env.BINANCE_SECRET_KEY);
const OKX_API_KEY = trimOrEmpty(process.env.OKX_API_KEY);
const OKX_SECRET_KEY = trimOrEmpty(process.env.OKX_SECRET_KEY);
const OKX_PASSPHRASE = trimOrEmpty(process.env.OKX_PASSPHRASE);
const COINBASE_API_KEY = trimOrEmpty(process.env.COINBASE_API_KEY);
const COINBASE_SECRET_KEY = trimOrEmpty(process.env.COINBASE_SECRET_KEY);

const USE_MAINNET_FOR_DATA =
  (process.env.USE_MAINNET_FOR_DATA ?? 'true').toLowerCase() !== 'false';

const envSnapshot = {
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_USER: process.env.DB_USER,
  DB_DB: process.env.DB_DB,
  DB_SSL: process.env.DB_SSL,
  USE_MAINNET_FOR_DATA: USE_MAINNET_FOR_DATA,
  BINANCE_API_KEY: mask(BINANCE_API_KEY),
  BINANCE_SECRET_KEY: mask(BINANCE_SECRET_KEY),
  OKX_API_KEY: mask(OKX_API_KEY),
  OKX_SECRET_KEY: mask(OKX_SECRET_KEY),
  OKX_PASSPHRASE: mask(OKX_PASSPHRASE),
  COINBASE_API_KEY: mask(COINBASE_API_KEY),
  COINBASE_SECRET_KEY: mask(COINBASE_SECRET_KEY),
  ACCOUNT_POLLING_INTERVAL: process.env.ACCOUNT_POLLING_INTERVAL,
};

console.info('[ENV]', envSnapshot);

const logger = new ConsoleLogger(LogLevel.INFO);

interface ExchangeData {
  name: string;
  exchange: any;
  balances: any[];
  positions: any[];
}

async function main() {
  logger.info('🚀 Initializing historical account data...');

  // Initialize database
  const dataManager = new TypeOrmDataManager({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DB || 'itrade',
    ssl: process.env.DB_SSL === 'true',
    logging: ['error'],
    synchronize: true, // Auto-create tables if needed
  });

  await dataManager.initialize();
  logger.info('✅ Database connected');

  const exchanges: ExchangeData[] = [];
  // const USE_MAINNET_FOR_DATA = true; // replaced by env above

  // Initialize Binance
  if (BINANCE_API_KEY && BINANCE_SECRET_KEY) {
    try {
      logger.info(`📡 Connecting to Binance (sandbox=${!USE_MAINNET_FOR_DATA})...`);
      const binance = new BinanceExchange(!USE_MAINNET_FOR_DATA);
      await binance.connect({
        apiKey: BINANCE_API_KEY,
        secretKey: BINANCE_SECRET_KEY,
        sandbox: !USE_MAINNET_FOR_DATA,
      });

      logger.info('📊 Fetching Binance account data...');
      const balances = await binance.getBalances();
      const positions = await binance.getPositions();

      exchanges.push({
        name: 'binance',
        exchange: binance,
        balances,
        positions,
      });

      logger.info(
        `✅ Binance: ${balances.length} balances, ${positions.length} positions`,
      );
    } catch (error: any) {
      logger.error(`❌ Failed to fetch Binance data: ${error.message}`);
    }
  } else {
    logger.warn('⚠️  Binance credentials not configured');
  }

  // Initialize OKX
  if (OKX_API_KEY && OKX_SECRET_KEY && OKX_PASSPHRASE) {
    try {
      logger.info(`📡 Connecting to OKX (sandbox=${!USE_MAINNET_FOR_DATA})...`);
      const okx = new OKXExchange(!USE_MAINNET_FOR_DATA);
      await okx.connect({
        apiKey: OKX_API_KEY,
        secretKey: OKX_SECRET_KEY,
        passphrase: OKX_PASSPHRASE,
        sandbox: !USE_MAINNET_FOR_DATA,
      });

      logger.info('📊 Fetching OKX account data...');
      const balances = await okx.getBalances();
      const positions = await okx.getPositions();

      exchanges.push({
        name: 'okx',
        exchange: okx,
        balances,
        positions,
      });

      logger.info(`✅ OKX: ${balances.length} balances, ${positions.length} positions`);
    } catch (error: any) {
      logger.error(`❌ Failed to fetch OKX data: ${error.message}`);
    }
  } else {
    logger.warn('⚠️  OKX credentials not configured');
  }

  // Initialize Coinbase
  if (COINBASE_API_KEY && COINBASE_SECRET_KEY) {
    try {
      logger.info(`📡 Connecting to Coinbase (sandbox=${!USE_MAINNET_FOR_DATA})...`);
      const coinbase = new CoinbaseExchange();
      await coinbase.connect({
        apiKey: COINBASE_API_KEY,
        secretKey: COINBASE_SECRET_KEY,
        sandbox: !USE_MAINNET_FOR_DATA,
      });

      logger.info('📊 Fetching Coinbase account data...');
      const balances = await coinbase.getBalances();
      const positions = await coinbase.getPositions();

      exchanges.push({
        name: 'coinbase',
        exchange: coinbase,
        balances,
        positions,
      });

      logger.info(
        `✅ Coinbase: ${balances.length} balances, ${positions.length} positions`,
      );
    } catch (error: any) {
      logger.error(`❌ Failed to fetch Coinbase data: ${error.message}`);
    }
  } else {
    logger.warn('⚠️  Coinbase credentials not configured');
  }

  if (exchanges.length === 0) {
    logger.error('❌ No exchanges configured. Please set API credentials in .env file.');
    await dataManager.close();
    process.exit(1);
  }

  // Save snapshots to database
  logger.info('💾 Saving account snapshots to database...');

  for (const { name, balances, positions } of exchanges) {
    try {
      // Calculate totals
      let totalBalance = new Decimal(0);
      let availableBalance = new Decimal(0);
      let lockedBalance = new Decimal(0);

      for (const balance of balances) {
        totalBalance = totalBalance.plus(balance.total);
        availableBalance = availableBalance.plus(balance.free);
        lockedBalance = lockedBalance.plus(balance.locked);
      }

      let totalPositionValue = new Decimal(0);
      let unrealizedPnl = new Decimal(0);

      for (const position of positions) {
        const positionNotional = (position.markPrice || new Decimal(0)).mul(
          position.quantity || new Decimal(0),
        );
        totalPositionValue = totalPositionValue.plus(positionNotional);
        unrealizedPnl = unrealizedPnl.plus(position.unrealizedPnl || new Decimal(0));
      }

      // Create snapshot
      const snapshot = {
        exchange: name,
        timestamp: new Date(),
        totalBalance,
        availableBalance,
        lockedBalance,
        totalPositionValue,
        unrealizedPnl,
        positionCount: positions.length,
        balances: balances.map((b) => ({
          asset: b.asset,
          free: b.free,
          locked: b.locked,
          total: b.total,
        })),
        positions: positions.map((p) => ({
          symbol: p.symbol,
          side: p.side,
          quantity: p.quantity ?? p.size ?? new Decimal(0),
          avgPrice: p.avgPrice ?? p.entryPrice ?? new Decimal(0),
          markPrice: p.markPrice ?? new Decimal(0),
          unrealizedPnl: p.unrealizedPnl ?? new Decimal(0),
          leverage: p.leverage ?? new Decimal(0),
          timestamp: p.timestamp ?? new Date(),
        })),
      };

      // Save to database
      await dataManager.saveAccountSnapshot(snapshot);

      const totalEquity = totalBalance.plus(totalPositionValue);
      logger.info(
        `💾 ${name.toUpperCase()}: Equity=$${totalEquity.toFixed(2)}, Balance=$${totalBalance.toFixed(2)}, ` +
          `Positions=${positions.length}, Unrealized P&L=$${unrealizedPnl.toFixed(2)}`,
      );
    } catch (error: any) {
      logger.error(`❌ Failed to save ${name} snapshot: ${error.message}`);
    }
  }

  // Close connections
  for (const { exchange } of exchanges) {
    try {
      await exchange.disconnect();
    } catch (error) {
      // Ignore disconnect errors
    }
  }

  await dataManager.close();

  logger.info('✅ Historical data initialization completed!');
  logger.info('📊 You can now start the cron job to keep data updated.');
  logger.info('   Run: pnpm run cron');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
