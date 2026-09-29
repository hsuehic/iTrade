import { describe, expect, it } from 'vitest';
import { CoinbaseExchange } from '../coinbase/CoinbaseExchange';

/**
 * Strategy 609 review (GLM MEDIUM / Opus M2): Coinbase's `transformOrder` used to
 * return its native `product_id` (`WLD-PERP-INTX`, `BTC-USD`) while the engine
 * matches orders on the unified symbol (`WLD/USDC:USDC`). Every symbol-based
 * reconciliation silently degraded to a no-op on this venue — and Coinbase has
 * no `reduce_only` field, so both oversell defences were dead here.
 */
describe('CoinbaseExchange symbol normalisation', () => {
  const ex = new CoinbaseExchange() as any;

  it('reports the unified symbol for a perpetual', () => {
    const order = ex.transformOrder({
      order_id: 'cb-1',
      client_order_id: 'T609D80D1790172800589',
      product_id: 'WLD-PERP-INTX',
      side: 'SELL',
      status: 'FILLED',
      order_configuration: {
        limit_limit_gtc: { base_size: '15000', limit_price: '0.4202' },
      },
      filled_size: '15000',
      leaves_quantity: '0',
    });

    expect(order.symbol).toBe('WLD/USDC:USDC');
  });

  it('reports the unified symbol for a spot product', () => {
    const order = ex.transformOrder({
      order_id: 'cb-2',
      product_id: 'BTC-USD',
      side: 'BUY',
      status: 'OPEN',
      order_configuration: {
        limit_limit_gtc: { base_size: '1', limit_price: '10000' },
      },
    });

    expect(order.symbol).toBe('BTC/USD');
  });

  it('passes an unmappable product id through untouched', () => {
    const order = ex.transformOrder({
      order_id: 'cb-3',
      product_id: 'UNKNOWN',
      side: 'BUY',
      status: 'OPEN',
      quantity: '1',
    });

    expect(order.symbol).toBe('UNKNOWN');
  });
});
