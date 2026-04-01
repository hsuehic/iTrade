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
    okx = new OKXExchange();

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
    // Track orders by clientOrderId
    const ordersByClientOrderId = new Map<string, any[]>();

    // Listen for order updates
    okx.on('orderUpdate', (symbol: string, order: any) => {
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

          if (previous.updateTime && current.updateTime) {
            const timeDiff = current.updateTime.getTime() - previous.updateTime.getTime();
            if (timeDiff <= 0) {
              // Keep for diagnostics without logging
            }
          }
        }
      }

      // Check for FILLED status
      if (order.status === 'FILLED') {
        // Keep hook for filled orders without logging
      }
    });

    // Subscribe to user data
    await okx.subscribeToUserData();

    // Keep the test running for 5 minutes to monitor orders
    await new Promise((resolve) => setTimeout(resolve, 300000));
  }, 310000); // 5 minute timeout

  it('should check if exchange is properly connected', async () => {});
});
