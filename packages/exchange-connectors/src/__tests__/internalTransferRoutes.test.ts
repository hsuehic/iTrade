import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import {
  AccountWalletType,
  getSupportedTransferRoutes,
  getSupportedTransferWallets,
} from '@itrade/core';

import { BinanceExchange } from '../binance/BinanceExchange';
import { OKXExchange } from '../okx/OKXExchange';

/**
 * Simple Earn (EARN) is deliberately NOT part of either exchange's wallet
 * transfer enum — it can only be moved through Binance's flexible
 * subscribe/redeem and OKX's savings purchase/redemption. These tests pin the
 * wire payloads for those routes and the rejected pairs (Funding <-> Earn).
 */
describe('BinanceExchange Simple Earn transfers', () => {
  let exchange: BinanceExchange;
  let getSpy: any;
  let postSpy: any;

  beforeEach(() => {
    exchange = new BinanceExchange(false);
    (exchange as any).credentials = {
      apiKey: 'test-key',
      secretKey: 'test-secret-key',
    };

    getSpy = vi.fn().mockResolvedValue({
      data: { rows: [{ asset: 'USDT', productId: 'P001' }] },
    });
    postSpy = vi.fn().mockResolvedValue({ data: { purchaseId: 555, redeemId: 777 } });
    (exchange as any).httpClient = { get: getSpy, post: postSpy };
  });

  it('lists EARN as a transferable wallet', () => {
    expect(exchange.getSupportedTransferWallets()).toContain(AccountWalletType.EARN);
  });

  it('subscribes to the flexible product when moving Spot -> Earn', async () => {
    const result = await exchange.transferFunds({
      asset: 'usdt',
      amount: new Decimal('25'),
      from: AccountWalletType.SPOT,
      to: AccountWalletType.EARN,
    });

    const [endpoint, body, config] = postSpy.mock.calls[0];
    expect(endpoint).toBe('/sapi/v1/simple-earn/flexible/subscribe');
    expect(body).toBeNull();
    expect(config.params.productId).toBe('P001');
    expect(config.params.amount).toBe('25');
    expect(config.params.signature).toBeDefined();
    expect(result.id).toBe('555');
  });

  it('redeems with type=FAST when moving Earn -> Spot', async () => {
    await exchange.transferFunds({
      asset: 'USDT',
      amount: new Decimal('10'),
      from: AccountWalletType.EARN,
      to: AccountWalletType.SPOT,
    });

    const [endpoint, , config] = postSpy.mock.calls[0];
    expect(endpoint).toBe('/sapi/v1/simple-earn/flexible/redeem');
    expect(config.params.type).toBe('FAST');
    expect(config.params.productId).toBe('P001');
  });

  it('rejects Funding -> Earn (no such route on Binance)', async () => {
    await expect(
      exchange.transferFunds({
        asset: 'USDT',
        amount: new Decimal('1'),
        from: AccountWalletType.FUNDING,
        to: AccountWalletType.EARN,
      }),
    ).rejects.toThrow(/only supports transferring into Earn from the Spot wallet/);
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('rejects Earn -> Perpetual (Earn settles against Spot only)', async () => {
    await expect(
      exchange.transferFunds({
        asset: 'USDT',
        amount: new Decimal('1'),
        from: AccountWalletType.EARN,
        to: AccountWalletType.PERPETUAL,
      }),
    ).rejects.toThrow(/only supports transferring out of Earn to the Spot wallet/);
  });

  it('keeps using the Universal Transfer endpoint for non-Earn routes', async () => {
    postSpy.mockResolvedValue({ data: { tranId: 42 } });

    const result = await exchange.transferFunds({
      asset: 'USDT',
      amount: new Decimal('5'),
      from: AccountWalletType.FUNDING,
      to: AccountWalletType.PERPETUAL,
    });

    const [endpoint, , config] = postSpy.mock.calls[0];
    expect(endpoint).toBe('/sapi/v1/asset/transfer');
    expect(config.params.type).toBe('FUNDING_UMFUTURE');
    expect(result.id).toBe('42');
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('fails loudly when the asset has no flexible product', async () => {
    getSpy.mockResolvedValue({ data: { rows: [] } });

    await expect(
      exchange.transferFunds({
        asset: 'NOPE',
        amount: new Decimal('1'),
        from: AccountWalletType.SPOT,
        to: AccountWalletType.EARN,
      }),
    ).rejects.toThrow(/no flexible Simple Earn product for NOPE/);
  });
});

describe('OKXExchange Simple Earn transfers', () => {
  let exchange: OKXExchange;
  let postSpy: any;

  beforeEach(() => {
    exchange = new OKXExchange(false);
    (exchange as any).credentials = { apiKey: 'k', secretKey: 's' };
    (exchange as any).passphrase = 'p';

    postSpy = vi.fn().mockResolvedValue({ data: { code: '0', msg: '', data: [{}] } });
    (exchange as any).httpClient = { post: postSpy, get: vi.fn() };
  });

  it('lists EARN as a transferable wallet', () => {
    expect(exchange.getSupportedTransferWallets()).toContain(AccountWalletType.EARN);
  });

  it('purchases savings when moving Trading -> Earn', async () => {
    await exchange.transferFunds({
      asset: 'usdt',
      amount: new Decimal('100'),
      from: AccountWalletType.TRADING,
      to: AccountWalletType.EARN,
    });

    const [endpoint, body, config] = postSpy.mock.calls[0];
    expect(endpoint).toBe('/api/v5/asset/purchase-redempt');
    expect(JSON.parse(body)).toEqual({ ccy: 'USDT', amt: '100', side: 'purchase' });
    expect(config.headers['OK-ACCESS-SIGN']).toBeDefined();
  });

  it('redeems savings when moving Earn -> Trading', async () => {
    await exchange.transferFunds({
      asset: 'USDT',
      amount: new Decimal('100'),
      from: AccountWalletType.EARN,
      to: AccountWalletType.TRADING,
    });

    const [, body] = postSpy.mock.calls[0];
    expect(JSON.parse(body).side).toBe('redempt');
  });

  it('rejects Funding -> Earn (savings settle against Trading only)', async () => {
    await expect(
      exchange.transferFunds({
        asset: 'USDT',
        amount: new Decimal('1'),
        from: AccountWalletType.FUNDING,
        to: AccountWalletType.EARN,
      }),
    ).rejects.toThrow(/only settle against the Trading account/);
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('still uses the asset-transfer endpoint for Funding <-> Trading', async () => {
    postSpy.mockResolvedValue({ data: { code: '0', msg: '', data: [{ transId: '9' }] } });

    const result = await exchange.transferFunds({
      asset: 'USDT',
      amount: new Decimal('1'),
      from: AccountWalletType.FUNDING,
      to: AccountWalletType.TRADING,
    });

    const [endpoint, body] = postSpy.mock.calls[0];
    expect(endpoint).toBe('/api/v5/asset/transfer');
    expect(JSON.parse(body)).toMatchObject({ from: '6', to: '18' });
    expect(result.id).toBe('9');
  });
});

/**
 * Drift guard: each connector's own capability list must stay identical to the
 * route table the web layer derives its dropdowns from (@itrade/core). If one
 * side gains or loses a wallet, this fails instead of silently letting the UI
 * offer a route the connector cannot execute — or hiding one it can.
 */
describe('connector capability lists match the @itrade/core route table', () => {
  it('binance', () => {
    expect(new BinanceExchange(false).getSupportedTransferWallets()).toEqual(
      getSupportedTransferWallets('binance'),
    );
  });

  it('okx', () => {
    expect(new OKXExchange(false).getSupportedTransferWallets()).toEqual(
      getSupportedTransferWallets('okx'),
    );
  });
});

/**
 * Drift guard #2: every Binance route the core table advertises must actually
 * build a request. A route added to the table without a matching
 * TRANSFER_TYPE_MAP entry would otherwise only fail in production, the moment a
 * user picks it in the form.
 */
describe('every advertised Binance route reaches the exchange', () => {
  it('posts a universal transfer for each non-Earn route', async () => {
    const exchange = new BinanceExchange(false);
    (exchange as any).credentials = { apiKey: 'k', secretKey: 's' };

    const postSpy = vi.fn().mockResolvedValue({ data: { tranId: 1 } });
    (exchange as any).httpClient = { get: vi.fn(), post: postSpy };

    const routes = getSupportedTransferRoutes('binance').filter(
      (route) =>
        route.from !== AccountWalletType.EARN && route.to !== AccountWalletType.EARN,
    );
    expect(routes.length).toBeGreaterThan(0);

    for (const route of routes) {
      postSpy.mockClear();

      await exchange.transferFunds({
        asset: 'USDT',
        amount: new Decimal('1'),
        from: route.from,
        to: route.to,
        // Ignored on the routes that do not take a pair.
        symbol: 'BTCUSDT',
      });

      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(postSpy.mock.calls[0][0]).toBe('/sapi/v1/asset/transfer');
    }
  });
});
