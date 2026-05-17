#!/usr/bin/env node
/**
 * Initialize Historical Transfers (deposits & withdrawals)
 *
 * In production the console runs in multi-tenant mode: API credentials live
 * encrypted in account_info, and the AccountPollingService only fetches the
 * last 24 hours of transfers per poll cycle — so anything older never reaches
 * the database. This tool walks every active account, decrypts its credentials
 * (same path as BotInstance), and backfills transfers in 90-day chunks
 * (Binance's max range per signed request).
 *
 * ⚠️  Safe to re-run: saveTransfers() upserts by transfer id.
 *
 * Required env:
 *   - DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_DB / DB_SSL
 *   - ENCRYPTION_KEY                (matches the console container's key)
 *
 * Optional env:
 *   - USER_ID                       (CSV; restrict to these user ids)
 *   - EXCHANGES                     (CSV; default: "binance"; binance,okx,coinbase)
 *   - LOOKBACK_DAYS                 (default: 730 → ~2 years)
 *   - CHUNK_DAYS                    (default: 90  → Binance API max)
 *   - USE_MAINNET_FOR_DATA          (default: true)
 *
 * Usage (host):
 *   cd apps/console && pnpm run tool:init-transfers
 *
 * Usage (inside the running console container):
 *   docker exec -e LOOKBACK_DAYS=730 itrade-console \
 *     node -r ts-node/register -r tsconfig-paths/register -r reflect-metadata \
 *          /app/apps/console/src/tools/init-transfers.ts
 */

import 'reflect-metadata';
import dotenv from 'dotenv';
import { ConsoleLogger, IExchange, LogLevel, Transfer } from '@itrade/core';
import {
  BinanceExchange,
  OKXExchange,
  CoinbaseExchange,
} from '@itrade/exchange-connectors';
import { AccountInfoEntity, TypeOrmDataManager } from '@itrade/data-manager';
import { CryptoUtils } from '@itrade/utils/CryptoUtils';

dotenv.config();

function trimOrEmpty(v?: string): string {
  return (v ?? '').trim();
}

const logger = new ConsoleLogger(LogLevel.INFO);

const ENCRYPTION_KEY = trimOrEmpty(process.env.ENCRYPTION_KEY);

const USE_MAINNET_FOR_DATA =
  (process.env.USE_MAINNET_FOR_DATA ?? 'true').toLowerCase() !== 'false';

const LOOKBACK_DAYS = Math.max(1, parseInt(process.env.LOOKBACK_DAYS ?? '730', 10));
const CHUNK_DAYS = Math.max(
  1,
  Math.min(90, parseInt(process.env.CHUNK_DAYS ?? '90', 10)),
);

const EXCHANGES = trimOrEmpty(process.env.EXCHANGES || 'binance')
  .toLowerCase()
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const USER_ID_FILTER = trimOrEmpty(process.env.USER_ID)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface ConnectedAccount {
  account: AccountInfoEntity;
  exchange: IExchange;
}

/**
 * Decrypt credentials and instantiate a connected IExchange for one
 * account_info row. Mirrors BotInstance#connectExchangeForAccount so we follow
 * the exact same code path as production.
 */
