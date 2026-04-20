import 'reflect-metadata';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Note: We need the hardcoded pairs. Since we are in the monorepo,
// we might have trouble importing from apps/web directly in a script.
// I will copy the values here for the script.

const COMMON_TRADING_PAIRS = [
  // Spot pairs (USDT-based - Binance/OKX)
  {
    symbol: 'BTC/USDT',
    base: 'BTC',
    quote: 'USDT',
    name: 'BTC/USDT (Spot)',
    type: 'spot',
    exchange: 'binance,okx',
  },
  {
    symbol: 'ETH/USDT',
    base: 'ETH',
    quote: 'USDT',
    name: 'ETH/USDT (Spot)',
    type: 'spot',
    exchange: 'binance,okx',
  },
  {
    symbol: 'BNB/USDT',
    base: 'BNB',
    quote: 'USDT',
    name: 'BNB/USDT (Spot)',
    type: 'spot',
    exchange: 'binance,okx',
  },
  {
    symbol: 'SOL/USDT',
    base: 'SOL',
    quote: 'USDT',
    name: 'SOL/USDT (Spot)',
    type: 'spot',
    exchange: 'binance,okx',
  },

  // Spot pairs (USDC-based - Coinbase)
  {
    symbol: 'BTC/USDC',
    base: 'BTC',
    quote: 'USDC',
    name: 'BTC/USDC (Spot)',
    type: 'spot',
    exchange: 'binance,coinbase,okx',
  },
  {
    symbol: 'ETH/USDC',
    base: 'ETH',
    quote: 'USDC',
    name: 'ETH/USDC (Spot)',
    type: 'spot',
    exchange: 'binance,coinbase,okx',
  },

  // Perpetual contracts - USDT-based (Binance/OKX)
  {
    symbol: 'BTC/USDT:USDT',
    base: 'BTC',
    quote: 'USDT',
    name: 'BTC/USDT (Futures)',
    type: 'perpetual',
    exchange: 'binance,okx',
  },
  {
    symbol: 'ETH/USDT:USDT',
    base: 'ETH',
    quote: 'USDT',
    name: 'ETH/USDT (Futures)',
    type: 'perpetual',
    exchange: 'binance,okx',
  },
  {
    symbol: 'SOL/USDT:USDT',
    base: 'SOL',
    quote: 'USDT',
    name: 'SOL/USDT (Futures)',
    type: 'perpetual',
    exchange: 'binance,okx',
  },

  // Perpetual contracts - USDC-based (Coinbase)
  {
    symbol: 'BTC/USDC:USDC',
    base: 'BTC',
    quote: 'USDC',
    name: 'BTC/USDC (Futures)',
    type: 'perpetual',
    exchange: 'binance,coinbase,okx',
  },
  {
    symbol: 'ETH/USDC:USDC',
    base: 'ETH',
    quote: 'USDC',
    name: 'ETH/USDC (Futures)',
    type: 'perpetual',
    exchange: 'binance,coinbase,okx',
  },
];

const pool = new Pool({
  host: '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DB || 'itrade',
});

async function seed() {
  try {
    console.log('Seeding trading pairs...');
    let added = 0;
    let skipped = 0;

    console.log('Clearing existing symbols...');
    await pool.query('DELETE FROM "symbols"');

    for (const pair of COMMON_TRADING_PAIRS) {
      const exchanges = pair.exchange.split(',');
      for (const exchange of exchanges) {
        const exchangeId = exchange.trim();
        await pool.query(
          'INSERT INTO "symbols" (symbol, "baseAsset", "quoteAsset", exchange, type, name, "isActive") VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [pair.symbol, pair.base, pair.quote, exchangeId, pair.type, pair.name, true],
        );
        added++;
        console.log(`Added: ${pair.symbol} (${exchangeId})`);
      }
    }

    console.log(`Seeding complete: ${added} added, ${skipped} skipped.`);
  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    await pool.end();
  }
}

seed();
