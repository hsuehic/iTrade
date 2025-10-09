# 交易对符号标准化

## 概述

不同的交易所使用不同的交易对符号格式。为了提供统一的开发体验，iTrade 实现了自动符号转换功能。

## 支持的格式

### 标准格式（推荐使用）
```typescript
'BTC/USDT'   // 基础货币/报价货币，使用斜杠分隔
'ETH/USDT'
'BNB/USDT'
```

### 交易所特定格式

| 交易所 | 输入格式 | 自动转换为 | 示例 |
|--------|---------|-----------|------|
| Binance | `BTC/USDT` | `BTCUSDT` | 无分隔符 |
| Coinbase | `BTC/USDT` | `BTC-USDT` | 使用连字符 |

## 实现原理

### BaseExchange

```typescript
protected normalizeSymbol(symbol: string): string {
  // 基础实现：仅转换为大写
  // 子类可以重写此方法以实现特定转换
  return symbol.toUpperCase();
}
```

### BinanceExchange

```typescript
protected normalizeSymbol(symbol: string): string {
  // 转换 BTC/USDT 或 BTC-USDT 为 BTCUSDT
  // Binance 不使用任何分隔符
  return symbol.replace('/', '').replace('-', '').toUpperCase();
}
```

**支持的输入格式**：
- `BTC/USDT` → `BTCUSDT` ✅
- `BTC-USDT` → `BTCUSDT` ✅
- `btc/usdt` → `BTCUSDT` ✅
- `BTCUSDT` → `BTCUSDT` ✅

### CoinbaseExchange

```typescript
protected normalizeSymbol(symbol: string): string {
  // 转换 BTC/USDT 为 BTC-USD
  // Coinbase 使用连字符作为分隔符
  return symbol.replace('/', '-').toUpperCase();
}
```

**支持的输入格式**：
- `BTC/USDT` → `BTC-USDT` ✅
- `btc/usdt` → `BTC-USDT` ✅
- `BTC-USDT` → `BTC-USDT` ✅

## 使用方法

### 在策略中使用标准格式

```typescript
// ✅ 推荐：使用标准格式
const strategy = new MovingAverageStrategy({
  symbol: 'BTC/USDT',  // 会自动转换为交易所格式
  // ...其他参数
});
```

### 订阅市场数据

```typescript
// ✅ 使用标准格式，自动转换
await binanceExchange.subscribeToTicker('BTC/USDT');
// 内部自动转换为 'BTCUSDT'

await coinbaseExchange.subscribeToTicker('BTC/USDT');
// 内部自动转换为 'BTC-USDT'
```

### API 调用

所有需要符号的 API 方法都会自动应用转换：

```typescript
// getTicker
await exchange.getTicker('BTC/USDT');
// BinanceExchange: 请求 /api/v3/ticker/24hr?symbol=BTCUSDT
// CoinbaseExchange: 请求 /products/BTC-USDT/ticker

// getOrderBook
await exchange.getOrderBook('ETH/USDT', 100);

// createOrder
await exchange.createOrder(
  'BTC/USDT',    // 自动转换
  OrderSide.BUY,
  OrderType.LIMIT,
  quantity,
  price
);
```

## 兼容性

### 向后兼容

如果你已经在使用交易所特定格式，它们仍然可以正常工作：

```typescript
// ✅ Binance 特定格式仍然有效
await binanceExchange.subscribeToTicker('BTCUSDT');

// ✅ Coinbase 特定格式仍然有效
await coinbaseExchange.subscribeToTicker('BTC-USDT');
```

### 推荐做法

为了代码的可移植性和可读性，建议使用标准格式：

```typescript
// ✅ 好：使用标准格式，易于切换交易所
const symbol = 'BTC/USDT';
await exchange.subscribeToTicker(symbol);

// ❌ 不推荐：硬编码交易所特定格式
const symbol = 'BTCUSDT';  // 绑定到 Binance
await binanceExchange.subscribeToTicker(symbol);
```

## 多交易所支持示例

使用标准格式可以轻松支持多个交易所：

```typescript
const symbol = 'BTC/USDT';  // 标准格式

// 同时连接多个交易所
const binance = new BinanceExchange();
const coinbase = new CoinbaseExchange();

await binance.connect(binanceCredentials);
await coinbase.connect(coinbaseCredentials);

// 使用相同的符号格式
await binance.subscribeToTicker(symbol);   // → BTCUSDT
await coinbase.subscribeToTicker(symbol);  // → BTC-USDT

// 添加到引擎
engine.addExchange('binance', binance);
engine.addExchange('coinbase', coinbase);

// 策略也使用标准格式
const strategy = new MovingAverageStrategy({
  symbol: symbol,  // 在所有交易所上都能正确工作
  // ...
});
```

## WebSocket 订阅

符号标准化也适用于 WebSocket 订阅：

### Binance WebSocket

```typescript
// 输入：'BTC/USDT'
// WebSocket URL: wss://stream.binance.com:9443/ws/btcusdt@ticker
```

### Coinbase WebSocket

```typescript
// 输入：'BTC/USDT'
// WebSocket 订阅消息：{"type": "subscribe", "product_ids": ["BTC-USDT"], ...}
```

## 自定义交易所实现

如果你要添加新的交易所，只需重写 `normalizeSymbol` 方法：

```typescript
class MyExchange extends BaseExchange {
  protected normalizeSymbol(symbol: string): string {
    // 实现你的交易所特定转换
    // 例如：BTC/USDT → BTC_USDT
    return symbol.replace('/', '_').toUpperCase();
  }
}
```

## 注意事项

1. **符号验证**：转换后的符号格式必须是交易所支持的
2. **大小写**：所有转换都会统一为大写
3. **分隔符**：支持 `/` 和 `-` 作为输入分隔符
4. **幂等性**：多次调用 `normalizeSymbol` 不会改变结果

## 测试

```typescript
// Binance
expect(binance.normalizeSymbol('BTC/USDT')).toBe('BTCUSDT');
expect(binance.normalizeSymbol('btc/usdt')).toBe('BTCUSDT');
expect(binance.normalizeSymbol('BTC-USDT')).toBe('BTCUSDT');
expect(binance.normalizeSymbol('BTCUSDT')).toBe('BTCUSDT');

// Coinbase
expect(coinbase.normalizeSymbol('BTC/USDT')).toBe('BTC-USDT');
expect(coinbase.normalizeSymbol('btc/usdt')).toBe('BTC-USDT');
expect(coinbase.normalizeSymbol('BTC-USDT')).toBe('BTC-USDT');
```

## 总结

- ✅ 使用标准格式 `'BTC/USDT'` 开发
- ✅ 自动转换为交易所特定格式
- ✅ 提高代码可移植性
- ✅ 简化多交易所支持
- ✅ 向后兼容现有代码

