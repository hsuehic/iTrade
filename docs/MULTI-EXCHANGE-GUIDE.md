# 多交易所使用指南

## 概述

iTrade 支持同时连接和使用多个交易所。本指南将说明如何在策略中区分不同交易所的数据，以及多交易所的最佳实践。

## 🆕 新特性：交易所数据标识

### 更新内容

✅ **Ticker 接口增强**：
```typescript
export interface Ticker {
  symbol: string;
  price: Decimal;
  volume: Decimal;
  timestamp: Date;
  // ... 其他字段
  exchange?: string; // 新增：交易所名称
}
```

✅ **TradingEngine 更新**：
- `onMarketData(symbol, data, exchangeName?)` - 新增可选的 `exchangeName` 参数
- 自动将交易所名称添加到市场数据中
- 策略可以通过 `ticker.exchange` 识别数据来源

## 基本用法

### 1. 添加多个交易所

```typescript
import { TradingEngine } from '@itrade/core';
import { BinanceExchange, OKXExchange, CoinbaseExchange } from '@itrade/exchange-connectors';

const engine = new TradingEngine(riskManager, portfolioManager, logger);

// 添加 Binance
const binance = new BinanceExchange(false); // mainnet
await binance.connect({...});
engine.addExchange('binance', binance);

// 添加 OKX
const okx = new OKXExchange(true); // demo
await okx.connect({...});
engine.addExchange('okx', okx);

// 添加 Coinbase
const coinbase = new CoinbaseExchange();
await coinbase.connect({...});
engine.addExchange('coinbase', coinbase);
```

### 2. 在策略中区分交易所数据

#### 方式1：检查 exchange 字段

```typescript
import { BaseStrategy, StrategyResult, Ticker } from '@itrade/core';

export class MultiExchangeStrategy extends BaseStrategy {
  public async analyze(marketData: {
    ticker?: Ticker;
    klines?: Kline[];
  }): Promise<StrategyResult> {
    if (!marketData.ticker) {
      return { action: 'hold', reason: 'No ticker data' };
    }

    const ticker = marketData.ticker;
    
    // 检查数据来源
    if (ticker.exchange === 'binance') {
      logger.info(`Processing Binance data: ${ticker.price}`);
      // Binance 特定逻辑
    } else if (ticker.exchange === 'okx') {
      logger.info(`Processing OKX data: ${ticker.price}`);
      // OKX 特定逻辑
    } else if (ticker.exchange === 'coinbase') {
      logger.info(`Processing Coinbase data: ${ticker.price}`);
      // Coinbase 特定逻辑
    }

    // 通用分析逻辑
    return this.analyzePrice(ticker);
  }
}
```

#### 方式2：分离数据流

```typescript
export class ArbitrageStrategy extends BaseStrategy {
  private binancePrices: Map<string, Decimal> = new Map();
  private okxPrices: Map<string, Decimal> = new Map();

  public async analyze(marketData: {
    ticker?: Ticker;
  }): Promise<StrategyResult> {
    if (!marketData.ticker) {
      return { action: 'hold', reason: 'No ticker data' };
    }

    const ticker = marketData.ticker;
    
    // 根据交易所存储价格
    if (ticker.exchange === 'binance') {
      this.binancePrices.set(ticker.symbol, ticker.price);
    } else if (ticker.exchange === 'okx') {
      this.okxPrices.set(ticker.symbol, ticker.price);
    }

    // 检查套利机会
    return this.checkArbitrageOpportunity(ticker.symbol);
  }

  private checkArbitrageOpportunity(symbol: string): StrategyResult {
    const binancePrice = this.binancePrices.get(symbol);
    const okxPrice = this.okxPrices.get(symbol);

    if (!binancePrice || !okxPrice) {
      return { action: 'hold', reason: 'Waiting for prices from both exchanges' };
    }

    const priceDiff = binancePrice.sub(okxPrice).abs();
    const diffPercent = priceDiff.div(binancePrice).mul(100);

    if (diffPercent.gt(1)) { // 价差 > 1%
      if (binancePrice.gt(okxPrice)) {
        return {
          action: 'buy',
          reason: `Arbitrage: Buy on OKX (${okxPrice}), Sell on Binance (${binancePrice})`,
          confidence: diffPercent.toNumber() / 100,
        };
      } else {
        return {
          action: 'buy',
          reason: `Arbitrage: Buy on Binance (${binancePrice}), Sell on OKX (${okxPrice})`,
          confidence: diffPercent.toNumber() / 100,
        };
      }
    }

    return { action: 'hold', reason: 'No arbitrage opportunity' };
  }
}
```

