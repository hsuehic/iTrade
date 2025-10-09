# TradingEngine 市场数据 API 参考

## 快速对比

| 旧 API | 新 API | 数据类型 |
|--------|--------|---------|
| `onMarketData(symbol, ticker, exchange?)` | `onTicker(symbol, ticker, exchange?)` | `Ticker` |
| `onMarketData(symbol, orderbook, exchange?)` | `onOrderBook(symbol, orderbook, exchange?)` | `OrderBook` |
| `onMarketData(symbol, trades, exchange?)` | `onTrades(symbol, trades, exchange?)` | `Trade[]` |
| `onMarketData(symbol, kline, exchange?)` | `onKline(symbol, kline, exchange?)` | `Kline` |

## API 详情

### onTicker

处理 Ticker 数据（价格、成交量等）。

**签名**：
```typescript
public async onTicker(
  symbol: string,
  ticker: Ticker,
  exchangeName?: string
): Promise<void>
```

**参数**：
- `symbol`: 交易对符号（如 `'BTC/USDT'`）
- `ticker`: Ticker 数据对象
- `exchangeName`: 可选，交易所名称（如 `'binance'`, `'okx'`）

**Ticker 接口**：
```typescript
interface Ticker {
  symbol: string;
  price: Decimal;
  volume: Decimal;
  timestamp: Date;
  bid?: Decimal;
  ask?: Decimal;
  high24h?: Decimal;
  low24h?: Decimal;
  change24h?: Decimal;
  exchange?: string; // 自动添加
}
```

**使用示例**：
```typescript
const ticker = await binance.getTicker('BTC/USDT');
await engine.onTicker('BTC/USDT', ticker, 'binance');
```

**WebSocket 自动调用**：
```typescript
// TradingEngine 内部已处理
exchange.on('ticker', (symbol, ticker) => {
  engine.onTicker(symbol, ticker, exchangeName);
});
```

---

### onOrderBook

处理订单簿数据（买卖盘深度）。

**签名**：
```typescript
public async onOrderBook(
  symbol: string,
  orderbook: OrderBook,
  exchangeName?: string
): Promise<void>
```

**参数**：
- `symbol`: 交易对符号
- `orderbook`: 订单簿数据对象
- `exchangeName`: 可选，交易所名称

**OrderBook 接口**：
```typescript
interface OrderBook {
  symbol: string;
  timestamp: Date;
  bids: Array<[Decimal, Decimal]>; // [price, quantity]
  asks: Array<[Decimal, Decimal]>; // [price, quantity]
  exchange?: string; // 自动添加
}
```

**使用示例**：
```typescript
const orderbook = await binance.getOrderBook('BTC/USDT', 20);
await engine.onOrderBook('BTC/USDT', orderbook, 'binance');
```

**WebSocket 自动调用**：
```typescript
// TradingEngine 内部已处理
exchange.on('orderbook', (symbol, orderbook) => {
  engine.onOrderBook(symbol, orderbook, exchangeName);
});
```

---

### onTrades

处理成交记录数据。

**签名**：
```typescript
public async onTrades(
  symbol: string,
  trades: Trade[],
  exchangeName?: string
): Promise<void>
```

**参数**：
- `symbol`: 交易对符号
- `trades`: 交易记录数组
- `exchangeName`: 可选，交易所名称

**Trade 接口**：
```typescript
interface Trade {
  id: string;
  symbol: string;
  price: Decimal;
  quantity: Decimal;
  side: 'buy' | 'sell';
  timestamp: Date;
  takerOrderId?: string;
  makerOrderId?: string;
  exchange?: string; // 自动添加
}
```

**使用示例**：
```typescript
const trades = await binance.getTrades('BTC/USDT', 10);
await engine.onTrades('BTC/USDT', trades, 'binance');
```

**WebSocket 自动调用**：
```typescript
// TradingEngine 内部已处理
exchange.on('trade', (symbol, trade) => {
  engine.onTrades(symbol, [trade], exchangeName);
});
```

---

### onKline

处理 K 线（蜡烛图）数据。

**签名**：
```typescript
public async onKline(
  symbol: string,
  kline: Kline,
  exchangeName?: string
): Promise<void>
```

