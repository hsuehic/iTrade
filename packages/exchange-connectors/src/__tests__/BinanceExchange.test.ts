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

  it('derives USDC margin asset from the symbol when positionRisk omits marginAsset', async () => {
    // Reproduces the reported bug: USDC-margined perpetuals (e.g. ZEC/USDC:USDC)
    // do not include `marginAsset` in /fapi/v2/positionRisk, so the code must
    // fall back to the symbol's settlement currency instead of defaulting to USDT.
    getSpy.mockImplementation((url: string) => {
      if (url.includes('positionSide/dual')) {
        return Promise.resolve({ data: { dualSidePosition: false } });
      }
      if (url.includes('positionRisk')) {
        return Promise.resolve({
          data: [
            {
              symbol: 'ZECUSDC',
              positionSide: 'BOTH',
              positionAmt: '1',
              // NB: `marginAsset` intentionally omitted to mirror live API.
              isolatedWallet: '1013.56175094',
              positionInitialMargin: '0',
            },
          ],
        });
      }
      if (url.includes('balance')) {
        return Promise.resolve({
          data: [{ asset: 'USDC', availableBalance: '500.25' }],
        });
      }
      return Promise.resolve({ data: {} });
    });

    const limits = await exchange.getIsolatedMarginLimits('ZEC/USDC:USDC', 'long');

    expect(limits.marginAsset).toBe('USDC');
    expect(limits.maxAdd.toString()).toBe('500.25');
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

  it('exposes every wallet the Universal Transfer API can reach', () => {
    expect(exchange.getSupportedTransferWallets()).toEqual([
      AccountWalletType.FUNDING,
      AccountWalletType.SPOT,
      AccountWalletType.PERPETUAL,
      AccountWalletType.COIN_M,
      AccountWalletType.MARGIN,
      AccountWalletType.OPTION,
      AccountWalletType.ISOLATED_MARGIN,
      AccountWalletType.EARN,
    ]);
  });

  it.each([
    [AccountWalletType.FUNDING, AccountWalletType.SPOT, 'FUNDING_MAIN'],
    [AccountWalletType.SPOT, AccountWalletType.FUNDING, 'MAIN_FUNDING'],
    [AccountWalletType.FUNDING, AccountWalletType.PERPETUAL, 'FUNDING_UMFUTURE'],
    [AccountWalletType.PERPETUAL, AccountWalletType.FUNDING, 'UMFUTURE_FUNDING'],
    [AccountWalletType.SPOT, AccountWalletType.PERPETUAL, 'MAIN_UMFUTURE'],
    [AccountWalletType.PERPETUAL, AccountWalletType.SPOT, 'UMFUTURE_MAIN'],
    [AccountWalletType.SPOT, AccountWalletType.COIN_M, 'MAIN_CMFUTURE'],
    [AccountWalletType.COIN_M, AccountWalletType.SPOT, 'CMFUTURE_MAIN'],
    [AccountWalletType.FUNDING, AccountWalletType.COIN_M, 'FUNDING_CMFUTURE'],
    [AccountWalletType.COIN_M, AccountWalletType.MARGIN, 'CMFUTURE_MARGIN'],
    [AccountWalletType.MARGIN, AccountWalletType.COIN_M, 'MARGIN_CMFUTURE'],
    [AccountWalletType.SPOT, AccountWalletType.MARGIN, 'MAIN_MARGIN'],
    [AccountWalletType.MARGIN, AccountWalletType.SPOT, 'MARGIN_MAIN'],
    [AccountWalletType.PERPETUAL, AccountWalletType.MARGIN, 'UMFUTURE_MARGIN'],
    [AccountWalletType.SPOT, AccountWalletType.OPTION, 'MAIN_OPTION'],
    [AccountWalletType.OPTION, AccountWalletType.SPOT, 'OPTION_MAIN'],
    [AccountWalletType.OPTION, AccountWalletType.PERPETUAL, 'OPTION_UMFUTURE'],
    [AccountWalletType.MARGIN, AccountWalletType.OPTION, 'MARGIN_OPTION'],
    [AccountWalletType.FUNDING, AccountWalletType.OPTION, 'FUNDING_OPTION'],
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
    // Only the isolated margin routes carry a pair.
    expect(config.params.fromSymbol).toBeUndefined();
    expect(config.params.toSymbol).toBeUndefined();
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

  it.each([
    [
      AccountWalletType.SPOT,
      AccountWalletType.ISOLATED_MARGIN,
      'MAIN_ISOLATED_MARGIN',
      'toSymbol',
    ],
    [
      AccountWalletType.ISOLATED_MARGIN,
      AccountWalletType.SPOT,
      'ISOLATED_MARGIN_MAIN',
      'fromSymbol',
    ],
    [
      AccountWalletType.MARGIN,
      AccountWalletType.ISOLATED_MARGIN,
      'MARGIN_ISOLATEDMARGIN',
      'toSymbol',
    ],
    [
      AccountWalletType.ISOLATED_MARGIN,
      AccountWalletType.MARGIN,
      'ISOLATEDMARGIN_MARGIN',
      'fromSymbol',
    ],
  ])(
    'maps %s -> %s to %s and sends the pair as %s',
    async (from, to, expectedType, symbolField) => {
      await exchange.transferFunds({
        asset: 'btc',
        amount: new Decimal(0.5),
        from,
        to,
        symbol: 'btcusdt',
      });

      const [, , config] = postSpy.mock.calls[0];
      expect(config.params).toMatchObject({
        type: expectedType,
        asset: 'BTC',
        amount: '0.5',
        [symbolField]: 'BTCUSDT',
      });
    },
  );

  it('rejects an isolated margin transfer that does not name the pair', async () => {
    await expect(
      exchange.transferFunds({
        asset: 'BTC',
        amount: new Decimal(0.5),
        from: AccountWalletType.SPOT,
        to: AccountWalletType.ISOLATED_MARGIN,
      }),
    ).rejects.toThrow(/require the pair/);

    expect(postSpy).not.toHaveBeenCalled();
  });

  it('rejects a pair Binance has no universal transfer type for', async () => {
    // USDⓈ-M <-> COIN-M is a real gap in Binance's enum, not an oversight here.
    await expect(
      exchange.transferFunds({
        asset: 'USDT',
        amount: new Decimal(10),
        from: AccountWalletType.PERPETUAL,
        to: AccountWalletType.COIN_M,
      }),
    ).rejects.toThrow(/does not support transferring/);

    expect(postSpy).not.toHaveBeenCalled();
  });
});

describe('BinanceExchange Simple Earn (EARN wallet)', () => {
  let exchange: BinanceExchange;
  let getSpy: any;

  beforeEach(() => {
    exchange = new BinanceExchange(false);
    (exchange as any).credentials = {
      apiKey: 'test-api-key',
      secretKey: 'test-secret-key',
    };

    getSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes('simple-earn/flexible/position')) {
        return Promise.resolve({
          data: {
            total: 2,
            rows: [
              { asset: 'USDT', totalAmount: '1000.5' },
              { asset: 'BTC', totalAmount: '0.25' },
            ],
          },
        });
      }
      if (url.includes('simple-earn/locked/position')) {
        return Promise.resolve({
          data: {
            total: 1,
            rows: [{ asset: 'USDT', amount: '200' }],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    (exchange as any).httpClient.get = getSpy;
  });

  it('merges flexible (free) and locked positions into EARN balances', async () => {
    const balances = await exchange.getWalletBalances(AccountWalletType.EARN);

    expect(getSpy).toHaveBeenCalledWith(
      '/sapi/v1/simple-earn/flexible/position',
      expect.objectContaining({
        params: expect.objectContaining({ current: 1, size: 100 }),
      }),
    );
    expect(getSpy).toHaveBeenCalledWith(
      '/sapi/v1/simple-earn/locked/position',
      expect.objectContaining({
        params: expect.objectContaining({ current: 1, size: 100 }),
      }),
    );

    const usdt = balances.find((b) => b.asset === 'USDT');
    expect(usdt?.free.toString()).toBe('1000.5');
    expect(usdt?.locked.toString()).toBe('200');
    expect(usdt?.total.toString()).toBe('1200.5');
    expect(usdt?.saving?.toString()).toBe('1200.5');

    const btc = balances.find((b) => b.asset === 'BTC');
    expect(btc?.free.toString()).toBe('0.25');
    expect(btc?.locked.toString()).toBe('0');
    expect(btc?.total.toString()).toBe('0.25');
  });

  it('follows pagination when a full page is returned', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      asset: `TOKEN${i}`,
      totalAmount: '1',
    }));

    getSpy.mockImplementation((url: string, config: any) => {
      if (url.includes('simple-earn/flexible/position')) {
        return Promise.resolve({
          data: { rows: config.params.current === 1 ? fullPage : [] },
        });
      }
      return Promise.resolve({ data: { rows: [] } });
    });

    const balances = await exchange.getWalletBalances(AccountWalletType.EARN);

    const flexibleCalls = getSpy.mock.calls.filter(([url]: [string]) =>
      url.includes('flexible/position'),
    );
    expect(flexibleCalls).toHaveLength(2);
    expect(balances).toHaveLength(100);
  });

  it('still returns locked positions when the flexible endpoint fails', async () => {
    getSpy.mockImplementation((url: string) => {
      if (url.includes('flexible/position')) {
        return Promise.reject(new Error('flexible endpoint down'));
      }
      return Promise.resolve({
        data: { rows: [{ asset: 'ETH', amount: '2' }] },
      });
    });

    const balances = await exchange.getWalletBalances(AccountWalletType.EARN);

    expect(balances).toHaveLength(1);
    expect(balances[0].asset).toBe('ETH');
    expect(balances[0].locked.toString()).toBe('2');
  });

  it('throws when both Simple Earn endpoints fail', async () => {
    getSpy.mockRejectedValue(new Error('unauthorized'));

    await expect(exchange.getWalletBalances(AccountWalletType.EARN)).rejects.toThrow(
      'unauthorized',
    );
  });

  it('lists EARN as transferable (via flexible subscribe/redeem)', () => {
    expect(exchange.getSupportedTransferWallets()).toContain(AccountWalletType.EARN);
  });
});

describe('BinanceExchange COIN-M / margin / options wallets', () => {
  let exchange: BinanceExchange;
  let getSpy: any;
  let coinGetSpy: any;

  beforeEach(() => {
    exchange = new BinanceExchange(false);
    (exchange as any).credentials = {
      apiKey: 'test-api-key',
      secretKey: 'test-secret-key',
    };

    getSpy = vi.fn().mockResolvedValue({ data: {} });
    coinGetSpy = vi.fn().mockResolvedValue({ data: [] });
    (exchange as any).httpClient.get = getSpy;
    (exchange as any).coinFuturesClient.get = coinGetSpy;
  });

  it('reads COIN-M balances from the /dapi host, not /fapi', async () => {
    coinGetSpy.mockResolvedValue({
      data: [{ asset: 'BTC', balance: '1.5', availableBalance: '1.25' }],
    });

    const balances = await exchange.getWalletBalances(AccountWalletType.COIN_M);

    expect(coinGetSpy.mock.calls[0][0]).toBe('/dapi/v1/balance');
    expect(getSpy).not.toHaveBeenCalled();
    expect(balances).toHaveLength(1);
    expect(balances[0].asset).toBe('BTC');
    expect(balances[0].free.toString()).toBe('1.25');
    expect(balances[0].locked.toString()).toBe('0.25');
    expect(balances[0].total.toString()).toBe('1.5');
  });

  it('reads cross margin holdings from the margin account', async () => {
    getSpy.mockResolvedValue({
      data: {
        userAssets: [
          { asset: 'USDT', free: '100', locked: '10', borrowed: '500' },
          { asset: 'BTC', free: '0.5', locked: '0' },
        ],
      },
    });

    const balances = await exchange.getWalletBalances(AccountWalletType.MARGIN);

    expect(getSpy.mock.calls[0][0]).toBe('/sapi/v1/margin/account');
    // Borrowed funds are not ours to move, so they are left out entirely.
    expect(balances.find((b) => b.asset === 'USDT')?.total.toString()).toBe('110');
    expect(balances.find((b) => b.asset === 'BTC')?.free.toString()).toBe('0.5');
  });

  it('narrows isolated margin balances to the requested pair', async () => {
    getSpy.mockResolvedValue({
      data: {
        assets: [
          {
            symbol: 'BTCUSDT',
            baseAsset: { asset: 'BTC', free: '0.25', locked: '0' },
            quoteAsset: { asset: 'USDT', free: '1000', locked: '0' },
          },
          {
            symbol: 'ETHUSDT',
            baseAsset: { asset: 'ETH', free: '5', locked: '0' },
            quoteAsset: { asset: 'USDT', free: '250', locked: '0' },
          },
        ],
      },
    });

    const balances = await exchange.getWalletBalances(
      AccountWalletType.ISOLATED_MARGIN,
      'btcusdt',
    );

    expect(balances.map((b) => b.asset).sort()).toEqual(['BTC', 'USDT']);
    expect(balances.find((b) => b.asset === 'USDT')?.total.toString()).toBe('1000');
  });

  it('aggregates isolated margin balances across pairs when no pair is given', async () => {
    getSpy.mockResolvedValue({
      data: {
        assets: [
          {
            symbol: 'BTCUSDT',
            baseAsset: { asset: 'BTC', free: '0.25', locked: '0' },
            quoteAsset: { asset: 'USDT', free: '1000', locked: '0' },
          },
          {
            symbol: 'ETHUSDT',
            baseAsset: { asset: 'ETH', free: '5', locked: '1' },
            quoteAsset: { asset: 'USDT', free: '250', locked: '0' },
          },
        ],
      },
    });

    const balances = await exchange.getWalletBalances(AccountWalletType.ISOLATED_MARGIN);

    expect(balances.find((b) => b.asset === 'USDT')?.total.toString()).toBe('1250');
    expect(balances.find((b) => b.asset === 'ETH')?.locked.toString()).toBe('1');
  });

  it('fails loudly when the requested isolated margin pair does not exist', async () => {
    getSpy.mockResolvedValue({ data: { assets: [] } });

    await expect(
      exchange.getWalletBalances(AccountWalletType.ISOLATED_MARGIN, 'BTCUSDT'),
    ).rejects.toThrow(/no isolated margin account/);
  });

  it('lists the isolated margin pairs it can transfer against', async () => {
    getSpy.mockResolvedValue({
      data: {
        assets: [
          { symbol: 'ETHUSDT', isolatedCreated: true },
          { symbol: 'BTCUSDT', isolatedCreated: true },
          { symbol: 'SOLUSDT', isolatedCreated: false },
        ],
      },
    });

    expect(await exchange.getIsolatedMarginSymbols()).toEqual(['BTCUSDT', 'ETHUSDT']);
  });

  it('cannot report an options balance and says so', async () => {
    // Binance's Options API has no balance endpoint at all. The wallet is still
    // a valid transfer source, so this has to fail loudly rather than report 0.
    await expect(exchange.getWalletBalances(AccountWalletType.OPTION)).rejects.toThrow(
      /does not expose an Options wallet balance/,
    );
  });
});
