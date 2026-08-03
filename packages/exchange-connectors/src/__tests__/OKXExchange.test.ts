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

describe('OKXExchange Simple Earn (EARN wallet)', () => {
  let exchange: OKXExchange;
  let getSpy: any;

  beforeEach(() => {
    exchange = new OKXExchange(false);

    (exchange as any).credentials = {
      apiKey: 'test-api-key',
      secretKey: 'test-secret-key',
      passphrase: 'test-passphrase',
    };

    getSpy = vi.fn().mockResolvedValue({
      data: {
        code: '0',
        msg: '',
        data: [
          { ccy: 'USDT', amt: '500.25', earnings: '1.2' },
          { ccy: 'ETH', amt: '3', earnings: '0.01' },
        ],
      },
    });

    (exchange as any).httpClient.get = getSpy;
  });

  it('maps savings balances to EARN wallet balances', async () => {
    const balances = await exchange.getWalletBalances(AccountWalletType.EARN);

    expect(getSpy).toHaveBeenCalledTimes(1);
    const endpoint = getSpy.mock.calls[0][0];
    expect(endpoint).toContain('/api/v5/finance/savings/balance');

    expect(balances).toHaveLength(2);
    const usdt = balances.find((b) => b.asset === 'USDT');
    expect(usdt?.free.toString()).toBe('500.25');
    expect(usdt?.locked.toString()).toBe('0');
    expect(usdt?.total.toString()).toBe('500.25');
    expect(usdt?.saving?.toString()).toBe('500.25');
  });

  it('throws on an OKX API error response', async () => {
    getSpy.mockResolvedValue({
      data: { code: '50110', msg: 'IP not whitelisted', data: [] },
    });

    await expect(exchange.getWalletBalances(AccountWalletType.EARN)).rejects.toThrow(
      'OKX API error: IP not whitelisted',
    );
  });

  it('keeps EARN out of the transferable wallet list', () => {
    expect(exchange.getSupportedTransferWallets()).not.toContain(AccountWalletType.EARN);
  });
});
