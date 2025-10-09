# 自动数据订阅 - 使用指南

## 概述

iTrade v1.3.0 引入了强大的自动数据订阅管理功能，极大简化了数据订阅的使用。

## 核心特性

✅ **自动订阅**：添加策略时自动订阅需要的数据  
✅ **自动取消**：移除策略时自动清理订阅  
✅ **智能去重**：多个策略共享同一订阅  
✅ **灵活配置**：支持简单和详细配置  
✅ **多种方式**：支持 WebSocket 和 REST 轮询  

## 快速开始

### 基本用法

```typescript
import { TradingEngine } from '@itrade/core';
import { MovingAverageStrategy } from '@itrade/strategies';
import { BinanceExchange } from '@itrade/exchange-connectors';

// 创建策略，配置自动订阅
const strategy = new MovingAverageStrategy({
  symbol: 'BTC/USDT',
  fastPeriod: 5,
  slowPeriod: 20,
  // ✅ 添加订阅配置
  subscription: {
    ticker: true,  // 自动订阅 ticker 数据
  }
});

// 添加策略到引擎
await engine.addStrategy('ma-strategy', strategy);

// ✅ 启动引擎，自动开始订阅
await engine.start();

// ✅ 数据会自动流向策略，无需手动管理！
```

## 订阅配置

### 1. 简单配置（布尔值）

```typescript
subscription: {
  ticker: true,      // 使用默认配置
  orderbook: true,   // 使用默认配置
  trades: false,     // 不订阅
  klines: true,      // 使用默认配置
}
```

### 2. 详细配置（对象）

```typescript
subscription: {
  // Ticker 配置
  ticker: {
    enabled: true,
    interval: 1000,  // REST 轮询间隔（毫秒）
  },
  
  // OrderBook 配置
  orderbook: {
    enabled: true,
    depth: 20,       // 订单簿深度
    interval: 500,   // REST 轮询间隔
  },
  
  // Trades 配置
  trades: {
    enabled: true,
    limit: 10,       // 获取交易数量
    interval: 1000,
  },
  
  // Klines 配置
  klines: {
    enabled: true,
    interval: '1m',      // K线间隔
    limit: 100,          // 获取数量
    pollInterval: 60000, // REST 轮询间隔
  },
  
  // 订阅方式
  method: 'auto',  // 'auto' | 'websocket' | 'rest'
  
  // 指定交易所
  exchange: 'binance', // 可选，不指定则订阅所有交易所
}
```

## 使用示例

### 示例 1：只需要 Ticker

```typescript
const maStrategy = new MovingAverageStrategy({
  symbol: 'BTC/USDT',
  fastPeriod: 10,
  slowPeriod: 30,
  subscription: {
    ticker: true,  // 简单！
  }
});

await engine.addStrategy('ma-strategy', maStrategy);
await engine.start();
```

### 示例 2：需要多种数据

```typescript
const complexStrategy = new ComplexStrategy({
  symbol: 'BTC/USDT',
  subscription: {
    ticker: true,
    orderbook: { enabled: true, depth: 50 },
    trades: { enabled: true, limit: 20 },
  }
});

await engine.addStrategy('complex-strategy', complexStrategy);
await engine.start();
```

### 示例 3：指定订阅方式

```typescript
// 使用 REST 轮询（更稳定）
const restStrategy = new Strategy({
  symbol: 'BTC/USDT',
  subscription: {
    ticker: {
      enabled: true,
      interval: 1000,  // 每秒轮询
    },
    method: 'rest',  // 强制使用 REST
  }
});

// 使用 WebSocket（实时性更好）
const wsStrategy = new Strategy({
  symbol: 'BTC/USDT',
  subscription: {
    ticker: true,
    method: 'websocket',  // 强制使用 WebSocket
  }
});
```

### 示例 4：多策略共享数据

```typescript
// 两个策略都需要 BTC/USDT ticker
const strategy1 = new StrategyA({
  symbol: 'BTC/USDT',
  subscription: { ticker: true }
});

const strategy2 = new StrategyB({
  symbol: 'BTC/USDT',
  subscription: { ticker: true }
});

// ✅ 添加第一个策略，订阅数据
await engine.addStrategy('strategy-a', strategy1);

// ✅ 添加第二个策略，自动共享订阅（不会重复订阅）
await engine.addStrategy('strategy-b', strategy2);

// ✅ 移除第一个策略，保持订阅（因为 strategy-b 还需要）
await engine.removeStrategy('strategy-a');

// ✅ 移除第二个策略，自动取消订阅（没有策略需要了）
await engine.removeStrategy('strategy-b');
```

### 示例 5：多交易所订阅

```typescript
// 不指定 exchange，自动订阅所有交易所
const arbitrageStrategy = new ArbitrageStrategy({
  symbol: 'BTC/USDT',
  subscription: {
    ticker: true,
    // 将订阅所有已连接的交易所（binance, okx, coinbase, etc.）
  }
});

await engine.addStrategy('arbitrage', arbitrageStrategy);
await engine.start();

// 策略的 analyze 方法会收到所有交易所的数据
// ticker.exchange 可以区分来源
```

