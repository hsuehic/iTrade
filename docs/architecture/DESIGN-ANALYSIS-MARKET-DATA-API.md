# 市场数据 API 设计分析

## 背景

当前 `TradingEngine` 使用单一方法 `onMarketData(symbol, data, exchangeName?)` 处理所有类型的市场数据。

考虑将其拆分为多个具体的方法：

- `onMarketTicker(symbol, ticker, exchangeName?)`
- `onMarketOrderBook(symbol, orderbook, exchangeName?)`
- `onMarketTrades(symbol, trades, exchangeName?)`
- `onMarketKline(symbol, kline, exchangeName?)`

## 方案对比

### 方案 A：统一方法（当前方案）

```typescript
// TradingEngine
public async onMarketData(
  symbol: string,
  data: any,  // 可以是 Ticker | OrderBook | Trade[] | Kline
  exchangeName?: string
): Promise<void>

// 调用方式
await engine.onMarketData('BTC/USDT', ticker, 'binance');
await engine.onMarketData('BTC/USDT', orderbook, 'binance');
await engine.onMarketData('BTC/USDT', klines, 'binance');
```

**优点** ✅：

1. **API 简单**：只有一个方法，易于理解和使用
2. **灵活性高**：可以传递任何类型的数据，扩展性好
3. **调用统一**：所有数据源的调用方式相同
4. **代码量少**：只需维护一个方法
5. **向后兼容**：不破坏现有代码

**缺点** ❌：

1. **类型不安全**：`data: any` 失去了类型检查
2. **语义不明确**：无法从方法名知道传递的数据类型
3. **策略处理复杂**：策略需要判断数据类型
4. **错误处理困难**：无法针对不同数据类型做不同的错误处理
5. **IDE 支持差**：无法提供类型提示和自动完成

**适用场景**：

- 原型开发和快速迭代
- 数据类型频繁变化
- 需要高度灵活性的场景

---

### 方案 B：拆分方法（推荐方案）

```typescript
// TradingEngine
public async onTicker(
  symbol: string,
  ticker: Ticker,
  exchangeName?: string
): Promise<void>

public async onOrderBook(
  symbol: string,
  orderbook: OrderBook,
  exchangeName?: string
): Promise<void>

public async onTrades(
  symbol: string,
  trades: Trade[],
  exchangeName?: string
): Promise<void>

public async onKline(
  symbol: string,
  kline: Kline,
  exchangeName?: string
): Promise<void>

// 调用方式
await engine.onTicker('BTC/USDT', ticker, 'binance');
await engine.onOrderBook('BTC/USDT', orderbook, 'binance');
await engine.onTrades('BTC/USDT', trades, 'binance');
await engine.onKline('BTC/USDT', kline, 'binance');
```

**优点** ✅：

1. **类型安全**：每个方法都有明确的类型定义
2. **语义清晰**：方法名直接表明数据类型
3. **IDE 友好**：完整的类型提示和自动完成
4. **错误处理精确**：可以针对不同数据类型做不同处理
5. **代码可读性强**：调用处一目了然
6. **策略接口清晰**：可以为每种数据类型提供专门的处理方法
7. **性能更好**：避免运行时类型判断
8. **易于测试**：可以独立测试每种数据类型的处理
9. **符合单一职责原则**：每个方法只处理一种数据类型

**缺点** ❌：

1. **API 数量增多**：需要维护多个方法
2. **代码重复**：可能存在一些共同逻辑的重复
3. **调用方需要修改**：需要更新所有调用点
4. **灵活性稍低**：新增数据类型需要新增方法

**适用场景**：

- 生产环境和长期维护
- 需要强类型安全
- 团队协作开发
- 复杂的数据处理逻辑

---

## 详细对比

| 维度 | 统一方法 (A) | 拆分方法 (B) |
|------|-------------|-------------|
| **类型安全** | ❌ 差 (`any` 类型) | ✅ 强（明确类型） |
| **可读性** | ⚠️ 中等 | ✅ 优秀 |
| **可维护性** | ⚠️ 中等 | ✅ 优秀 |
| **IDE 支持** | ❌ 差 | ✅ 优秀 |
| **错误处理** | ⚠️ 通用 | ✅ 精确 |
| **性能** | ⚠️ 需运行时判断 | ✅ 编译时确定 |
| **测试难度** | ⚠️ 需覆盖多种情况 | ✅ 独立测试 |
| **API 简洁度** | ✅ 简单 | ⚠️ 多个方法 |
| **扩展性** | ✅ 灵活 | ⚠️ 需新增方法 |
| **学习曲线** | ✅ 低 | ⚠️ 稍高 |
| **重构成本** | - | ⚠️ 需更新调用点 |

---

## 混合方案（推荐）

结合两种方案的优点：

```typescript
// 提供具体的类型安全方法（推荐使用）
public async onTicker(symbol: string, ticker: Ticker, exchangeName?: string): Promise<void>
public async onOrderBook(symbol: string, orderbook: OrderBook, exchangeName?: string): Promise<void>
public async onTrades(symbol: string, trades: Trade[], exchangeName?: string): Promise<void>
public async onKline(symbol: string, kline: Kline, exchangeName?: string): Promise<void>

// 保留通用方法（向后兼容）
@deprecated('Use specific methods like onTicker, onOrderBook, etc.')
public async onMarketData(symbol: string, data: any, exchangeName?: string): Promise<void> {
  // 自动检测类型并调用对应方法
  if (this.isTicker(data)) {
    return this.onTicker(symbol, data as Ticker, exchangeName);
  } else if (this.isOrderBook(data)) {
    return this.onOrderBook(symbol, data as OrderBook, exchangeName);
  }
  // ... 其他类型
}
```

