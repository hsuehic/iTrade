import { SubscriptionCoordinator, LogLevel } from '@itrade/core';
import { ConsoleLogger } from '@itrade/logger';
import { BinanceExchange } from '@itrade/exchange-connectors';

/**
 * Demo: Subscription Coordinator with refactored architecture
 *
 * This example demonstrates:
 * 1. Clear separation of concerns
 * 2. Subscription reference counting
 * 3. Coordination between strategies and exchanges
 */

const logger = new ConsoleLogger(LogLevel.INFO);
const coordinator = new SubscriptionCoordinator(logger);

// Create a mock exchange
const exchange = new BinanceExchange(true); // testnet

async function runSubscriptionDemo() {
  try {
    await exchange.connect({
      apiKey: 'test',
      secretKey: 'test',
      sandbox: true,
    });

    logger.info('Exchange connected');

    // Subscribe Strategy 1 to ticker
    await coordinator.subscribe(
      'MA Strategy 1',
      exchange,
      'BTC/USDT',
      'ticker',
      {},
      'websocket'
    );

    // Subscribe Strategy 2 to the same ticker (reference counting)
    await coordinator.subscribe(
      'MA Strategy 2',
      exchange,
      'BTC/USDT',
      'ticker',
      {},
      'websocket'
    );

    // Subscribe Strategy 2 to klines with different interval
    await coordinator.subscribe(
      'MA Strategy 2',
      exchange,
      'BTC/USDT',
      'klines',
      { interval: '1m' },
      'websocket'
    );

    console.log('\n=== Subscription Stats ===');
    console.log(JSON.stringify(coordinator.getStats(), null, 2));

    console.log('\n=== Strategy 2 Subscriptions ===');
    console.log(
      JSON.stringify(
        coordinator.getStrategySubscriptions('MA Strategy 2'),
        null,
        2
      )
    );

    // Unsubscribe Strategy 1 (subscription should remain for Strategy 2)
    await coordinator.unsubscribe(
      'MA Strategy 1',
      exchange,
      'BTC/USDT',
      'ticker',
      {}
    );

    console.log('\n=== After Unsubscribing Strategy 1 ===');
    console.log(JSON.stringify(coordinator.getStats(), null, 2));

    // Unsubscribe Strategy 2 (subscription should be removed)
    await coordinator.unsubscribe(
      'MA Strategy 2',
      exchange,
      'BTC/USDT',
      'ticker',
      {}
    );

    console.log('\n=== After Unsubscribing Strategy 2 ===');
    console.log(JSON.stringify(coordinator.getStats(), null, 2));

    // Cleanup
    await coordinator.clear();
    await exchange.disconnect();

    console.log('\n✅ Subscription demo completed successfully!');
  } catch (error) {
    console.error('❌ Error in subscription demo:', error);
    throw error;
  }
}

// Run the demo
runSubscriptionDemo().catch(console.error);