## 高级用例

### 用例1：套利策略

在不同交易所之间套利：

```typescript
export class CrossExchangeArbitrageStrategy extends BaseStrategy {
  private prices: Map<string, Map<string, Decimal>> = new Map();
  // prices 结构: { 'BTC/USDT': { 'binance': 43000, 'okx': 42900 } }

  public async analyze(marketData: { ticker?: Ticker }): Promise<StrategyResult> {
    if (!marketData.ticker) {
      return { action: 'hold', reason: 'No data' };
    }

    const { symbol, price, exchange } = marketData.ticker;
    
    if (!exchange) {
      return { action: 'hold', reason: 'No exchange info' };
    }

    // 存储价格
    if (!this.prices.has(symbol)) {
      this.prices.set(symbol, new Map());
    }
    this.prices.get(symbol)!.set(exchange, price);

    // 检查套利机会
    return this.findArbitrageOpportunity(symbol);
  }

  private findArbitrageOpportunity(symbol: string): StrategyResult {
    const symbolPrices = this.prices.get(symbol);
    if (!symbolPrices || symbolPrices.size < 2) {
      return { action: 'hold', reason: 'Need prices from multiple exchanges' };
    }

    // 找到最高价和最低价
    let maxPrice = new Decimal(0);
    let minPrice = new Decimal(Infinity);
    let maxExchange = '';
    let minExchange = '';

    for (const [exchange, price] of symbolPrices) {
      if (price.gt(maxPrice)) {
        maxPrice = price;
        maxExchange = exchange;
      }
      if (price.lt(minPrice)) {
        minPrice = price;
        minExchange = exchange;
      }
    }

    // 计算价差百分比
    const spread = maxPrice.sub(minPrice).div(minPrice).mul(100);
    const threshold = new Decimal(0.5); // 0.5% 阈值

    if (spread.gt(threshold)) {
      return {
        action: 'buy',
        reason: `Arbitrage: Buy on ${minExchange} @ ${minPrice}, Sell on ${maxExchange} @ ${maxPrice} (spread: ${spread.toFixed(2)}%)`,
        confidence: Math.min(spread.toNumber() / 10, 1.0),
        quantity: new Decimal(0.01), // 套利数量
        price: minPrice,
      };
    }

    return { action: 'hold', reason: `Spread too small: ${spread.toFixed(2)}%` };
  }
}
```

### 用例2：最优价格执行

自动选择价格最优的交易所：

```typescript
export class BestPriceStrategy extends BaseStrategy {
  private exchangePrices: Map<string, { price: Decimal; exchange: string }> = new Map();

  public async analyze(marketData: { ticker?: Ticker }): Promise<StrategyResult> {
    if (!marketData.ticker) {
      return { action: 'hold', reason: 'No data' };
    }

    const { symbol, price, exchange } = marketData.ticker;
    
    if (!exchange) {
      return { action: 'hold', reason: 'No exchange info' };
    }

    // 更新价格缓存
    this.exchangePrices.set(exchange, { price, exchange });

    // 执行策略分析
    const signal = this.analyzeMarket(symbol, price);
    
    if (signal.action !== 'hold') {
      // 找到最优价格的交易所
      const bestExchange = this.findBestExchange(signal.action);
      
      return {
        ...signal,
        reason: `${signal.reason} (Best exchange: ${bestExchange.exchange} @ ${bestExchange.price})`,
      };
    }

    return signal;
  }

  private findBestExchange(action: 'buy' | 'sell'): { price: Decimal; exchange: string } {
    const prices = Array.from(this.exchangePrices.values());
    
    if (action === 'buy') {
      // 买入：选择最低价
      return prices.reduce((best, current) =>
        current.price.lt(best.price) ? current : best
      );
    } else {
      // 卖出：选择最高价
      return prices.reduce((best, current) =>
        current.price.gt(best.price) ? current : best
      );
    }
  }

  private analyzeMarket(symbol: string, price: Decimal): StrategyResult {
    // 你的策略逻辑
    return { action: 'hold', reason: 'Example' };
  }
}
```

### 用例3：数据质量选择

选择数据质量最好的交易所：

