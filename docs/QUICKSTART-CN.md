# iTrade 快速开始指南

## 🚀 5分钟快速启动

### 1. 安装依赖并构建

```bash
# 在项目根目录执行
pnpm install
pnpm run build
```

### 2. 运行示例

```bash
cd apps/console
pnpm run start
```

### 3. 预期输出

```
[INFO] Starting trading engine...
[INFO] Strategy ma-strategy initialized successfully
[INFO] Trading engine started successfully
[INFO] Subscribing to ticker data for BTCUSDT...
[INFO] Successfully subscribed to BTCUSDT ticker
[INFO] Trading system is running...
[INFO] Waiting for market data and strategy signals...
```

约 30 秒后，当收集足够数据后：
```
[INFO] Strategy result: hold (reason: Fast MA: 43251.23, Slow MA: 43200.45)
```

当检测到交叉信号时：
```
[INFO] Strategy signal: buy
[INFO] Executing strategy signal...
```

## 📊 系统架构

### 核心组件

```
TradingEngine
├── Strategies (策略)
│   └── MovingAverageStrategy (移动平均线策略)
├── Exchanges (交易所)
│   └── BinanceExchange (币安)
├── RiskManager (风险管理)
└── PortfolioManager (投资组合管理)
```

### 数据流

```
Binance WebSocket → Exchange → TradingEngine → Strategy → Signal → Order
```

## 🔧 自定义配置

### 修改策略参数

编辑 `apps/console/src/main.ts`：

```typescript
const strategy = new MovingAverageStrategy({
  fastPeriod: 10,   // 快速移动平均周期
  slowPeriod: 30,   // 慢速移动平均周期
  threshold: 0.05,  // 交叉信号阈值（5%）
  symbol: 'BTCUSDT',
});
```

### 更快看到信号（测试用）

降低参数以更快触发信号：

```typescript
const strategy = new MovingAverageStrategy({
  fastPeriod: 3,    // 只需要 3 个数据点
  slowPeriod: 5,    // 只需要 5 个数据点
  threshold: 0.01,  // 降低阈值到 1%
  symbol: 'BTCUSDT',
});
```

### 更换交易对

```typescript
// ✅ 推荐：使用标准格式（会自动转换为交易所格式）
const symbol = 'BTC/USDT';   // Bitcoin
const symbol = 'ETH/USDT';   // Ethereum
const symbol = 'BNB/USDT';   // BNB
const symbol = 'SOL/USDT';   // Solana

// ✅ 也支持交易所特定格式
const symbol = 'BTCUSDT';    // Binance 格式
const symbol = 'BTC-USDT';   // Coinbase 格式

// 📝 符号标准化：
// 'BTC/USDT' → Binance: 'BTCUSDT'  | Coinbase: 'BTC-USDT'
// 'btc/usdt' → Binance: 'BTCUSDT'  | Coinbase: 'BTC-USDT'
// 'BTC-USDT' → Binance: 'BTCUSDT'  | Coinbase: 'BTC-USDT'
```

### 订阅多种数据类型

```typescript
// 订阅实时价格
await binance.subscribeToTicker('BTCUSDT');

// 订阅订单簿
await binance.subscribeToOrderBook('BTCUSDT');

// 订阅最近交易
await binance.subscribeToTrades('BTCUSDT');

// 订阅 K 线数据
await binance.subscribeToKlines('BTCUSDT', '1m');  // 1分钟K线
```

## 🐛 常见问题

### Q: 没有看到任何策略信号？

**A**: 检查以下几点：

1. **WebSocket 是否连接成功**
   ```
   [INFO] WebSocket connected to binance
   ```
   
2. **是否收到 ticker 数据**（需要 DEBUG 日志级别）
   ```typescript
   const logger = new ConsoleLogger(LogLevel.DEBUG);
   ```

3. **等待足够时间**
   - MovingAverageStrategy 需要 30 个数据点
   - Ticker 每秒更新一次，所以需要约 30 秒

4. **市场波动是否足够**
   - 策略需要检测到价格交叉
   - 可以降低 `threshold` 参数来更容易触发

### Q: 出现 "Exchange credentials not set" 错误？

**A**: 这是正常的。订阅市场数据不需要 API 密钥，只有在创建订单时才需要。如果要测试下单功能：