**参数**：
- `symbol`: 交易对符号
- `kline`: K 线数据对象
- `exchangeName`: 可选，交易所名称

**Kline 接口**：
```typescript
interface Kline {
  symbol: string;
  interval: string;
  openTime: Date;
  closeTime: Date;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
  quoteVolume: Decimal;
  trades: number;
  takerBuyBaseVolume?: Decimal;
  takerBuyQuoteVolume?: Decimal;
  exchange?: string; // 自动添加
}
```

**使用示例**：
```typescript
const klines = await binance.getKlines('BTC/USDT', '1m', undefined, undefined, 1);
if (klines.length > 0) {
  await engine.onKline('BTC/USDT', klines[0], 'binance');
}
```

**WebSocket 自动调用**：
```typescript
// TradingEngine 内部已处理
exchange.on('kline', (symbol, kline) => {
  engine.onKline(symbol, kline, exchangeName);
});
```

---

### onMarketData（已弃用）

通用市场数据处理方法（保留用于向后兼容）。

**签名**：
```typescript
/**
 * @deprecated Use specific methods like onTicker, onOrderBook, onTrades, onKline instead.
 */
public async onMarketData(
  symbol: string,
  data: any,
  exchangeName?: string
): Promise<void>
```

**参数**：
- `symbol`: 交易对符号
- `data`: 任意类型的市场数据
- `exchangeName`: 可选，交易所名称

**行为**：
- 自动检测数据类型
- 调用对应的具体方法
- 如果检测失败，使用旧逻辑

**类型检测逻辑**：
```typescript
if (isTicker(data)) {
  return this.onTicker(symbol, data, exchangeName);
} else if (isOrderBook(data)) {
  return this.onOrderBook(symbol, data, exchangeName);
} else if (isKline(data)) {
  return this.onKline(symbol, data, exchangeName);
} else if (Array.isArray(data) && isTrade(data[0])) {
  return this.onTrades(symbol, data, exchangeName);
}
```

**使用示例**（不推荐）：
```typescript
// ⚠️ 旧方式，仍然可用但不推荐
await engine.onMarketData('BTC/USDT', ticker, 'binance');
```

---

## 类型守卫（内部使用）

TradingEngine 内部使用以下类型守卫自动检测数据类型：

### isTicker
```typescript
private isTicker(data: any): data is Ticker {
  return (
    data &&
    typeof data === 'object' &&
    'price' in data &&
    'volume' in data &&
    'timestamp' in data
  );
}
```

### isOrderBook
```typescript
private isOrderBook(data: any): data is OrderBook {
  return (
    data &&
    typeof data === 'object' &&
    'bids' in data &&
    'asks' in data &&
    Array.isArray(data.bids) &&
    Array.isArray(data.asks)
  );
}
```

### isKline
```typescript
private isKline(data: any): data is Kline {
  return (
    data &&
    typeof data === 'object' &&
    'open' in data &&
    'high' in data &&
    'low' in data &&
    'close' in data &&
    'interval' in data
  );
}
```

### isTrade
```typescript
private isTrade(data: any): data is Trade {
  return (
    data &&
    typeof data === 'object' &&
    'id' in data &&
    'price' in data &&
    'quantity' in data &&
    'side' in data
  );
}
```

---

## 使用场景

### 场景 1：REST API 轮询

```typescript
// ✅ 推荐
setInterval(async () => {
  const ticker = await exchange.getTicker('BTC/USDT');
  await engine.onTicker('BTC/USDT', ticker, 'binance');
}, 1000);
```

### 场景 2：WebSocket 订阅

```typescript
// ✅ 自动处理（TradingEngine 内部）
// 你只需要订阅
await exchange.subscribeToTicker('BTC/USDT');

// 或手动处理
exchange.on('ticker', (symbol, ticker) => {
  await engine.onTicker(symbol, ticker, 'binance');
});
```

### 场景 3：多交易所数据

```typescript
// ✅ 推荐：类型安全，交易所明确
const binanceTicker = await binance.getTicker('BTC/USDT');
await engine.onTicker('BTC/USDT', binanceTicker, 'binance');

const okxTicker = await okx.getTicker('BTC/USDT');
await engine.onTicker('BTC/USDT', okxTicker, 'okx');
```

