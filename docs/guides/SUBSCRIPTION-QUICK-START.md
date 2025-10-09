# 订阅配置 - 快速入门

## ✅ 是的！完全支持订阅不同类型的数据

策略配置中可以灵活设置需要订阅哪种类型的数据：
- ✅ **ticker** - 实时价格数据
- ✅ **orderbook** - 订单簿（买卖盘深度）
- ✅ **trades** - 成交记录
- ✅ **klines** - K线数据
- ✅ **任意组合** - 可以同时订阅多种数据

---

## 📝 基本用法

### 1. 只订阅 Ticker（最常用）

```typescript
const strategy = new MovingAverageStrategy({
  symbol: 'BTC/USDT',
  fastPeriod: 5,
  slowPeriod: 20,
  // ✅ 只订阅 ticker
  subscription: {
    ticker: true,
  }
});
```

### 2. 订阅多种数据类型

```typescript
const strategy = new ComplexStrategy({
  symbol: 'BTC/USDT',
  // ✅ 同时订阅 ticker 和 orderbook
  subscription: {
    ticker: true,
    orderbook: true,
  }
});
```

### 3. 订阅所有数据类型

```typescript
const strategy = new FullDataStrategy({
  symbol: 'BTC/USDT',
  // ✅ 订阅所有类型
  subscription: {
    ticker: true,
    orderbook: true,
    trades: true,
    klines: true,
  }
});
```

---

## 🎛️ 详细配置

每种数据类型都支持简单配置（布尔值）和详细配置（对象）：

### Ticker - 价格数据

```typescript
// 简单配置
subscription: {
  ticker: true,  // 使用默认配置
}

// 详细配置
subscription: {
  ticker: {
    enabled: true,
    interval: 1000,  // REST 轮询间隔（毫秒）
  }
}
```

### OrderBook - 订单簿

```typescript
// 简单配置
subscription: {
  orderbook: true,  // 使用默认配置（20档深度）
}

// 详细配置
subscription: {
  orderbook: {
    enabled: true,
    depth: 50,       // 订单簿深度（档位）
    interval: 500,   // REST 轮询间隔（毫秒）
  }
}
```

### Trades - 成交记录

```typescript
// 简单配置
subscription: {
  trades: true,  // 使用默认配置（10条）
}

// 详细配置
subscription: {
  trades: {
    enabled: true,
    limit: 20,       // 获取的交易数量
    interval: 1000,  // REST 轮询间隔（毫秒）
  }
}
```

### Klines - K线数据

```typescript
// 简单配置
subscription: {
  klines: true,  // 使用默认配置（1m）
}

// 详细配置
subscription: {
  klines: {
    enabled: true,
    interval: '5m',      // K线间隔：'1m', '5m', '15m', '1h', '1d'
    limit: 100,          // 获取的K线数量
    pollInterval: 300000 // REST 轮询间隔（5分钟）
  }
}
```

---

## 🎯 实际场景示例

### 场景 1：简单移动平均策略（只需要价格）

```typescript
const maStrategy = new MovingAverageStrategy({
  symbol: 'BTC/USDT',
  fastPeriod: 10,
  slowPeriod: 30,
  // ✅ 只需要 ticker
  subscription: {
    ticker: true,
  }
});

await engine.addStrategy('ma-strategy', maStrategy);
await engine.start();
```

### 场景 2：订单簿分析策略

```typescript
const obStrategy = new OrderBookStrategy({
  symbol: 'BTC/USDT',
  // ✅ 需要 ticker 和 orderbook
  subscription: {
    ticker: true,
    orderbook: {
      enabled: true,
      depth: 50,  // 需要50档深度
    }
  }
});

await engine.addStrategy('ob-strategy', obStrategy);
```

### 场景 3：成交量分析策略

```typescript
const volumeStrategy = new VolumeAnalysisStrategy({
  symbol: 'BTC/USDT',
  // ✅ 需要 ticker 和 trades
  subscription: {
    ticker: true,
    trades: {
      enabled: true,
      limit: 50,  // 分析最近50笔交易
    }
  }
});

await engine.addStrategy('volume-strategy', volumeStrategy);
```