1. 注册 Binance Testnet 账号：https://testnet.binance.vision/
2. 获取 API Key 和 Secret Key
3. 设置环境变量：
   ```bash
   export BINANCE_API_KEY=your_key
   export BINANCE_SECRET_KEY=your_secret
   ```

### Q: 如何停止系统？

**A**: 按 `Ctrl+C`，系统会优雅关闭：
```
[INFO] Shutting down...
[INFO] Trading engine stopped successfully
```

## 📚 深入学习

### 详细文档

- [TradingEngine 架构分析](./trading-engine-analysis.md) - 完整的数据流分析和 Mermaid 图表
- [符号标准化指南](./symbol-normalization.md) - 交易对符号格式转换说明
- [策略开发指南](./strategy-example-cn.md) - 如何开发自定义策略
- [策略执行流程](./strategy-flow-cn.md) - 策略执行的详细流程

### 核心概念

#### 1. 策略 (Strategy)
策略负责分析市场数据并产生交易信号：
- `analyze()`: 分析市场数据
- `onOrderFilled()`: 订单成交回调
- 返回 `StrategyResult`: `{action: 'buy'|'sell'|'hold', quantity, price, confidence, reason}`

#### 2. 交易引擎 (TradingEngine)
核心协调器：
- 管理策略和交易所
- 接收市场数据并分发给策略
- 执行策略信号（经过风险检查）
- 发布事件通知

#### 3. 交易所 (Exchange)
与真实交易所的接口：
- WebSocket 订阅市场数据
- REST API 执行订单
- 统一的接口抽象（支持多个交易所）

#### 4. 风险管理 (RiskManager)
保护资金安全：
- 检查订单大小
- 监控持仓风险
- 设置最大回撤和日损失限制

#### 5. 投资组合管理 (PortfolioManager)
跟踪资金状态：
- 余额管理
- 持仓跟踪
- 盈亏计算

## 🛠️ 开发技巧

### 启用详细日志

```typescript
import { LogLevel } from '@itrade/core';

const logger = new ConsoleLogger(LogLevel.DEBUG);
```

### 监听事件

```typescript
const eventBus = EventBus.getInstance();

// 监听策略信号
eventBus.onStrategySignal((signal) => {
  console.log('Strategy signal:', signal);
});

// 监听订单创建
eventBus.onOrderCreated((data) => {
  console.log('Order created:', data.order);
});

// 监听订单成交
eventBus.onOrderFilled((data) => {
  console.log('Order filled:', data.order);
});

// 监听风险事件
eventBus.onRiskLimitExceeded((data) => {
  console.log('Risk limit exceeded:', data);
});
```

### 添加自定义策略

```typescript
import { BaseStrategy, StrategyResult } from '@itrade/core';

class MyStrategy extends BaseStrategy {
  constructor(parameters) {
    super('MyStrategy', parameters);
  }

  protected async onInitialize(): Promise<void> {
    // 初始化逻辑
  }

  public async analyze(marketData): Promise<StrategyResult> {
    // 策略逻辑
    return {
      action: 'buy',
      quantity: new Decimal(0.1),
      price: marketData.ticker.price,
      confidence: 0.8,
      reason: 'Custom signal',
    };
  }

  protected async onCleanup(): Promise<void> {
    // 清理逻辑
  }
}

// 使用
const myStrategy = new MyStrategy({ /* params */ });
engine.addStrategy('my-strategy', myStrategy);
```

## 🎯 下一步

1. ✅ 运行示例并观察输出
2. ✅ 理解数据流和架构
3. 📝 阅读[详细分析文档](./trading-engine-analysis.md)
4. 🔧 尝试修改策略参数
5. 💡 开发自己的策略
6. 🚀 在 testnet 上测试真实交易

## 📞 获取帮助

- 查看 [trading-engine-analysis.md](./trading-engine-analysis.md) 了解完整的架构和数据流
- 查看源代码中的注释和类型定义
- 检查日志输出进行调试

---

**⚠️ 重要提示**：
- 默认使用 Binance Testnet（模拟环境）
- 真实交易需要设置 `sandbox: false` 并使用真实 API 密钥
- 始终先在 testnet 上充分测试
- 量化交易有风险，请谨慎使用