### 场景 4：混合数据类型

```typescript
// ✅ 推荐：每种类型使用对应方法
const ticker = await exchange.getTicker('BTC/USDT');
await engine.onTicker('BTC/USDT', ticker, 'binance');

const orderbook = await exchange.getOrderBook('BTC/USDT', 10);
await engine.onOrderBook('BTC/USDT', orderbook, 'binance');

const trades = await exchange.getTrades('BTC/USDT', 10);
await engine.onTrades('BTC/USDT', trades, 'binance');
```

---

## 错误处理

所有方法都内置了错误处理：

```typescript
try {
  const ticker = await exchange.getTicker('BTC/USDT');
  await engine.onTicker('BTC/USDT', ticker, 'binance');
} catch (error) {
  // TradingEngine 内部会记录错误
  // 你可以在外部添加额外处理
  logger.error('Failed to process ticker:', error);
}
```

内部错误日志示例：
```
[ERROR] Error processing ticker data: Invalid price value
[ERROR] Error in strategy my-strategy: Ticker analysis failed
```

---

## 性能考虑

### 方法调用性能

| 方法 | 性能 | 说明 |
|------|------|------|
| `onTicker` | ⚡️ 最快 | 无类型检测，直接处理 |
| `onOrderBook` | ⚡️ 最快 | 无类型检测，直接处理 |
| `onTrades` | ⚡️ 最快 | 无类型检测，直接处理 |
| `onKline` | ⚡️ 最快 | 无类型检测，直接处理 |
| `onMarketData` | ⚠️ 稍慢 | 需要运行时类型检测 |

### 高频交易场景

```typescript
// ✅ 推荐：直接使用具体方法
// 每秒 1000+ 次调用时，性能差异显著
for (let i = 0; i < 1000; i++) {
  await engine.onTicker(symbol, ticker, 'binance');
}

// ⚠️ 不推荐：使用通用方法
// 需要额外的类型检测开销
for (let i = 0; i < 1000; i++) {
  await engine.onMarketData(symbol, ticker, 'binance');
}
```

---

## 最佳实践

### ✅ 推荐做法

1. **使用具体方法**
   ```typescript
   await engine.onTicker(symbol, ticker, 'binance');
   ```

2. **明确指定交易所**
   ```typescript
   await engine.onTicker(symbol, ticker, 'binance'); // ✅ 明确
   ```

3. **合理的轮询间隔**
   ```typescript
   setInterval(async () => {
     await engine.onTicker(symbol, ticker, 'binance');
   }, 1000); // 1秒
   ```

### ❌ 避免的做法

1. **使用 onMarketData**
   ```typescript
   await engine.onMarketData(symbol, data, 'binance'); // ❌ 已弃用
   ```

2. **省略交易所名称（多交易所场景）**
   ```typescript
   await engine.onTicker(symbol, ticker); // ❌ 无法区分交易所
   ```

3. **过于频繁的调用**
   ```typescript
   setInterval(async () => {
     await engine.onTicker(symbol, ticker, 'binance');
   }, 10); // ❌ 太频繁，可能超过 API 限制
   ```

---

## 版本兼容性

| 版本 | onTicker/onOrderBook/onTrades/onKline | onMarketData | 兼容性 |
|------|---------------------------------------|--------------|--------|
| v1.0.x | ❌ 不可用 | ✅ 可用 | 仅旧 API |
| v1.1.x | ❌ 不可用 | ✅ 可用 | 仅旧 API |
| v1.2.x | ✅ 推荐 | ⚠️ 已弃用但可用 | 完全兼容 |
| v2.0.x | ✅ 推荐 | ❌ 可能移除 | 仅新 API |

---

## 相关文档

- [迁移指南](./MIGRATION-GUIDE-TYPED-MARKET-DATA.md) - 如何从旧 API 迁移到新 API
- [设计分析](./DESIGN-ANALYSIS-MARKET-DATA-API.md) - 详细的设计考虑和对比
- [多交易所使用指南](./MULTI-EXCHANGE-GUIDE.md) - 多交易所最佳实践

---

**版本**：1.2.0  
**最后更新**：2025-10-09  
**状态**：稳定

