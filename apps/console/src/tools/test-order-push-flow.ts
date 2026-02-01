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

const logger = new ConsoleLogger(LogLevel.INFO);

type MockPushNotificationService = {
  notifyOrderFill(order: Order, kind: 'filled' | 'partial'): Promise<void>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function buildMockPushService(): MockPushNotificationService {
  return {
    async notifyOrderFill(order: Order, kind: 'filled' | 'partial'): Promise<void> {
      logger.info(
        `✅ Mock push invoked (${kind}) for order ${order.id} (${order.symbol})`,
      );
    },
  };
}

async function createDataManager(): Promise<TypeOrmDataManager> {
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
  return dataManager;
}

async function main(): Promise<void> {
  const userId = process.env.USER_ID ?? 'test-user';
  const useRealPush = process.env.USE_REAL_PUSH === 'true';
  const includeUserId = process.env.ORDER_HAS_USER_ID === 'true';

  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('🧪 Testing Order Filled Push Flow');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info(`User scoped bot: ${userId}`);
  logger.info(`Order payload has userId: ${includeUserId}`);
  logger.info(`Use real push provider: ${useRealPush}`);

  const dataManager = useRealPush
    ? await createDataManager()
    : ({
        saveOrder: async () => {},
        getStrategy: async () => null,
      } as unknown as TypeOrmDataManager);

  const pushService = useRealPush
    ? new PushNotificationService(dataManager, logger, { defaultUserId: userId })
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
    status: OrderStatus.FILLED,
    timeInForce: TimeInForce.GTC,
    timestamp: new Date(),
    executedQuantity: new Decimal('0.01'),
    updateTime: new Date(),
    exchange: process.env.PUSH_TEST_EXCHANGE ?? 'okx',
    userId: includeUserId ? userId : undefined,
  };

  logger.info(`Emitting OrderFilled event for ${order.id}`);
  EventBus.getInstance().emitOrderFilled({ order, timestamp: new Date() });

  await sleep(500);
  await tracker.stop();

  if (useRealPush) {
    await dataManager.close();
  }

  logger.info('✅ Order filled push flow test completed');
}

main().catch((error) => {
  logger.error('❌ Order filled push flow test failed', error as Error);
  process.exit(1);
});