```typescript
export class QualityAwareStrategy extends BaseStrategy {
  private dataQuality: Map<string, number> = new Map();

  public async analyze(marketData: { ticker?: Ticker }): Promise<StrategyResult> {
    if (!marketData.ticker) {
      return { action: 'hold', reason: 'No data' };
    }

    const { exchange, volume } = marketData.ticker;
    
    if (!exchange) {
      return { action: 'hold', reason: 'No exchange info' };
    }

    // 根据交易量评估数据质量
    const quality = this.assessDataQuality(exchange, volume);
    this.dataQuality.set(exchange, quality);

    // 只使用高质量数据
    if (quality < 0.7) {
      return { action: 'hold', reason: `Low data quality from ${exchange}` };
    }

    // 继续分析...
    return this.performAnalysis(marketData.ticker);
  }

  private assessDataQuality(exchange: string, volume: Decimal): number {
    // 评估标准：
    // 1. 交易量大小
    // 2. 数据新鲜度
    // 3. 交易所可靠性
    
    const volumeScore = volume.gt(1000) ? 1.0 : 0.5;
    
    const exchangeReliability: { [key: string]: number } = {
      binance: 1.0,
      okx: 0.9,
      coinbase: 0.95,
    };
    
    const reliabilityScore = exchangeReliability[exchange] || 0.5;
    
    return (volumeScore + reliabilityScore) / 2;
  }

  private performAnalysis(ticker: Ticker): StrategyResult {
    // 你的分析逻辑
    return { action: 'hold', reason: 'Example' };
  }
}
```

## 订阅管理

### 订阅同一个交易对

```typescript
async function setupMultiExchange() {
  const symbol = 'BTC/USDT';
  
  // 方式1：使用 WebSocket（如果可用）
  await binance.subscribeToTicker(symbol);
  await okx.subscribeToTicker(symbol);
  await coinbase.subscribeToTicker(symbol);
  
  // 方式2：使用 REST 轮询
  setInterval(async () => {
    const binanceTicker = await binance.getTicker(symbol);
    await engine.onMarketData(symbol, binanceTicker, 'binance');
  }, 1000);
  
  setInterval(async () => {
    const okxTicker = await okx.getTicker(symbol);
    await engine.onMarketData(symbol, okxTicker, 'okx');
  }, 1000);
}
```

### 订阅不同交易对

```typescript
async function setupDifferentSymbols() {
  // Binance: BTC/USDT
  await binance.subscribeToTicker('BTC/USDT');
  
  // OKX: ETH/USDT
  await okx.subscribeToTicker('ETH/USDT');
  
  // Coinbase: BNB/USDT
  await coinbase.subscribeToTicker('BNB/USDT');
}
```

## 执行策略

### 指定特定交易所执行

```typescript
// 在 TradingEngine 中，executeOrder 会自动选择交易所
// 如果需要指定特定交易所，可以这样：

class ExchangeSpecificStrategy extends BaseStrategy {
  private preferredExchange = 'binance';

  public async analyze(marketData: { ticker?: Ticker }): Promise<StrategyResult> {
    const ticker = marketData.ticker;
    
    if (!ticker || ticker.exchange !== this.preferredExchange) {
      // 只处理来自首选交易所的数据
      return { action: 'hold', reason: `Waiting for ${this.preferredExchange} data` };
    }

    // 分析逻辑...
    return this.performAnalysis(ticker);
  }
}
```

## 完整示例

