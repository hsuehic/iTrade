import type { IExchange, IStrategy } from '../interfaces';
import type {
  InitialDataResult,
  InitialDataConfig,
  Kline,
  Position,
  Order,
  Balance,
  AccountInfo,
  Ticker,
  OrderBook,
} from '../types';
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

  const { initialData } = context;

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
  if (!initialData) {
    return {} as InitialDataResult; // No initial data requested
  }

  const symbol = context.symbol;

  if (!symbol) {
    logger?.warn('No symbol found in strategy context, skipping initial data load');
    return {} as InitialDataResult;
  }

  const result: Partial<InitialDataResult> = {};

  const typedInitialData = initialData as InitialDataConfig;

  // 3.1 Load Klines
  if (typedInitialData.klines && typedInitialData.klines.length > 0) {
    result.klines = {};
    for (const klineConfig of typedInitialData.klines) {
      const interval = klineConfig.interval;
      logger?.debug(`Loading ${klineConfig.limit} klines for ${symbol} (${interval})`);
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
    logger?.debug(`Loading positions for ${symbol}`);
    const allPositions = await exchange.getPositions();
    result.positions = allPositions.filter((p) => p.symbol === symbol);
  }

  // 3.3 Load Open Orders
  if (typedInitialData.fetchOpenOrders) {
    logger?.debug(`Loading open orders for ${symbol}`);
    const openOrders = await exchange.getOpenOrders(symbol);
    result.openOrders = openOrders;
  }

  // 3.4 Load Balance
  if (typedInitialData.fetchBalance) {
    logger?.debug(`Loading balances`);
    const balance = await exchange.getBalances();
    result.balance = balance;
  }

  // 3.5 Load Account Info
  if (typedInitialData.fetchAccountInfo) {
    logger?.debug(`Loading account info`);
    const accountInfo = await exchange.getAccountInfo();
    result.accountInfo = accountInfo;
  }

  // 3.6 Load Ticker
  if (typedInitialData.fetchTicker) {
    logger?.debug(`Loading ticker for ${symbol}`);
    const ticker = await exchange.getTicker(symbol);
    result.ticker = ticker;
  }

  // 3.7 Load Order Book
  if (typedInitialData.fetchOrderBook) {
    logger?.debug(`Loading order book for ${symbol}`);
    const depth = typedInitialData.fetchOrderBook?.depth || 20;
    const orderBook = await exchange.getOrderBook(symbol, depth);
    result.orderBook = orderBook;
  }

  logger?.info(`✅ Initial data loaded for ${symbol}`);
  return result as InitialDataResult;
}