### 场景 4：K线形态策略

```typescript
const candlestickStrategy = new CandlestickPatternStrategy({
  symbol: 'BTC/USDT',
  // ✅ 需要 klines
  subscription: {
    klines: {
      enabled: true,
      interval: '1h',  // 1小时K线
      limit: 100,      // 最近100根
    }
  }
});

await engine.addStrategy('candlestick-strategy', candlestickStrategy);
```

### 场景 5：综合分析策略（所有数据）

```typescript
const advancedStrategy = new AdvancedStrategy({
  symbol: 'BTC/USDT',
  // ✅ 使用所有数据类型
  subscription: {
    ticker: {
      enabled: true,
      interval: 500,  // 高频更新
    },
    orderbook: {
      enabled: true,
      depth: 20,
      interval: 500,
    },
    trades: {
      enabled: true,
      limit: 30,
    },
    klines: {
      enabled: true,
      interval: '5m',
      limit: 50,
    },
    method: 'rest',  // 使用 REST（更稳定）
  }
});

await engine.addStrategy('advanced-strategy', advancedStrategy);
```

---

## 🔧 订阅方式配置

可以指定订阅方式：

```typescript
subscription: {
  ticker: true,
  orderbook: true,
  
  // 订阅方式
  method: 'auto',      // 自动选择（默认）
  // method: 'websocket', // 强制使用 WebSocket
  // method: 'rest',      // 强制使用 REST 轮询
}
```

### 方式对比

| 方式 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| `websocket` | 实时性好，延迟低 | 可能被防火墙阻断 | 高频交易 |
| `rest` | 稳定可靠 | 有轮询间隔 | 中低频交易 |
| `auto` | 自动选择最佳 | - | 推荐（默认）|

---

## 🏢 多交易所配置

可以指定只订阅特定交易所：

```typescript
// 不指定 exchange：订阅所有交易所
subscription: {
  ticker: true,
  // 自动订阅所有已连接的交易所（binance, okx, coinbase...）
}

// 指定 exchange：只订阅特定交易所
subscription: {
  ticker: true,
  exchange: 'binance',  // 只订阅 Binance
}
```

---

## 📊 在策略中使用订阅的数据

策略的 `analyze` 方法会收到订阅的数据：

```typescript
export class MyStrategy extends BaseStrategy {
  public async analyze(marketData: {
    ticker?: Ticker;        // ✅ 如果订阅了 ticker
    orderbook?: OrderBook;  // ✅ 如果订阅了 orderbook
    trades?: Trade[];       // ✅ 如果订阅了 trades
    klines?: Kline[];       // ✅ 如果订阅了 klines
  }): Promise<StrategyResult> {
    
    // 检查数据是否可用
    if (marketData.ticker) {
      const price = marketData.ticker.price;
      const exchange = marketData.ticker.exchange;  // 来自哪个交易所
      console.log(`Price from ${exchange}: ${price}`);
    }
    
    if (marketData.orderbook) {
      const bestBid = marketData.orderbook.bids[0][0];
      const bestAsk = marketData.orderbook.asks[0][0];
      console.log(`Spread: ${bestAsk.sub(bestBid)}`);
    }
    
    if (marketData.trades) {
      const recentTrades = marketData.trades;
      console.log(`Recent trades: ${recentTrades.length}`);
    }
    
    if (marketData.klines) {
      const latestKline = marketData.klines[marketData.klines.length - 1];
      console.log(`Latest close: ${latestKline.close}`);
    }
    
    // 执行分析逻辑
    return { action: 'hold' };
  }
}
```

---

## 💡 最佳实践

### 1. 只订阅需要的数据

```typescript
// ✅ 好：只订阅需要的
subscription: {
  ticker: true,
}

// ❌ 差：订阅不需要的数据
subscription: {
  ticker: true,
  orderbook: true,  // 如果策略不用，不要订阅
  trades: true,
  klines: true,
}
```

### 2. 合理设置轮询间隔

