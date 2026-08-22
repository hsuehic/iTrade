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

export const STABLECOINS = new Set([
  'USDT',
  'USDC',
  'DAI',
  'BUSD',
  'TUSD',
  'USDP',
  'FDUSD',
]);

/** Only refresh cached prices for holdings worth at least this much (USD). */
export const PRICE_FETCH_MIN_USD = 10;

/** Module-level price cache shared across all API routes in the same process. */
const priceCache = new Map<string, { value: number; updatedAt: number }>();
const PRICE_CACHE_TTL_MS = 30_000;

/** Binance full-ticker cache (one HTTP call covers all symbols). */
let binanceAllPricesCache: { prices: Map<string, number>; updatedAt: number } | null =
  null;

export const getCachedPrice = (key: string): number | null => {
  const cached = priceCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.updatedAt > PRICE_CACHE_TTL_MS) return null;
  return cached.value;
};

export const setCachedPrice = (key: string, value: number): void => {
  priceCache.set(key, { value, updatedAt: Date.now() });
};

const shouldCachePrice = (total: number, price: number): boolean => {
  return total * price >= PRICE_FETCH_MIN_USD;
};

/**
 * Fetch all Binance spot prices in a single request, then pick the assets we need.
 * Avoids 414 errors and rate limits from huge per-symbol query strings.
 */
export const fetchBinanceAllPrices = async (): Promise<Map<string, number>> => {
  if (
    binanceAllPricesCache &&
    Date.now() - binanceAllPricesCache.updatedAt <= PRICE_CACHE_TTL_MS
  ) {
    return binanceAllPricesCache.prices;
  }

  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/price', {
      next: { revalidate: 30 },
    });
    if (!response.ok) return binanceAllPricesCache?.prices ?? new Map();

    const data = (await response.json()) as Array<{ symbol: string; price: string }>;
    const prices = new Map<string, number>();
    for (const item of data) {
      if (!item.symbol.endsWith('USDT')) continue;
      const asset = item.symbol.slice(0, -4);
      prices.set(asset, parseFloat(item.price));
    }

    binanceAllPricesCache = { prices, updatedAt: Date.now() };
    return prices;
  } catch {
    return binanceAllPricesCache?.prices ?? new Map();
  }
};

/**
 * Cache for Binance Futures (fapi) prices — keyed by full futures symbol
 * (e.g. "ZECUSDC", "BTCUSDT").  Separate from the spot cache so a spot
 * fetch never shadows a futures price or vice-versa.
 */
let binanceFuturesPriceCache: {
  prices: Map<string, number>;
  updatedAt: number;
} | null = null;

/**
 * Fetch all Binance **futures** prices in a single request from fapi.
 * Used when the strategy trades perpetual contracts — the spot price can
 * differ significantly from the perp price for assets with non-trivial
 * basis spread (e.g. ZEC, where spot ≠ perp by ~1%).
 *
 * Returns a map keyed by the full futures symbol (e.g. "ZECUSDC").
 */
export const fetchBinanceAllFuturesPrices = async (): Promise<Map<string, number>> => {
  if (
    binanceFuturesPriceCache &&
    Date.now() - binanceFuturesPriceCache.updatedAt <= PRICE_CACHE_TTL_MS
  ) {
    return binanceFuturesPriceCache.prices;
  }

  try {
    const response = await fetch('https://fapi.binance.com/fapi/v1/ticker/price', {
      next: { revalidate: 30 },
    });
    if (!response.ok) return binanceFuturesPriceCache?.prices ?? new Map();

    const data = (await response.json()) as Array<{
      symbol: string;
      price: string;
    }>;
    const prices = new Map<string, number>();
    for (const item of data) {
      prices.set(item.symbol, parseFloat(item.price));
    }

    binanceFuturesPriceCache = { prices, updatedAt: Date.now() };
    return prices;
  } catch {
    return binanceFuturesPriceCache?.prices ?? new Map();
  }
};

/**
 * Look up a single Binance futures price by base + quote asset.
 * Uses the bulk futures cache; falls back to '' (not found) if missing.
 */
export const fetchBinanceFuturesPrice = async (
  baseAsset: string,
  quoteAsset: string,
): Promise<number | null> => {
  const allPrices = await fetchBinanceAllFuturesPrices();
  const symbol = `${baseAsset.toUpperCase()}${quoteAsset.toUpperCase()}`;
  const price = allPrices.get(symbol);
  return price !== undefined ? price : null;
};

export const fetchBinancePrices = async (
  assets: string[],
): Promise<Map<string, number>> => {
  if (assets.length === 0) return new Map();

  const allPrices = await fetchBinanceAllPrices();
  const prices = new Map<string, number>();
  for (const asset of assets) {
    const price = allPrices.get(asset.toUpperCase());
    if (price !== undefined) prices.set(asset, price);
  }
  return prices;
};

