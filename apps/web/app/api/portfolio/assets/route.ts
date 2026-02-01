'use server';

import { NextResponse } from 'next/server';

import { getDataManager } from '@/lib/data-manager';
import { getSession } from '@/lib/auth';

export interface AssetData {
  asset: string;
  exchange: string;
  free: number;
  locked: number;
  total: number;
  percentage: number;
  estimatedValue?: number;
}

export interface AssetsSummary {
  totalAssets: number;
  uniqueAssets: number;
  totalValue: number;
  exchanges: string[];
}

const STABLECOINS = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'USDP']);

const priceCache = new Map<string, { value: number; updatedAt: number }>();
const PRICE_CACHE_TTL_MS = 30_000;

const getCachedPrice = (key: string) => {
  const cached = priceCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.updatedAt > PRICE_CACHE_TTL_MS) return null;
  return cached.value;
};

const setCachedPrice = (key: string, value: number) => {
  priceCache.set(key, { value, updatedAt: Date.now() });
};

const fetchBinancePrices = async (assets: string[]) => {
  const symbols = assets.map((asset) => `${asset}USDT`);
  const response = await fetch(
    `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(
      JSON.stringify(symbols),
    )}`,
    { next: { revalidate: 30 } },
  );

  if (!response.ok) {
    return new Map<string, number>();
  }

  const data = (await response.json()) as Array<{ symbol: string; price: string }>;
  const prices = new Map<string, number>();
  for (const item of data) {
    const asset = item.symbol.replace('USDT', '');
    prices.set(asset, parseFloat(item.price));
  }
  return prices;
};

const fetchOkxPrices = async (assets: string[]) => {
  const prices = new Map<string, number>();
  await Promise.all(
    assets.map(async (asset) => {
      const response = await fetch(
        `https://www.okx.com/api/v5/market/ticker?instId=${asset}-USDT`,
        { next: { revalidate: 30 } },
      );
      if (!response.ok) return;
      const result = await response.json();
      const price = parseFloat(result?.data?.[0]?.last ?? '0');
      if (price > 0) {
        prices.set(asset, price);
      }
    }),
  );
  return prices;
};

const fetchCoinbasePrices = async (assets: string[]) => {
  const prices = new Map<string, number>();
  await Promise.all(
    assets.map(async (asset) => {
      const response = await fetch(
        `https://api.exchange.coinbase.com/products/${asset}-USDC/ticker`,
        { next: { revalidate: 30 } },
      );
      if (!response.ok) return;
      const result = await response.json();
      const price = parseFloat(result?.price ?? '0');
      if (price > 0) {
        prices.set(asset, price);
      }
    }),
  );
  return prices;
};

/**
 * GET /api/portfolio/assets - Get detailed asset breakdown
 *
 * Query params:
 * - exchange?: string - Exchange name filter
 * - minValue?: number - Minimum total value filter
 */
