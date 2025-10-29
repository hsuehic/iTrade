/**
 * Integration test for CoinbaseAdvancedExchange
 */

import { CoinbaseAdvancedExchange } from './CoinbaseAdvancedExchange';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment
dotenv.config({ path: path.join(__dirname, '../../../../apps/console/.env') });

async function testCoinbaseAdvanced() {
  console.log('🚀 Testing CoinbaseAdvancedExchange...\n');

  const exchange = new CoinbaseAdvancedExchange();

  // Connect
  console.log('📡 Connecting...');
  await exchange.connect({
    apiKey: process.env.COINBASE_API_KEY!,
    secretKey: process.env.COINBASE_SECRET_KEY!,
  });

  console.log('✅ Connected\n');

  // Test REST API
  console.log('📊 Testing REST API...\n');

  try {
    console.log('1️⃣ Getting balances...');
    const balances = await exchange.getBalances();
    console.log(`   Found ${balances.length} balances:`);
    balances.forEach((b) => {
      if (b.total.greaterThan(0)) {
        console.log(`   - ${b.asset}: ${b.total} (free: ${b.free}, locked: ${b.locked})`);
      }
    });
    console.log();
  } catch (err: any) {
    console.error('   ❌ Error:', err.message);
  }

  try {
    console.log('2️⃣ Getting positions...');
    const positions = await exchange.getPositions();
    console.log(`   Found ${positions.length} positions:`);
    positions.forEach((p) => {
      console.log(
        `   - ${p.symbol}: ${p.side} ${p.quantity} @ ${p.avgPrice} (PnL: ${p.unrealizedPnl})`,
      );
    });
    console.log();
  } catch (err: any) {
    console.error('   ❌ Error:', err.message);
  }

  // Test WebSocket
  console.log('📡 Testing WebSocket...\n');

  // Setup listeners
  exchange.on('accountUpdate', (data: any) => {
    console.log(`💰 Account Update: ${data.balances.length} balances`);
    data.balances.forEach((b: any) => {
      if (b.total.greaterThan(0)) {
        console.log(`   - ${b.asset}: ${b.total}`);
      }
    });
  });

  exchange.on('positionUpdate', (data: any) => {
    console.log(`📊 Position Update: ${data.positions.length} positions`);
    data.positions.forEach((p: any) => {
      console.log(`   - ${p.symbol}: ${p.side} ${p.quantity}`);
    });
  });

  exchange.on('orderUpdate', (data) => {
    console.log(`📦 Order Update: ${data.symbol} - ${data.order.status}`);
  });

  console.log('3️⃣ Subscribing to user data...');
  await exchange.subscribeToUserData();
  console.log('   ✅ Subscribed\n');

  // Wait for updates
  console.log('⏰ Waiting for WebSocket updates (30 seconds)...\n');
  await new Promise((resolve) => setTimeout(resolve, 30000));

  // Disconnect
  console.log('\n🛑 Disconnecting...');
  await exchange.disconnect();
  console.log('✅ Test complete!');
}

// Run test
if (require.main === module) {
  testCoinbaseAdvanced()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}
