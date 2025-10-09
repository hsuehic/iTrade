# 多交易所支持 - 快速总结

## 问题

**用户提问**：
> TradeEngine 里如果添加了多个 Exchange 都有订阅数据的话， Strategy 里怎么区别是哪个交易所的数据呢？

## 解决方案

### ✅ 1. 数据类型增强

在所有市场数据接口中添加了 `exchange?: string` 字段：

```typescript
// Ticker
export interface Ticker {
  // ... 原有字段
  exchange?: string; // 🆕 交易所名称
}

// OrderBook, Trade, Kline 同样添加
```

### ✅ 2. TradingEngine API 增强

```typescript
// 之前
public async onMarketData(symbol: string, data: any): Promise<void>

// 现在
public async onMarketData(
  symbol: string, 
  data: any, 
  exchangeName?: string  // 🆕 可选参数
): Promise<void>
```

### ✅ 3. 自动交易所标识

```typescript
// TradingEngine 内部自动处理
exchange.on('ticker', (symbol: string, ticker: any) => {
  this.onMarketData(symbol, ticker, exchange.name); // 自动传递交易所名称
});
```

## 使用方法

### 方法 1：在策略中检查 exchange 字段

```typescript
export class MyStrategy extends BaseStrategy {
  public async analyze(marketData: { ticker?: Ticker }): Promise<StrategyResult> {
    const ticker = marketData.ticker;
    
    // 检查数据来源
    if (ticker.exchange === 'binance') {
      console.log('来自 Binance');
    } else if (ticker.exchange === 'okx') {
      console.log('来自 OKX');
    }
    
    // 继续分析...
  }
}
```

### 方法 2：分离不同交易所的数据流

```typescript
export class ArbitrageStrategy extends BaseStrategy {
  private binancePrices: Map<string, Decimal> = new Map();
  private okxPrices: Map<string, Decimal> = new Map();

  public async analyze(marketData: { ticker?: Ticker }): Promise<StrategyResult> {
    const ticker = marketData.ticker;
    
    if (ticker.exchange === 'binance') {
      this.binancePrices.set(ticker.symbol, ticker.price);
    } else if (ticker.exchange === 'okx') {
      this.okxPrices.set(ticker.symbol, ticker.price);
    }
    
    // 比较价格，寻找套利机会
    return this.checkArbitrage(ticker.symbol);
  }
}
```

### 方法 3：手动调用时指定交易所

```typescript
// REST API 轮询时
const binanceTicker = await binance.getTicker('BTC/USDT');
await engine.onMarketData('BTC/USDT', binanceTicker, 'binance'); // 指定交易所

const okxTicker = await okx.getTicker('BTC/USDT');
await engine.onMarketData('BTC/USDT', okxTicker, 'okx'); // 指定交易所
```

## 实际应用场景

### 1️⃣ 跨交易所套利

```typescript
// 监控价差，当差价 > 1% 时触发套利
if (binancePrice > okxPrice * 1.01) {
  return {
    action: 'buy',
    reason: `在 OKX 买入 @ ${okxPrice}, 在 Binance 卖出 @ ${binancePrice}`,
  };
}
```

### 2️⃣ 最优价格执行

```typescript
// 买入时选择最低价的交易所
const lowestPrice = Math.min(binancePrice, okxPrice, coinbasePrice);
const bestExchange = // ... 找到最低价的交易所
```

### 3️⃣ 数据质量筛选

```typescript
// 只使用流动性好的交易所数据
if (ticker.exchange === 'binance' || ticker.exchange === 'okx') {
  // 使用高质量数据
} else {
  return { action: 'hold', reason: 'Low liquidity exchange' };
}
```

## 完整示例

```typescript
async function main() {
  // 1. 添加多个交易所
  const binance = new BinanceExchange(false);
  const okx = new OKXExchange(true);
  
  await binance.connect({...});
  await okx.connect({...});
  
  engine.addExchange('binance', binance);
  engine.addExchange('okx', okx);
  
  // 2. 添加套利策略
  const arbitrageStrategy = new ArbitrageStrategy({...});
  engine.addStrategy('arbitrage', arbitrageStrategy);
  
  // 3. 启动
  await engine.start();
  
  // 4. 轮询数据（自动携带交易所信息）
  setInterval(async () => {
    const binanceTicker = await binance.getTicker('BTC/USDT');
    await engine.onMarketData('BTC/USDT', binanceTicker, 'binance');
    
    const okxTicker = await okx.getTicker('BTC/USDT');
    await engine.onMarketData('BTC/USDT', okxTicker, 'okx');
  }, 1000);
}
```

## 修改的文件

| 文件 | 修改内容 |
|-----|---------|
| `packages/core/src/types/index.ts` | 在 `Ticker`, `OrderBook`, `Trade`, `Kline` 中添加 `exchange?: string` |
| `packages/core/src/engine/TradingEngine.ts` | `onMarketData` 添加 `exchangeName` 参数，自动标识交易所 |
| `apps/console/src/main.ts` | 手动调用时传递交易所名称 |

## 特点

✅ **向后兼容**：所有字段都是可选的，现有代码无需修改  
✅ **自动化**：WebSocket 事件自动携带交易所信息  
✅ **灵活**：支持手动指定交易所名称  
✅ **类型安全**：完整的 TypeScript 类型支持

## 详细文档

📚 完整指南请查看：
- [多交易所使用指南](./MULTI-EXCHANGE-GUIDE.md) - 详细用法和示例
- [变更日志](./CHANGELOG-MULTI-EXCHANGE.md) - 完整的变更记录
- [OKX Exchange Guide](./OKX-EXCHANGE-GUIDE.md) - OKX 交易所使用指南

---

**更新时间**：2025-10-09  
**问题解决**：✅ 完成

