# Initial Data Loading Guide

## 概述

iTrade 支持在策略**实例化之前**预加载历史数据和账户状态，让策略能够从一个完整的上下文开始运行，而不是从零开始积累数据。

## 核心设计

```
配置初始数据 → 加载数据 → 创建策略实例 → 添加到引擎
```

**关键优势**：
- ✅ 数据在策略实例化**之前**加载
- ✅ 策略构造函数可以直接使用加载好的数据
- ✅ 简单清晰，无需额外的回调方法
- ✅ 完全独立于 TradingEngine，可在任何地方使用
- ✅ 策略自主决定初始化逻辑，无需 `initialize()` 方法
- ✅ TradingEngine 只负责运行和管理，不负责初始化

---

## 使用方法

### 1️⃣ 配置初始数据（Web UI）

在策略创建/编辑表单的 **"Initial Data"** Tab 中配置：

```typescript
// 配置示例
{
  "initialData": {
    // K线数据
    "klines": [
      { "interval": "15m", "limit": 20 },  // 最近20根15分钟K线
      { "interval": "1h", "limit": 10 }     // 最近10根1小时K线
    ],
    
    // 账户数据
    "fetchPositions": true,      // 当前持仓
    "fetchOpenOrders": true,     // 挂单信息
    "fetchBalance": true,        // 账户余额
    "fetchAccountInfo": false,   // 完整账户信息（可选）
    
    // 市场数据
    "fetchTicker": true,         // 当前价格
    "fetchOrderBook": {
      "enabled": true,
      "depth": 20                // 订单簿深度
    }
  }
}
```

---

### 2️⃣ 使用 StrategyLoader 加载数据

在创建策略**之前**，使用 `StrategyLoader` 加载初始数据：

```typescript
import { StrategyLoader } from '@itrade/core';
import { MovingWindowGridsStrategy } from '@itrade/strategies';

// 1. 准备策略参数
const parameters = {
  symbol: 'BTC/USDC:USDC',
  exchange: 'coinbase',
  windowSize: 10,
  gridSize: 0.01,
  gridCount: 5,
  initialData: {
    klines: [{ interval: '15m', limit: 20 }],
    fetchPositions: true,
    fetchOpenOrders: true,
  }
};

// 2. 加载初始数据（在实例化之前）
const preparedParams = await StrategyLoader.prepareStrategyParameters(
  parameters,
  exchange,  // 交易所实例
  logger     // 日志记录器（可选）
);

// 3. 创建策略实例（数据已经在 parameters 中）
const strategy = new MovingWindowGridsStrategy(preparedParams);

// 4. 添加到 TradingEngine
await engine.addStrategy('my-strategy', strategy);
```

---

### 3️⃣ 在策略中处理初始数据

策略构造函数中检查并处理 `loadedInitialData`：

```typescript
export class MovingWindowGridsStrategy extends BaseStrategy {
  private historicalKlines: Kline[] = [];
  private currentPosition: 'long' | 'short' | 'none' = 'none';
  private openOrders: Order[] = [];

  constructor(parameters: MovingWindowGridsParameters) {
    super('MovingWindowGrids', parameters);
    
    // 1. 初始化基础参数
    this.windowSize = parameters.windowSize;
    this.gridSize = parameters.gridSize;
    this.gridCount = parameters.gridCount;

    // 2. 🆕 处理预加载的初始数据
    if (parameters.loadedInitialData) {
      this.processInitialData(parameters.loadedInitialData);
    }

    // 3. 其他初始化逻辑（如果需要）
    // 不需要调用 this.initialize() - 所有初始化在构造函数中完成
  }

  /**
   * 处理初始数据
   */
  private processInitialData(data: InitialDataResult): void {
    console.log(`📊 Processing initial data for ${data.symbol}`);

    // 1. 加载历史K线
    if (data.klines?.['15m']) {
      this.historicalKlines = data.klines['15m'];
      console.log(`  📈 Loaded ${this.historicalKlines.length} klines`);
    }

    // 2. 恢复持仓状态
    if (data.positions && data.positions.length > 0) {
      const totalQty = data.positions.reduce(
        (sum, p) => sum + parseFloat(p.quantity.toString()),
        0
      );
      if (totalQty > 0) {
        this.currentPosition = 'long';
      } else if (totalQty < 0) {
        this.currentPosition = 'short';
      }
      console.log(`  💼 Restored position: ${this.currentPosition}`);
    }

    // 3. 加载挂单
    if (data.openOrders) {
      this.openOrders = data.openOrders;
      console.log(`  📝 Loaded ${this.openOrders.length} open orders`);
    }

    // 4. 其他数据处理...
    if (data.balance) {
      console.log(`  💰 Loaded balance: ${data.balance.length} assets`);
    }

    console.log('✅ Initial data processed successfully');
  }
}
```

---

## 完整示例

### 在 Console 应用中使用

```typescript
// apps/console/src/main.ts
import { 
  TradingEngine, 
  StrategyLoader 
} from '@itrade/core';
import { MovingWindowGridsStrategy } from '@itrade/strategies';

async function main() {
  // 1. 初始化 TradingEngine 和 Exchange
  const engine = new TradingEngine(riskManager, portfolioManager, logger);
  const coinbase = new CoinbaseExchange();
  await coinbase.connect({ apiKey, secretKey });
  await engine.addExchange('coinbase', coinbase);

  // 2. 准备策略参数（包含初始数据配置）
  const strategyParams = {
    symbol: 'BTC/USDC:USDC',
    exchange: 'coinbase',
    windowSize: 10,
    gridSize: 0.01,
    gridCount: 5,
    initialData: {
      klines: [
        { interval: '15m', limit: 20 },
        { interval: '1h', limit: 10 }
      ],
      fetchPositions: true,
      fetchOpenOrders: true,
      fetchBalance: true,
      fetchTicker: true,
    },
    subscription: {
      // ... 实时数据订阅配置
    }
  };

  // 3. 加载初始数据
  logger.info('📊 Loading initial data...');
  const preparedParams = await StrategyLoader.prepareStrategyParameters(
    strategyParams,
    coinbase,
    logger
  );

  // 4. 创建策略实例（此时数据已加载）
  const strategy = new MovingWindowGridsStrategy(preparedParams);

  // 5. 添加策略到引擎
  await engine.addStrategy('btc-grid', strategy);

  // 6. 启动引擎
  await engine.start();
}
```