```typescript
// ✅ 好：根据需要设置
subscription: {
  ticker: {
    enabled: true,
    interval: 1000,  // 1秒足够大多数策略
  }
}

// ❌ 差：过于频繁
subscription: {
  ticker: {
    enabled: true,
    interval: 10,  // 太频繁，可能超限
  }
}
```

### 3. 根据交易频率选择方式

```typescript
// 高频策略：优先 WebSocket
subscription: {
  ticker: true,
  method: 'websocket',
}

// 中低频策略：REST 更稳定
subscription: {
  ticker: true,
  method: 'rest',
}
```

---

## 🚀 完整示例

```typescript
import { TradingEngine, LogLevel } from '@itrade/core';
import { ConsoleLogger } from '@itrade/logger';
import { RiskManager } from '@itrade/risk-manager';
import { PortfolioManager } from '@itrade/portfolio-manager';
import { BinanceExchange, OKXExchange } from '@itrade/exchange-connectors';
import { MovingAverageStrategy } from '@itrade/strategies';
import { Decimal } from 'decimal.js';

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

  // 添加交易所
  const binance = new BinanceExchange(false);
  const okx = new OKXExchange(true);
  await binance.connect({...});
  await okx.connect({...});
  engine.addExchange('binance', binance);
  engine.addExchange('okx', okx);

  // 策略 1：只需要 ticker
  await engine.addStrategy('simple-ma', new MovingAverageStrategy({
    symbol: 'BTC/USDT',
    fastPeriod: 5,
    slowPeriod: 20,
    subscription: {
      ticker: true,  // ✅ 简单配置
    }
  }));

  // 策略 2：需要 ticker + orderbook
  await engine.addStrategy('orderbook-strategy', new OrderBookStrategy({
    symbol: 'ETH/USDT',
    subscription: {
      ticker: true,
      orderbook: {
        enabled: true,
        depth: 50,    // ✅ 详细配置
        interval: 500,
      },
      method: 'rest',
      exchange: 'binance',  // ✅ 只订阅 Binance
    }
  }));

  // 策略 3：需要 klines
  await engine.addStrategy('pattern-strategy', new PatternStrategy({
    symbol: 'BNB/USDT',
    subscription: {
      klines: {
        enabled: true,
        interval: '1h',  // ✅ 1小时K线
        limit: 100,
      }
    }
  }));

  // 启动引擎（自动开始所有订阅）
  await engine.start();
  logger.info('✅ All strategies started with auto-subscription');

  // 查看订阅统计
  const stats = engine.getSubscriptionStats();
  logger.info(`📊 Subscriptions: ${JSON.stringify(stats)}`);

  // 优雅关闭
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await engine.stop();  // 自动清理所有订阅
    process.exit(0);
  });
}

main().catch(console.error);
```

---

## 📋 快速参考

### 数据类型

| 类型 | 用途 | 默认配置 |
|------|------|---------|
| `ticker` | 实时价格、成交量 | `{ interval: 1000 }` |
| `orderbook` | 买卖盘深度 | `{ depth: 20, interval: 500 }` |
| `trades` | 成交记录 | `{ limit: 10, interval: 1000 }` |
| `klines` | K线/蜡烛图 | `{ interval: '1m', limit: 1, pollInterval: 60000 }` |

### 配置方式

```typescript
// 简单配置
subscription: {
  ticker: true,         // 布尔值
  orderbook: false,     // 不订阅
}

// 详细配置
subscription: {
  ticker: {             // 对象
    enabled: true,
    interval: 1000,
  }
}
```

### 组合示例

```typescript
// 只要价格
{ ticker: true }

// 价格 + 深度
{ ticker: true, orderbook: true }

// 价格 + 交易
{ ticker: true, trades: true }

// 价格 + K线
{ ticker: true, klines: true }

// 全部数据
{ ticker: true, orderbook: true, trades: true, klines: true }
```

---

## 📚 相关文档

- [自动订阅使用指南](./AUTO-SUBSCRIPTION-USAGE.md) - 完整的使用指南
- [设计文档](./DESIGN-AUTO-SUBSCRIPTION.md) - 详细的设计说明

---

**版本**：1.3.0  
**日期**：2025-10-09  
**状态**：生产就绪 ✅

