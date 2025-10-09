# OKX 交易所集成指南

## 概述

OKX（前身为 OKEx）是全球领先的加密货币交易所之一。本指南将帮助你在 iTrade 系统中使用 OKX 交易所。

## 主要特性

✅ **支持的功能**：
- 实时市场数据（Ticker、OrderBook、Trades）
- K线数据订阅
- 现货交易
- 账户信息查询
- 持仓管理
- WebSocket 实时数据流
- REST API 轮询

✅ **支持的市场**：
- 现货交易（SPOT）

## 快速开始

### 1. 基本使用示例

```typescript
import { OKXExchange } from '@itrade/exchange-connectors';
import { TradingEngine, LogLevel } from '@itrade/core';
import { ConsoleLogger } from '@itrade/logger';
import { RiskManager } from '@itrade/risk-manager';
import { PortfolioManager } from '@itrade/portfolio-manager';
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

  // 创建 OKX 交易所实例
  const okx = new OKXExchange(true); // true = demo trading mode

  // 连接到 OKX
  await okx.connect({
    apiKey: process.env.OKX_API_KEY || '',
    secretKey: process.env.OKX_SECRET_KEY || '',
    passphrase: process.env.OKX_PASSPHRASE || '', // OKX 需要 passphrase
    sandbox: true, // 使用模拟交易
  });

  // 添加到引擎
  engine.addExchange('okx', okx);

  // 添加策略
  const strategy = new MovingAverageStrategy({
    fastPeriod: 3,
    slowPeriod: 5,
    threshold: 0.001,
    symbol: 'BTC/USDT', // 标准格式，会自动转换为 BTC-USDT
  });
  engine.addStrategy('ma-strategy', strategy);

  // 启动引擎
  await engine.start();

  // 订阅市场数据
  await okx.subscribeToTicker('BTC/USDT');
  logger.info('Subscribed to OKX BTC/USDT ticker');

  // 保持运行
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await engine.stop();
    await okx.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);
```

### 2. 使用 REST API 轮询（推荐）

如果 WebSocket 连接有问题，使用 REST API：

```typescript
async function main() {
  // ... 初始化代码 ...

  const okx = new OKXExchange(true);
  await okx.connect({
    apiKey: process.env.OKX_API_KEY || '',
    secretKey: process.env.OKX_SECRET_KEY || '',
    passphrase: process.env.OKX_PASSPHRASE || '',
    sandbox: true,
  });

  engine.addExchange('okx', okx);
  await engine.start();

  // 使用 REST API 轮询
  const symbol = 'BTC/USDT';
  setInterval(async () => {
    try {
      const ticker = await okx.getTicker(symbol);
      logger.info(`OKX ${symbol}: ${ticker.price.toString()}`);
      await engine.onMarketData(symbol, ticker);
    } catch (error) {
      logger.error('Failed to fetch ticker:', error);
    }
  }, 1000); // 每秒轮询
}
```

## OKX API 配置

### 获取 API 密钥