---

## API 参考

### StrategyLoader.prepareStrategyParameters()

加载初始数据并返回包含 `loadedInitialData` 的参数。

```typescript
static async prepareStrategyParameters(
  parameters: StrategyParameters,
  exchange: IExchange,
  logger?: ILogger
): Promise<StrategyParameters>
```

**参数**：
- `parameters` - 原始策略参数（包含 `initialData` 配置）
- `exchange` - 交易所实例
- `logger` - 日志记录器（可选）

**返回**：
- 包含 `loadedInitialData` 的完整参数

---

### StrategyLoader.loadInitialData()

直接加载初始数据（不修改参数）。

```typescript
static async loadInitialData(
  parameters: StrategyParameters,
  exchange: IExchange,
  logger?: ILogger
): Promise<InitialDataResult | null>
```

**返回**：
- `InitialDataResult` - 加载的数据
- `null` - 无需加载或加载失败

---

## InitialDataResult 结构

```typescript
interface InitialDataResult {
  symbol: string;              // 交易对
  exchange: string;            // 交易所
  timestamp: Date;             // 加载时间
  
  // 历史数据
  klines?: Record<string, Kline[]>;  // 按周期分组的K线
  
  // 账户数据
  positions?: Position[];      // 持仓
  openOrders?: Order[];        // 挂单
  balance?: Balance[];         // 余额
  accountInfo?: AccountInfo;   // 账户信息
  
  // 市场数据
  ticker?: Ticker;             // Ticker
  orderBook?: OrderBook;       // 订单簿
}
```

---

## 最佳实践

### 1. 选择合适的数据量

```typescript
// ✅ 推荐：根据策略需求选择
{
  klines: [
    { interval: '15m', limit: 20 }  // MA20 策略需要20根K线
  ]
}

// ❌ 避免：过多数据影响启动速度
{
  klines: [
    { interval: '1m', limit: 1000 }  // 太多了！
  ]
}
```

### 2. 只加载必要的数据

```typescript
// ✅ 推荐：按需加载
{
  fetchPositions: true,   // 需要恢复持仓
  fetchOpenOrders: true,  // 需要避免重复下单
  fetchBalance: false,    // 不需要余额信息
}
```

### 3. 错误处理

```typescript
private processInitialData(data: InitialDataResult): void {
  try {
    // 处理K线数据
    if (data.klines?.['15m']) {
      this.historicalKlines = data.klines['15m'];
    } else {
      console.warn('No 15m klines loaded, using empty buffer');
    }
    
    // 处理持仓（可能为空）
    if (data.positions && data.positions.length > 0) {
      // 有持仓，恢复状态
    } else {
      // 无持仓，从空仓开始
      this.currentPosition = 'none';
    }
  } catch (error) {
    console.error('Failed to process initial data:', error);
    // 继续运行，但从零开始
  }
}
```

### 4. 日志记录

```typescript
// 加载数据时使用详细日志
const preparedParams = await StrategyLoader.prepareStrategyParameters(
  parameters,
  exchange,
  logger  // 传入 logger 以获取详细日志
);

// 输出示例：
// Loading initial data for BTC/USDC:USDC on coinbase...
//   📈 Loaded 20 klines for 15m
//   💼 Loaded 1 position(s)
//   📝 Loaded 3 open order(s)
//   🎯 Current price: 42000.50
// ✅ Initial data loaded successfully
```

---

## 常见问题

### Q: 初始数据会自动更新吗？

A: 不会。初始数据只在策略启动时加载一次。实时更新通过 `subscription` 配置的 WebSocket 订阅实现。

### Q: 如果加载失败会怎样？

A: 策略会正常创建，但 `loadedInitialData` 为 `undefined`。策略应该能够处理这种情况并从零开始运行。

### Q: 可以在多个策略之间共享初始数据吗？

A: 可以。先加载一次数据，然后传给多个策略实例：

```typescript
const initialData = await StrategyLoader.loadInitialData(params, exchange);

const strategy1 = new Strategy1({ ...params, loadedInitialData: initialData });
const strategy2 = new Strategy2({ ...params, loadedInitialData: initialData });
```

### Q: 支持哪些交易所？

A: 所有实现 `IExchange` 接口的交易所都支持，包括 Binance、OKX、Coinbase 等。

---

## 总结

Initial Data 功能让策略能够从一个完整的历史上下文开始运行，而不是从零开始。通过 `StrategyLoader` 工具类，您可以在策略实例化之前轻松加载所需的数据，使策略逻辑更加简洁和可靠。

**核心要点**：
1. 使用 `StrategyLoader.prepareStrategyParameters()` 在实例化前加载数据
2. 在策略构造函数中处理 `parameters.loadedInitialData`
3. 只加载策略真正需要的数据
4. 做好错误处理，确保策略能在没有初始数据时也能运行

---

Author: xiaoweihsueh@gmail.com  
Date: October 24, 2025

