import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OKXExchange } from '../okx/OKXExchange';
import { BinanceExchange } from '../binance/BinanceExchange';

/**
 * UNIT-CONSISTENCY CONTRACT (review round 7, blockers): the console poller
 * persists VALUATION equity for these venues (OKX /asset/asset-valuation
 * USD totalBal; Binance BTC-price rollup over spot+futures). The balance
 * endpoints used for credential verification return per-asset RAW
 * quantities — a naive cross-asset sum (0.5 BTC + 1000 USDT = 1000.5)
 * would seed a balance_history row in a different unit than every later
 * row (false chart cliff + poisoned P&L bootstrap baseline). These tests
 * pin the contract: verifyCredentials succeeds but returns NO summary.
 */
describe('OKX/Binance verifyCredentials return no balanceSummary (unit consistency)', () => {
  describe('OKX', () => {
    let exchange: OKXExchange;

    beforeEach(() => {
      exchange = new OKXExchange(false);
      (exchange as any).credentials = {
        apiKey: 'test-api-key',
        secretKey: 'test-secret',
        passphrase: 'test-passphrase',
      };
      (exchange as any).httpClient = {
        get: vi.fn().mockResolvedValue({
          data: {
            code: '0',
            data: [{ ccy: 'BTC', availBal: '0.5', frozenBal: '0.1', bal: '0.6' }],
          },
        }),
      };
    });

    it('verifies but does NOT seed a raw cross-asset sum', async () => {
      const result = await exchange.verifyCredentials();
      expect(result.verified).toBe(true);
      expect(result.balanceSummary).toBeUndefined();
    });

    it('succeeds with an empty balance list (nothing to misread)', async () => {
      (exchange as any).httpClient.get = vi
        .fn()
        .mockResolvedValue({ data: { code: '0', data: [] } });
      const result = await exchange.verifyCredentials();
      expect(result.verified).toBe(true);
      expect(result.balanceSummary).toBeUndefined();
    });
  });

  describe('Binance', () => {
    let exchange: BinanceExchange;

    beforeEach(() => {
      exchange = new BinanceExchange(false);
      (exchange as any).credentials = {
        apiKey: 'test-api-key',
        secretKey: 'test-secret',
      };
      (exchange as any).httpClient = {
        get: vi.fn().mockResolvedValue({
          data: {
            balances: [{ asset: 'BTC', free: '0.5', locked: '0.1' }],
          },
        }),
      };
    });

    it('verifies but does NOT seed a raw cross-asset sum', async () => {
      const result = await exchange.verifyCredentials();
      expect(result.verified).toBe(true);
      expect(result.balanceSummary).toBeUndefined();
    });
  });
});
