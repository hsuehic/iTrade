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
