/**
 * Test Order-Strategy-Exchange Association
 *
 * This script tests the complete order-strategy-exchange association mechanism:
 * 1. Create a test strategy in database
 * 2. Create a mock order with association metadata
 * 3. Save order to database
 * 4. Query and verify associations
 * 5. Clean up test data
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
 *        src/test-order-strategy-association.ts
 */

import 'reflect-metadata';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { Decimal } from 'decimal.js';
import { ConsoleLogger, LogLevel } from '@itrade/core';
import { OrderSide, OrderStatus, OrderType, TimeInForce } from '@itrade/core';
import { TypeOrmDataManager, StrategyStatus } from '@itrade/data-manager';

// Load environment variables
dotenv.config();

const logger = new ConsoleLogger(LogLevel.INFO);

async function main() {
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('🧪 Testing Order-Strategy-Exchange Association');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Initialize database connection
  logger.info('\n📦 Step 1: Initialize Database Connection');
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

  let testStrategyId: number | undefined;
  let testOrderId: string | undefined;
  let testUserId: string | undefined;

  try {
    // Step 2: Get or create test user
    logger.info('\n📦 Step 2: Get or Create Test User');

    // Query existing user from database
    const userRepo = (dataManager as any).dataSource.getRepository('User');
    const users = await userRepo.find({ take: 1, order: { createdAt: 'ASC' } });
    let testUser = users[0];

    if (testUser) {
      logger.info(`✅ Using Existing User: ID=${testUser.id}`);
    } else {
      // Create a minimal test user if none exists
      testUser = await userRepo.save({
        id: `test-user-${Date.now()}`,
        email: `test_${Date.now()}@example.com`,
        name: 'Test User',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      logger.info(`✅ Test User Created: ID=${testUser.id}`);
    }

    testUserId = testUser.id;

    // Step 3: Create a test strategy
    logger.info('\n📦 Step 3: Create Test Strategy');

    const testStrategy = await dataManager.createStrategy({
      name: `TEST_ORDER_ASSOC_${Date.now()}`,
      description: 'Test strategy for order association',
      type: 'MovingAverageStrategy', // Strategy class name
      status: StrategyStatus.STOPPED,
      exchange: 'binance',
      symbol: 'BTC/USDT',
      parameters: {
        fastPeriod: 10,
        slowPeriod: 20,
      },
      userId: testUserId!,
    });

    testStrategyId = testStrategy.id;
    logger.info(
      `✅ Test Strategy Created: ID=${testStrategyId}, Name=${testStrategy.name}`,
    );

    // Step 4: Create a mock order with association metadata
    logger.info('\n📦 Step 4: Create Mock Order with Associations');

    const timestamp = Date.now();
    const clientOrderId = `s-${testStrategyId}-${timestamp}`;

    testOrderId = randomUUID();
    const mockOrder = {
      id: testOrderId,
      clientOrderId: clientOrderId,
      symbol: 'BTC/USDT',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      quantity: new Decimal('0.001'),
      price: new Decimal('50000'),
      stopLoss: new Decimal('49000'),
      takeProfit: new Decimal('51000'),
      status: OrderStatus.FILLED,
      timeInForce: TimeInForce.GTC,
      timestamp: new Date(),
      executedQuantity: new Decimal('0.001'),
      cummulativeQuoteQuantity: new Decimal('50'),

      // 🆕 Association metadata (from strategy object, not hardcoded)
      exchange: testStrategy.exchange || 'binance',
      strategyId: testStrategyId,
      strategyType: testStrategy.type, // 🆕 Strategy type/class (e.g., "moving_average")
      strategyName: testStrategy.name, // 🆕 User-defined strategy name

      // Strategy relation
      strategy: { id: testStrategyId } as any,
    };

    logger.info('📋 Mock Order Details:');
    logger.info(`   ID: ${mockOrder.id}`);
    logger.info(`   ClientOrderId: ${mockOrder.clientOrderId}`);
    logger.info(`   Symbol: ${mockOrder.symbol}`);
    logger.info(`   Side: ${mockOrder.side}`);
    logger.info(`   Quantity: ${mockOrder.quantity.toString()}`);
    logger.info(`   Price: ${mockOrder.price.toString()}`);
    logger.info(`   Exchange: ${mockOrder.exchange}`);
    logger.info(`   StrategyId: ${mockOrder.strategyId}`);
    logger.info(`   StrategyType: ${mockOrder.strategyType}`); // 🆕 Strategy type/class
    logger.info(`   StrategyName: ${mockOrder.strategyName}`);

    // Step 5: Save order to database
    logger.info('\n📦 Step 5: Save Order to Database');
    const savedOrder = await dataManager.saveOrder(mockOrder);
    logger.info(`✅ Order Saved: ID=${savedOrder.id}`);

    // Step 6: Query order and verify associations
    logger.info('\n📦 Step 6: Query Order and Verify Associations');

    // Query by ID (without relations)
    if (!testOrderId) {
      throw new Error('Test order ID is undefined!');
    }
    const queriedOrder = await dataManager.getOrder(testOrderId);
    if (!queriedOrder) {
      throw new Error('Order not found!');
    }

    logger.info('✅ Order Retrieved from Database:');
    logger.info(`   ID: ${queriedOrder.id}`);
    logger.info(`   ClientOrderId: ${queriedOrder.clientOrderId}`);
    logger.info(`   Symbol: ${queriedOrder.symbol}`);
    logger.info(`   Exchange: ${queriedOrder.exchange || 'NOT SET ❌'}`);
    logger.info(`   StrategyType: ${queriedOrder.strategyType || 'NOT SET ❌'}`); // Strategy type/class
    logger.info(`   StrategyName: ${queriedOrder.strategyName || 'NOT SET ❌'}`);

    // Query with strategy relation
    logger.info('\n📦 Step 7: Query Order with Strategy Relation');
    const orders = await dataManager.getOrders({
      includeStrategy: true,
    });

    const testOrderWithRelation = orders.find((o) => o.id === testOrderId);
    if (!testOrderWithRelation) {
      throw new Error('Order not found in query results!');
    }

    logger.info('✅ Order with Strategy Relation:');
    logger.info(`   Order ID: ${testOrderWithRelation.id}`);
    logger.info(`   Exchange: ${testOrderWithRelation.exchange || 'NOT SET ❌'}`);
    logger.info(`   StrategyType: ${testOrderWithRelation.strategyType || 'NOT SET ❌'}`); // Strategy type/class
    logger.info(`   StrategyName: ${testOrderWithRelation.strategyName || 'NOT SET ❌'}`);
    logger.info(
      `   Strategy Relation: ${testOrderWithRelation.strategy ? '✅ Loaded' : '❌ NOT Loaded'}`,
    );
    if (testOrderWithRelation.strategy) {
      logger.info(`   Strategy ID: ${testOrderWithRelation.strategy.id}`);
      logger.info(`   Strategy Name: ${testOrderWithRelation.strategy.name}`);
      logger.info(`   Strategy Exchange: ${testOrderWithRelation.strategy.exchange}`);
    }

    // Step 8: Verify all associations
    logger.info('\n📦 Step 8: Verify All Associations');

    const checks = {
      orderExists: !!queriedOrder,
      exchangeSet: !!queriedOrder.exchange,
      strategyTypeSet: !!queriedOrder.strategyType, // 🆕 Check strategyType is set
      strategyNameSet: !!queriedOrder.strategyName,
      strategyRelationLoaded: !!testOrderWithRelation.strategy,
      strategyIdMatch: testOrderWithRelation.strategy?.id === testStrategyId,
      exchangeMatch: queriedOrder.exchange === testStrategy.exchange,
      strategyTypeMatch: queriedOrder.strategyType === testStrategy.type, // 🆕 Check type matches
      strategyNameMatch: queriedOrder.strategyName === testStrategy.name, // 🆕 Check name matches
      clientOrderIdFormat: queriedOrder.clientOrderId?.startsWith(`s-${testStrategyId}-`),
    };

    logger.info('\n📊 Verification Results:');
    logger.info(`   ✅ Order Exists: ${checks.orderExists}`);
    logger.info(
      `   ${checks.exchangeSet ? '✅' : '❌'} Exchange Set: ${checks.exchangeSet}`,
    );
    logger.info(
      `   ${checks.strategyTypeSet ? '✅' : '❌'} StrategyType Set: ${checks.strategyTypeSet}`,
    );
    logger.info(
      `   ${checks.strategyNameSet ? '✅' : '❌'} StrategyName Set: ${checks.strategyNameSet}`,
    );
    logger.info(
      `   ${checks.strategyRelationLoaded ? '✅' : '❌'} Strategy Relation Loaded: ${checks.strategyRelationLoaded}`,
    );
    logger.info(
      `   ${checks.strategyIdMatch ? '✅' : '❌'} Strategy ID Match: ${checks.strategyIdMatch}`,
    );
    logger.info(
      `   ${checks.exchangeMatch ? '✅' : '❌'} Exchange Match: ${checks.exchangeMatch}`,
    );
    logger.info(
      `   ${checks.strategyTypeMatch ? '✅' : '❌'} StrategyType Match: ${checks.strategyTypeMatch}`,
    );
    logger.info(
      `   ${checks.strategyNameMatch ? '✅' : '❌'} StrategyName Match: ${checks.strategyNameMatch}`,
    );
    logger.info(
      `   ${checks.clientOrderIdFormat ? '✅' : '❌'} ClientOrderId Format: ${checks.clientOrderIdFormat}`,
    );

    const allChecksPassed = Object.values(checks).every((check) => check === true);

    if (allChecksPassed) {
      logger.info('\n🎉 All Checks PASSED! ✅');
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.info('✅ Order-Strategy-Exchange Association Working Correctly!');
    } else {
      logger.error('\n❌ Some Checks FAILED!');
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      const failedChecks = Object.entries(checks)
        .filter(([_, passed]) => !passed)
        .map(([check]) => check);
      logger.error(`Failed checks: ${failedChecks.join(', ')}`);
    }

    // Step 9: Test query by strategyId
    logger.info('\n📦 Step 9: Test Query Orders by StrategyId');
    const strategyOrders = await dataManager.getOrders({
      strategyId: testStrategyId,
      includeStrategy: true,
    });

    logger.info(
      `✅ Found ${strategyOrders.length} order(s) for strategy ${testStrategyId}`,
    );
    strategyOrders.forEach((order, index) => {
      logger.info(`   Order ${index + 1}:`);
      logger.info(`     ID: ${order.id}`);
      logger.info(`     Symbol: ${order.symbol}`);
      logger.info(`     Exchange: ${order.exchange}`);
      logger.info(`     StrategyType: ${order.strategyType}`); // Strategy type/class
      logger.info(`     StrategyName: ${order.strategyName}`);
    });
  } catch (error) {
    logger.error('❌ Test Failed:', error as Error);
    throw error;
  } finally {
    // Step 10: Clean up test data
    logger.info('\n📦 Step 10: Clean Up Test Data');

    if (testStrategyId) {
      try {
        await dataManager.deleteStrategy(testStrategyId);
        logger.info(`✅ Deleted test strategy: ${testStrategyId}`);
      } catch (error) {
        logger.warn(
          `Failed to delete strategy ${testStrategyId}:`,
          error as Record<string, unknown>,
        );
      }
    }

    await dataManager.close();
    logger.info('✅ Database connection closed');
  }

  logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('✅ Test Completed Successfully!');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
