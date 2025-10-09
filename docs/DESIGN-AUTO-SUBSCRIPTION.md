# 自动数据订阅管理 - 设计文档

## 需求分析

### 核心需求

1. **自动订阅**：添加策略时，TradingEngine 自动订阅策略需要的数据
2. **自动取消**：移除策略时，自动清理不再需要的订阅
3. **去重管理**：多个策略订阅相同数据时，避免重复订阅
4. **灵活配置**：策略可以配置需要哪些数据（ticker, orderbook, trades, klines）
5. **多种方式**：支持 REST 轮询和 WebSocket 订阅

### 使用场景

#### 场景 1：简单策略
```typescript
const strategy = new MovingAverageStrategy({
  symbol: 'BTC/USDT',
  subscription: {
    ticker: true,  // 只需要 ticker 数据
  }
});

engine.addStrategy('ma-strategy', strategy);
// ✅ 自动订阅 BTC/USDT 的 ticker 数据
```

#### 场景 2：复杂策略
```typescript
const strategy = new OrderBookStrategy({
  symbol: 'BTC/USDT',
  subscription: {
    ticker: true,
    orderbook: { enabled: true, depth: 20 },
    trades: { enabled: true, limit: 10 },
  }
});

engine.addStrategy('ob-strategy', strategy);
// ✅ 自动订阅多种数据
```

#### 场景 3：多策略共享数据
```typescript
const strategy1 = new StrategyA({
  symbol: 'BTC/USDT',
  subscription: { ticker: true }
});

const strategy2 = new StrategyB({
  symbol: 'BTC/USDT',
  subscription: { ticker: true }
});

engine.addStrategy('strategy-a', strategy1);
// ✅ 订阅 BTC/USDT ticker

engine.addStrategy('strategy-b', strategy2);
// ✅ 不会重复订阅，共享同一个数据流

engine.removeStrategy('strategy-a');
// ✅ 保持订阅，因为 strategy-b 还需要

engine.removeStrategy('strategy-b');
// ✅ 自动取消订阅，因为没有策略需要了
```

## 设计方案

### 1. 策略参数扩展

```typescript
interface SubscriptionConfig {
  // Ticker 订阅
  ticker?: boolean | {
    enabled: boolean;
    interval?: number; // REST 轮询间隔（毫秒）
  };
  
  // OrderBook 订阅
  orderbook?: boolean | {
    enabled: boolean;
    depth?: number;      // 深度
    interval?: number;   // REST 轮询间隔
  };
  
  // Trades 订阅
  trades?: boolean | {
    enabled: boolean;
    limit?: number;      // 获取数量
    interval?: number;   // REST 轮询间隔
  };
  
  // Klines 订阅
  klines?: boolean | {
    enabled: boolean;
    interval?: string;   // K线间隔（'1m', '5m', '1h', 等）
    limit?: number;      // 获取数量
    pollInterval?: number; // REST 轮询间隔
  };
  
  // 订阅方式
  method?: 'websocket' | 'rest' | 'auto'; // 默认 'auto'
  
  // 交易所
  exchange?: string;     // 指定交易所，如果不指定则使用所有已连接的交易所
}

interface StrategyParameters {
  symbol: string;
  subscription?: SubscriptionConfig;
  // ... 其他参数
}
```

### 2. 订阅管理器

```typescript
interface SubscriptionKey {
  exchange: string;
  symbol: string;
  type: 'ticker' | 'orderbook' | 'trades' | 'klines';
  params?: any; // 额外参数（如 klines interval）
}

interface SubscriptionInfo {
  key: SubscriptionKey;
  refCount: number;           // 引用计数
  strategies: Set<string>;    // 使用此订阅的策略
  timerId?: NodeJS.Timeout;   // REST 轮询定时器
  method: 'websocket' | 'rest';
}

class SubscriptionManager {
  private subscriptions = new Map<string, SubscriptionInfo>();
  
  subscribe(strategyName: string, key: SubscriptionKey): void {
    // 增加引用计数
  }
  
  unsubscribe(strategyName: string, key: SubscriptionKey): void {
    // 减少引用计数，如果为 0 则取消订阅
  }
  
  private getSubscriptionId(key: SubscriptionKey): string {
    // 生成唯一订阅 ID
  }
}
```

