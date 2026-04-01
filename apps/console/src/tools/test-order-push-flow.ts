import 'reflect-metadata';
import dotenv from 'dotenv';
import { Decimal } from 'decimal.js';
import {
  ConsoleLogger,
  EventBus,
  LogLevel,
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
  type Order,
} from '@itrade/core';
import { TypeOrmDataManager } from '@itrade/data-manager';
import { OrderTracker } from '../integration/helpers/order-tracker';
import { PushNotificationService } from '../services/push-notification-service';

dotenv.config();

type MockPushNotificationService = {
  notifyOrderUpdate(
    order: Order,
    kind: 'created' | 'filled' | 'partial' | 'failed',
  ): Promise<void>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const logger = new ConsoleLogger(LogLevel.INFO);

function buildMockPushService(): MockPushNotificationService {
  return {
    async notifyOrderUpdate(
      order: Order,
      kind: 'created' | 'filled' | 'partial' | 'failed',
    ): Promise<void> {
      void order;
      void kind;
    },
  };
}

async function createDataManager(): Promise<TypeOrmDataManager> {
  const dataManager = new TypeOrmDataManager({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DB || 'itrade',
    synchronize: false,
    logging: process.env.DB_LOGGING === 'true' ? ['error', 'warn'] : false,
    poolSize: 20,
    cache: {
      type: 'database',
      duration: 30000,
    },
  });

  await dataManager.initialize();
  return dataManager;
}

async function main(): Promise<void> {
  const userId = process.env.USER_ID ?? 'test-user';
  const useRealPush = process.env.USE_REAL_PUSH === 'true';
  const includeUserId = process.env.ORDER_HAS_USER_ID === 'true';

  const testKind = (process.env.PUSH_TEST_KIND ?? 'filled').toLowerCase();
  const isFailed = testKind === 'failed';

  const dataManager = useRealPush
    ? await createDataManager()
    : ({
        saveOrder: async () => {},
        updateOrder: async () => {},
        getOrders: async () => [],
        getStrategy: async () => null,
      } as unknown as TypeOrmDataManager);

  const pushService = useRealPush
    ? new PushNotificationService(dataManager, { defaultUserId: userId })
    : buildMockPushService();

  const tracker = new OrderTracker(dataManager, logger, pushService, userId);
  await tracker.start();

  const order: Order = {
    id: `test-order-${Date.now()}`,
    symbol: process.env.PUSH_TEST_SYMBOL ?? 'BTC/USDT',
    side: OrderSide.BUY,
    type: OrderType.LIMIT,
    quantity: new Decimal('0.01'),
    price: new Decimal('50000'),
    status: isFailed ? OrderStatus.REJECTED : OrderStatus.FILLED,
    timeInForce: TimeInForce.GTC,
    timestamp: new Date(),
    executedQuantity: new Decimal('0.01'),
    updateTime: new Date(),
    exchange: process.env.PUSH_TEST_EXCHANGE ?? 'okx',
    userId: includeUserId ? userId : undefined,
    ...(isFailed
      ? { errorMessage: process.env.PUSH_TEST_ERROR ?? 'Mock order failure' }
      : {}),
  };

  if (isFailed) {
    EventBus.getInstance().emitOrderRejected({ order, timestamp: new Date() });
  } else {
    EventBus.getInstance().emitOrderFilled({ order, timestamp: new Date() });
  }

  await sleep(500);
  await tracker.stop();

  if (useRealPush) {
    await dataManager.close();
  }
}

main().catch(() => {
  process.exit(1);
});