```typescript
import { TradingEngine, LogLevel, EventBus } from '@itrade/core';
import { ConsoleLogger } from '@itrade/logger';
import { RiskManager } from '@itrade/risk-manager';
import { PortfolioManager } from '@itrade/portfolio-manager';
import { BinanceExchange, OKXExchange } from '@itrade/exchange-connectors';
import { Decimal } from 'decimal.js';
import { ArbitrageStrategy } from './strategies/ArbitrageStrategy';

const logger = new ConsoleLogger(LogLevel.INFO);

async function main() {
  // 初始化
  const riskManager = new RiskManager({
    maxDrawdown: new Decimal(20),
    maxPositionSize: new Decimal(10),
    maxDailyLoss: new Decimal(5),
  });
  const portfolioManager = new PortfolioManager(new Decimal(10000));
  const engine = new TradingEngine(riskManager, portfolioManager, logger);

  // 添加套利策略
  const strategy = new ArbitrageStrategy({
    symbol: 'BTC/USDT',
    threshold: 0.5, // 0.5% 套利阈值
  });
  engine.addStrategy('arbitrage', strategy);

  // 连接 Binance
  const binance = new BinanceExchange(false);
  binance.on('connected', () => logger.info('✅ Binance connected'));
  await binance.connect({
    apiKey: process.env.BINANCE_API_KEY || '',
    secretKey: process.env.BINANCE_SECRET_KEY || '',
    sandbox: false,
  });
  engine.addExchange('binance', binance);

  // 连接 OKX
  const okx = new OKXExchange(true);
  okx.on('connected', () => logger.info('✅ OKX connected'));
  await okx.connect({
    apiKey: process.env.OKX_API_KEY || '',
    secretKey: process.env.OKX_SECRET_KEY || '',
    passphrase: process.env.OKX_PASSPHRASE || '',
    sandbox: true,
  });
  engine.addExchange('okx', okx);

  // 启动引擎
  await engine.start();

  // 使用 REST 轮询（更稳定）
  const symbol = 'BTC/USDT';
  
  // Binance 轮询
  setInterval(async () => {
    try {
      const ticker = await binance.getTicker(symbol);
      logger.debug(`Binance ${symbol}: ${ticker.price}`);
      await engine.onMarketData(symbol, ticker, 'binance');
    } catch (error) {
      logger.error('Binance error:', error);
    }
  }, 1000);

  // OKX 轮询
  setInterval(async () => {
    try {
      const ticker = await okx.getTicker(symbol);
      logger.debug(`OKX ${symbol}: ${ticker.price}`);
      await engine.onMarketData(symbol, ticker, 'okx');
    } catch (error) {
      logger.error('OKX error:', error);
    }
  }, 1000);

  // 监听套利信号
  const eventBus = EventBus.getInstance();
  eventBus.onStrategySignal((signal) => {
    logger.info(`🎯 Arbitrage Signal: ${signal.action}`);
    logger.info(`   ${signal.reason}`);
  });

  // 优雅关闭
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await engine.stop();
    await binance.disconnect();
    await okx.disconnect();
    process.exit(0);
  });

  logger.info('Multi-exchange arbitrage system is running...');
}

main().catch(console.error);
```

## 最佳实践

### 1. 数据同步

确保不同交易所的数据时间戳接近：

```typescript
const timestamps: Map<string, Date> = new Map();

function checkDataSync(ticker: Ticker): boolean {
  if (!ticker.exchange) return true;
  
  timestamps.set(ticker.exchange, ticker.timestamp);
  
  // 检查所有交易所的数据是否在1秒内
  const times = Array.from(timestamps.values());
  const maxTime = Math.max(...times.map(t => t.getTime()));
  const minTime = Math.min(...times.map(t => t.getTime()));
  
  return (maxTime - minTime) < 1000; // 1秒阈值
}
```

### 2. 错误处理

不同交易所可能有不同的错误：

```typescript
async function safeGetTicker(exchange: IExchange, symbol: string, exchangeName: string) {
  try {
    return await exchange.getTicker(symbol);
  } catch (error) {
    logger.error(`Failed to get ticker from ${exchangeName}:`, error);
    return null;
  }
}
```

### 3. 监控和日志

记录每个交易所的性能：

```typescript
const exchangeMetrics: Map<string, {
  requests: number;
  errors: number;
  avgLatency: number;
}> = new Map();

function updateMetrics(exchangeName: string, latency: number, isError: boolean) {
  const metrics = exchangeMetrics.get(exchangeName) || {
    requests: 0,
    errors: 0,
    avgLatency: 0,
  };
  
  metrics.requests++;
  if (isError) metrics.errors++;
  metrics.avgLatency = (metrics.avgLatency * (metrics.requests - 1) + latency) / metrics.requests;
  
  exchangeMetrics.set(exchangeName, metrics);
}
```

## 注意事项

⚠️ **时间同步**：不同交易所的数据可能有延迟
⚠️ **符号格式**：虽然有自动转换，但确保符号在所有交易所都可用
⚠️ **API 限制**：每个交易所都有自己的速率限制
⚠️ **交易费用**：套利时要考虑不同交易所的费用
⚠️ **提现限制**：跨交易所套利需要考虑提现时间和费用

## 相关文档

- [OKX Exchange Guide](./OKX-EXCHANGE-GUIDE.md)
- [Strategy Debug Guide](./STRATEGY-DEBUG-GUIDE.md)
- [WebSocket Blocked Solution](./WEBSOCKET-BLOCKED-SOLUTION.md)

---

**更新日期**：2025-10-09  
**版本**：1.0.0

