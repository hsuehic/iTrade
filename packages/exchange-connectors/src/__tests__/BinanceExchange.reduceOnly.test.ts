import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { OrderSide, OrderType } from '@itrade/core';
import { BinanceExchange } from '../binance/BinanceExchange';

/**
 * Strategy 609 review (GLM): the Binance connector already forwarded
 * `reduceOnly` for futures, but nothing pinned it. The wire payload is what
 * actually stops a second TP from opening a short, so it gets a regression
 * test — including the spot path, where the option must be loudly ignored.
 */
describe('BinanceExchange reduceOnly forwarding', () => {
  let ex: any;
  let postSpy: any;

  beforeEach(() => {
    ex = new BinanceExchange(false) as any;
    ex.credentials = { apiKey: 'test-key', secretKey: 'test-secret' };
    ex.signRequest = vi.fn().mockImplementation((params: any) => params);
    ex.getFuturesPositionMode = vi.fn().mockResolvedValue('oneway');
    ex.transformBinanceOrder = vi.fn().mockReturnValue({ id: 'bn-1' });

    postSpy = vi.fn().mockResolvedValue({ data: { orderId: 4743137639 } });
    ex.futuresClient = { post: postSpy };
    ex.httpClient = { post: postSpy };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends reduceOnly=true for a futures order when requested', async () => {
    await ex.createOrder(
      'WLDUSDT',
      OrderSide.SELL,
      OrderType.LIMIT,
      new Decimal(15000),
      new Decimal('0.4202'),
      undefined,
      'T609D78D1790172796407',
      { reduceOnly: true },
    );

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [path, , config] = postSpy.mock.calls[0];
    expect(path).toBe('/fapi/v1/order');
    expect(config.params.reduceOnly).toBe(true);
    expect(config.params.side).toBe('SELL');
    expect(config.params.quantity).toBe('15000');
  });

  it('omits reduceOnly on the wire when the caller does not ask for it', async () => {
    await ex.createOrder(
      'WLDUSDT',
      OrderSide.SELL,
      OrderType.LIMIT,
      new Decimal(15000),
      new Decimal('0.4202'),
      undefined,
      'T609D78D1790172796408',
      {},
    );

    const [, , config] = postSpy.mock.calls[0];
    expect(config.params).not.toHaveProperty('reduceOnly');
  });

  it('ignores reduceOnly for a spot symbol and warns instead', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await ex.createOrder(
      'BTC/USDT',
      OrderSide.SELL,
      OrderType.LIMIT,
      new Decimal(1),
      new Decimal('10000'),
      undefined,
      'T609D99D1790172799999',
      { reduceOnly: true },
    );

    const [path, , config] = postSpy.mock.calls[0];
    expect(path).toBe('/api/v3/order');
    expect(config.params).not.toHaveProperty('reduceOnly');
    expect(warnSpy).toHaveBeenCalled();
  });
});
