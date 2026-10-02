import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MarginModeSwitchError } from '@itrade/core';
import { BinanceExchange } from '../binance/BinanceExchange';
import { OKXExchange } from '../okx/OKXExchange';

/**
 * Manual cross/isolated margin-mode switching (position page entry).
 *
 * The strategy path asserts the margin type on every futures order and must
 * never throw (`BinanceExchange.setMarginType`), but the operator-driven path
 * added here is the opposite: the exchange's refusal has to reach the UI, with
 * the reason classified so the page can tell the user to flatten the symbol
 * (position-open) or cancel its resting orders (open-orders) first.
 *
 * Binance is the only venue with a switch endpoint — OKX's mode follows each
 * order's `tdMode`, so the absence of `OKXExchange.setMarginMode` is asserted
 * here on purpose.
 */
describe('BinanceExchange margin mode (manual switch)', () => {
  let exchange: BinanceExchange;
  let postSpy: any;
  let getSpy: any;

  beforeEach(() => {
    exchange = new BinanceExchange(false);
    (exchange as any).credentials = { apiKey: 'test-key', secretKey: 'test-secret' };
    postSpy = vi.fn().mockResolvedValue({ data: {} });
    getSpy = vi.fn().mockResolvedValue({ data: [] });
    (exchange as any).futuresClient.post = postSpy;
    (exchange as any).futuresClient.get = getSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts ISOLATED for an isolated switch on the normalised symbol', async () => {
    const result = await exchange.setMarginMode('WLD/USDC:USDC', 'isolated');

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [path, body, config] = postSpy.mock.calls[0];
    expect(path).toBe('/fapi/v1/marginType');
    expect(body).toBeNull();
    expect(config.params.symbol).toBe('WLDUSDC');
    expect(config.params.marginType).toBe('ISOLATED');
    expect(config.params.signature).toBeTruthy();
    expect(result).toEqual({
      symbol: 'WLD/USDC:USDC',
      marginMode: 'isolated',
      changed: true,
    });
  });

  it('posts CROSSED for a cross switch', async () => {
    await exchange.setMarginMode('WLD/USDC:USDC', 'cross');

    const [, , config] = postSpy.mock.calls[0];
    expect(config.params.marginType).toBe('CROSSED');
  });

  it('reports -4046 as changed:false instead of an error', async () => {
    postSpy.mockRejectedValue({
      response: { data: { code: -4046, msg: 'No need to change margin type.' } },
    });

    await expect(
      exchange.setMarginMode('WLD/USDC:USDC', 'isolated'),
    ).resolves.toMatchObject({
      symbol: 'WLD/USDC:USDC',
      marginMode: 'isolated',
      changed: false,
    });
  });

  it('carries the exchange HTTP status so a credential failure stays a 401', async () => {
    // The route maps a 401 to "check the API credentials / demo mode"; if the
    // status were dropped in the wrapper the operator would see a 502 instead.
    postSpy.mockRejectedValue({
      response: {
        status: 401,
        data: { code: -2015, msg: 'Invalid API-key, IP, or permissions for action.' },
      },
    });

    await expect(
      exchange.setMarginMode('WLD/USDC:USDC', 'isolated'),
    ).rejects.toMatchObject({
      reason: 'unknown',
      exchangeCode: '-2015',
      httpStatus: 401,
    });
  });

  it('classifies -4047 as open-orders', async () => {
    postSpy.mockRejectedValue({
      response: {
        data: {
          code: -4047,
          msg: 'Margin type cannot be changed if there exists open orders.',
        },
      },
    });

    await expect(
      exchange.setMarginMode('WLD/USDC:USDC', 'isolated'),
    ).rejects.toMatchObject({
      name: 'MarginModeSwitchError',
      reason: 'open-orders',
      exchangeCode: '-4047',
    });
  });

  it('classifies -4048 as position-open', async () => {
    postSpy.mockRejectedValue({
      response: {
        data: {
          code: -4048,
          msg: 'Margin type cannot be changed if there exists position.',
        },
      },
    });

    await expect(
      exchange.setMarginMode('WLD/USDC:USDC', 'isolated'),
    ).rejects.toMatchObject({
      reason: 'position-open',
      exchangeCode: '-4048',
    });
  });

  it('classifies -4168 as multi-assets-mode, the account-level refusal', async () => {
    // Seen in prod on WLDUSDC: the account runs in Multi-Assets mode, where
    // Binance refuses isolated margin for ANY symbol — no symbol-level guard can
    // satisfy it, so it must not surface as a generic "failed to switch".
    postSpy.mockRejectedValue({
      response: {
        data: {
          code: -4168,
          msg: 'Unable to adjust to isolated-margin mode under the Multi-Assets mode.',
        },
      },
    });

    await expect(
      exchange.setMarginMode('WLD/USDC:USDC', 'isolated'),
    ).rejects.toMatchObject({
      name: 'MarginModeSwitchError',
      reason: 'multi-assets-mode',
      exchangeCode: '-4168',
    });
  });

  it('keeps unknown rejections on the unknown reason with the exchange code', async () => {
    postSpy.mockRejectedValue({
      response: { data: { code: -1102, msg: 'Mandatory parameter was not sent.' } },
    });

    await expect(
      exchange.setMarginMode('WLD/USDC:USDC', 'isolated'),
    ).rejects.toMatchObject({
      reason: 'unknown',
      exchangeCode: '-1102',
    });
    await expect(
      exchange.setMarginMode('WLD/USDC:USDC', 'isolated'),
    ).rejects.toBeInstanceOf(MarginModeSwitchError);
  });

  it('reads the current mode from positionRisk', async () => {
    getSpy.mockResolvedValue({
      data: [
        { symbol: 'BTCUSDT', marginType: 'isolated', positionAmt: '0' },
        { symbol: 'WLDUSDC', marginType: 'cross', positionAmt: '-1500' },
      ],
    });

    await expect(exchange.getMarginMode('WLD/USDC:USDC')).resolves.toBe('cross');
    const [path, config] = getSpy.mock.calls[0];
    expect(path).toBe('/fapi/v2/positionRisk');
    expect(config.params.symbol).toBe('WLDUSDC');
  });

  it('returns null when the symbol has no risk entry', async () => {
    getSpy.mockResolvedValue({ data: [] });

    await expect(exchange.getMarginMode('WLD/USDC:USDC')).resolves.toBeNull();
  });
});

