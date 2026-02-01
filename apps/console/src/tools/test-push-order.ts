import 'reflect-metadata';
import { Decimal } from 'decimal.js';
import {
  ConsoleLogger,
  LogLevel,
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
} from '@itrade/core';
import { TypeOrmDataManager } from '@itrade/data-manager';
import * as dotenv from 'dotenv';
import type { PushNotificationService } from '../services/push-notification-service';

type PushTestKind = 'created' | 'filled' | 'partial';

const logger = new ConsoleLogger(LogLevel.INFO);
dotenv.config();

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

async function main() {
  const { isPushEnabled } = await import('@itrade/push-notification');
  if (!isPushEnabled()) {
    throw new Error(
      'Firebase Admin not initialized: set FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH',
    );
  }
  const userId = getRequiredEnv('USER_ID');
  const kind = (process.env.PUSH_TEST_KIND ?? 'filled') as PushTestKind;
  const symbol = process.env.PUSH_TEST_SYMBOL ?? 'BTC/USDT';
  const exchange = process.env.PUSH_TEST_EXCHANGE ?? 'okx';
  const price = new Decimal(process.env.PUSH_TEST_PRICE ?? '50000');
  const quantity = new Decimal(process.env.PUSH_TEST_QTY ?? '0.01');
  const executedQuantity =
    kind === 'partial'
      ? new Decimal(process.env.PUSH_TEST_EXECUTED_QTY ?? '0.005')
      : quantity;

  const dataManager = new TypeOrmDataManager({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'itrade',
    synchronize: false,
    logging: process.env.DB_LOGGING === 'true' ? ['error', 'warn'] : false,
    poolSize: 20,
    cache: {
      type: 'database',
      duration: 30000,
    },
  });

  await dataManager.initialize();

  const { PushNotificationService } = await import(
    '../services/push-notification-service'
  );
  const service: PushNotificationService = new PushNotificationService(
    dataManager,
    logger,
    {
      defaultUserId: userId,
    },
  );

  const orderId = `test-push-${Date.now()}`;
  await service.notifyOrderUpdate(
    {
      id: orderId,
      symbol,
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      quantity,
      price,
      status:
        kind === 'created'
          ? OrderStatus.NEW
          : kind === 'partial'
          ? OrderStatus.PARTIALLY_FILLED
          : OrderStatus.FILLED,
      timeInForce: TimeInForce.GTC,
      timestamp: new Date(),
      updateTime: new Date(),
      executedQuantity,
      exchange,
      strategyName: 'PushTest',
    },
    kind,
  );

  await dataManager.dataSource.destroy();
  logger.info(`✅ Push test finished (${kind}) for order ${orderId}`);
}

main().catch((error) => {
  logger.error('❌ Push test failed', error as Error);
  process.exit(1);
});