async function connectAccount(
  account: AccountInfoEntity,
): Promise<ConnectedAccount | null> {
  if (!account.apiKey || !account.secretKey) {
    return null;
  }

  const apiKey = CryptoUtils.decrypt(account.apiKey, ENCRYPTION_KEY);
  const secretKey = CryptoUtils.decrypt(account.secretKey, ENCRYPTION_KEY);
  const passphrase = account.passphrase
    ? CryptoUtils.decrypt(account.passphrase, ENCRYPTION_KEY)
    : undefined;

  const exchangeName = account.exchange.toLowerCase();
  let exchange: IExchange;

  switch (exchangeName) {
    case 'binance':
      exchange = new BinanceExchange(!USE_MAINNET_FOR_DATA);
      await exchange.connect({
        apiKey,
        secretKey,
        sandbox: !USE_MAINNET_FOR_DATA,
      });
      break;
    case 'okx':
      if (!passphrase) {
        logger.warn(
          `⚠️  ${exchangeName}: passphrase missing — skipping account ${account.id}`,
        );
        return null;
      }
      exchange = new OKXExchange(!USE_MAINNET_FOR_DATA);
      await exchange.connect({
        apiKey,
        secretKey,
        passphrase,
        sandbox: !USE_MAINNET_FOR_DATA,
      });
      break;
    case 'coinbase':
      exchange = new CoinbaseExchange();
      await exchange.connect({
        apiKey,
        secretKey,
        sandbox: !USE_MAINNET_FOR_DATA,
      });
      break;
    default:
      logger.warn(
        `⚠️  Unsupported exchange "${exchangeName}" — skipping account ${account.id}`,
      );
      return null;
  }

  return { account, exchange };
}

/**
 * Walk backwards from now to (now - LOOKBACK_DAYS) in CHUNK_DAYS-sized
 * windows, saving each batch as it lands so a transient failure later in the
 * loop doesn't lose what was already fetched.
 */
async function backfillAccount(
  conn: ConnectedAccount,
  dataManager: TypeOrmDataManager,
): Promise<{ fetched: number; saved: number }> {
  const { account, exchange } = conn;
  const exchangeName = account.exchange.toLowerCase();

  if (!exchange.getTransfers) {
    logger.warn(`⚠️  ${exchangeName} does not implement getTransfers — skipping`);
    return { fetched: 0, saved: 0 };
  }

  const overallEnd = new Date();
  const overallStart = new Date(overallEnd.getTime() - LOOKBACK_DAYS * MS_PER_DAY);

  let chunkEnd = new Date(overallEnd);
  let chunkStart = new Date(
    Math.max(chunkEnd.getTime() - CHUNK_DAYS * MS_PER_DAY, overallStart.getTime()),
  );

  let totalFetched = 0;
  let totalSaved = 0;
  const seenIds = new Set<string>();

  while (chunkEnd.getTime() > overallStart.getTime()) {
    const label = `${exchangeName}/${account.userId.slice(0, 8)}…`;
    logger.info(
      `   ⏳ ${label}: ${chunkStart.toISOString().slice(0, 10)} → ${chunkEnd
        .toISOString()
        .slice(0, 10)}`,
    );

    let batch: Transfer[] = [];
    try {
      batch = await exchange.getTransfers(chunkStart, chunkEnd);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`   ❌ ${label}: getTransfers failed — ${message}`);
      // Don't abort the whole run on one bad chunk — keep walking back.
      chunkEnd = new Date(chunkStart.getTime() - 1);
      chunkStart = new Date(
        Math.max(chunkEnd.getTime() - CHUNK_DAYS * MS_PER_DAY, overallStart.getTime()),
      );
      continue;
    }

    // De-dup within this run (chunks can overlap on the boundary; the DB
    // upsert also acts as a safety net via conflictPaths: ['id']).
    const fresh = batch.filter((t) => {
      if (seenIds.has(t.id)) return false;
      seenIds.add(t.id);
      return true;
    });

    totalFetched += fresh.length;

    if (fresh.length > 0) {
      try {
        await dataManager.saveTransfers(fresh, account.userId, exchangeName);
        totalSaved += fresh.length;
        logger.info(`   💾 ${label}: saved ${fresh.length} transfers`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`   ❌ ${label}: saveTransfers failed — ${message}`);
      }
    } else {
      logger.info(`   · ${label}: 0 transfers in chunk`);
    }

    // Step backward; -1 ms so adjacent chunks don't overlap at the edge.
    chunkEnd = new Date(chunkStart.getTime() - 1);
    chunkStart = new Date(
      Math.max(chunkEnd.getTime() - CHUNK_DAYS * MS_PER_DAY, overallStart.getTime()),
    );

    // Gentle pacing — back-to-back signed calls from the same key can trip
    // rate-limit headers even though Binance allows ~12k req/min.
    await new Promise((r) => setTimeout(r, 250));
  }

  return { fetched: totalFetched, saved: totalSaved };
}

