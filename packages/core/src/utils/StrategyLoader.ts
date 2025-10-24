import { IExchange } from '../interfaces';
import {
  StrategyParameters,
  InitialDataConfig,
  InitialDataResult,
  Kline,
  OrderStatus,
} from '../types';
import { ILogger } from '../interfaces';

/**
 * 策略加载器 - 在实例化策略前加载初始数据
 */
export class StrategyLoader {
  /**
   * 加载初始数据（在策略实例化之前调用）
   * @param parameters 策略参数（包含 initialData 配置）
   * @param exchange 交易所实例
   * @param logger 日志记录器
   * @returns 加载后的初始数据（添加到 parameters.loadedInitialData）
   */
  public static async loadInitialData(
    parameters: StrategyParameters,
    exchange: IExchange,
    logger?: ILogger,
  ): Promise<InitialDataResult | null> {
    const config = parameters.initialData;
    if (!config) {
      return null;
    }

    const symbol = parameters.symbol;
    if (!symbol) {
      logger?.warn('No symbol specified, skipping initial data loading');
      return null;
    }

    const exchangeName = exchange.name;
    logger?.info(`Loading initial data for ${symbol} on ${exchangeName}...`);

    const initialData: InitialDataResult = {
      symbol,
      exchange: exchangeName,
      timestamp: new Date(),
    };

    try {
      // 1. 加载历史 K 线数据
      if (config.klines && config.klines.length > 0) {
        initialData.klines = {};
        for (const klineConfig of config.klines) {
          try {
            const klines = await exchange.getKlines(
              symbol,
              klineConfig.interval,
              undefined,
              undefined,
              klineConfig.limit,
            );
            initialData.klines[klineConfig.interval] = klines;
            logger?.info(
              `  📈 Loaded ${klines.length} klines for ${klineConfig.interval}`,
            );
          } catch (error) {
            logger?.error(
              `Failed to fetch klines (${klineConfig.interval})`,
              error as Error,
            );
          }
        }
      }

      // 2. 加载当前持仓
      if (config.fetchPositions) {
        try {
          const allPositions = await exchange.getPositions();
          initialData.positions = allPositions.filter((p) => p.symbol === symbol);
          logger?.info(`  💼 Loaded ${initialData.positions.length} position(s)`);
        } catch (error) {
          logger?.error('Failed to fetch positions', error as Error);
        }
      }

      // 3. 加载挂单
      if (config.fetchOpenOrders) {
        try {
          const allOrders = await exchange.getOpenOrders(symbol);
          initialData.openOrders = allOrders;
          logger?.info(`  📝 Loaded ${initialData.openOrders.length} open order(s)`);
        } catch (error) {
          logger?.error('Failed to fetch orders', error as Error);
        }
      }

      // 4. 加载账户余额
      if (config.fetchBalance) {
        try {
          initialData.balance = await exchange.getBalances();
          logger?.info(`  💰 Loaded balance (${initialData.balance.length} asset(s))`);
        } catch (error) {
          logger?.error('Failed to fetch balance', error as Error);
        }
      }

      // 5. 加载账户信息
      if (config.fetchAccountInfo) {
        try {
          initialData.accountInfo = await exchange.getAccountInfo();
          logger?.info('  ℹ️  Loaded account info');
        } catch (error) {
          logger?.error('Failed to fetch account info', error as Error);
        }
      }

      // 6. 加载当前 Ticker
      if (config.fetchTicker) {
        try {
          initialData.ticker = await exchange.getTicker(symbol);
          logger?.info(`  🎯 Current price: ${initialData.ticker.price.toString()}`);
        } catch (error) {
          logger?.error('Failed to fetch ticker', error as Error);
        }
      }

      // 7. 加载订单簿
      if (config.fetchOrderBook?.enabled) {
        try {
          const depth = config.fetchOrderBook.depth || 20;
          initialData.orderBook = await exchange.getOrderBook(symbol, depth);
          logger?.info(`  📊 Loaded order book (${depth} levels)`);
        } catch (error) {
          logger?.error('Failed to fetch order book', error as Error);
        }
      }

      logger?.info('✅ Initial data loaded successfully');
      return initialData;
    } catch (error) {
      logger?.error('Failed to load initial data', error as Error);
      return null;
    }
  }

  /**
   * 准备策略参数（加载初始数据并添加到参数中）
   * @param parameters 原始策略参数
   * @param exchange 交易所实例
   * @param logger 日志记录器
   * @returns 包含已加载初始数据的参数
   */
  public static async prepareStrategyParameters(
    parameters: StrategyParameters,
    exchange: IExchange,
    logger?: ILogger,
  ): Promise<StrategyParameters> {
    const loadedData = await this.loadInitialData(parameters, exchange, logger);

    if (loadedData) {
      return {
        ...parameters,
        loadedInitialData: loadedData,
      };
    }

    return parameters;
  }
}

