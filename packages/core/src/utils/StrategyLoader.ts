import type { IExchange, IStrategy } from '../interfaces';
import type { InitialDataResult, InitialDataConfig, KlineInterval } from '../types';
import type { ILogger } from '../interfaces';

/**
 * 🔄 Strategy Loader
 *
 * Loads initial data for strategies based on their configuration
 * This includes historical klines, current positions, open orders, balances, etc.
 *
 * @param strategy - The strategy instance to load data for
 * @param exchanges - Map of exchange instances
 * @param logger - Logger instance for debugging
 * @returns InitialDataResult containing the loaded data
 */
export async function loadInitialDataForStrategy(
  strategy: IStrategy,
  exchanges: Map<string, IExchange>,
  logger?: ILogger,
): Promise<InitialDataResult> {
  // 1. Extract context from strategy
  const context = strategy.context;
  if (!context) {
    logger?.warn('No context available in strategy');
    return {} as InitialDataResult;
  }

  const { initialDataConfig } = context;

  // 2. Get exchange instance
  const exchangeName = Array.isArray(context.exchange)
    ? context.exchange[0]
    : context.exchange;
  const exchange = exchanges.get(exchangeName);

  if (!exchange) {
    const strategyName = strategy.strategyType || 'unknown';
    throw new Error(`Exchange ${exchangeName} not found for strategy ${strategyName}`);
  }

  // 3. Load initial data based on initialData config
  if (!initialDataConfig) {
    return {} as InitialDataResult; // No initial data requested
  }

  const symbol = context.symbol;

  if (!symbol) {
    logger?.warn('No symbol found in strategy context, skipping initial data load');
    return {} as InitialDataResult;
  }

  const result: Partial<InitialDataResult> = {};

  const typedInitialData = initialDataConfig as InitialDataConfig;

  // Log what initial data is requested
  logger?.info(`🔍 Initial data configuration for ${symbol}:`, {
    klines: typedInitialData.klines ? 'Yes' : 'No',
    positions: typedInitialData.fetchPositions ? 'Yes' : 'No',
    openOrders: typedInitialData.fetchOpenOrders ? 'Yes' : 'No',
    balance: typedInitialData.fetchBalance ? 'Yes' : 'No',
    accountInfo: typedInitialData.fetchAccountInfo ? 'Yes' : 'No',
    ticker: typedInitialData.fetchTicker ? 'Yes' : 'No',
    orderBook: typedInitialData.fetchOrderBook ? 'Yes' : 'No',
  });

  // 3.1 Load Klines
  // Handle both array format and object format for backward compatibility
  if (typedInitialData.klines) {
    result.klines = {};

    let klineConfigs: Array<{ interval: string; limit: number }> = [];

    // Standard format (used by system): { "15m": 20, "1h": 10 }
    // Legacy format (backward compatibility): [{ interval: "15m", limit: 20 }]
    if (Array.isArray(typedInitialData.klines)) {
      // Legacy array format (for backward compatibility)
      klineConfigs = typedInitialData.klines;
    } else if (typeof typedInitialData.klines === 'object') {
      // Standard object format: { interval: limit }
      const klinesObj = typedInitialData.klines as Record<string, number>;
      klineConfigs = Object.entries(klinesObj).map(([interval, limit]) => ({
        interval,
        limit,
      }));
    }

    // Load klines for each configuration
    for (const klineConfig of klineConfigs) {
      const interval = klineConfig.interval as KlineInterval;
      const klines = await exchange.getKlines(
        symbol,
        interval,
        undefined,
        undefined,
        klineConfig.limit,
      );
      result.klines[interval] = klines;
    }
  }

  // 3.2 Load Positions
  if (typedInitialData.fetchPositions) {
    logger?.info(`📊 Fetching initial positions for ${symbol}`);
    const allPositions = await exchange.getPositions();
    // Filter to only positions for this strategy's symbol
    result.positions = allPositions.filter((p) => p.symbol === symbol);
    logger?.info(`✅ Loaded ${result.positions.length} position(s) for ${symbol}`);
  }

  // 3.3 Load Open Orders
  if (typedInitialData.fetchOpenOrders) {
    logger?.info(`📋 Fetching initial open orders for ${symbol}`);
    const openOrders = await exchange.getOpenOrders(symbol);
    result.openOrders = openOrders;
    logger?.info(`✅ Loaded ${openOrders.length} open order(s) for ${symbol}`);
  }

  // 3.4 Load Balance
  if (typedInitialData.fetchBalance) {
    logger?.info(`💰 Fetching account balances`);
    const balance = await exchange.getBalances();
    result.balance = balance;
    const nonZeroBalances = balance.filter(
      (b) => parseFloat(b.free.toString()) > 0 || parseFloat(b.locked.toString()) > 0,
    );
    logger?.info(`✅ Loaded ${nonZeroBalances.length} non-zero balance(s)`);
  }

  // 3.5 Load Account Info
  if (typedInitialData.fetchAccountInfo) {
    logger?.info(`ℹ️  Fetching account info`);
    const accountInfo = await exchange.getAccountInfo();
    result.accountInfo = accountInfo;
    logger?.info(`✅ Loaded account info`);
  }

  // 3.6 Load Ticker
  if (typedInitialData.fetchTicker) {
    logger?.info(`📈 Fetching current ticker for ${symbol}`);
    const ticker = await exchange.getTicker(symbol);
    result.ticker = ticker;
    logger?.info(`✅ Loaded ticker: ${ticker.price} (${symbol})`);
  }

  // 3.7 Load Order Book
  if (typedInitialData.fetchOrderBook) {
    logger?.info(`📖 Fetching order book for ${symbol}`);
    const depth = typedInitialData.fetchOrderBook?.depth || 20;
    const orderBook = await exchange.getOrderBook(symbol, depth);
    result.orderBook = orderBook;
    logger?.info(
      `✅ Loaded order book: ${orderBook.bids.length} bids, ${orderBook.asks.length} asks`,
    );
  }

  logger?.info(`✅ Initial data loaded for ${symbol}`);
  return result as InitialDataResult;
}
