# 交易所测试 (Exchange Tests)

测试所有交易所连接器的 WebSocket 和 REST API 功能。

## 📂 目录结构

```
exchanges/
├── base/                  # 基础测试类（不要直接运行）
│   ├── BaseExchangeTest.ts    # WebSocket 测试基类
│   └── BaseRESTTest.ts        # REST API 测试基类
├── binance/              # Binance 交易所测试
│   ├── binance-ws.test.ts          # WebSocket 测试
│   ├── binance-ws-v2.test.ts       # WebSocket 测试（优化版）
│   ├── binance-rest.test.ts        # REST API 测试
│   └── binance-rest-v2.test.ts     # REST API 测试（优化版）
├── okx/                  # OKX 交易所测试
│   ├── okx-ws.test.ts              # WebSocket 测试
│   ├── okx-ws-v2.test.ts           # WebSocket 测试（优化版）
│   ├── okx-rest.test.ts            # REST API 测试
│   ├── okx-rest-v2.test.ts         # REST API 测试（优化版）
│   ├── okx-create-order.test.ts    # 创建订单测试
│   └── okx-permissions.test.ts     # 权限测试
└── coinbase/             # Coinbase 交易所测试
    ├── coinbase-ws.test.ts         # WebSocket 测试
    ├── coinbase-ws-v2.test.ts      # WebSocket 测试（优化版）
    └── coinbase-rest.test.ts       # REST API 测试
```

## 🧪 测试类型

### WebSocket 测试

测试实时数据流功能。

**测试覆盖：**
- ✅ Ticker（24小时价格统计）
- ✅ OrderBook（买卖盘深度）
- ✅ Trades（最近成交记录）
- ✅ Klines（K线/蜡烛图数据）
- ✅ User Data（订单、余额、持仓）

**特点：**
- 自动退出机制（所有数据接收后或超时）
- 支持 Spot 和 Futures/Perpetual
- 实时数据验证

### REST API 测试

测试 REST 端点功能。

**测试覆盖：**
- ✅ getTicker - 获取价格信息
- ✅ getOrderBook - 获取订单簿
- ✅ getTrades - 获取交易记录
- ✅ getKlines - 获取K线数据
- ✅ getAccountInfo - 获取账户信息
- ✅ getBalances - 获取余额
- ✅ getOpenOrders - 获取开放订单
- ✅ getOrderHistory - 获取历史订单

**特点：**
- 顺序执行所有端点
- 详细的响应验证
- 错误处理和报告

## 🚀 运行测试

### 单个测试

```bash
# WebSocket
npm run test:binance        # Binance
npm run test:okx            # OKX
npm run test:coinbase       # Coinbase

# REST API
npm run test:binance-rest   # Binance
npm run test:okx-rest       # OKX  
npm run test:coinbase-rest  # Coinbase
```

### 批量测试

```bash
npm run test:all-ws         # 所有 WebSocket
npm run test:all-rest       # 所有 REST
npm run test:all-exchanges  # 所有交易所测试
```

## 📊 基础测试类

### BaseExchangeTest (WebSocket)

所有 WebSocket 测试的抽象基类。

**提供功能：**
- 环境变量加载
- 测试指标跟踪
- 自动退出机制
- 超时处理
- 结果摘要显示
- 一致的测试结构

**子类需实现：**
```typescript
protected abstract getCredentials(): ExchangeCredentials | null;
protected abstract setupEventListeners(exchange: IExchange): void;
protected abstract subscribeToMarketData(...): Promise<void>;
abstract run(): Promise<void>;
```

### BaseRESTTest (REST API)

所有 REST API 测试的抽象基类。

**提供功能：**
- 类似 BaseExchangeTest 的核心功能
- 专注于顺序测试 REST 端点
- 简化的指标收集

**子类需实现：**
```typescript
protected abstract getCredentials(): ExchangeCredentials | null;
protected abstract testMarketData(...): Promise<void>;
protected abstract testAccountData(exchange: IExchange): Promise<void>;
abstract run(): Promise<void>;
```

## 📖 详细文档

完整的测试套件文档请查看：
- [交易所测试详细文档](../../docs/EXCHANGE_TESTS_README.md)
- [快速参考](../../docs/QUICK_REFERENCE.md)
- [测试套件总结](../../docs/TEST_SUITE_SUMMARY.md)

---

Author: xiaoweihsueh@gmail.com  
Date: October 26, 2025

