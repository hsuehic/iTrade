import 'reflect-metadata';
import { TypeOrmDataManager } from '../packages/data-manager/src/TypeOrmDataManager';
import { SymbolEntity } from '../packages/data-manager/src/entities/Symbol';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function verify() {
  const dm = new TypeOrmDataManager({
    type: 'postgres',
    host: '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DB || 'itrade',
  });

  try {
    await dm.initialize();
    console.log('--- Database Verification ---');

    const repo = dm.dataSource.getRepository(SymbolEntity);
    const count = await repo.count();
    console.log(`Total symbols in database: ${count}`);

    // Verify a few samples
    const samples = await repo.find({ take: 5 });
    console.log(
      'Sample symbols:',
      samples.map((s) => `${s.symbol} (${s.exchange}) - ${s.type}`),
    );

    // Test Search/Read
    const btcBinance = await repo.findOneBy({ symbol: 'BTC/USDT', exchange: 'binance' });
    console.log('BTC/USDT (binance) exists:', !!btcBinance);

    const btcOkx = await repo.findOneBy({ symbol: 'BTC/USDT', exchange: 'okx' });
    console.log('BTC/USDT (okx) exists:', !!btcOkx);

    // Verify distinct symbols test (multiple exchanges same symbol)
    if (btcBinance && btcOkx) {
      console.log('SUCCESS: Multiple exchanges can host the same symbol string.');
    } else {
      console.error('FAILURE: Missing expected multi-exchange symbols.');
    }

    console.log('--- End of Verification ---');
  } catch (error) {
    console.error('Verification failed:', error);
  } finally {
    await dm.close();
  }
}

verify();
