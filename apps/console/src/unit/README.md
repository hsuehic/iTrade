# 单元测试 (Unit Tests)

单元测试专注于测试单个功能模块，确保每个组件独立工作正常。

## 📂 测试分类

### 🌐 交易所测试 (`exchanges/`)

测试交易所接口的各项功能，包括 WebSocket 和 REST API。

**目录结构：**
```
exchanges/
├── base/                  # 基础测试类
│   ├── BaseExchangeTest.ts    # WebSocket 测试基类
│   └── BaseRESTTest.ts        # REST API 测试基类
├── binance/              # Binance 交易所测试
│   ├── binance-ws.test.ts
│   ├── binance-ws-v2.test.ts
│   ├── binance-rest.test.ts
│   └── binance-rest-v2.test.ts
├── okx/                  # OKX 交易所测试
│   ├── okx-ws.test.ts
│   ├── okx-ws-v2.test.ts
│   ├── okx-rest.test.ts
│   ├── okx-rest-v2.test.ts
│   ├── okx-create-order.test.ts
│   └── okx-permissions.test.ts
└── coinbase/             # Coinbase 交易所测试
    ├── coinbase-ws.test.ts
    ├── coinbase-ws-v2.test.ts
    └── coinbase-rest.test.ts
```

**测试覆盖：**
- ✅ Ticker（24小时价格统计）
- ✅ OrderBook（买卖盘）
- ✅ Trades（最近成交）
- ✅ Klines（K线数据）
- ✅ User Data（订单、余额、持仓）

**运行命令：**
```bash
# WebSocket 测试
npm run test:binance
npm run test:okx
npm run test:coinbase

# REST API 测试
npm run test:binance-rest
npm run test:okx-rest
npm run test:coinbase-rest

# 批量测试
npm run test:all-ws
npm run test:all-rest
npm run test:all-exchanges
```

详细文档：[交易所测试详细说明](./exchanges/README.md)

### 🗄️ 数据库测试 (`database/`)

测试数据库实体的 CRUD 操作和数据完整性。

**目录结构：**
```
database/
└── order-strategy-association.test.ts    # Order-Strategy-Exchange 关联测试
```

**测试覆盖：**
- ✅ 创建测试 Strategy
- ✅ 创建 Order 并关联 Strategy
- ✅ 验证关联元数据（exchange, strategyType, strategyName）
- ✅ 查询验证（带/不带 relation）
- ✅ 按 strategyId 查询订单
- ✅ 数据清理

**运行命令：**
```bash
npm run test:db:order-association
```

**测试场景：**
1. 初始化数据库连接
2. 获取或创建测试用户
3. 创建测试策略
4. 创建 Mock Order 并关联 Strategy
5. 保存到数据库
6. 查询并验证所有关联字段
7. 查询带 Strategy Relation 的 Order
8. 验证 ClientOrderId 格式
9. 按 StrategyId 查询订单
10. 清理测试数据

## 🎯 单元测试原则

### ✅ 单一职责
每个测试只测试一个功能点，保持简单和专注。

### ✅ 独立性
测试之间互不依赖，可以单独运行，顺序无关。

### ✅ 快速执行
单元测试应该快速执行（通常 < 1 分钟），提供即时反馈。

### ✅ 可重复性
多次运行应产生相同结果，不受外部状态影响。

### ✅ 自动验证
测试应自动验证结果，明确 PASS/FAIL。

## 📊 测试输出格式

### WebSocket 测试输出示例

```
🧪 Starting Binance WebSocket Test

Testing: Spot + Futures + User Data
Symbols: BTC/USDT (spot), BTC/USDT:USDT (futures)

✅ Connected to Binance (with credentials)

🟢 ===== SUBSCRIBING TO SPOT MARKET DATA =====
📊 [TICKER] BTC/USDT: $95234.56
📚 [ORDERBOOK] BTC/USDT: Bid $95234.50, Ask $95234.60

============================================================
📊 TEST RESULTS SUMMARY
============================================================

🟢 SPOT:
  Ticker:    ✅ PASS
  OrderBook: ✅ PASS
  Trades:    ✅ PASS
  Klines:    ✅ PASS

🔵 FUTURES/PERPETUAL:
  Ticker:    ✅ PASS
  OrderBook: ✅ PASS
  Trades:    ✅ PASS
  Klines:    ✅ PASS

👤 USER DATA:
  Orders:    ✅ PASS
  Balance:   ✅ PASS
  Positions: ✅ PASS

============================================================
⏱️  Duration: 12.5s
📈 Overall: 11/11 tests passed
============================================================

🎉 ALL TESTS PASSED!
```

### 数据库测试输出示例

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 Testing Order-Strategy-Exchange Association
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 Step 1: Initialize Database Connection
✅ Database connected

📦 Step 2: Get or Create Test User
✅ Using Existing User: ID=xxx

📦 Step 3: Create Test Strategy
✅ Test Strategy Created: ID=123, Name=TEST_ORDER_ASSOC_xxx

📦 Step 4: Create Mock Order with Associations
📋 Mock Order Details:
   ID: xxx
   ClientOrderId: s-123-1234567890
   Symbol: BTC/USDT
   Exchange: binance
   StrategyId: 123
   StrategyType: MovingAverageStrategy
   StrategyName: TEST_ORDER_ASSOC_xxx

📦 Step 5: Save Order to Database
✅ Order Saved: ID=xxx

📦 Step 6: Query Order and Verify Associations
✅ Order Retrieved from Database

📦 Step 7: Query Order with Strategy Relation
✅ Order with Strategy Relation

📦 Step 8: Verify All Associations
📊 Verification Results:
   ✅ Order Exists: true
   ✅ Exchange Set: true
   ✅ StrategyType Set: true
   ✅ StrategyName Set: true
   ✅ Strategy Relation Loaded: true
   ✅ Strategy ID Match: true
   ✅ Exchange Match: true
   ✅ StrategyType Match: true
   ✅ StrategyName Match: true
   ✅ ClientOrderId Format: true

🎉 All Checks PASSED! ✅
```

## 🔍 常见问题

### Q: 测试需要真实 API 凭证吗？

**A:** 视情况而定：
- **市场数据测试**：不需要凭证（公开数据）
- **用户数据测试**：需要有效的 API Key 和 Secret
- 无凭证时，用户数据测试会被跳过，但市场数据测试仍会执行

### Q: 测试会产生真实交易吗？

**A:** 不会！
- WebSocket 和 REST 测试仅读取数据，不执行交易
- `okx-create-order.test.ts` 是特殊的订单创建测试，但可以配置使用测试网

### Q: 如何提高测试速度？

**A:**
- 使用 `-v2` 版本的测试（优化后的版本）
- 减少 timeout 时间
- 并行运行独立测试

### Q: 测试失败怎么办？

**A:**
1. 查看详细错误信息
2. 检查网络连接
3. 验证 API 凭证
4. 检查交易所状态
5. 运行诊断工具：`npm run tool:diagnose-auth`

## 📚 相关文档

- [交易所测试详细文档](./exchanges/README.md)
- [数据库测试详细文档](./database/README.md)
- [主文档](../README.md)

---

Author: xiaoweihsueh@gmail.com  
Date: October 26, 2025