### 示例 6：只订阅特定交易所

```typescript
const binanceOnlyStrategy = new Strategy({
  symbol: 'BTC/USDT',
  subscription: {
    ticker: true,
    exchange: 'binance',  // 只订阅 Binance
  }
});

await engine.addStrategy('binance-strategy', binanceOnlyStrategy);
```

## 完整示例

### 简单的移动平均策略

```typescript
import { TradingEngine, LogLevel, EventBus } from '@itrade/core';
import { ConsoleLogger } from '@itrade/logger';
import { RiskManager } from '@itrade/risk-manager';
import { PortfolioManager } from '@itrade/portfolio-manager';
import { BinanceExchange } from '@itrade/exchange-connectors';
import { MovingAverageStrategy } from '@itrade/strategies';
import { Decimal } from 'decimal.js';

const logger = new ConsoleLogger(LogLevel.INFO);

async function main() {
  // 初始化组件
  const riskManager = new RiskManager({
    maxDrawdown: new Decimal(20),
    maxPositionSize: new Decimal(10),
    maxDailyLoss: new Decimal(5),
  });
  const portfolioManager = new PortfolioManager(new Decimal(10000));
  const engine = new TradingEngine(riskManager, portfolioManager, logger);

  // 连接交易所
  const binance = new BinanceExchange(false);
  await binance.connect({
    apiKey: process.env.BINANCE_API_KEY || '',
    secretKey: process.env.BINANCE_SECRET_KEY || '',
    sandbox: false,
  });
  engine.addExchange('binance', binance);

  // 创建策略（带自动订阅配置）
  const strategy = new MovingAverageStrategy({
    symbol: 'BTC/USDT',
    fastPeriod: 5,
    slowPeriod: 20,
    threshold: 0.001,
    // ✅ 自动订阅配置
    subscription: {
      ticker: {
        enabled: true,
        interval: 1000,  // 每秒更新
      },
      method: 'rest',  // 使用 REST 轮询（更稳定）
    }
  });

  // 添加策略
  await engine.addStrategy('ma-strategy', strategy);

  // 监听策略信号
  const eventBus = EventBus.getInstance();
  eventBus.onStrategySignal((signal) => {
    logger.info(`🎯 Strategy Signal: ${signal.action} ${signal.symbol} @ ${signal.price}`);
  });

  // 启动引擎（自动开始订阅）
  await engine.start();
  logger.info('✅ Trading engine started with auto-subscription');

  // 查看订阅统计
  const stats = engine.getSubscriptionStats();
  logger.info(`📊 Subscription Stats: ${JSON.stringify(stats)}`);

  // 优雅关闭
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await engine.stop();  // 自动清理所有订阅
    process.exit(0);
  });
}

main().catch(console.error);
```

### 多策略示例

```typescript
async function multiStrategyExample() {
  const engine = new TradingEngine(riskManager, portfolioManager, logger);
  
  // 添加多个交易所
  const binance = new BinanceExchange(false);
  const okx = new OKXExchange(true);
  await binance.connect({...});
  await okx.connect({...});
  engine.addExchange('binance', binance);
  engine.addExchange('okx', okx);

  // 策略 1：BTC/USDT 移动平均（两个交易所）
  await engine.addStrategy('btc-ma', new MovingAverageStrategy({
    symbol: 'BTC/USDT',
    fastPeriod: 5,
    slowPeriod: 20,
    subscription: {
      ticker: true,  // 自动订阅两个交易所的数据
    }
  }));

  // 策略 2：ETH/USDT 移动平均（只 Binance）
  await engine.addStrategy('eth-ma', new MovingAverageStrategy({
    symbol: 'ETH/USDT',
    fastPeriod: 10,
    slowPeriod: 30,
    subscription: {
      ticker: true,
      exchange: 'binance',  // 只订阅 Binance
    }
  }));

  // 策略 3：BTC/USDT 订单簿分析（只需要 orderbook）
  await engine.addStrategy('btc-ob', new OrderBookStrategy({
    symbol: 'BTC/USDT',
    subscription: {
      orderbook: {
        enabled: true,
        depth: 50,
        interval: 500,
      },
      method: 'rest',
    }
  }));

  // 启动
  await engine.start();
  
  // 查看统计
  const stats = engine.getSubscriptionStats();
  console.log('Subscriptions:', {
    total: stats.total,
    byType: stats.byType,
    byExchange: stats.byExchange,
  });
  // 输出示例：
  // {
  //   total: 3,
  //   byType: { ticker: 2, orderbook: 1 },
  //   byExchange: { binance: 3, okx: 1 }
  // }
}
```

## 配置参考

### Ticker 配置

```typescript
ticker: boolean | {
  enabled: boolean;
  interval?: number;  // REST 轮询间隔，默认 1000ms
}
```

### OrderBook 配置

```typescript
orderbook: boolean | {
  enabled: boolean;
  depth?: number;     // 订单簿深度，默认 20
  interval?: number;  // REST 轮询间隔，默认 500ms
}
```

### Trades 配置

