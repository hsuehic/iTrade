/**
 * Test OKX API Key Permissions
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { OKXExchange } from '@itrade/exchange-connectors';

dotenv.config({ path: resolve(__dirname, '../../.env') });

async function testOKXPermissions() {
  console.log('🧪 Testing OKX API Key Permissions...\n');

  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;

  if (!apiKey || !secretKey || !passphrase) {
    console.error('❌ Error: OKX credentials not found');
    process.exit(1);
  }

  const exchange = new OKXExchange(false);
  await exchange.connect({ apiKey, secretKey, passphrase });

  console.log('✅ Connected to OKX\n');
  console.log('Testing different API endpoints:\n');

  // 1. Test public endpoint (no auth needed)
  try {
    console.log('1️⃣  Testing public endpoint (getTicker)...');
    const ticker = await exchange.getTicker('WLD/USDT:USDT');
    console.log(`   ✅ SUCCESS - Last price: ${ticker.last}\n`);
  } catch (error: any) {
    console.error(`   ❌ FAILED: ${error.message}\n`);
  }

  // 2. Test account info (requires Read permission)
  try {
    console.log('2️⃣  Testing account endpoint (getBalances)...');
    const account = await exchange.getBalances();
    console.log(`   ✅ SUCCESS - Found ${account.balances.length} balances\n`);
  } catch (error: any) {
    console.error(`   ❌ FAILED: ${error.message}\n`);
  }

  // 3. Test positions (requires Read permission)
  try {
    console.log('3️⃣  Testing positions endpoint (getPositions)...');
    const positions = await exchange.getPositions();
    console.log(`   ✅ SUCCESS - Found ${positions.length} positions\n`);
  } catch (error: any) {
    console.error(`   ❌ FAILED: ${error.message}\n`);
  }

  // 4. Test open orders (requires Trade permission - Read part)
  try {
    console.log('4️⃣  Testing open orders endpoint (getOpenOrders)...');
    const orders = await exchange.getOpenOrders('WLD/USDT:USDT');
    console.log(`   ✅ SUCCESS - Found ${orders.length} open orders\n`);
  } catch (error: any) {
    console.error(`   ❌ FAILED: ${error.message}`);
    if (error.message.includes('401')) {
      console.error('   ⚠️  This suggests your API Key lacks Trade permission\n');
    }
  }

  console.log('\n📊 Summary:');
  console.log('If endpoint 4 (getOpenOrders) failed with 401:');
  console.log('  → Your API Key needs "Trade" permission enabled');
  console.log('  → Go to OKX website → API Management → Edit API Key');
  console.log('  → Enable "Trade" permission checkbox');
  console.log('  → You may also need to enable "Read" permission\n');

  await exchange.disconnect();
}

testOKXPermissions().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
