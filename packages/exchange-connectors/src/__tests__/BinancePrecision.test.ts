import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BinanceExchange } from '../binance/BinanceExchange';
import { PrecisionUtils } from '@itrade/core';
import { Decimal } from 'decimal.js';

describe('Binance Precision Parsing', () => {
  let exchange: BinanceExchange;

  beforeEach(() => {
    exchange = new BinanceExchange(false);
  });

  it('should correctly parse WLDUSDC Futures metadata and round prices', async () => {
    // Mock Futures exchangeInfo response for WLDUSDC
    const futuresGetSpy = vi.fn().mockResolvedValue({
      data: {
        symbols: [
          {
            symbol: 'WLDUSDC',
            pair: 'WLDUSDC',
            contractType: 'PERPETUAL',
            status: 'TRADING',
            baseAsset: 'WLD',
            quoteAsset: 'USDC',
            pricePrecision: 7,
            quantityPrecision: 1,
            filters: [
              {
                filterType: 'PRICE_FILTER',
                minPrice: '0.0001000',
                maxPrice: '200',
                tickSize: '0.0001000',
              },
              {
                filterType: 'LOT_SIZE',
                minQty: '0.1',
                maxQty: '5000000',
                stepSize: '0.1',
              },
            ],
          },
        ],
      },
    });

    (exchange as any).futuresClient.get = futuresGetSpy;

    const info = await exchange.getSymbolInfo('WLD/USDC:USDC');

    expect(info.tickSize.toString()).toBe('0.0001');
    expect(info.stepSize.toString()).toBe('0.1');
    expect(info.pricePrecision).toBe(7);
    expect(info.quantityPrecision).toBe(1);

    // Verify rounding
    const signalPrice = new Decimal('0.3768864');
    const roundedPrice = PrecisionUtils.roundPrice(
      signalPrice,
      info.tickSize,
      info.pricePrecision,
    );
    expect(roundedPrice.toString()).toBe('0.3769');
  });

  it('should handle Spot metadata where pricePrecision is missing', async () => {
    const spotGetSpy = vi.fn().mockResolvedValue({
      data: {
        symbols: [
          {
            symbol: 'BTCUSDT',
            status: 'TRADING',
            baseAsset: 'BTC',
            quoteAsset: 'USDT',
            baseAssetPrecision: 8,
            quoteAssetPrecision: 8,
            filters: [
              { filterType: 'PRICE_FILTER', tickSize: '0.01' },
              { filterType: 'LOT_SIZE', stepSize: '0.00001' },
            ],
          },
        ],
      },
    });

    (exchange as any).httpClient.get = spotGetSpy;

    const info = await exchange.getSymbolInfo('BTC/USDT');

    expect(info.tickSize.toString()).toBe('0.01');
    expect(info.pricePrecision).toBe(8); // Fell back to quoteAssetPrecision
  });

  it('should take the most restrictive (minimum) maxQuantity from multiple filters', async () => {
    const exchange = new BinanceExchange();
    const mockExchangeInfo = {
      data: {
        symbols: [
          {
            symbol: 'BTCUSDT',
            status: 'TRADING',
            baseAsset: 'BTC',
            quoteAsset: 'USDT',
            pricePrecision: 2,
            quantityPrecision: 3,
            filters: [
              {
                filterType: 'LOT_SIZE',
                minQty: '0.001',
                maxQty: '1000',
                stepSize: '0.001',
              },
              {
                filterType: 'MARKET_LOT_SIZE',
                minQty: '0.001',
                maxQty: '120',
                stepSize: '0.001',
              },
            ],
          },
        ],
      },
    };

    // Mock futures client
    (exchange as any).futuresClient = {
      get: vi.fn().mockResolvedValue(mockExchangeInfo),
    };

    const info = await exchange.getSymbolInfo('BTC/USDT:USDT');
    expect(info.maxQuantity?.toString()).toBe('120'); // Should take 120 (min), not 1000 (max)
  });
});