**优点** ✅：

1. ✅ 类型安全（新代码使用具体方法）
2. ✅ 向后兼容（旧代码继续工作）
3. ✅ 渐进式迁移（可以逐步迁移）
4. ✅ 灵活性（两种方式都支持）

---

## 策略接口设计对比

### 当前设计

```typescript
interface IStrategy {
  analyze(marketData: {
    ticker?: Ticker;
    orderbook?: OrderBook;
    trades?: Trade[];
    klines?: Kline[];
  }): Promise<StrategyResult>;
}
```

**问题**：

- 策略需要检查哪些字段有值
- 不明确策略需要哪种数据
- 可能传递了不需要的数据

### 优化设计

```typescript
interface IStrategy {
  // 必须实现的核心方法
  analyze(marketData: {
    ticker?: Ticker;
    orderbook?: OrderBook;
    trades?: Trade[];
    klines?: Kline[];
  }): Promise<StrategyResult>;
  
  // 🆕 可选的专门处理方法
  onTicker?(ticker: Ticker): Promise<StrategyResult>;
  onOrderBook?(orderbook: OrderBook): Promise<StrategyResult>;
  onTrades?(trades: Trade[]): Promise<StrategyResult>;
  onKline?(kline: Kline): Promise<StrategyResult>;
}
```

**使用方式**：

```typescript
// TradingEngine
public async onTicker(symbol: string, ticker: Ticker, exchangeName?: string) {
  for (const [name, strategy] of this._strategies) {
    let result: StrategyResult;
    
    // 优先使用专门的方法
    if (strategy.onTicker) {
      result = await strategy.onTicker(ticker);
    } else {
      // 回退到通用方法
      result = await strategy.analyze({ ticker });
    }
    
    // 处理结果...
  }
}
```

---

## 实现建议

### 阶段 1：添加新方法（不破坏现有代码）

1. 添加具体的类型安全方法
2. 保留 `onMarketData` 并标记为 deprecated
3. `onMarketData` 内部调用新方法

### 阶段 2：更新调用点

1. 更新 `setupExchangeListeners` 使用新方法
2. 更新示例代码使用新方法
3. 更新文档说明推荐用法

### 阶段 3：增强策略接口（可选）

1. 为策略添加可选的专门处理方法
2. 保持向后兼容
3. 允许策略选择最适合的实现方式

### 阶段 4：逐步弃用（长期）

1. 在文档中说明 `onMarketData` 已弃用
2. 提供迁移指南
3. 在下一个大版本中移除（可选）

---

## 性能影响

### 方案 A（统一方法）

```typescript
// 需要运行时判断
public async onMarketData(symbol: string, data: any) {
  for (const strategy of strategies) {
    // 策略内部需要判断类型
    if (data.price && data.volume) {
      // 处理 ticker
    } else if (data.bids && data.asks) {
      // 处理 orderbook
    }
  }
}
```

**性能开销**：

- 运行时类型检查
- 策略内部类型判断
- 可能的类型断言

### 方案 B（拆分方法）

```typescript
// 编译时确定类型
public async onTicker(symbol: string, ticker: Ticker) {
  for (const strategy of strategies) {
    // 直接处理，无需判断
    const result = await strategy.onTicker(ticker);
  }
}
```

**性能优势**：

- 无运行时类型检查
- 编译时优化
- 更好的内联优化

**性能测试**（假设）：

- 方案 A：~0.5ms per call
- 方案 B：~0.3ms per call
- 差异：~40% 性能提升（高频交易场景显著）

---

## 推荐方案：混合方案

### 实现步骤

1. **立即实现**：
   - ✅ 添加 `onTicker`, `onOrderBook`, `onTrades`, `onKline` 方法
   - ✅ 保留 `onMarketData` 并标记为 deprecated
   - ✅ 更新内部监听器使用新方法

2. **短期（1-2周）**：
   - ✅ 更新示例代码
   - ✅ 更新文档
   - ✅ 添加迁移指南

3. **中期（1-2月）**：
   - ⚠️ 为策略添加可选的专门方法
   - ⚠️ 提供更多示例

4. **长期（6-12月）**：
   - ⚠️ 考虑在下一个大版本移除 `onMarketData`

---

## 结论

**推荐采用混合方案（方案 B + 向后兼容）**：

✅ **优势**：

1. 类型安全 - 减少运行时错误
2. 代码清晰 - 提高可读性和可维护性
3. IDE 友好 - 更好的开发体验
4. 性能更好 - 避免运行时类型判断
5. 向后兼容 - 不破坏现有代码
6. 渐进迁移 - 可以逐步更新

⚠️ **代价**：

1. API 数量增加 - 但更清晰
2. 需要更新调用点 - 但可以渐进式
3. 稍高的学习曲线 - 但文档可以解决

**对于生产环境和长期维护的项目，方案 B 的优势远超其代价。**

---

## 代码示例对比

### 旧方式（不推荐）

```typescript
// ❌ 类型不安全，语义不明确
await engine.onMarketData(symbol, ticker, 'binance');
await engine.onMarketData(symbol, orderbook, 'binance');
```

### 新方式（推荐）

```typescript
// ✅ 类型安全，语义清晰
await engine.onTicker(symbol, ticker, 'binance');
await engine.onOrderBook(symbol, orderbook, 'binance');
```

---

**作者**：iTrade Architecture Team  
**日期**：2025-10-09  
**版本**：1.0.0