```typescript
trades: boolean | {
  enabled: boolean;
  limit?: number;     // 交易数量，默认 10
  interval?: number;  // REST 轮询间隔，默认 1000ms
}
```

### Klines 配置

```typescript
klines: boolean | {
  enabled: boolean;
  interval?: string;      // K线间隔，默认 '1m'
  limit?: number;         // K线数量，默认 1
  pollInterval?: number;  // REST 轮询间隔，默认 60000ms
}
```

### 方法选择

```typescript
method: 'auto' | 'websocket' | 'rest'
```

- `'auto'`：自动选择（优先 WebSocket，不可用则 REST）
- `'websocket'`：强制使用 WebSocket
- `'rest'`：强制使用 REST 轮询

## 订阅统计

查看当前的订阅状态：

```typescript
const stats = engine.getSubscriptionStats();

console.log(stats);
// {
//   total: 5,
//   byType: {
//     ticker: 3,
//     orderbook: 1,
//     klines: 1
//   },
//   byMethod: {
//     websocket: 2,
//     rest: 3
//   },
//   byExchange: {
//     binance: 3,
//     okx: 2
//   }
// }
```

## 最佳实践

### 1. 选择合适的订阅方式

```typescript
// ✅ 高频交易：使用 WebSocket
subscription: {
  ticker: true,
  method: 'websocket'
}

// ✅ 稳定性优先：使用 REST
subscription: {
  ticker: { enabled: true, interval: 1000 },
  method: 'rest'
}

// ✅ 自动选择：让系统决定
subscription: {
  ticker: true,
  method: 'auto'  // 默认
}
```

### 2. 合理设置轮询间隔

```typescript
// ✅ 推荐：根据交易所限制设置
subscription: {
  ticker: {
    enabled: true,
    interval: 1000,  // Binance: 1200次/分钟
  }
}

// ❌ 避免：过于频繁
subscription: {
  ticker: {
    enabled: true,
    interval: 10,  // 太频繁，可能超限
  }
}
```

### 3. 按需订阅

```typescript
// ✅ 只订阅需要的数据
subscription: {
  ticker: true,  // 只需要价格
}

// ❌ 避免：订阅不需要的数据
subscription: {
  ticker: true,
  orderbook: true,  // 如果策略不用，不要订阅
  trades: true,
  klines: true,
}
```

### 4. 日志监控

```typescript
// 订阅时会自动记录日志
// [INFO] Auto-subscribing data for strategy ma-strategy (symbol: BTC/USDT, exchanges: binance)
// [INFO] Subscribing via REST polling: binance BTC/USDT ticker (interval: 1000ms)
// [INFO] Strategy ma-strategy reusing subscription: binance:BTC/USDT:ticker (refCount: 2)
```

## 与手动订阅对比

### 旧方式（手动管理）

```typescript
// ❌ 旧方式：需要手动管理
const strategy = new MovingAverageStrategy({
  symbol: 'BTC/USDT',
  // ...
});

engine.addStrategy('ma-strategy', strategy);
await engine.start();

// 手动订阅
await binance.subscribeToTicker('BTC/USDT');

// 或者 REST 轮询
const pollInterval = setInterval(async () => {
  const ticker = await binance.getTicker('BTC/USDT');
  await engine.onTicker('BTC/USDT', ticker, 'binance');
}, 1000);

// 移除策略时需要手动清理
engine.removeStrategy('ma-strategy');
clearInterval(pollInterval);  // 容易忘记！
```

### 新方式（自动管理）

```typescript
// ✅ 新方式：完全自动
const strategy = new MovingAverageStrategy({
  symbol: 'BTC/USDT',
  subscription: {
    ticker: true,  // 就这么简单！
  }
});

await engine.addStrategy('ma-strategy', strategy);
await engine.start();  // 自动订阅

// 移除时自动清理
await engine.removeStrategy('ma-strategy');  // 自动取消订阅
```

## 故障排除

### 问题 1：没有收到数据

**检查**：
1. 策略是否配置了 `subscription`
2. 策略是否指定了 `symbol`
3. 引擎是否已启动（`await engine.start()`）
4. 交易所是否已连接

```typescript
// 检查订阅统计
const stats = engine.getSubscriptionStats();
console.log(stats);  // 应该显示订阅信息
```

### 问题 2：订阅被限速

**解决**：增加轮询间隔

```typescript
subscription: {
  ticker: {
    enabled: true,
    interval: 2000,  // 增加到 2 秒
  }
}
```

### 问题 3：WebSocket 连接失败

**解决**：改用 REST

```typescript
subscription: {
  ticker: true,
  method: 'rest',  // 强制使用 REST
}
```

## 相关文档

- [设计文档](./DESIGN-AUTO-SUBSCRIPTION.md) - 详细的设计说明
- [API 参考](./API-REFERENCE-MARKET-DATA.md) - 完整的 API 文档
- [多交易所指南](./MULTI-EXCHANGE-GUIDE.md) - 多交易所使用

---

**版本**：1.3.0  
**日期**：2025-10-09  
**状态**：生产就绪 ✅