async function main(): Promise<void> {
  logger.info('🚀 Initializing historical transfers (multi-tenant)...');
  logger.info('[CFG]', {
    EXCHANGES: EXCHANGES.join(','),
    USER_ID_FILTER: USER_ID_FILTER.length > 0 ? USER_ID_FILTER.join(',') : '(all)',
    LOOKBACK_DAYS,
    CHUNK_DAYS,
    USE_MAINNET_FOR_DATA,
    DB_HOST: process.env.DB_HOST,
    DB_DB: process.env.DB_DB,
  });

  if (!ENCRYPTION_KEY) {
    logger.error('❌ ENCRYPTION_KEY env var is required.');
    process.exit(1);
  }

  const dataManager = new TypeOrmDataManager({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DB || 'itrade',
    ssl: process.env.DB_SSL === 'true',
    logging: ['error'],
    synchronize: false,
  });

  await dataManager.initialize();
  logger.info('✅ Database connected');

  // Load every active account that matches the EXCHANGES / USER_ID filters.
  const accountRepo = dataManager.dataSource.getRepository(AccountInfoEntity);
  const accounts = (
    await accountRepo.find({
      where: { isActive: true },
      select: {
        id: true,
        userId: true,
        apiKey: true,
        secretKey: true,
        passphrase: true,
        exchange: true,
      },
    })
  ).filter((acc) => {
    if (!acc.userId || !acc.apiKey || !acc.secretKey) return false;
    if (!EXCHANGES.includes(acc.exchange.toLowerCase())) return false;
    if (USER_ID_FILTER.length > 0 && !USER_ID_FILTER.includes(acc.userId)) return false;
    if (acc.exchange.toLowerCase() === 'okx' && !acc.passphrase) return false;
    return true;
  });

  if (accounts.length === 0) {
    logger.error(
      '❌ No matching active accounts found. Check EXCHANGES / USER_ID filters and isActive flag.',
    );
    await dataManager.close();
    process.exit(1);
  }

  logger.info(`📒 Found ${accounts.length} matching account(s) to backfill`);

  const summary: Array<{
    accountId: number;
    userId: string;
    exchange: string;
    fetched: number;
    saved: number;
    error?: string;
  }> = [];

  for (const account of accounts) {
    const exchangeName = account.exchange.toLowerCase();
    logger.info(
      `\n=== account#${account.id} ${exchangeName} user=${account.userId.slice(0, 8)}… ===`,
    );

    let conn: ConnectedAccount | null = null;
    try {
      conn = await connectAccount(account);
      if (!conn) {
        summary.push({
          accountId: account.id,
          userId: account.userId,
          exchange: exchangeName,
          fetched: 0,
          saved: 0,
          error: 'connect skipped',
        });
        continue;
      }

      const { fetched, saved } = await backfillAccount(conn, dataManager);
      summary.push({
        accountId: account.id,
        userId: account.userId,
        exchange: exchangeName,
        fetched,
        saved,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`❌ account#${account.id}: ${message}`);
      summary.push({
        accountId: account.id,
        userId: account.userId,
        exchange: exchangeName,
        fetched: 0,
        saved: 0,
        error: message,
      });
    } finally {
      if (conn) {
        try {
          await conn.exchange.disconnect();
        } catch {
          // ignore
        }
      }
    }
  }

  await dataManager.close();

  logger.info('\n📊 Backfill summary:');
  for (const row of summary) {
    const suffix = row.error ? ` (error: ${row.error})` : '';
    logger.info(
      `   account#${row.accountId} ${row.exchange} user=${row.userId.slice(0, 8)}…: fetched=${row.fetched}, saved=${row.saved}${suffix}`,
    );
  }
  logger.info('✅ Transfer initialization completed.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('❌ Fatal error:', message);
  process.exit(1);
});
