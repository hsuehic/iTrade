import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { OrderSide, OrderType } from '@itrade/core';
import { CoinbaseExchange } from '../coinbase/CoinbaseExchange';

/**
 * Strategy 609 hardening: Coinbase Advanced Trade (`/api/v3/brokerage/orders`)
 * has NO `reduce_only` field in its CreateOrderRequest schema — only the
 * separate Coinbase Derivatives/International API has one. The connector must
 * therefore NOT invent the field (an unknown field risks a 400) and must warn
 * loudly instead of silently dropping the caller's request, so nobody believes
 * an exchange-level guard exists when it does not.
 */
describe('CoinbaseExchange reduceOnly handling', () => {
  let exchange: CoinbaseExchange;
  let postSpy: any;
  let warnSpy: any;

  beforeEach(() => {
    exchange = new CoinbaseExchange(false);
    (exchange as any).credentials = {
      apiKey: 'test-api-key',
      secretKey: 'test-secret-key',
    };
    (exchange as any).transformOrder = vi
      .fn()
      .mockReturnValue({ id: 'cb-order-1', symbol: 'BTC-USD', quantity: new Decimal(1) });

    postSpy = vi.fn().mockResolvedValue({
      data: {
        success: true,
        success_response: {
          order_id: 'cb-order-1',
          client_order_id: 'T609D78D1790172796407',
        },
      },
    });
    (exchange as any).httpClient.post = postSpy;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never puts reduce_only into the request body and warns when reduceOnly is requested', async () => {
    await exchange.createOrder(
      'BTC-USD',
      OrderSide.SELL,
      OrderType.LIMIT,
      new Decimal(1),
      new Decimal('10000'),
      undefined,
      'T609D78D1790172796407',
      { reduceOnly: true } as any,
    );

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [path, body] = postSpy.mock.calls[0];
    expect(path).toBe('/api/v3/brokerage/orders');
    expect(body).not.toHaveProperty('reduce_only');
    expect(body).not.toHaveProperty('reduceOnly');
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0][0])).toContain('reduceOnly');
  });

  it('stays quiet for a plain order without reduceOnly', async () => {
    await exchange.createOrder(
      'BTC-USD',
      OrderSide.BUY,
      OrderType.LIMIT,
      new Decimal(1),
      new Decimal('10000'),
      undefined,
      'E609D01D1790172757243',
      {},
    );

    const [, body] = postSpy.mock.calls[0];
    expect(body).not.toHaveProperty('reduce_only');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
