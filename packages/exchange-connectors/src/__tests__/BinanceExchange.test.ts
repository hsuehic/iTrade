import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { AccountWalletType } from '@itrade/core';
import { BinanceExchange } from '../binance/BinanceExchange';

describe('BinanceExchange Leverage & Margin', () => {
  let exchange: BinanceExchange;
  let postSpy: any;

  beforeEach(() => {
    exchange = new BinanceExchange(false);

    // Mock credentials
    (exchange as any).credentials = {
      apiKey: 'test-api-key',
      secretKey: 'test-secret-key',
    };

    // Mock futuresClient.post to verify compliance with query-params-only requirement
    postSpy = vi.fn().mockImplementation((url: string, body: any, config: any) => {
      // API Contract Simulation:
      // If ANY data is sent in body for signed endpoints like /leverage or /marginType, request fails
      if (body && Object.keys(body).length > 0) {
        throw {
          response: {
            status: 400,
            data: {
              code: -1102,
              msg: 'Mandatory parameter was not sent as query param.',
            },
          },
        };
      }

      // If params are missing or empty in query string, request fails
      if (!config?.params || Object.keys(config.params).length === 0) {
        throw {
          response: {
            status: 400,
            data: { code: -1102, msg: 'Mandatory parameter was not sent.' },
          },
        };
      }

      // If all good, return success
      if (url.includes('/leverage')) {
        return Promise.resolve({
          data: {
            leverage: config.params.leverage,
            maxNotionalValue: '1000000',
            symbol: config.params.symbol,
          },
        });
      }

      if (url.includes('/marginType')) {
        return Promise.resolve({
          data: {
            msg: 'success',
          },
        });
      }

      return Promise.resolve({ data: {} });
    });

    (exchange as any).futuresClient.post = postSpy;
  });

  it('should successfully set leverage when sending query params', async () => {
    // This verifies the fix: setLeverage MUST use query params internally, otherwise mock throws
    await expect((exchange as any).setLeverage('BTCUSDT', 5)).resolves.not.toThrow();
  });

  it('should successfully set margin type when sending query params', async () => {
    // This verifies the fix: setMarginType MUST use query params internally, otherwise mock throws
    await expect(
      (exchange as any).setMarginType('BTCUSDT', 'isolated'),
    ).resolves.not.toThrow();
  });

  // Optional: Negative test to prove the mock is working correctly
  /*
  it('should fail if method were to use body params (validation of test harness)', async () => {
      // Temporarily break the mock to simulate bad implementation
      const badImplementation = async () => {
          await (exchange as any).futuresClient.post('/fapi/v1/leverage', { symbol: 'BTCUSDT' });
      };
      await expect(badImplementation()).rejects.toHaveProperty('response.status', 400);
  });
  */
});

describe('BinanceExchange adjustIsolatedMargin', () => {
  let exchange: BinanceExchange;
  let postSpy: ReturnType<typeof vi.fn>;
  let getSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    exchange = new BinanceExchange(false);
    (exchange as any).credentials = {
      apiKey: 'test-api-key',
      secretKey: 'test-secret-key',
    };

    postSpy = vi.fn().mockResolvedValue({ data: { code: 200, msg: 'ok' } });
    getSpy = vi.fn().mockResolvedValue({ data: { dualSidePosition: false } });

    (exchange as any).futuresClient.post = postSpy;
    (exchange as any).futuresClient.get = getSpy;
  });

  it('uses positionSide BOTH in one-way mode even when position is long', async () => {
    await exchange.adjustIsolatedMargin(
      'BTC/USDT:USDT',
      new Decimal('10'),
      'add',
      'long',
    );

    expect(postSpy).toHaveBeenCalledWith(
      '/fapi/v1/positionMargin',
      null,
      expect.objectContaining({
        params: expect.objectContaining({
          symbol: 'BTCUSDT',
          positionSide: 'BOTH',
          type: 1,
          amount: '10',
        }),
      }),
    );
  });

  it('uses LONG/SHORT in hedge mode', async () => {
    getSpy.mockResolvedValue({ data: { dualSidePosition: true } });

    await exchange.adjustIsolatedMargin(
      'BTC/USDT:USDT',
      new Decimal('5'),
      'reduce',
      'short',
    );

    expect(postSpy).toHaveBeenCalledWith(
      '/fapi/v1/positionMargin',
      null,
      expect.objectContaining({
        params: expect.objectContaining({
          symbol: 'BTCUSDT',
          positionSide: 'SHORT',
          type: 2,
          amount: '5',
        }),
      }),
    );
  });

  it('derives max add/reduce from positionRisk and balance', async () => {
    getSpy.mockImplementation((url: string) => {
      if (url.includes('positionSide/dual')) {
        return Promise.resolve({ data: { dualSidePosition: false } });
      }
      if (url.includes('positionRisk')) {
        return Promise.resolve({
          data: [
            {
              symbol: 'BTCUSDT',
              positionSide: 'BOTH',
              positionAmt: '0.01',
              marginAsset: 'USDT',
              isolatedWallet: '100',
              positionInitialMargin: '30',
            },
          ],
        });
      }
      if (url.includes('balance')) {
        return Promise.resolve({
          data: [{ asset: 'USDT', availableBalance: '250.5' }],
        });
      }
      return Promise.resolve({ data: {} });
    });

    const limits = await exchange.getIsolatedMarginLimits('BTC/USDT:USDT', 'long');

    expect(limits.maxAdd.toString()).toBe('250.5');
    expect(limits.maxReduce.toString()).toBe('70');
    expect(limits.currentMargin?.toString()).toBe('100');
    expect(limits.marginAsset).toBe('USDT');
  });
});