describe('OKXExchange margin mode', () => {
  let exchange: OKXExchange;
  let getSpy: any;

  beforeEach(() => {
    exchange = new OKXExchange(false);
    (exchange as any).credentials = {
      apiKey: 'test-api-key',
      secretKey: 'test-secret-key',
      passphrase: 'test-passphrase',
    };
    getSpy = vi.fn().mockResolvedValue({ data: { code: '0', msg: '', data: [] } });
    (exchange as any).httpClient.get = getSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has no setMarginMode: OKX exposes no endpoint that switches the mode', () => {
    // OKX's perp margin mode follows the `tdMode` each order carries (asserted
    // by createOrder). Writing a leverage for a mgnMode is NOT a mode switch,
    // so the connector deliberately does not offer one.
    expect(
      (exchange as unknown as { setMarginMode?: unknown }).setMarginMode,
    ).toBeUndefined();
  });

  it('reads the mode off an open SWAP position', async () => {
    getSpy.mockResolvedValue({
      data: {
        code: '0',
        msg: '',
        data: [
          { instId: 'WLD-USDC-SWAP', posSide: 'net', pos: '1500', mgnMode: 'cross' },
          { instId: 'BTC-USDC-SWAP', posSide: 'net', pos: '0', mgnMode: 'isolated' },
        ],
      },
    });

    await expect(exchange.getMarginMode('WLD/USDC:USDC')).resolves.toBe('cross');
    expect(getSpy.mock.calls[0][0]).toContain('/api/v5/account/positions');
    expect(getSpy.mock.calls[0][0]).toContain('instType=SWAP');
  });

  it('reads the mode in hedge mode, where posSide is long/short not net', async () => {
    getSpy.mockResolvedValue({
      data: {
        code: '0',
        msg: '',
        data: [
          { instId: 'WLD-USDC-SWAP', posSide: 'long', pos: '1500', mgnMode: 'isolated' },
          { instId: 'WLD-USDC-SWAP', posSide: 'short', pos: '0', mgnMode: 'isolated' },
        ],
      },
    });

    await expect(exchange.getMarginMode('WLD/USDC:USDC')).resolves.toBe('isolated');
  });

  it('returns null for a flat instrument (OKX exposes no setting without a position)', async () => {
    getSpy.mockResolvedValue({
      data: {
        code: '0',
        msg: '',
        data: [{ instId: 'WLD-USDC-SWAP', posSide: 'net', pos: '0', mgnMode: 'cross' }],
      },
    });

    await expect(exchange.getMarginMode('WLD/USDC:USDC')).resolves.toBeNull();
  });
});
