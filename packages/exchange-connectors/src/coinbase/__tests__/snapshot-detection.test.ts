/**
 * Unit test for Coinbase Initial Snapshot Detection
 *
 * Tests that the CoinbaseExchange correctly:
 * 1. Detects initial snapshot when receiving batches of 50 orders
 * 2. Suppresses orderUpdate events during snapshot
 * 3. Resumes normal event emission after snapshot completes
 * 4. Resets state on reconnection
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { CoinbaseExchange } from '@itrade/exchange-connectors';

describe('CoinbaseExchange - Initial Snapshot Detection', () => {
  let exchange: CoinbaseExchange;
  let orderUpdateCount: number;
  let receivedOrders: any[];

  beforeEach(() => {
    exchange = new CoinbaseExchange();
    orderUpdateCount = 0;
    receivedOrders = [];

    // Listen for orderUpdate events
    exchange.on('orderUpdate', (symbol: string, order: any) => {
      orderUpdateCount++;
      receivedOrders.push({ symbol, order });
    });
  });

  afterEach(() => {
    exchange.removeAllListeners();
  });

  /**
   * Helper function to simulate WebSocket messages
   */
  const simulateUserChannelMessage = (orders: any[]) => {
    const message = {
      channel: 'user',
      events: [
        {
          type: 'snapshot',
          orders: orders,
        },
      ],
    };
    // Access private method via type assertion
    (exchange as any).handleWebSocketMessage(message);
  };

  /**
   * Helper to create mock order data
   */
  const createMockOrder = (id: string, symbol: string = 'BTC-USD') => ({
    order_id: id,
    product_id: symbol,
    side: 'BUY',
    order_type: 'LIMIT',
    base_size: '0.01',
    limit_price: '50000',
    status: 'OPEN',
  });

  test('should suppress events for initial snapshot of 50 orders', () => {
    // Simulate first batch of 50 orders (initial snapshot)
    const orders = Array.from({ length: 50 }, (_, i) => createMockOrder(`order-${i}`));

    simulateUserChannelMessage(orders);

    // Should NOT emit any orderUpdate events during snapshot
    expect(orderUpdateCount).toBe(0);
    expect(receivedOrders).toHaveLength(0);
  });

  test('should suppress events for multiple batches until batch < 50', () => {
    // First batch: 50 orders
    simulateUserChannelMessage(
      Array.from({ length: 50 }, (_, i) => createMockOrder(`order-batch1-${i}`)),
    );
    expect(orderUpdateCount).toBe(0);

    // Second batch: 50 orders (still in snapshot)
    simulateUserChannelMessage(
      Array.from({ length: 50 }, (_, i) => createMockOrder(`order-batch2-${i}`)),
    );
    expect(orderUpdateCount).toBe(0);

    // Third batch: 9 orders (end of snapshot)
    simulateUserChannelMessage(
      Array.from({ length: 9 }, (_, i) => createMockOrder(`order-batch3-${i}`)),
    );
    expect(orderUpdateCount).toBe(0);

    // Snapshot should be complete now (109 total orders processed, 0 events emitted)
  });

  test('should emit events for new orders after snapshot completes', () => {
    // Complete the initial snapshot
    simulateUserChannelMessage(
      Array.from({ length: 50 }, (_, i) => createMockOrder(`snapshot-${i}`)),
    );
    simulateUserChannelMessage(
      Array.from({ length: 9 }, (_, i) => createMockOrder(`snapshot-last-${i}`)),
    );

    expect(orderUpdateCount).toBe(0); // No events during snapshot

    // Now send a real-time order update (after snapshot)
    simulateUserChannelMessage([createMockOrder('new-order-1', 'BTC-USD')]);

    // Should emit event for this new order
    expect(orderUpdateCount).toBe(1);
    expect(receivedOrders).toHaveLength(1);
  });

  test('should handle case with no existing orders (0 orders in first batch)', () => {
    // First message has empty orders array (account has no open orders)
    simulateUserChannelMessage([]);

    // Snapshot is complete immediately (batch < 50)
    expect(orderUpdateCount).toBe(0);

    // New order should trigger event
    simulateUserChannelMessage([createMockOrder('new-order-1')]);
    expect(orderUpdateCount).toBe(1);
  });

  test('should handle undefined orders array gracefully', () => {
    // Simulate a message with no orders field at all (edge case)
    const message = {
      channel: 'user',
      events: [
        {
          type: 'update',
          // No orders field
        },
      ],
    };
    (exchange as any).handleWebSocketMessage(message);

    // Snapshot should still be waiting (no orders array received yet)
    expect(orderUpdateCount).toBe(0);

    // When we finally get the orders array (even if empty), snapshot completes
    simulateUserChannelMessage([]);
    expect(orderUpdateCount).toBe(0);

    // New order should work
    simulateUserChannelMessage([createMockOrder('new-order-1')]);
    expect(orderUpdateCount).toBe(1);
  });

  test('should handle case with exactly 50 existing orders', () => {
    // First batch: 50 orders (full batch, might be more)
    simulateUserChannelMessage(
      Array.from({ length: 50 }, (_, i) => createMockOrder(`order-${i}`)),
    );
    expect(orderUpdateCount).toBe(0);

    // Second batch: 0 orders (end of snapshot)
    simulateUserChannelMessage([]);
    expect(orderUpdateCount).toBe(0);

    // New orders should now trigger events
    simulateUserChannelMessage([createMockOrder('new-order-1')]);
    expect(orderUpdateCount).toBe(1);
  });

  test('should handle single batch with < 50 orders', () => {
    // Single batch with 25 orders (snapshot complete immediately)
    simulateUserChannelMessage(
      Array.from({ length: 25 }, (_, i) => createMockOrder(`order-${i}`)),
    );

    // No events for snapshot
    expect(orderUpdateCount).toBe(0);

    // New order should trigger event
    simulateUserChannelMessage([createMockOrder('new-order-1')]);
    expect(orderUpdateCount).toBe(1);
  });

  test('should reset snapshot state on reconnection', () => {
    // Complete first snapshot
    simulateUserChannelMessage(
      Array.from({ length: 50 }, (_, i) => createMockOrder(`first-${i}`)),
    );
    simulateUserChannelMessage(
      Array.from({ length: 9 }, (_, i) => createMockOrder(`first-last-${i}`)),
    );

    // Verify snapshot complete - new orders trigger events
    simulateUserChannelMessage([createMockOrder('after-first-snapshot')]);
    expect(orderUpdateCount).toBe(1);

    // Simulate reconnection
    (exchange as any).resetInitialSnapshotState();

    // After reset, new snapshot should suppress events again
    simulateUserChannelMessage(
      Array.from({ length: 50 }, (_, i) => createMockOrder(`reconnect-${i}`)),
    );

    // Should still be 1 (no new events during second snapshot)
    expect(orderUpdateCount).toBe(1);

    // Complete second snapshot
    simulateUserChannelMessage(
      Array.from({ length: 10 }, (_, i) => createMockOrder(`reconnect-last-${i}`)),
    );

    // New order after second snapshot should trigger event
    simulateUserChannelMessage([createMockOrder('after-reconnect')]);
    expect(orderUpdateCount).toBe(2);
  });

  test('should track total snapshot order count correctly', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    // First batch: 50
    simulateUserChannelMessage(
      Array.from({ length: 50 }, (_, i) => createMockOrder(`order-${i}`)),
    );

    // Second batch: 50
    simulateUserChannelMessage(
      Array.from({ length: 50 }, (_, i) => createMockOrder(`order-${i + 50}`)),
    );

    // Final batch: 9 (total = 109)
    simulateUserChannelMessage(
      Array.from({ length: 9 }, (_, i) => createMockOrder(`order-${i + 100}`)),
    );

    // Check that the completion message logged the correct total
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Initial snapshot complete - received 109 existing orders'),
    );

    consoleLogSpy.mockRestore();
  });
});