describe('BinanceExchange Symbol Info Precision', () => {
  let exchange: BinanceExchange;

  beforeEach(() => {
    exchange = new BinanceExchange(false);
  });

  it('should fetch futures exchangeInfo for perpetual symbols and use futures tick size', async () => {
    const spotGetSpy = vi.fn();
    const futuresGetSpy = vi.fn().mockResolvedValue({
      data: {
        symbols: [
          {
            symbol: 'BTCUSDC',
            baseAsset: 'BTC',
            quoteAsset: 'USDC',
            status: 'TRADING',
            pricePrecision: 1,
            quantityPrecision: 3,
            filters: [
              { filterType: 'PRICE_FILTER', tickSize: '0.1' },
              { filterType: 'LOT_SIZE', minQty: '0.001', stepSize: '0.001' },
              { filterType: 'MIN_NOTIONAL', notional: '5' },
            ],
          },
        ],
      },
    });

    (exchange as any).httpClient.get = spotGetSpy;
    (exchange as any).futuresClient.get = futuresGetSpy;

    const info = await exchange.getSymbolInfo('BTC/USDC:USDC');

    expect(futuresGetSpy).toHaveBeenCalledWith('/fapi/v1/exchangeInfo', {
      params: { symbol: 'BTCUSDC' },
    });
    expect(spotGetSpy).not.toHaveBeenCalled();
    expect(info.market).toBe('futures');
    expect(info.symbol).toBe('BTC/USDC:USDC');
    expect(info.tickSize.toString()).toBe('0.1');
    expect(info.pricePrecision).toBe(1);
  });
});

describe('BinanceExchange getTransfers', () => {
  let exchange: BinanceExchange;
  let getSpy: any;

  beforeEach(() => {
    exchange = new BinanceExchange(false);

    // Mock credentials
    (exchange as any).credentials = {
      apiKey: 'test-api-key',
      secretKey: 'test-secret-key',
    };

    getSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes('deposit/hisrec')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('withdraw/history')) {
        return Promise.resolve({
          data: [
            {
              id: 'test-withdraw-1',
              coin: 'USDT',
              amount: '100',
              status: 6,
              applyTime: '2026-05-19 17:02:25',
              network: 'TRX',
              txId: 'test-tx-id',
            },
          ],
        });
      }
      if (url.includes('pay/transactions')) {
        return Promise.resolve({ data: { code: '000000', data: [] } });
      }
      return Promise.resolve({ data: [] });
    });

    (exchange as any).httpClient.get = getSpy;
  });

  it('should parse applyTime strictly as UTC time', async () => {
    const transfers = await exchange.getTransfers();
    expect(transfers).toHaveLength(1);

    const withdrawal = transfers[0];
    expect(withdrawal.type).toBe('WITHDRAW');

    // 2026-05-19 17:02:25 in UTC is 1763485345000 in Unix timestamp milliseconds
    expect(withdrawal.timestamp.getTime()).toBe(
      new Date('2026-05-19T17:02:25.000Z').getTime(),
    );
  });
});

describe('BinanceExchange transferFunds', () => {
  let exchange: BinanceExchange;
  let postSpy: any;

  beforeEach(() => {
    exchange = new BinanceExchange(false);

    (exchange as any).credentials = {
      apiKey: 'test-api-key',
      secretKey: 'test-secret-key',
    };

    postSpy = vi.fn().mockResolvedValue({ data: { tranId: 999999 } });
    (exchange as any).httpClient.post = postSpy;
  });

  it('exposes FUNDING, SPOT, and PERPETUAL as supported wallets', () => {
    expect(exchange.getSupportedTransferWallets()).toEqual([
      AccountWalletType.FUNDING,
      AccountWalletType.SPOT,
      AccountWalletType.PERPETUAL,
    ]);
  });

  it.each([
    [AccountWalletType.FUNDING, AccountWalletType.SPOT, 'FUNDING_MAIN'],
    [AccountWalletType.SPOT, AccountWalletType.FUNDING, 'MAIN_FUNDING'],
    [AccountWalletType.FUNDING, AccountWalletType.PERPETUAL, 'FUNDING_UMFUTURE'],
    [AccountWalletType.PERPETUAL, AccountWalletType.FUNDING, 'UMFUTURE_FUNDING'],
    [AccountWalletType.SPOT, AccountWalletType.PERPETUAL, 'MAIN_UMFUTURE'],
    [AccountWalletType.PERPETUAL, AccountWalletType.SPOT, 'UMFUTURE_MAIN'],
  ])('maps %s -> %s to universal transfer type %s', async (from, to, expectedType) => {
    const result = await exchange.transferFunds({
      asset: 'usdt',
      amount: new Decimal(50),
      from,
      to,
    });

    expect(result).toEqual({ id: '999999' });
    expect(postSpy).toHaveBeenCalledTimes(1);
    const [url, body, config] = postSpy.mock.calls[0];
    expect(url).toBe('/sapi/v1/asset/transfer');
    expect(body).toBeNull();
    expect(config.params).toMatchObject({
      type: expectedType,
      asset: 'USDT',
      amount: '50',
    });
  });

  it('rejects a transfer when the source and destination wallets are the same', async () => {
    await expect(
      exchange.transferFunds({
        asset: 'USDT',
        amount: new Decimal(10),
        from: AccountWalletType.SPOT,
        to: AccountWalletType.SPOT,
      }),
    ).rejects.toThrow(/must be different/);

    expect(postSpy).not.toHaveBeenCalled();
  });
});
