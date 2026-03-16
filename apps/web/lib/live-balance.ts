/**
 * Shared live-balance utility
 *
 * Provides price-fetching and USD value computation that is used by BOTH:
 *   - /api/portfolio/assets   (asset list + totalValue)
 *   - /api/analytics/account  (account summary totalBalance + per-exchange breakdown)
 *
 * This ensures the two apps (mobile / web) always see the same number because
 * they both ultimately hit /api/analytics/account for the totalBalance.
 */

export const STABLECOINS = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'USDP']);

/** Module-level price cache shared across all API routes in the same process. */
const priceCache = new Map<string, { value: number; updatedAt: number }>();
const PRICE_CACHE_TTL_MS = 30_000;

export const getCachedPrice = (key: string): number | null => {
  const cached = priceCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.updatedAt > PRICE_CACHE_TTL_MS) return null;
  return cached.value;
};

export const setCachedPrice = (key: string, value: number): void => {
  priceCache.set(key, { value, updatedAt: Date.now() });
};

export const fetchBinancePrices = async (
  assets: string[],
): Promise<Map<string, number>> => {
  const symbols = assets.map((asset) => `${asset}USDT`);
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(
        JSON.stringify(symbols),
      )}`,
      { next: { revalidate: 30 } },
    );
    if (!response.ok) return new Map();
    const data = (await response.json()) as Array<{ symbol: string; price: string }>;
    const prices = new Map<string, number>();
    for (const item of data) {
      const asset = item.symbol.replace('USDT', '');
      prices.set(asset, parseFloat(item.price));
    }
    return prices;
  } catch {
    return new Map();
  }
};

export const fetchOkxPrices = async (assets: string[]): Promise<Map<string, number>> => {
  const prices = new Map<string, number>();
  await Promise.all(
    assets.map(async (asset) => {
      try {
        const response = await fetch(
          `https://www.okx.com/api/v5/market/ticker?instId=${asset}-USDT`,
          { next: { revalidate: 30 } },
        );
        if (!response.ok) return;
        const result = await response.json();
        const price = parseFloat(result?.data?.[0]?.last ?? '0');
        if (price > 0) prices.set(asset, price);
      } catch {
        // ignore per-asset fetch errors
      }
    }),
  );
  return prices;
};

export const fetchCoinbasePrices = async (
  assets: string[],
): Promise<Map<string, number>> => {
  const prices = new Map<string, number>();
  await Promise.all(
    assets.map(async (asset) => {
      try {
        const response = await fetch(
          `https://api.exchange.coinbase.com/products/${asset}-USDC/ticker`,
          { next: { revalidate: 30 } },
        );
        if (!response.ok) return;
        const result = await response.json();
        const price = parseFloat(result?.price ?? '0');
        if (price > 0) prices.set(asset, price);
      } catch {
        // ignore per-asset fetch errors
      }
    }),
  );
  return prices;
};

export interface AssetWithExchange {
  asset: string;
  exchange: string;
  total: number;
}

export interface LiveBalanceResult {
  /** Grand total USD value across all exchanges / assets. */
  totalValue: number;
  /** USD value broken down per exchange name (lowercase). */
  valueByExchange: Map<string, number>;
  /** "exchange:ASSET" → USD price (for callers that need per-asset pricing). */
  priceByExchangeAsset: Map<string, number>;
  /** "ASSET" → USD price (cross-exchange best-effort; for aggregated views). */
  priceByAsset: Map<string, number>;
}

/**
 * Compute live USD values for a list of asset holdings.
 *
 * Stablecoins are treated as 1 USD per unit.
 * Non-stablecoin prices are fetched from the exchange's public price API,
 * with a 30-second in-process cache to limit external requests.
 *
 * @param assets  Flat list of {asset, exchange, total} entries.
 * @param minValue  Skip assets whose estimated value is below this threshold
 *                  (useful for the asset-list view; pass 0 to keep all).
 */
export async function computeLiveBalances(
  assets: AssetWithExchange[],
  minValue = 0,
): Promise<LiveBalanceResult> {
  // Group non-stablecoin assets by exchange so we can batch-fetch prices.
  const assetsByExchangeMap = new Map<string, Set<string>>();
  for (const { asset, exchange } of assets) {
    if (STABLECOINS.has(asset.toUpperCase())) continue;
    const key = exchange.toLowerCase();
    const set = assetsByExchangeMap.get(key) ?? new Set<string>();
    set.add(asset.toUpperCase());
    assetsByExchangeMap.set(key, set);
  }

  const priceByExchangeAsset = new Map<string, number>();
  const priceByAsset = new Map<string, number>();

  await Promise.all(
    Array.from(assetsByExchangeMap.entries()).map(async ([exchange, assetSet]) => {
      const filteredAssets = Array.from(assetSet);
      const cacheKeyPrefix = `${exchange}:`;
      const missingAssets: string[] = [];

      for (const asset of filteredAssets) {
        const cached = getCachedPrice(`${cacheKeyPrefix}${asset}`);
        if (cached !== null) {
          priceByExchangeAsset.set(`${cacheKeyPrefix}${asset}`, cached);
          if (!priceByAsset.has(asset)) priceByAsset.set(asset, cached);
        } else {
          missingAssets.push(asset);
        }
      }

      if (missingAssets.length === 0) return;

      let fetched = new Map<string, number>();
      if (exchange === 'binance') {
        fetched = await fetchBinancePrices(missingAssets);
      } else if (exchange === 'okx') {
        fetched = await fetchOkxPrices(missingAssets);
      } else if (exchange === 'coinbase') {
        fetched = await fetchCoinbasePrices(missingAssets);
      }

      for (const [asset, price] of fetched.entries()) {
        const key = `${cacheKeyPrefix}${asset}`;
        priceByExchangeAsset.set(key, price);
        if (!priceByAsset.has(asset)) priceByAsset.set(asset, price);
        setCachedPrice(key, price);
      }
    }),
  );

  // Compute USD values.
  let totalValue = 0;
  const valueByExchange = new Map<string, number>();

  for (const { asset, exchange, total } of assets) {
    const assetUpper = asset.toUpperCase();
    const exchangeLower = exchange.toLowerCase();

    let usdValue: number;
    if (STABLECOINS.has(assetUpper)) {
      usdValue = total;
    } else {
      const price = priceByExchangeAsset.get(`${exchangeLower}:${assetUpper}`) ?? 0;
      usdValue = total * price;
    }

    if (usdValue < minValue) continue;

    totalValue += usdValue;
    valueByExchange.set(
      exchangeLower,
      (valueByExchange.get(exchangeLower) ?? 0) + usdValue,
    );
  }

  return { totalValue, valueByExchange, priceByExchangeAsset, priceByAsset };
}
