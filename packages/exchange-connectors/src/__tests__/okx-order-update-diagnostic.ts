/**
 * OKX Order Update Diagnostic Script
 * 
 * This script helps diagnose why take profit orders are not being placed for OKX.
 * 
 * To run this test:
 * 1. Set your OKX credentials in .env file
 * 2. Run: pnpm test okx-order-update-diagnostic.ts
 * 
 * What to check:
 * 1. Are order updates being received from OKX WebSocket?
 * 2. Is updateTime being set correctly?
 * 3. Is the order status changing from NEW → FILLED?
 * 4. Is the clientOrderId preserved across updates?
 */

import { describe, it, beforeAll, afterAll } from 'vitest';
import { OKXExchange } from '../okx/OKXExchange';

describe('OKX Order Update Diagnostic', () => {
  let okx: OKXExchange;

  beforeAll(async () => {
    // Initialize OKX exchange
    okx = new OKXExchange({
      apiKey: process.env.OKX_API_KEY || '',
      secretKey: process.env.OKX_SECRET_KEY || '',
      passphrase: process.env.OKX_PASSPHRASE || '',
      sandbox: process.env.OKX_SANDBOX === 'true',
    });

    await okx.connect({
      apiKey: process.env.OKX_API_KEY || '',
      secretKey: process.env.OKX_SECRET_KEY || '',
      passphrase: process.env.OKX_PASSPHRASE || '',
      sandbox: process.env.OKX_SANDBOX === 'true',
    });
  });

  afterAll(async () => {
    if (okx) {
      await okx.disconnect();
    }
  });

  it('should listen for order updates and log diagnostic information', async () => {
    console.log('\n=== OKX ORDER UPDATE DIAGNOSTIC ===\n');
    console.log('Subscribing to user data...\n');

    // Track orders by clientOrderId
    const ordersByClientOrderId = new Map<string, any[]>();

    // Listen for order updates
    okx.on('orderUpdate', (symbol: string, order: any) => {
      console.log('─────────────────────────────────────────────────');
      console.log(`📦 ORDER UPDATE RECEIVED at ${new Date().toISOString()}`);
      console.log('─────────────────────────────────────────────────');
      console.log('Symbol:', symbol);
      console.log('Order ID:', order.id);
      console.log('Client Order ID:', order.clientOrderId);
      console.log('Status:', order.status);
      console.log('Side:', order.side);
      console.log('Quantity:', order.quantity?.toString());
      console.log('Price:', order.price?.toString());
      console.log('Executed Qty:', order.executedQuantity?.toString());
      console.log('Average Price:', order.averagePrice?.toString());
      console.log('Timestamp:', order.timestamp?.toISOString());
      console.log('Update Time:', order.updateTime?.toISOString());
      console.log('Exchange:', order.exchange);
      console.log('─────────────────────────────────────────────────\n');

      // Track order history by clientOrderId
      if (order.clientOrderId) {
        if (!ordersByClientOrderId.has(order.clientOrderId)) {
          ordersByClientOrderId.set(order.clientOrderId, []);
        }
        ordersByClientOrderId.get(order.clientOrderId)!.push({
          status: order.status,
          updateTime: order.updateTime,
          executedQuantity: order.executedQuantity?.toString(),
          timestamp: new Date(),
        });

        // Check for status transitions
        const history = ordersByClientOrderId.get(order.clientOrderId)!;
        if (history.length > 1) {
          const previous = history[history.length - 2];
          const current = history[history.length - 1];
          
          console.log('🔍 STATUS TRANSITION DETECTED:');
          console.log(`   Previous: ${previous.status} at ${previous.updateTime?.toISOString()}`);
          console.log(`   Current:  ${current.status} at ${current.updateTime?.toISOString()}`);
          
          if (previous.status !== current.status) {
            console.log(`   ✅ Status changed: ${previous.status} → ${current.status}`);
          } else {
            console.log(`   ⚠️ Status unchanged: ${previous.status}`);
          }

          if (previous.updateTime && current.updateTime) {
            const timeDiff = current.updateTime.getTime() - previous.updateTime.getTime();
            console.log(`   Time difference: ${timeDiff}ms`);
            if (timeDiff <= 0) {
              console.log('   ⚠️ WARNING: Update time is not increasing!');
              console.log('   This will prevent the strategy from detecting status changes!');
            }
          } else {
            console.log('   ⚠️ WARNING: Missing updateTime!');
          }
          console.log();
        }
      }

      // Check for FILLED status
      if (order.status === 'FILLED') {
        console.log('🎉 ORDER FILLED!');
        console.log('   This should trigger take profit signal generation.');
        console.log('   Check if strategy.analyze() receives this order update.');
        console.log();
      }
    });

    // Subscribe to user data
    try {
      await okx.subscribeToUserData();
      console.log('✅ Subscribed to OKX user data stream\n');
      console.log('Monitoring order updates...');
      console.log('Place a test order on OKX to see the diagnostic output.\n');
      console.log('Press Ctrl+C to stop.\n');
    } catch (error) {
      console.error('❌ Failed to subscribe to user data:', error);
      throw error;
    }

    // Keep the test running for 5 minutes to monitor orders
    await new Promise((resolve) => setTimeout(resolve, 300000));
  }, 310000); // 5 minute timeout

  it('should check if exchange is properly connected', async () => {
    console.log('\n=== CONNECTION CHECK ===\n');
    console.log('Exchange Name:', okx.name);
    console.log('Is Connected:', okx.isConnected);
    console.log('Is Testnet:', (okx as any)._isTestnet);
    console.log();
  });
});