1. 访问 [OKX](https://www.okx.com)
2. 登录账户
3. 前往 **API 管理** 页面
4. 创建新的 API 密钥

⚠️ **重要**：
- API Key
- Secret Key
- **Passphrase**（OKX 特有，创建 API 时设置）

### Demo Trading（模拟交易）

OKX 提供模拟交易环境：

1. 在 OKX 网站开启 Demo Trading
2. 创建 Demo API 密钥
3. 使用时设置 `isDemo = true`

```typescript
const okx = new OKXExchange(true); // Demo mode
```

### 环境变量配置

创建 `.env` 文件：

```bash
# OKX API 凭证
OKX_API_KEY=your_api_key_here
OKX_SECRET_KEY=your_secret_key_here
OKX_PASSPHRASE=your_passphrase_here

# 或者使用 Demo Trading
OKX_DEMO_API_KEY=your_demo_api_key
OKX_DEMO_SECRET_KEY=your_demo_secret_key
OKX_DEMO_PASSPHRASE=your_demo_passphrase
```

## 符号格式

### 标准格式 → OKX 格式

iTrade 自动处理符号转换：

| 标准格式 | OKX 格式 | 说明 |
|---------|---------|------|
| `BTC/USDT` | `BTC-USDT` | 使用连字符 |
| `ETH/USDT` | `ETH-USDT` | 自动转换 |
| `BNB/USDT` | `BNB-USDT` | 支持所有币种 |

```typescript
// ✅ 推荐：使用标准格式
await okx.subscribeToTicker('BTC/USDT');

// ✅ 也支持 OKX 格式
await okx.subscribeToTicker('BTC-USDT');
```

## API 方法

### 市场数据

```typescript
// 获取 Ticker
const ticker = await okx.getTicker('BTC/USDT');
console.log(`Price: ${ticker.price.toString()}`);
console.log(`Volume: ${ticker.volume.toString()}`);

// 获取订单簿
const orderbook = await okx.getOrderBook('BTC/USDT', 20);
console.log(`Best bid: ${orderbook.bids[0][0].toString()}`);
console.log(`Best ask: ${orderbook.asks[0][0].toString()}`);

// 获取最近交易
const trades = await okx.getTrades('BTC/USDT', 10);
trades.forEach(trade => {
  console.log(`${trade.side} ${trade.quantity} @ ${trade.price}`);
});

// 获取 K 线数据
const klines = await okx.getKlines('BTC/USDT', '1h', undefined, undefined, 100);
klines.forEach(kline => {
  console.log(`O: ${kline.open}, H: ${kline.high}, L: ${kline.low}, C: ${kline.close}`);
});
```

### 交易操作

```typescript
import { OrderSide, OrderType } from '@itrade/core';
import { Decimal } from 'decimal.js';

// 创建限价买单
const order = await okx.createOrder(
  'BTC/USDT',
  OrderSide.BUY,
  OrderType.LIMIT,
  new Decimal(0.001),  // 数量
  new Decimal(40000),  // 价格
);
console.log(`Order created: ${order.id}`);

// 创建市价卖单
const marketOrder = await okx.createOrder(
  'BTC/USDT',
  OrderSide.SELL,
  OrderType.MARKET,
  new Decimal(0.001),
);

// 取消订单
await okx.cancelOrder('BTC/USDT', order.id);

// 查询订单
const orderInfo = await okx.getOrder('BTC/USDT', order.id);
console.log(`Order status: ${orderInfo.status}`);

// 获取未完成订单
const openOrders = await okx.getOpenOrders('BTC/USDT');
console.log(`Open orders: ${openOrders.length}`);

// 获取历史订单
const history = await okx.getOrderHistory('BTC/USDT', 10);
```

### 账户信息

```typescript
// 获取账户信息
const account = await okx.getAccountInfo();
console.log(`Can trade: ${account.canTrade}`);

// 获取余额
const balances = await okx.getBalances();
balances.forEach(balance => {
  if (balance.total.gt(0)) {
    console.log(`${balance.asset}: ${balance.total.toString()}`);
  }
});

// 获取持仓（合约）
const positions = await okx.getPositions();
positions.forEach(pos => {
  console.log(`${pos.symbol}: ${pos.quantity} @ ${pos.entryPrice}`);
});

// 获取交易所信息
const info = await okx.getExchangeInfo();
console.log(`Supported symbols: ${info.symbols.length}`);
```

### WebSocket 订阅

```typescript
// 订阅 Ticker
await okx.subscribeToTicker('BTC/USDT');

// 订阅订单簿
await okx.subscribeToOrderBook('BTC/USDT');

// 订阅交易
await okx.subscribeToTrades('BTC/USDT');

// 订阅 K 线
await okx.subscribeToKlines('BTC/USDT', '1m');

// 监听事件
okx.on('ticker', (symbol, ticker) => {
  console.log(`${symbol}: ${ticker.price.toString()}`);
});

okx.on('orderbook', (symbol, orderbook) => {
  console.log(`${symbol} orderbook updated`);
});

okx.on('trade', (symbol, trade) => {
  console.log(`${symbol} trade: ${trade.side} ${trade.quantity} @ ${trade.price}`);
});
```

## OKX vs Binance 对比

| 特性 | OKX | Binance |
|------|-----|---------|
| 符号格式 | `BTC-USDT` | `BTCUSDT` |
| API 认证 | Key + Secret + Passphrase | Key + Secret |
| WebSocket URL | `wss://ws.okx.com:8443/ws/v5/public` | `wss://stream.binance.com:9443/ws/` |
| K线间隔 | `1m`, `1H`, `1D` | `1m`, `1h`, `1d` |
| 现货交易 | ✅ | ✅ |
| 合约交易 | ✅ | ✅ |
| Demo Trading | ✅ | ✅ (Testnet) |
| API 速率限制 | 更宽松 | 严格 |

## API 速率限制

### REST API

OKX 的速率限制比 Binance 更宽松：

| 端点类型 | 限制 |
|---------|------|
| 公共端点 | 20 次/2秒 |
| 私有端点 | 60 次/2秒 |
| 交易端点 | 60 次/2秒 |

### WebSocket

- 每个连接最多订阅 240 个频道
- 每个 IP 最多 200 个连接

### 推荐轮询间隔

```typescript
// 市场数据
const marketDataInterval = 500;  // 500ms（每秒2次，安全）

// 账户数据
const accountDataInterval = 2000; // 2秒
```

## 错误处理

```typescript
try {
  const ticker = await okx.getTicker('BTC/USDT');
} catch (error) {
  if (error.message.includes('OKX API error')) {
    // OKX API 返回错误
    console.error('OKX API error:', error.message);
  } else if (error.message.includes('ECONNRESET')) {
    // 网络连接问题
    console.error('Network error, retrying...');
  } else {
    // 其他错误
    console.error('Unknown error:', error);
  }
}
```

## 常见问题

### Q: Passphrase 是什么？

**A**: OKX API 需要三个凭证：
- API Key
- Secret Key
- **Passphrase**（创建 API 时你设置的密码）

### Q: 如何使用 Demo Trading？

**A**: 
1. 创建 OKX 账户
2. 在网站上启用 Demo Trading
3. 创建 Demo API 密钥
4. 使用时设置 `new OKXExchange(true)`

### Q: WebSocket 连接失败怎么办？

**A**: 使用 REST API 轮询作为备用方案：

```typescript
// 轮询模式
setInterval(async () => {
  const ticker = await okx.getTicker('BTC/USDT');
  await engine.onMarketData('BTC/USDT', ticker);
}, 1000);
```

### Q: 支持哪些订单类型？

**A**: 
- ✅ Market（市价单）
- ✅ Limit（限价单）
- ✅ Conditional（条件单，用于止损）

### Q: 如何在多个交易所之间切换？

**A**:
```typescript
// 同时使用 OKX 和 Binance
const okx = new OKXExchange(true);
const binance = new BinanceExchange(false);

await okx.connect({...});
await binance.connect({...});

engine.addExchange('okx', okx);
engine.addExchange('binance', binance);

// 订阅相同的交易对
await okx.subscribeToTicker('BTC/USDT');
await binance.subscribeToTicker('BTC/USDT');
```

## 完整示例

创建 `apps/console/src/main-okx.ts`：

```typescript
import { OKXExchange } from '@itrade/exchange-connectors';
import { TradingEngine, LogLevel, EventBus } from '@itrade/core';
import { ConsoleLogger } from '@itrade/logger';
import { RiskManager } from '@itrade/risk-manager';
import { PortfolioManager } from '@itrade/portfolio-manager';
import { MovingAverageStrategy } from '@itrade/strategies';
import { Decimal } from 'decimal.js';

const logger = new ConsoleLogger(LogLevel.DEBUG);

async function main() {
  const riskManager = new RiskManager({
    maxDrawdown: new Decimal(20),
    maxPositionSize: new Decimal(10),
    maxDailyLoss: new Decimal(5),
  });
  const portfolioManager = new PortfolioManager(new Decimal(10000));
  const engine = new TradingEngine(riskManager, portfolioManager, logger);

  const symbol = 'BTC/USDT';
  const strategy = new MovingAverageStrategy({
    fastPeriod: 3,
    slowPeriod: 5,
    threshold: 0.001,
    symbol,
  });
  engine.addStrategy('ma-strategy', strategy);

  // 创建 OKX 实例
  const okx = new OKXExchange(true); // Demo mode

  // 添加事件监听
  okx.on('connected', () => {
    logger.info('✅ OKX connected');
  });

  await okx.connect({
    apiKey: process.env.OKX_API_KEY || '',
    secretKey: process.env.OKX_SECRET_KEY || '',
    passphrase: process.env.OKX_PASSPHRASE || '',
    sandbox: true,
  });

  engine.addExchange('okx', okx);
  await engine.start();

  // 使用 REST 轮询（更稳定）
  logger.info(`Starting REST API polling for ${symbol}...`);
  let tickerCount = 0;

  const pollInterval = setInterval(async () => {
    try {
      const ticker = await okx.getTicker(symbol);
      tickerCount++;
      logger.info(`📈 OKX Ticker #${tickerCount}: ${symbol} = ${ticker.price.toString()}`);
      await engine.onMarketData(symbol, ticker);
    } catch (error) {
      logger.error('Failed to fetch ticker:', error);
    }
  }, 1000);

  // 监听策略信号
  const eventBus = EventBus.getInstance();
  eventBus.onStrategySignal((signal) => {
    logger.info(`🎯 Strategy Signal: ${signal.action} ${signal.symbol} @ ${signal.price}`);
  });

  // 优雅关闭
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    clearInterval(pollInterval);
    await engine.stop();
    await okx.disconnect();
    process.exit(0);
  });

  logger.info('OKX trading system is running...');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

运行：
```bash
cd apps/console
tsx src/main-okx.ts
```

## 相关资源

- [OKX API 文档](https://www.okx.com/docs-v5/en/)
- [OKX Demo Trading](https://www.okx.com/trade-demo)
- [iTrade 文档](../README.md)
- [WebSocket 故障排除](./WEBSOCKET-BLOCKED-SOLUTION.md)
- [策略调试指南](./STRATEGY-DEBUG-GUIDE.md)

## 总结

OKX 交易所现已完全集成到 iTrade 系统中：

✅ **完整功能**：
- REST API（市场数据、交易、账户）
- WebSocket（实时数据流）
- 符号自动转换
- Demo Trading 支持

✅ **使用便捷**：
- 与 Binance 类似的 API
- 支持 REST 轮询备用方案
- 详细的错误处理

✅ **生产就绪**：
- 完整的类型支持
- 全面的错误处理
- 速率限制友好

开始使用 OKX 进行交易吧！🚀