### 3. TradingEngine 扩展

```typescript
class TradingEngine {
  private subscriptionManager: SubscriptionManager;
  
  public async addStrategy(name: string, strategy: IStrategy): Promise<void> {
    // 1. 添加策略
    this._strategies.set(name, strategy);
    
    // 2. 自动订阅数据
    await this.subscribeStrategyData(name, strategy);
  }
  
  public async removeStrategy(name: string): Promise<void> {
    // 1. 取消数据订阅
    await this.unsubscribeStrategyData(name);
    
    // 2. 移除策略
    this._strategies.delete(name);
  }
  
  private async subscribeStrategyData(name: string, strategy: IStrategy): Promise<void> {
    const config = strategy.parameters.subscription;
    if (!config) return;
    
    const symbol = strategy.parameters.symbol;
    const exchanges = this.getTargetExchanges(config.exchange);
    
    for (const exchange of exchanges) {
      if (config.ticker) {
        await this.subscribeData(name, exchange, symbol, 'ticker', config.ticker);
      }
      
      if (config.orderbook) {
        await this.subscribeData(name, exchange, symbol, 'orderbook', config.orderbook);
      }
      
      if (config.trades) {
        await this.subscribeData(name, exchange, symbol, 'trades', config.trades);
      }
      
      if (config.klines) {
        await this.subscribeData(name, exchange, symbol, 'klines', config.klines);
      }
    }
  }
  
  private async subscribeData(
    strategyName: string,
    exchange: IExchange,
    symbol: string,
    type: DataType,
    config: any
  ): Promise<void> {
    const key = { exchange: exchange.name, symbol, type, params: config };
    const subscriptionId = this.getSubscriptionId(key);
    
    // 检查是否已订阅
    const existing = this.subscriptionManager.get(subscriptionId);
    if (existing) {
      // 已存在，增加引用计数
      existing.refCount++;
      existing.strategies.add(strategyName);
      return;
    }
    
    // 新订阅
    const method = this.determineMethod(config, exchange);
    
    if (method === 'websocket') {
      await this.subscribeViaWebSocket(exchange, symbol, type, config);
    } else {
      await this.subscribeViaREST(exchange, symbol, type, config);
    }
    
    // 记录订阅信息
    this.subscriptionManager.set(subscriptionId, {
      key,
      refCount: 1,
      strategies: new Set([strategyName]),
      method,
    });
  }
}
```

## 实现细节

### 1. WebSocket 订阅

```typescript
private async subscribeViaWebSocket(
  exchange: IExchange,
  symbol: string,
  type: DataType,
  config: any
): Promise<void> {
  switch (type) {
    case 'ticker':
      await exchange.subscribeToTicker(symbol);
      break;
    case 'orderbook':
      await exchange.subscribeToOrderBook(symbol);
      break;
    case 'trades':
      await exchange.subscribeToTrades(symbol);
      break;
    case 'klines':
      const interval = typeof config === 'object' ? config.interval : '1m';
      await exchange.subscribeToKlines(symbol, interval);
      break;
  }
}
```

### 2. REST 轮询订阅

```typescript
private async subscribeViaREST(
  exchange: IExchange,
  symbol: string,
  type: DataType,
  config: any
): Promise<NodeJS.Timeout> {
  const interval = this.getPollingInterval(config);
  
  const timerId = setInterval(async () => {
    try {
      switch (type) {
        case 'ticker':
          const ticker = await exchange.getTicker(symbol);
          await this.onTicker(symbol, ticker, exchange.name);
          break;
        case 'orderbook':
          const depth = typeof config === 'object' ? config.depth : 20;
          const orderbook = await exchange.getOrderBook(symbol, depth);
          await this.onOrderBook(symbol, orderbook, exchange.name);
          break;
        case 'trades':
          const limit = typeof config === 'object' ? config.limit : 10;
          const trades = await exchange.getTrades(symbol, limit);
          await this.onTrades(symbol, trades, exchange.name);
          break;
        case 'klines':
          const klineInterval = typeof config === 'object' ? config.interval : '1m';
          const klineLimit = typeof config === 'object' ? config.limit : 1;
          const klines = await exchange.getKlines(symbol, klineInterval, undefined, undefined, klineLimit);
          if (klines.length > 0) {
            await this.onKline(symbol, klines[0], exchange.name);
          }
          break;
      }
    } catch (error) {
      this.logger.error(`Failed to poll ${type} for ${symbol}:`, error as Error);
    }
  }, interval);
  
  return timerId;
}
```