export const fetchOkxPrices = async (assets: string[]): Promise<Map<string, number>> => {
  const prices = new Map<string, number>();
  const assetsToFetch: string[] = [];

  for (const asset of assets) {
    const cacheKey = `okx:${asset.toUpperCase()}`;
    const cached = getCachedPrice(cacheKey);
    if (cached !== null) {
      prices.set(asset, cached);
    } else {
      assetsToFetch.push(asset);
    }
  }

  await Promise.all(
    assetsToFetch.map(async (asset) => {
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
  const assetsToFetch: string[] = [];

  for (const asset of assets) {
    const cacheKey = `coinbase:${asset.toUpperCase()}`;
    const cached = getCachedPrice(cacheKey);
    if (cached !== null) {
      prices.set(asset, cached);
    } else {
      assetsToFetch.push(asset);
    }
  }

  await Promise.all(
    assetsToFetch.map(async (asset) => {
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

/**
 * Get a single real-time price for a trading-pair symbol on a given exchange.
 * Reuses the same per-exchange fetchers + 30s cache as `computeLiveBalances`.
 *
 * For Binance, when `marketType` is `"perpetual"` (or inferred from a symbol
 * containing `:USDC` / `:USDT`), the price is fetched from Binance **Futures**
 * (fapi) instead of spot — perpetual prices can differ materially from spot
 * for assets with non-trivial basis spread (e.g. ZEC).
 */
export async function getCurrentPrice(
  symbol: string,
  exchange: string,
  marketType?: string,
): Promise<number | null> {
  const parts = symbol.split(/[/:]/);
  const baseAsset = parts[0]?.toUpperCase();
  if (!baseAsset) return null;

  const quoteAsset = parts[1]?.toUpperCase() ?? 'USDT';

  if (STABLECOINS.has(baseAsset)) return 1;

  const exchangeLower = exchange.toLowerCase();

  // For Binance perpetuals, use the futures API (fapi) so unrealized PnL
  // reflects the contract price, not the spot price.
  const isPerp =
    marketType === 'perpetual' || symbol.includes(':USDC') || symbol.includes(':USDT');

  if (exchangeLower === 'binance' && isPerp) {
    const cacheKey = `binance-futures:${baseAsset}${quoteAsset}`;
    const cached = getCachedPrice(cacheKey);
    if (cached !== null) return cached;

    const price = await fetchBinanceFuturesPrice(baseAsset, quoteAsset);
    if (price !== null) {
      setCachedPrice(cacheKey, price);
    }
    return price;
  }

  const cacheKey = `${exchangeLower}:${baseAsset}`;
  const cached = getCachedPrice(cacheKey);
  if (cached !== null) return cached;

  let fetched = new Map<string, number>();
  if (exchangeLower === 'binance') {
    fetched = await fetchBinancePrices([baseAsset]);
  } else if (exchangeLower === 'okx') {
    fetched = await fetchOkxPrices([baseAsset]);
  } else if (exchangeLower === 'coinbase') {
    fetched = await fetchCoinbasePrices([baseAsset]);
  }

  const price = fetched.get(baseAsset);
  if (price === undefined) return null;

  setCachedPrice(cacheKey, price);
  return price;
}

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
 * Price refresh policy:
 * - Binance: one bulk ticker call, then filter locally (no per-asset rate-limit risk)
 * - OKX / Coinbase: only fetch uncached tickers when stablecoin qty >= $10
 * - Cache is updated only for holdings worth >= PRICE_FETCH_MIN_USD ($10)
 */
export async function computeLiveBalances(
  assets: AssetWithExchange[],
  minValue = 0,
): Promise<LiveBalanceResult> {
  const holdingsByExchange = new Map<string, Map<string, number>>();
  const assetsByExchangeMap = new Map<string, Set<string>>();

  for (const { asset, exchange, total } of assets) {
    if (total <= 0) continue;

    const exchangeLower = exchange.toLowerCase();
    const assetUpper = asset.toUpperCase();

    const holdings = holdingsByExchange.get(exchangeLower) ?? new Map<string, number>();
    holdings.set(assetUpper, total);
    holdingsByExchange.set(exchangeLower, holdings);

    if (STABLECOINS.has(assetUpper)) continue;

    const set = assetsByExchangeMap.get(exchangeLower) ?? new Set<string>();
    set.add(assetUpper);
    assetsByExchangeMap.set(exchangeLower, set);
  }

  const priceByExchangeAsset = new Map<string, number>();
  const priceByAsset = new Map<string, number>();

  await Promise.all(
    Array.from(assetsByExchangeMap.entries()).map(async ([exchange, assetSet]) => {
      const cacheKeyPrefix = `${exchange}:`;
      const holdings = holdingsByExchange.get(exchange) ?? new Map<string, number>();
      const missingAssets: string[] = [];

      for (const asset of assetSet) {
        const cacheKey = `${cacheKeyPrefix}${asset}`;
        const cached = getCachedPrice(cacheKey);
        if (cached !== null) {
          priceByExchangeAsset.set(cacheKey, cached);
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
        const assetUpper = asset.toUpperCase();
        const key = `${cacheKeyPrefix}${assetUpper}`;
        priceByExchangeAsset.set(key, price);
        if (!priceByAsset.has(assetUpper)) priceByAsset.set(assetUpper, price);

        const total = holdings.get(assetUpper) ?? 0;
        if (shouldCachePrice(total, price)) {
          setCachedPrice(key, price);
        }
      }
    }),
  );

  let totalValue = 0;
  const valueByExchange = new Map<string, number>();

  for (const { asset, exchange, total } of assets) {
    if (total <= 0) continue;

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
