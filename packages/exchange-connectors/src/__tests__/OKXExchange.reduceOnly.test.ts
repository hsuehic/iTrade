import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { OrderSide, OrderType } from '@itrade/core';
import { OKXExchange } from '../okx/OKXExchange';

/**
 * Strategy 609 hardening: the OKX connector used to declare `reduceOnly` in its
 * `createOrder` options type and then silently drop it, so a strategy that set
 * the flag believed it had an exchange-level guard when it had none. These
 * tests pin the wire payload for the supported (FUTURES/SWAP in net mode) and
 * the unsupported (SPOT cash) cases.
 */
describe('OKXExchange reduceOnly forwarding', () => {
  let exchange: OKXExchange;
  let postSpy: any;

  beforeEach(() => {
    exchange = new OKXExchange(false);
    (exchange as any).credentials = {
      apiKey: 'test-api-key',
      secretKey: 'test-secret-key',
      passphrase: 'test-passphrase',
    };

    // Keep the test focused on the order payload: stub the sizing helpers so no
    // public-instruments REST call is needed.
    (exchange as any).getCachedSymbolInfo = vi.fn().mockResolvedValue({
      symbol: 'WLD/USDT:USDT',
      market: 'swap',
      contractValue: new Decimal(1),
      contractMultiplier: new Decimal(1),
    });
    (exchange as any).calculateContractSize = vi
      .fn()
      .mockResolvedValue(new Decimal(15000));
    (exchange as any).transformOKXOrder = vi.fn().mockReturnValue({ id: '4743137639' });

    postSpy = vi.fn().mockResolvedValue({
      data: {
        code: '0',
        msg: '',
        data: [
          { ordId: '4743137639', clOrdId: 'T609D78D1790172796407', sCode: '0', sMsg: '' },
        ],
      },
    });
    (exchange as any).httpClient.post = postSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends reduceOnly=true for a SWAP order when requested (net mode)', async () => {
    await exchange.createOrder(
      'WLD/USDT:USDT',
      OrderSide.SELL,
      OrderType.LIMIT,
      new Decimal(15000),
      new Decimal('0.4202'),
      undefined,
      'T609D78D1790172796407',
      { reduceOnly: true, tradeMode: 'isolated' } as any,
    );

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [path, body] = postSpy.mock.calls[0];
    expect(path).toBe('/api/v5/trade/order');
    expect(body.reduceOnly).toBe('true');
    expect(body.posSide).toBe('net');
    expect(body.instId).toBe('WLD-USDT-SWAP');
  });

  it('omits reduceOnly entirely when the caller does not ask for it', async () => {
    await exchange.createOrder(
      'WLD/USDT:USDT',
      OrderSide.BUY,
      OrderType.LIMIT,
      new Decimal(8000),
      new Decimal('0.4063'),
      undefined,
      'E609D01D1790172757243',
      { tradeMode: 'isolated' } as any,
    );

    const [, body] = postSpy.mock.calls[0];
    expect(body).not.toHaveProperty('reduceOnly');
  });

  it('does NOT send reduceOnly for a spot cash order, and warns instead of dropping it silently', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (exchange as any).getCachedSymbolInfo = vi.fn().mockResolvedValue({
      symbol: 'BTC/USDT',
      market: 'spot',
    });
    (exchange as any).calculateContractSize = vi.fn().mockResolvedValue(new Decimal(1));

    await exchange.createOrder(
      'BTC/USDT',
      OrderSide.SELL,
      OrderType.LIMIT,
      new Decimal(1),
      new Decimal('10000'),
      undefined,
      'T609D99D1790172799999',
      { reduceOnly: true } as any,
    );

    const [, body] = postSpy.mock.calls[0];
    expect(body).not.toHaveProperty('reduceOnly');
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0][0])).toContain('reduceOnly');
  });
});
