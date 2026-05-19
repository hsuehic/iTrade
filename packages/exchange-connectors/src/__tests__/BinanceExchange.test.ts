import { describe, it, expect, vi, beforeEach } from 'vitest';
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
