# @crypto-trading/dry-run-engine

A minimal dry run engine that simulates strategy execution against historical klines and persists orders/trades/results using the TypeORM DryRun entities via `@crypto-trading/data-manager`.

## Install

This is a workspace package. Build the repo root with pnpm.

## Usage

```ts
import { Decimal } from 'decimal.js';
import { DryRunEngine } from '@crypto-trading/dry-run-engine';
import { TypeOrmDataManagerConfig } from '@crypto-trading/data-manager';
import { IStrategy } from '@crypto-trading/core';

const config: TypeOrmDataManagerConfig = {
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'postgres',
  database: 'itrade',
  synchronize: false,
  migrationsRun: false,
};

const engine = DryRunEngine.fromConfig(config);

const strategy: IStrategy = /* your strategy */ null as any;

await engine.run(
  strategy,
  {
    symbols: ['BTCUSDT'],
    timeframe: '1m',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-01-02'),
    initialBalance: new Decimal(10000),
    commission: new Decimal(0.001),
  },
  { userId: 'your-user-id', name: 'Example Dry Run' }
);
```
