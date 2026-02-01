/**
 * Test Strategy Deletion with Associated Orders
 *
 * Verifies that deleting a strategy with linked orders succeeds and
 * the orders have their strategyId cleared (ON DELETE SET NULL).
 */

import 'reflect-metadata';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { Decimal } from 'decimal.js';
import { ConsoleLogger, LogLevel } from '@itrade/core';
import { OrderSide, OrderStatus, OrderType, TimeInForce } from '@itrade/core';
import {
  OrderEntity,
  StrategyStatus,
  TypeOrmDataManager,
  User,
} from '@itrade/data-manager';

dotenv.config();

const logger = new ConsoleLogger(LogLevel.INFO);

async function main() {
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('🧪 Testing Strategy Deletion with Associated Orders');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const dataManager = new TypeOrmDataManager({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DB || 'itrade',
    ssl: process.env.DB_SSL === 'true',
    logging: false,
    synchronize: false,
  });

  await dataManager.initialize();
  logger.info('✅ Database connected');

  type RepositoryLike<T> = {
    find: (options: {
      order?: Record<string, 'ASC' | 'DESC'>;
      take?: number;
    }) => Promise<T[]>;
    findOne: (options: {
      order?: Record<string, 'ASC' | 'DESC'>;
      where?: Record<string, unknown>;
    }) => Promise<T | null>;
    save: (entity: Partial<T>) => Promise<T>;
    delete: (criteria: Record<string, unknown>) => Promise<void>;
  };

  type DataSourceLike = {
    getRepository: <T>(entity: new () => T) => RepositoryLike<T>;
  };

  const dataSource = (dataManager as unknown as { dataSource: DataSourceLike })
    .dataSource;
  const userRepo = dataSource.getRepository(User);
  const orderRepo = dataSource.getRepository(OrderEntity);

  let strategyId: number | undefined;
  let orderId: string | undefined;
  let userId: string | undefined;

  try {
    logger.info('\n📦 Step 1: Get or Create Test User');
    const users = await userRepo.find({ order: { createdAt: 'ASC' }, take: 1 });
    const existingUser = users[0];
    const user =
      existingUser ??
      (await userRepo.save({
        id: `test-user-${Date.now()}`,
        email: `test_${Date.now()}@example.com`,
        name: 'Test User',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

    userId = user.id;
    if (!userId) {
      throw new Error('User ID is missing');
    }
    logger.info(`✅ Using User: ID=${userId}`);

    logger.info('\n📦 Step 2: Create Test Strategy');
    const strategy = await dataManager.createStrategy({
      name: `TEST_DELETE_STRATEGY_${Date.now()}`,
      description: 'Test strategy for delete-with-orders',
      type: 'MovingAverageStrategy',
      status: StrategyStatus.STOPPED,
      exchange: 'binance',
      symbol: 'BTC/USDT',
      parameters: {
        fastPeriod: 5,
        slowPeriod: 10,
      },
      userId,
    });

    strategyId = strategy.id;
    logger.info(`✅ Strategy created: ID=${strategyId}`);

    logger.info('\n📦 Step 3: Create Test Order linked to Strategy');
    orderId = randomUUID();
    const order = {
      id: orderId,
      clientOrderId: `s-${strategyId}-${Date.now()}`,
      symbol: 'BTC/USDT',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      quantity: new Decimal('0.001'),
      price: new Decimal('50000'),
      status: OrderStatus.FILLED,
      timeInForce: TimeInForce.GTC,
      timestamp: new Date(),
      executedQuantity: new Decimal('0.001'),
      cummulativeQuoteQuantity: new Decimal('50'),
      exchange: strategy.exchange || 'binance',
      strategyId,
      strategyType: strategy.type,
      strategyName: strategy.name,
    };

    await dataManager.saveOrder(order);
    logger.info(`✅ Order created: ID=${orderId}`);

    logger.info('\n📦 Step 4: Delete Strategy');
    await dataManager.deleteStrategy(strategyId);
    logger.info(`✅ Strategy deleted: ID=${strategyId}`);

    logger.info('\n📦 Step 5: Verify Strategy Deleted');
    const deletedStrategy = await dataManager.getStrategy(strategyId);
    if (deletedStrategy) {
      throw new Error('Strategy still exists after deletion');
    }
    logger.info('✅ Strategy no longer exists');

    logger.info('\n📦 Step 6: Verify Order StrategyId Cleared');
    const updatedOrder = await orderRepo.findOne({ where: { id: orderId } });
    if (!updatedOrder) {
      throw new Error('Order not found after strategy deletion');
    }
    if (updatedOrder.strategyId !== null && updatedOrder.strategyId !== undefined) {
      throw new Error(
        `Expected order.strategyId to be null, got ${updatedOrder.strategyId}`,
      );
    }
    logger.info('✅ Order.strategyId cleared (SET NULL)');

    logger.info('\n🎉 All Checks PASSED! ✅');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error) {
    logger.error('❌ Test Failed:', error as Error);
    throw error;
  } finally {
    logger.info('\n📦 Cleanup: Delete Test Order');
    if (orderId) {
      try {
        await orderRepo.delete({ id: orderId });
        logger.info(`✅ Deleted test order: ${orderId}`);
      } catch (cleanupError) {
        logger.warn(
          'Failed to delete test order:',
          cleanupError as Record<string, unknown>,
        );
      }
    }

    await dataManager.close();
    logger.info('✅ Database connection closed');
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