export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const exchangeFilter = searchParams.get('exchange') || 'all';
    const minValue = parseFloat(searchParams.get('minValue') || '0');

    const dm = await getDataManager();
    
    // Optimized: Get latest state from AccountInfo and Balance entities
    const accounts = await dm.getUserAccountsWithBalances(session.user.id);
    
    if (accounts.length === 0) {
      return NextResponse.json({
        summary: { totalAssets: 0, uniqueAssets: 0, totalValue: 0, exchanges: [] },
        assets: [],
        assetsByExchange: {},
        aggregatedAssets: [],
        timestamp: new Date(),
      });
    }

    // Process assets from all accounts
    const allAssets: AssetData[] = [];
    const assetsByExchange: Record<string, AssetData[]> = {};
    const aggregatedAssetsMap = new Map<string, any>();
    const exchanges: string[] = [];
    const assetsByExchangeMap = new Map<string, Set<string>>();

    for (const account of accounts) {
      const balances = await dm.getAccountBalances(account.id);
      const exchange = account.exchange;
      
      if (!exchanges.includes(exchange)) {
        exchanges.push(exchange);
      }

      assetsByExchange[exchange] = [];
      const assetSet = assetsByExchangeMap.get(exchange) || new Set<string>();

      for (const balance of balances) {
        assetSet.add(balance.asset.toUpperCase());

        const free = parseFloat(balance.free.toString());
        const locked = parseFloat(balance.locked.toString());
        const total = parseFloat(balance.total.toString());

        const assetData: AssetData = {
          asset: balance.asset,
          exchange: exchange,
          free,
          locked,
          total,
          percentage: 0,
        };

        allAssets.push(assetData);
        assetsByExchange[exchange].push(assetData);

        const existing = aggregatedAssetsMap.get(balance.asset);
        if (existing) {
          existing.free += free;
          existing.locked += locked;
          existing.total += total;
        } else {
          aggregatedAssetsMap.set(balance.asset, {
            asset: balance.asset,
            free,
            locked,
            total,
          });
        }
      }
      assetsByExchangeMap.set(exchange, assetSet);
    }

    const priceByExchangeAsset = new Map<string, number>();
    const priceByAsset = new Map<string, number>();
    await Promise.all(
      Array.from(assetsByExchangeMap.entries()).map(async ([exchange, assets]) => {
        const upperExchange = exchange.toLowerCase();
        const filteredAssets = Array.from(assets).filter(
          (asset) => !STABLECOINS.has(asset),
        );

        const cacheKeyPrefix = `${upperExchange}:`;
        const missingAssets: string[] = [];
        for (const asset of filteredAssets) {
          const cached = getCachedPrice(`${cacheKeyPrefix}${asset}`);
          if (cached !== null) {
            priceByExchangeAsset.set(`${cacheKeyPrefix}${asset}`, cached);
            if (!priceByAsset.has(asset)) {
              priceByAsset.set(asset, cached);
            }
          } else {
            missingAssets.push(asset);
          }
        }

        if (missingAssets.length === 0) return;

        let fetchedPrices = new Map<string, number>();
        if (upperExchange === 'binance') {
          fetchedPrices = await fetchBinancePrices(missingAssets);
        } else if (upperExchange === 'okx') {
          fetchedPrices = await fetchOkxPrices(missingAssets);
        } else if (upperExchange === 'coinbase') {
          fetchedPrices = await fetchCoinbasePrices(missingAssets);
        }

        for (const [asset, price] of fetchedPrices.entries()) {
          const key = `${cacheKeyPrefix}${asset}`;
          priceByExchangeAsset.set(key, price);
          if (!priceByAsset.has(asset)) {
            priceByAsset.set(asset, price);
          }
          setCachedPrice(key, price);
        }
      }),
    );

    let totalValue = 0;
    const filteredAssets: AssetData[] = [];
    const filteredAssetsByExchange: Record<string, AssetData[]> = {};

    for (const assetData of allAssets) {
      const assetUpper = assetData.asset.toUpperCase();
      let estimatedValue: number | undefined;
      if (STABLECOINS.has(assetUpper)) {
        estimatedValue = assetData.total;
      } else {
        const price = priceByExchangeAsset.get(
          `${assetData.exchange.toLowerCase()}:${assetUpper}`,
        );
        if (price !== undefined) {
          estimatedValue = assetData.total * price;
        }
      }

      assetData.estimatedValue = estimatedValue;

      const valueForTotals = estimatedValue ?? 0;
      if (valueForTotals < minValue) {
        continue;
      }

      totalValue += valueForTotals;

      filteredAssets.push(assetData);

      if (!filteredAssetsByExchange[assetData.exchange]) {
        filteredAssetsByExchange[assetData.exchange] = [];
      }
      filteredAssetsByExchange[assetData.exchange].push(assetData);
    }

    // Calculate percentages
    if (totalValue > 0) {
      for (const asset of filteredAssets) {
        const valueForTotals = asset.estimatedValue ?? 0;
        asset.percentage = (valueForTotals / totalValue) * 100;
      }
    }

    // Convert aggregated map to array with percentages
    const aggregatedAssets = Array.from(aggregatedAssetsMap.values())
      .map((item) => {
        const assetUpper = item.asset.toUpperCase();
        let estimatedValue: number | undefined;
        if (STABLECOINS.has(assetUpper)) {
          estimatedValue = item.total;
        } else {
          const price = priceByAsset.get(assetUpper);
          if (price !== undefined) {
            estimatedValue = item.total * price;
          }
        }

        const valueForTotals = estimatedValue ?? 0;
        return {
          ...item,
          estimatedValue,
          percentage: totalValue > 0 ? (valueForTotals / totalValue) * 100 : 0,
        };
      })
      .filter((item) => (item.estimatedValue ?? 0) >= minValue)
      .sort((a, b) => (b.estimatedValue ?? b.total) - (a.estimatedValue ?? a.total));

    // Sort all assets by total value descending
    filteredAssets.sort(
      (a, b) => (b.estimatedValue ?? b.total) - (a.estimatedValue ?? a.total),
    );

    // Get unique asset count
    const uniqueAssets = new Set(filteredAssets.map((a) => a.asset)).size;

    return NextResponse.json({
      summary: {
        totalAssets: filteredAssets.length,
        uniqueAssets,
        totalValue,
        exchanges,
      },
      assets: filteredAssets,
      assetsByExchange: filteredAssetsByExchange,
      aggregatedAssets,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Portfolio assets error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch portfolio assets' },
      { status: 500 },
    );
  }
}
