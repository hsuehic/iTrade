# 策略调试指南

## 问题：策略没有产生信号

如果你的系统已经收到市场数据，但策略一直没有产生信号，使用本指南进行调试。

## 调试功能说明

### 已添加的调试日志

在 `apps/console/src/main.ts` 中，我们添加了详细的调试日志：

```typescript
// 每次轮询时打印：
1. 📈 Ticker 数据（价格）
2. 📊 策略收集的数据点数量
3. 📈 移动平均线的值和差异百分比
4. 当前持仓状态（long/short/none）
```

## 预期输出

### 第1阶段：收集数据（0-5秒）

```
[INFO] 📈 Ticker #1: BTC/USDT = 121402.63
[INFO] 📊 Strategy collected 1/5 data points

[INFO] 📈 Ticker #2: BTC/USDT = 121405.20
[INFO] 📊 Strategy collected 2/5 data points

[INFO] 📈 Ticker #3: BTC/USDT = 121408.15
[INFO] 📊 Strategy collected 3/5 data points

[INFO] 📈 Ticker #4: BTC/USDT = 121410.50
[INFO] 📊 Strategy collected 4/5 data points

[INFO] 📈 Ticker #5: BTC/USDT = 121412.80
[INFO] 📊 Strategy collected 5/5 data points
```

### 第2阶段：开始分析（5秒后）

一旦收集到5个数据点，每次更新都会显示：

```
[INFO] 📈 Ticker #6: BTC/USDT = 121415.50
[INFO] 📊 Strategy collected 5/5 data points
[INFO] 📈 FastMA=121410.43, SlowMA=121408.82, Diff=0.0133%, Position=none
```

**关键指标解释**：
- **FastMA**: 最近3个价格的平均值
- **SlowMA**: 最近5个价格的平均值
- **Diff**: 两个均线的差异百分比
- **Position**: 当前持仓状态
  - `none`: 没有持仓
  - `long`: 已做多（买入后）
  - `short`: 已做空（卖出后）

### 第3阶段：产生信号

当检测到交叉且差异 > 0.1% 时：

```
[INFO] 📈 Ticker #10: BTC/USDT = 121450.20
[INFO] 📊 Strategy collected 5/5 data points
[INFO] 📈 FastMA=121445.50, SlowMA=121430.20, Diff=0.1262%, Position=none
[INFO] 🎯 Strategy Signal: buy BTC/USDT @ 121450.20 (confidence: 0.126)
[INFO]    Reason: Fast MA (121445.50) crossed above Slow MA (121430.20)
[INFO] 📈 FastMA=121445.50, SlowMA=121430.20, Diff=0.1262%, Position=long
```

注意 Position 从 `none` 变成了 `long`。

## 常见问题和解决方案

### 问题1: 一直显示 "Insufficient data"

**症状**：
```
[DEBUG] Strategy result: hold (reason: Insufficient data for analysis)
```

**原因**：策略还没有收集足够的数据点

**解决**：
- 等待至少 5 秒（5 个 ticker 更新）
- 检查是否真的在接收 ticker 数据
- 确认日志中有 `📊 Strategy collected X/5 data points`

### 问题2: 有5个数据点但没有信号

**症状**：
```
[INFO] 📈 FastMA=121410.00, SlowMA=121409.50, Diff=0.0041%, Position=none
```
（Diff 一直很小，< 0.1%）

**原因**：
1. 市场波动太小，Fast MA 和 Slow MA 非常接近
2. 阈值设置为 0.1%（`threshold: 0.001`）
3. 价格变化不够大无法触发交叉

**解决方案**：

#### 方案A: 降低阈值（更敏感）
```typescript
const strategy = new MovingAverageStrategy({
  fastPeriod: 3,
  slowPeriod: 5,
  threshold: 0.0001, // 从 0.001 降到 0.0001（0.01%）
  symbol: 'BTC/USDT',
});
```

#### 方案B: 使用更短的周期
```typescript
const strategy = new MovingAverageStrategy({
  fastPeriod: 2,  // 从 3 降到 2
  slowPeriod: 3,  // 从 5 降到 3
  threshold: 0.001,
  symbol: 'BTC/USDT',
});
```

#### 方案C: 手动模拟价格变化（测试用）
```typescript
// 在轮询中手动调整价格
const ticker = await binance.getTicker(symbol);
// 添加人工波动
ticker.price = ticker.price.mul(1 + Math.random() * 0.002); // +/- 0.2%
await engine.onMarketData(symbol, ticker);
```

### 问题3: 产生信号但只有一次

**症状**：
```
[INFO] 🎯 Strategy Signal: buy BTC/USDT @ 121450.20
[INFO] Position=long
// 之后再也没有信号
```

**原因**：策略有位置追踪（position tracking）
- 一旦买入（long），只有当 Fast MA 低于 Slow MA 时才会产生卖出信号
- 一旦卖出（short），只有当 Fast MA 高于 Slow MA 时才会产生买入信号

**这是正确的行为**！策略不会重复发出相同方向的信号。

**验证**：查看 Position 字段
```
Position=long  → 已买入，等待卖出信号
Position=short → 已卖出，等待买入信号
Position=none  → 可以产生任意方向的信号
```

### 问题4: 策略根本没有被调用

**症状**：没有看到任何策略相关的日志

**诊断**：

