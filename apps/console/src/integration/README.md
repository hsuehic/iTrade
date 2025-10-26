# 集成测试 (Integration Tests)

集成测试验证多个组件协同工作的完整流程，确保系统整体功能正常。

## 📂 测试文件

```
integration/
├── helpers/                       # 辅助类和工具
│   ├── strategy-runner.ts        # 策略运行器
│   ├── strategy-manager.ts       # 策略管理器
│   └── order-tracker.ts          # 订单跟踪器
├── trading-engine.test.ts        # TradingEngine 完整流程测试
├── strategy-execution.test.ts    # 策略执行测试
└── subscription-coordinator.test.ts # 订阅协调器测试
```

## 🧪 测试详解

### 1️⃣ TradingEngine 完整流程测试

**文件：** `trading-engine.test.ts`

**测试流程：**
```
1. 初始化 TradingEngine
   ├── 连接数据库
   ├── 初始化 RiskManager
   ├── 初始化 PortfolioManager
   └── 创建 TradingEngine 实例

2. 注册交易所
   ├── Binance Exchange
   ├── OKX Exchange
   └── Coinbase Exchange

3. 加载 Active Strategies
   ├── 从数据库读取 ACTIVE 状态的策略
   ├── 实例化策略对象
   ├── 注册到 TradingEngine
   └── 初始化 StrategyManager

4. 启动策略管理
   ├── 同步策略状态
   ├── 订阅市场数据
   ├── 监听信号事件
   └── 订单跟踪

5. 运行时验证
   ├── 验证订阅正常工作
   ├── 验证数据流正常接收
   ├── 验证策略状态同步
   └── 验证订单创建和保存

6. 优雅关闭
   ├── 停止所有策略
   ├── 断开交易所连接
   ├── 保存策略状态
   └── 关闭数据库连接
```

**运行命令：**
```bash
npm run test:trading-engine
# 或
npm run dev
```

**预期输出：**
```
📊 iTrade Console started with database-driven strategy management

Implemented Strategies:
  - MovingAverageStrategy
  - RSIStrategy
  - MovingWindowGridsStrategy

✅ Binance Exchange initialized
✅ OKX Exchange initialized
✅ Coinbase Exchange initialized

📦 Loading strategies from database...
✅ Loaded 3 active strategies from database

Strategy 1: MA_BTC_SPOT (MovingAverageStrategy)
  Exchange: binance
  Symbol: BTC/USDT
  Status: ACTIVE

🚀 Starting strategy management...
✅ Strategy Manager started
✅ Order Tracker started

📡 Subscribed to user data: binance
📡 Market data subscription: binance BTC/USDT

🚀 Trading System is LIVE

📊 [TICKER] BTC/USDT: $95234.56
💰 [BALANCE] USDT: 10000.00
...
```

**关键验证点：**
- ✅ 数据库连接成功
- ✅ 所有交易所初始化成功
- ✅ 从数据库加载 ACTIVE 策略
- ✅ 策略正确实例化和注册
- ✅ 市场数据订阅成功
- ✅ 用户数据订阅成功
- ✅ EventBus 事件正常触发
- ✅ 策略状态定期同步
- ✅ 订单正确保存到数据库
- ✅ 优雅关闭无错误

---

### 2️⃣ 策略执行测试

**文件：** `strategy-execution.test.ts`

**测试流程：**
```
1. 创建测试策略实例
   └── MovingWindowGridsStrategy

2. 运行策略执行器 (strategy-runner)
   ├── 初始化 TradingEngine
   ├── 注册交易所
   ├── 注册策略
   └── 启动执行

3. 验证策略行为
   ├── 策略正确订阅市场数据
   ├── 策略接收数据并处理
   ├── 策略生成交易信号
   └── 信号触发订单创建

4. 监控和报告
   ├── 信号统计
   ├── 订单统计
   └── 错误统计
```

**运行命令：**
```bash
npm run test:strategy-execution
```

**配置示例：**
```typescript
const strategies = new Map<string, IStrategy>();
strategies.set(
  'MovingWindowGrids',
  new MovingWindowGridsStrategy({
    exchange: 'okx',
    symbol: 'WLD/USDT:USDT',
    windowSize: 10,
    gridSize: 10,
    gridCount: 10,
    minVolatility: 0.008,
    takeProfitRatio: 0.006,
    subscription: {
      ticker: false,
      klines: {
        enabled: true,
        interval: '5m',
      },
      trades: false,
      orderbook: {
        enabled: false,
        depth: 5,
      },
      method: 'websocket',
      exchange: 'okx',
    },
  }),
);
```

**关键验证点：**
- ✅ 策略正确实例化
- ✅ 订阅配置正确应用
- ✅ K线数据正常接收
- ✅ 策略逻辑正确执行
- ✅ 信号正常生成
- ✅ 订单正确创建