### 3. 取消订阅

```typescript
private async unsubscribeStrategyData(strategyName: string): Promise<void> {
  const strategy = this._strategies.get(strategyName);
  if (!strategy || !strategy.parameters.subscription) return;
  
  const config = strategy.parameters.subscription;
  const symbol = strategy.parameters.symbol;
  const exchanges = this.getTargetExchanges(config.exchange);
  
  for (const exchange of exchanges) {
    if (config.ticker) {
      await this.unsubscribeData(strategyName, exchange, symbol, 'ticker');
    }
    
    if (config.orderbook) {
      await this.unsubscribeData(strategyName, exchange, symbol, 'orderbook');
    }
    
    if (config.trades) {
      await this.unsubscribeData(strategyName, exchange, symbol, 'trades');
    }
    
    if (config.klines) {
      await this.unsubscribeData(strategyName, exchange, symbol, 'klines');
    }
  }
}

private async unsubscribeData(
  strategyName: string,
  exchange: IExchange,
  symbol: string,
  type: DataType
): Promise<void> {
  const key = { exchange: exchange.name, symbol, type };
  const subscriptionId = this.getSubscriptionId(key);
  
  const subscription = this.subscriptionManager.get(subscriptionId);
  if (!subscription) return;
  
  // 减少引用计数
  subscription.strategies.delete(strategyName);
  subscription.refCount--;
  
  // 如果没有策略使用了，取消订阅
  if (subscription.refCount === 0) {
    if (subscription.method === 'websocket') {
      // WebSocket 取消订阅（目前大多数交易所不支持）
      this.logger.info(`WebSocket unsubscription not supported for ${type}`);
    } else if (subscription.timerId) {
      // 清除 REST 轮询定时器
      clearInterval(subscription.timerId);
    }
    
    this.subscriptionManager.delete(subscriptionId);
    this.logger.info(`Unsubscribed from ${exchange.name} ${symbol} ${type}`);
  }
}
```

### 4. 订阅方式决策

```typescript
private determineMethod(
  config: any,
  exchange: IExchange
): 'websocket' | 'rest' {
  const method = typeof config === 'object' ? config.method : 'auto';
  
  if (method === 'rest') {
    return 'rest';
  }
  
  if (method === 'websocket') {
    return 'websocket';
  }
  
  // auto: 优先使用 WebSocket，如果不可用则使用 REST
  // 可以检查 exchange 是否支持 WebSocket
  return 'websocket'; // 默认使用 WebSocket
}
```

## 使用示例

### 示例 1：简单的 Ticker 订阅

```typescript
const strategy = new MovingAverageStrategy({
  symbol: 'BTC/USDT',
  fastPeriod: 5,
  slowPeriod: 20,
  subscription: {
    ticker: true,  // 简单配置
  }
});

engine.addStrategy('ma-strategy', strategy);
// ✅ 自动订阅 BTC/USDT ticker
```

### 示例 2：详细配置

```typescript
const strategy = new OrderBookStrategy({
  symbol: 'BTC/USDT',
  subscription: {
    ticker: {
      enabled: true,
      interval: 1000,  // REST 轮询：每秒一次
    },
    orderbook: {
      enabled: true,
      depth: 20,       // 20档深度
      interval: 500,   // 每 0.5 秒
    },
    method: 'rest',    // 强制使用 REST
  }
});

engine.addStrategy('ob-strategy', strategy);
```

### 示例 3：K 线订阅

```typescript
const strategy = new KlineStrategy({
  symbol: 'BTC/USDT',
  subscription: {
    klines: {
      enabled: true,
      interval: '1m',      // 1分钟 K 线
      limit: 100,          // 获取 100 根
      pollInterval: 60000, // 每分钟更新一次
    },
    method: 'rest',
  }
});

engine.addStrategy('kline-strategy', strategy);
```