1. **检查是否添加了策略**
   ```
   [INFO] Added strategy: ma-strategy  // 应该看到这个
   ```

2. **检查引擎是否启动**
   ```
   [INFO] Trading engine started successfully  // 应该看到这个
   ```

3. **检查是否收到 ticker 数据**
   ```
   [INFO] 📈 Ticker #1: BTC/USDT = ...  // 应该看到这个
   ```

4. **添加更多调试日志**
   ```typescript
   // 在 TradingEngine.onMarketData 中
   logger.info(`Processing market data for ${symbol}`);
   logger.info(`Number of strategies: ${this._strategies.size}`);
   ```

## 策略逻辑详解

### MovingAverageStrategy 的工作原理

```
1. 收集价格历史
   priceHistory = [p1, p2, p3, p4, p5]

2. 计算移动平均线
   FastMA = (p3 + p4 + p5) / 3  // 最近3个
   SlowMA = (p1 + p2 + p3 + p4 + p5) / 5  // 最近5个

3. 计算差异
   Diff = |FastMA - SlowMA| / SlowMA

4. 检查交叉
   如果 FastMA > SlowMA 且 Diff > threshold:
     → 买入信号（如果当前不是 long）
   
   如果 FastMA < SlowMA 且 Diff > threshold:
     → 卖出信号（如果当前不是 short）

5. 防止重复信号
   只有当 position 状态改变时才产生信号
```

### 为什么需要 threshold（阈值）？

**没有阈值的问题**：
```
FastMA = 100.00
SlowMA = 100.01
// FastMA < SlowMA，会产生卖出信号

FastMA = 100.01  // 价格小幅波动
SlowMA = 100.00
// FastMA > SlowMA，会产生买入信号

FastMA = 100.00
SlowMA = 100.01
// 又产生卖出信号...
```

**有阈值 (0.1%) 的效果**：
```
FastMA = 100.00
SlowMA = 100.01
Diff = 0.01% < 0.1%  // 忽略，太小

FastMA = 100.15  // 显著变化
SlowMA = 100.00
Diff = 0.15% > 0.1%  // 产生信号！
```

## 测试技巧

### 快速测试：使用极小的阈值

```typescript
const strategy = new MovingAverageStrategy({
  fastPeriod: 2,      // 最小周期
  slowPeriod: 3,      // 最小周期
  threshold: 0.00001, // 几乎任何变化都触发
  symbol: 'BTC/USDT',
});
```

这样几乎每次价格波动都会产生信号（用于验证系统工作）。

### 模拟理想的价格走势

创建一个测试函数：

```typescript
async function testStrategy() {
  const prices = [
    new Decimal(100),
    new Decimal(101),
    new Decimal(102),
    new Decimal(103),
    new Decimal(104), // 明确上涨趋势
  ];
  
  for (const price of prices) {
    const ticker = { price, symbol: 'BTC/USDT', /* ... */ };
    await engine.onMarketData('BTC/USDT', ticker);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
```

## 监控清单

运行系统时，检查以下项：

- [ ] ✅ 收到 ticker 数据（每秒一次）
- [ ] ✅ 策略收集数据（1/5, 2/5, ..., 5/5）
- [ ] ✅ 显示 MA 值和差异百分比
- [ ] ✅ 差异百分比 > 0.1%（或你的 threshold）
- [ ] ✅ Position 状态正确（none → long → none → short → ...）
- [ ] ✅ 看到策略信号 🎯
- [ ] ✅ 信号有合理的 reason

## 常用调试命令

```bash
# 查看实时日志
tail -f output.log | grep "Strategy\|Signal\|FastMA"

# 过滤只看信号
tail -f output.log | grep "🎯"

# 查看数据收集进度
tail -f output.log | grep "📊"

# 查看 MA 值
tail -f output.log | grep "📈 FastMA"
```

## 性能调优

### 生产环境推荐配置

```typescript
const strategy = new MovingAverageStrategy({
  fastPeriod: 10,   // 更平滑的快线
  slowPeriod: 30,   // 更平滑的慢线
  threshold: 0.01,  // 1% 的显著变化
  symbol: 'BTC/USDT',
});

// 5秒轮询（降低 API 请求）
const pollInterval = 5000;
```

### 测试环境推荐配置

```typescript
const strategy = new MovingAverageStrategy({
  fastPeriod: 3,    // 快速反应
  slowPeriod: 5,    // 快速反应
  threshold: 0.001, // 0.1% 容易触发
  symbol: 'BTC/USDT',
});

// 1秒轮询（快速看到结果）
const pollInterval = 1000;
```

## 总结

通过添加的调试日志，你可以清楚地看到：

1. **数据收集**: 策略是否收到价格数据
2. **MA 计算**: Fast MA 和 Slow MA 的实际值
3. **差异检查**: 两个 MA 之间的差异是否足够大
4. **位置追踪**: 当前持仓状态
5. **信号产生**: 何时以及为何产生交易信号

如果系统正常工作，你应该在 5 秒后看到 MA 值，并在价格有显著变化时看到信号。

---

**相关文档**：
- [WebSocket 被阻断解决方案](./WEBSOCKET-BLOCKED-SOLUTION.md)
- [故障排除指南](./TROUBLESHOOTING.md)
- [快速开始](./QUICKSTART-CN.md)

