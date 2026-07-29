import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { AccountWalletType } from '@itrade/core';
import { OKXExchange } from '../okx/OKXExchange';

describe('OKXExchange getTransfers', () => {
  let exchange: OKXExchange;
  let getSpy: any;

  beforeEach(() => {
    exchange = new OKXExchange(false);

    // Mock credentials
    (exchange as any).credentials = {
      apiKey: 'test-api-key',
      secretKey: 'test-secret-key',
      passphrase: 'test-passphrase',
    };

    getSpy = vi.fn().mockResolvedValue({
      data: {
        code: '0',
        msg: '',
        data: [],
      },
    });

    (exchange as any).httpClient.get = getSpy;
  });

  it('should map startTime to before and endTime to after parameters', async () => {
    const startTime = new Date('2026-05-19T00:00:00Z');
    const endTime = new Date('2026-05-19T23:59:59Z');

    await exchange.getTransfers(startTime, endTime);

    expect(getSpy).toHaveBeenCalled();
    const calls = getSpy.mock.calls;

    // Both deposit-history and withdrawal-history are called
    expect(calls.length).toBe(2);

    // Check query params of the first call (deposit-history) encoded in URL
    const depositEndpoint = calls[0][0];
    const depositQuery = Object.fromEntries(
      new URLSearchParams(depositEndpoint.split('?')[1]),
    );
    expect(depositQuery.before).toBe(startTime.getTime().toString());
    expect(depositQuery.after).toBe(endTime.getTime().toString());

    // Check query params of the second call (withdrawal-history) encoded in URL
    const withdrawEndpoint = calls[1][0];
    const withdrawQuery = Object.fromEntries(
      new URLSearchParams(withdrawEndpoint.split('?')[1]),
    );
    expect(withdrawQuery.before).toBe(startTime.getTime().toString());
    expect(withdrawQuery.after).toBe(endTime.getTime().toString());
  });
});

describe('OKXExchange transferFunds', () => {
  let exchange: OKXExchange;
  let postSpy: any;

  beforeEach(() => {
    exchange = new OKXExchange(false);

    (exchange as any).credentials = {
      apiKey: 'test-api-key',
      secretKey: 'test-secret-key',
      passphrase: 'test-passphrase',
    };

    postSpy = vi.fn().mockResolvedValue({
      data: { code: '0', msg: '', data: [{ transId: '123' }] },
    });

    (exchange as any).httpClient.post = postSpy;
  });

  it('exposes only FUNDING and TRADING as supported wallets (unified account mode)', () => {
    expect(exchange.getSupportedTransferWallets()).toEqual([
      AccountWalletType.FUNDING,
      AccountWalletType.TRADING,
    ]);
  });

  it('transfers FUNDING -> TRADING using OKX account ids 6 -> 18', async () => {
    const result = await exchange.transferFunds({
      asset: 'usdt',
      amount: new Decimal(100),
      from: AccountWalletType.FUNDING,
      to: AccountWalletType.TRADING,
    });

    expect(result).toEqual({ id: '123' });
    expect(postSpy).toHaveBeenCalledTimes(1);
    const [endpoint, body] = postSpy.mock.calls[0];
    expect(endpoint).toBe('/api/v5/asset/transfer');
    const payload = JSON.parse(body);
    expect(payload).toEqual({ ccy: 'USDT', amt: '100', from: '6', to: '18' });
  });

  it('rejects SPOT -> PERPETUAL because both map to the same Trading account', async () => {
    await expect(
      exchange.transferFunds({
        asset: 'USDT',
        amount: new Decimal(10),
        from: AccountWalletType.SPOT,
        to: AccountWalletType.PERPETUAL,
      }),
    ).rejects.toThrow(/same OKX Trading account/);

    expect(postSpy).not.toHaveBeenCalled();
  });
});