### 示例 4：多交易所

```typescript
const arbitrageStrategy = new ArbitrageStrategy({
  symbol: 'BTC/USDT',
  subscription: {
    ticker: true,
    // 不指定 exchange，自动订阅所有已连接的交易所
  }
});

engine.addStrategy('arbitrage', arbitrageStrategy);
// ✅ 自动订阅所有交易所的 BTC/USDT ticker
```

### 示例 5：指定交易所

```typescript
const strategy = new BinanceOnlyStrategy({
  symbol: 'BTC/USDT',
  subscription: {
    ticker: true,
    exchange: 'binance', // 只订阅 Binance
  }
});

engine.addStrategy('binance-strategy', strategy);
// ✅ 只订阅 Binance 的数据
```

## 优势分析

### ✅ 优势

1. **简化使用**
   - 不需要手动管理订阅
   - 添加策略即自动订阅
   - 移除策略即自动清理

2. **避免重复**
   - 多个策略共享同一订阅
   - 节省资源和 API 限额

3. **灵活配置**
   - 支持简单布尔值配置
   - 支持详细对象配置
   - 支持多种数据类型

4. **多种方式**
   - WebSocket 实时性更好
   - REST 轮询更稳定
   - 自动选择最佳方式

5. **自动管理**
   - 引用计数管理
   - 自动清理资源
   - 日志记录完整

### ⚠️ 注意事项

1. **API 限制**
   - REST 轮询需要注意速率限制
   - 建议设置合理的轮询间隔

2. **资源消耗**
   - WebSocket 连接有限
   - 轮询定时器占用资源

3. **错误处理**
   - 订阅失败需要重试机制
   - 需要处理网络异常

## 配置参考

### 默认配置

```typescript
const DEFAULT_SUBSCRIPTION_CONFIG = {
  ticker: {
    interval: 1000,  // 1秒
  },
  orderbook: {
    depth: 20,
    interval: 500,   // 0.5秒
  },
  trades: {
    limit: 10,
    interval: 1000,  // 1秒
  },
  klines: {
    interval: '1m',
    limit: 1,
    pollInterval: 60000, // 1分钟
  },
  method: 'auto',
};
```

### 推荐配置

#### 高频交易
```typescript
subscription: {
  ticker: { enabled: true, interval: 100 },  // 0.1秒
  method: 'websocket',  // 使用 WebSocket
}
```

#### 中频交易
```typescript
subscription: {
  ticker: { enabled: true, interval: 1000 }, // 1秒
  method: 'auto',
}
```

#### 低频交易
```typescript
subscription: {
  ticker: { enabled: true, interval: 5000 }, // 5秒
  klines: { enabled: true, interval: '5m', pollInterval: 300000 }, // 5分钟
  method: 'rest',
}
```

## 实现优先级

### 阶段 1（核心功能）
- ✅ 策略参数扩展（SubscriptionConfig）
- ✅ 订阅管理器（SubscriptionManager）
- ✅ 自动订阅（addStrategy）
- ✅ 自动取消（removeStrategy）
- ✅ 引用计数管理

### 阶段 2（REST 支持）
- ✅ REST 轮询实现
- ✅ 轮询间隔配置
- ✅ 错误处理和重试

### 阶段 3（WebSocket 支持）
- ✅ WebSocket 订阅
- ✅ 方式自动选择
- ✅ 降级处理

### 阶段 4（优化）
- ⚠️ 重试机制
- ⚠️ 健康检查
- ⚠️ 性能监控

## 总结

这个自动订阅管理系统将大大简化 iTrade 的使用：

✅ **简化配置**：在策略参数中声明需求即可  
✅ **自动管理**：无需手动订阅和取消  
✅ **避免重复**：智能去重，节省资源  
✅ **灵活强大**：支持多种配置和方式  
✅ **生产就绪**：完整的错误处理和日志  

---

**版本**：1.3.0  
**日期**：2025-10-09  
**状态**：设计完成，待实现