---

### 3️⃣ 订阅协调器测试

**文件：** `subscription-coordinator.test.ts`

**测试流程：**
```
1. 初始化 SubscriptionCoordinator

2. 创建 Mock Exchange

3. 测试订阅引用计数
   ├── Strategy 1 订阅 BTC/USDT ticker
   ├── Strategy 2 订阅 BTC/USDT ticker (引用计数 +1)
   ├── Strategy 3 订阅 ETH/USDT ticker
   └── 验证去重和引用计数

4. 测试取消订阅
   ├── Strategy 1 取消订阅 (引用计数 -1)
   ├── Strategy 2 取消订阅 (引用计数 =0, 真正取消)
   └── 验证正确清理

5. 测试协调逻辑
   ├── 多策略同一交易对
   ├── 不同时间间隔的 kline 订阅
   └── 动态添加/移除订阅
```

**运行命令：**
```bash
npm run test:subscription
```

**关键验证点：**
- ✅ 订阅去重机制工作
- ✅ 引用计数正确维护
- ✅ 只在引用计数为 0 时真正取消订阅
- ✅ 不同策略可订阅同一数据
- ✅ 协调器正确管理生命周期

---

## 🎯 集成测试原则

### ✅ 端到端验证
测试完整的业务流程，从输入到输出，验证所有组件协同工作。

### ✅ 真实环境
使用真实的数据库、交易所连接，而不是 Mock。

### ✅ 业务场景
模拟实际的使用场景和工作流程。

### ✅ 状态管理
验证系统状态的正确维护和转换。

### ✅ 错误处理
测试异常情况和错误恢复。

## 📊 测试运行时长

| 测试 | 预期时长 | 说明 |
|------|---------|------|
| `trading-engine.test.ts` | 15-30s | 需要连接数据库和交易所 |
| `strategy-execution.test.ts` | 10-20s | 依赖策略配置 |
| `subscription-coordinator.test.ts` | 5-10s | 较轻量，主要测试逻辑 |

## 🔍 调试建议

### 查看详细日志

修改 LogLevel 以获取更详细的输出：

```typescript
const logger = new ConsoleLogger(LogLevel.DEBUG); // INFO, WARN, ERROR, DEBUG
```

### 使用 Debugger

在 VS Code 中使用调试配置：

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Trading Engine Test",
  "skipFiles": ["<node_internals>/**"],
  "program": "${workspaceFolder}/apps/console/src/integration/trading-engine.test.ts",
  "runtimeArgs": [
    "-r", "ts-node/register",
    "-r", "tsconfig-paths/register",
    "-r", "reflect-metadata"
  ],
  "env": {
    "NODE_ENV": "development",
    "TS_NODE_PROJECT": "${workspaceFolder}/apps/console/tsconfig.build.json"
  },
  "cwd": "${workspaceFolder}/apps/console"
}
```

### 分段测试

如果完整流程太长，可以注释掉部分代码，分段测试：

1. 只测试初始化
2. 只测试策略加载
3. 只测试订阅
4. 只测试信号生成

## 🛠️ 辅助类说明

### StrategyRunner (`helpers/strategy-runner.ts`)

策略运行器，用于快速启动策略执行环境。

**功能：**
- 初始化 TradingEngine
- 注册交易所
- 运行指定策略
- 处理信号和订单

**使用示例：**
```typescript
import { run } from './helpers/strategy-runner';

const strategies = new Map<string, IStrategy>();
strategies.set('MyStrategy', myStrategyInstance);

await run(strategies);
```

---

### StrategyManager (`helpers/strategy-manager.ts`)

策略管理器，负责策略生命周期管理。

**功能：**
- 从数据库加载 ACTIVE 策略
- 定期同步策略状态
- 监控策略健康状态
- 状态恢复和备份
- 策略性能报告

**核心方法：**
- `loadStrategiesFromDatabase()` - 加载策略
- `syncStrategies()` - 同步状态
- `start()` - 启动管理
- `stop()` - 停止管理

---

### OrderTracker (`helpers/order-tracker.ts`)

订单跟踪器，监听并保存所有订单事件。

**功能：**
- 监听 OrderCreated 事件
- 监听 OrderFilled 事件
- 监听 OrderCancelled 事件
- 自动保存到数据库
- 统计和报告

**事件监听：**
- `onOrderCreated` - 订单创建
- `onOrderFilled` - 订单完全成交
- `onOrderPartiallyFilled` - 订单部分成交
- `onOrderCancelled` - 订单取消
- `onOrderRejected` - 订单拒绝

---

## 📚 相关文档

- [主文档](../README.md)
- [单元测试文档](../unit/README.md)
- [工具脚本文档](../tools/README.md)

---

Author: xiaoweihsueh@gmail.com  
Date: October 26, 2025

