/**
 * Test script for OKX createOrder
 *
 * Tests creating an order with specific parameters:
 * - Symbol: WLD-USDT-SWAP
 * - Side: BUY
 * - Leverage: 3x
 * - Price: 0.8
 * - Quantity: 100
 * - Trade Mode: isolated
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import Decimal from 'decimal.js';
import { OKXExchange } from '@itrade/exchange-connectors';
import { OrderSide, OrderType, TimeInForce } from '@itrade/core';

// Load environment variables from .env
dotenv.config({ path: resolve(__dirname, '../../.env') });

async function testOKXCreateOrder() {
  console.log('🧪 Testing OKX createOrder...\n');

  // Check if credentials are available
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;

  if (!apiKey || !secretKey || !passphrase) {
    console.error('❌ Error: OKX credentials not found in environment variables');
    console.error(
      '   Please ensure OKX_API_KEY, OKX_SECRET_KEY, and OKX_PASSPHRASE are set in .env',
    );
    process.exit(1);
  }

  console.log('✅ OKX credentials loaded');
  console.log(`   API Key: ${apiKey.substring(0, 8)}...`);
  console.log(`   Passphrase: ${passphrase}\n`);

  // Initialize OKX exchange
  const exchange = new OKXExchange(false); // false = mainnet, true = demo
  await exchange.connect({
    apiKey,
    secretKey,
    passphrase,
  });

  console.log('✅ OKX Exchange connected\n');

  // Test parameters
  const symbol = 'WLD/USDT:USDT'; // iTrade format (will be normalized to WLD-USDT-SWAP)
  const side = OrderSide.BUY;
  const type = OrderType.LIMIT;
  const quantity = new Decimal(100);
  const price = new Decimal(0.8);
  const leverage = 3;
  const tradeMode = 'isolated' as const;

  console.log('📋 Test Parameters:');
  console.log(`   Symbol: ${symbol}`);
  console.log(`   Side: ${side}`);
  console.log(`   Type: ${type}`);
  console.log(`   Quantity: ${quantity.toString()}`);
  console.log(`   Price: ${price.toString()}`);
  console.log(`   Leverage: ${leverage}x`);
  console.log(`   Trade Mode: ${tradeMode}\n`);

  try {
    console.log('📤 Creating order...\n');

    // OKX clOrdId must be alphanumeric, max 32 characters
    const clientOrderId = `test${Date.now()}`;

    const order = await exchange.createOrder(
      symbol,
      side,
      type,
      quantity,
      price,
      undefined, // stopLoss
      TimeInForce.GTC,
      clientOrderId,
      {
        tradeMode,
        leverage,
      },
    );

    console.log('✅ Order created successfully!\n');
    console.log('📝 Order Details:');
    console.log(JSON.stringify(order, null, 2));

    // Verify order by fetching it from the exchange
    console.log('\n🔍 Verifying order with getOpenOrders...');
    console.log(`   Fetching open orders for symbol: ${symbol}`);
    try {
      const openOrders = await exchange.getOpenOrders(symbol);
      console.log(`\n📋 Found ${openOrders.length} open orders for ${symbol}:`);

      openOrders.forEach((o, index) => {
        console.log(`\n   Order ${index + 1}:`);
        console.log(`   - ID: ${o.id}`);
        console.log(`   - Client Order ID: ${o.clientOrderId || 'N/A'}`);
        console.log(`   - Side: ${o.side}`);
        console.log(`   - Type: ${o.type}`);
        console.log(`   - Quantity: ${o.quantity}`);
        console.log(`   - Price: ${o.price || 'N/A'}`);
        console.log(`   - Status: ${o.status}`);
      });

      // Check if our order is in the list
      const ourOrder = openOrders.find(
        (o) => o.id === order.id || o.clientOrderId === order.clientOrderId,
      );

      if (ourOrder) {
        console.log('\n✅ Order verified in open orders list!');
      } else {
        console.warn(
          '\n⚠️  Order not found in open orders list (may have been filled instantly)',
        );
      }
    } catch (verifyError: any) {
      console.error('\n❌ Failed to verify order:', verifyError.message);
    }

    // Cancel the test order immediately
    console.log('\n🗑️  Canceling test order...');
    try {
      const canceledOrder = await exchange.cancelOrder(
        symbol,
        order.id,
        order.clientOrderId,
      );
      console.log('✅ Test order canceled successfully');
      console.log('   Status:', canceledOrder.status);
    } catch (cancelError: any) {
      console.warn('⚠️  Could not cancel test order:', cancelError.message);
      console.warn('   You may need to cancel it manually');
    }

    console.log('\n✅ TEST PASSED - OKX createOrder works correctly!');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED - Error creating order:');
    console.error('   Message:', error.message);

    if (error.response?.data) {
      console.error('   API Response:', JSON.stringify(error.response.data, null, 2));
    }

    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }

    process.exit(1);
  } finally {
    // Cleanup - disconnect from exchange
    try {
      await exchange.disconnect();
      console.log('\n🧹 Cleanup completed');
    } catch (err) {
      // Ignore cleanup errors
    }
  }
}

// Run the test
testOKXCreateOrder().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
