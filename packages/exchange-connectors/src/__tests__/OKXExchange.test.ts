import { describe, expect, it, vi, beforeEach } from 'vitest';
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
