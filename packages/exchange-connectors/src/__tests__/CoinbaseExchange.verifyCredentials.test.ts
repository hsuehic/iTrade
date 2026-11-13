import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { CoinbaseExchange } from '../coinbase/CoinbaseExchange';

/**
 * Bind-time verification + initial balance seed: verifyCredentials must be
 * FAIL-OPEN for the balanceSummary (auth already proven; any parse hiccup
 * returns { verified: true } with NO summary instead of failing the bind),
 * and must only seed a summary when the response is the FULL account list
 * (no pagination) — a partial sum would understate equity.
 */
describe('CoinbaseExchange verifyCredentials balanceSummary', () => {
  let exchange: CoinbaseExchange;
  let getSpy: any;

  const account = (currency: string, free: string, hold: string) => ({
    currency,
    available_balance: { value: free },
    hold: { value: hold },
  });

  beforeEach(() => {
    exchange = new CoinbaseExchange(false);
    (exchange as any).credentials = {
      apiKey: 'test-api-key',
      secretKey: 'test-secret-key',
    };
    getSpy = vi.fn();
    (exchange as any).httpClient.get = getSpy;
  });

  it('seeds a summary from a full, unpaged account list', async () => {
    getSpy.mockResolvedValue({
      data: {
        has_next: false,
        accounts: [account('BTC', '0.5', '0.1'), account('USDC', '1000', '5')],
      },
    });
    const result = await exchange.verifyCredentials();
    expect(result.verified).toBe(true);
    expect(result.balanceSummary).toBeDefined();
    expect(result.balanceSummary!.free.toString()).toBe('1000.5');
    expect(result.balanceSummary!.locked.toString()).toBe('5.1');
    expect(result.balanceSummary!.total.toString()).toBe('1005.6');
    expect(result.balanceSummary!.saving.toString()).toBe('0');
  });

  it('returns NO summary when the response is paginated (has_next)', async () => {
    getSpy.mockResolvedValue({
      data: { has_next: true, accounts: [account('BTC', '0.5', '0')] },
    });
    const result = await exchange.verifyCredentials();
    expect(result.verified).toBe(true);
    expect(result.balanceSummary).toBeUndefined();
  });

  it('returns NO summary for an empty account list', async () => {
    getSpy.mockResolvedValue({ data: { has_next: false, accounts: [] } });
    const result = await exchange.verifyCredentials();
    expect(result.verified).toBe(true);
    expect(result.balanceSummary).toBeUndefined();
  });

  it('FAIL-OPEN: malformed (non-array) accounts must not fail the bind', async () => {
    getSpy.mockResolvedValue({ data: { has_next: false, accounts: 'garbage' } });
    const result = await exchange.verifyCredentials();
    expect(result.verified).toBe(true);
    expect(result.balanceSummary).toBeUndefined();
  });

  it('FAIL-OPEN: a throwing mapper must not fail the bind', async () => {
    getSpy.mockResolvedValue({
      data: { has_next: false, accounts: [account('BTC', 'not-a-number', '0')] },
    });
    // formatDecimal throws on garbage → the catch must swallow it and
    // return verified with no summary (bind succeeds; poller owns balances).
    const result = await exchange.verifyCredentials();
    expect(result.verified).toBe(true);
    expect(result.balanceSummary).toBeUndefined();
  });

  it('FAIL-OPEN: missing accounts field entirely', async () => {
    getSpy.mockResolvedValue({ data: {} });
    const result = await exchange.verifyCredentials();
    expect(result.verified).toBe(true);
    expect(result.balanceSummary).toBeUndefined();
  });
});
