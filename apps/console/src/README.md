# iTrade Console - Testing & Utilities

iTrade Console 应用包含完整的测试套件和实用工具，用于验证和调试 iTrade 交易系统。

> ⚠️ **重要提示**: 不同类型的测试需要使用不同的运行方式（tsx vs ts-node）。  
> 详情请查看 [测试运行指南](../TESTING_GUIDE.md) 了解如何正确运行每种测试。

## 📂 目录结构

```
src/
├── unit/                          # 单元测试
│   ├── exchanges/                 # 交易所接口测试
│   │   ├── base/                  # 基础测试类
│   │   ├── binance/              # Binance 测试
│   │   ├── okx/                  # OKX 测试
│   │   └── coinbase/             # Coinbase 测试
│   └── database/                  # 数据库 CRUD 测试
├── integration/                   # 集成测试
│   ├── helpers/                   # 集成测试辅助类
│   ├── trading-engine.test.ts    # TradingEngine 完整流程
│   ├── strategy-execution.test.ts # 策略执行测试
│   └── subscription-coordinator.test.ts # 订阅协调测试
├── tools/                         # 工具脚本
│   ├── init-history.ts           # 初始化历史数据
│   ├── cron.ts                   # 账户轮询服务
│   ├── diagnose-auth.ts          # 认证诊断工具
│   └── get-current-ip.ts         # 获取公网 IP
└── docs/                         # 文档
    ├── EXCHANGE_TESTS_README.md  # 交易所测试详细文档
    ├── QUICK_REFERENCE.md        # 快速参考
    └── TEST_SUITE_SUMMARY.md     # 测试套件总结
```

## 🧪 测试分类

### 1️⃣ 单元测试 (`unit/`)

测试单个功能模块，确保每个组件独立工作正常。

**交易所测试** (`unit/exchanges/`)
- WebSocket 接口测试（实时数据流）
- REST API 测试（市场数据和账户数据）
- 每个交易所独立测试（Binance, OKX, Coinbase）

**数据库测试** (`unit/database/`)
- Entity CRUD 操作测试
- Order-Strategy-Exchange 关联测试
- 数据完整性验证

### 2️⃣ 集成测试 (`integration/`)

测试多个组件协同工作的完整流程。

**TradingEngine 集成测试**
- 初始化 TradingEngine
- 加载 Active Strategies
- 同步运行 Strategies
- 订阅验证
- Signal 执行验证

**策略执行测试**
- 策略实例化
- 市场数据订阅
- 信号生成
- 订单执行

**订阅协调测试**
- SubscriptionCoordinator 功能
- 引用计数机制
- 动态订阅/取消订阅

### 3️⃣ 工具脚本 (`tools/`)

实用工具脚本，用于系统初始化、诊断和维护。

## 🚀 快速开始

### 运行单元测试

```bash
# 交易所 WebSocket 测试
npm run test:binance        # Binance WebSocket
npm run test:okx            # OKX WebSocket
npm run test:coinbase       # Coinbase WebSocket

# 交易所 REST API 测试
npm run test:binance-rest   # Binance REST
npm run test:okx-rest       # OKX REST
npm run test:coinbase-rest  # Coinbase REST

# 数据库测试
npm run test:db:order-association

# 批量测试
npm run test:all-ws         # 所有 WebSocket 测试
npm run test:all-rest       # 所有 REST API 测试
npm run test:all-exchanges  # 所有交易所测试
```

### 运行集成测试

```bash
# TradingEngine 完整流程
npm run test:trading-engine

# 策略执行测试
npm run test:strategy-execution

# 订阅协调测试
npm run test:subscription

# 所有集成测试
npm run test:all-integration
```

### 运行工具脚本

```bash
# 初始化历史数据（首次运行）
npm run tool:init-history

# 启动账户轮询服务
npm run cron

# 诊断认证问题
npm run tool:diagnose-auth

# 获取当前公网 IP
npm run tool:get-ip
```

### 运行所有测试

```bash
npm run test:all
```

## ⚙️ 配置

### 环境变量

在 `apps/console` 目录创建 `.env` 文件：

```bash
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_DB=itrade
DB_SSL=false

# Binance API
BINANCE_API_KEY=your_api_key
BINANCE_SECRET_KEY=your_secret_key

# OKX API
OKX_API_KEY=your_api_key
OKX_SECRET_KEY=your_secret_key
OKX_PASSPHRASE=your_passphrase

# Coinbase API
COINBASE_API_KEY=your_api_key
COINBASE_SECRET_KEY=your_secret_key

# 账户轮询间隔（毫秒）
ACCOUNT_POLLING_INTERVAL=60000
```

### API 权限要求

**Binance:**
- ✅ Enable Reading
- ✅ Enable Spot & Margin Trading
- ✅ IP 白名单（如果配置）

**OKX:**
- ✅ Read permission
- ✅ Trade permission
- ✅ IP 白名单（如果配置）
- ✅ Passphrase 配置

**Coinbase:**
- ✅ View permission
- ✅ Trade permission

## 📚 详细文档

- [交易所测试详细文档](./docs/EXCHANGE_TESTS_README.md)
- [快速参考](./docs/QUICK_REFERENCE.md)
- [测试套件总结](./docs/TEST_SUITE_SUMMARY.md)

## 🔍 测试最佳实践

### 单元测试
- ✅ 测试单一功能
- ✅ 快速执行（< 1 分钟）
- ✅ 独立运行，无依赖
- ✅ 使用 Mock 数据

### 集成测试
- ✅ 测试完整流程
- ✅ 真实环境（数据库、交易所）
- ✅ 验证组件协同工作
- ✅ 可能需要较长时间

### 工具脚本
- ✅ 幂等性（可重复运行）
- ✅ 错误处理完善
- ✅ 清晰的日志输出
- ✅ 安全的默认配置

## 🐛 故障排查

### 测试失败

**WebSocket 连接失败**
- 检查网络连接
- 验证防火墙/代理设置
- 检查交易所状态页面

**认证错误（401 Unauthorized）**
- 验证 API Key 和 Secret
- 检查 IP 白名单
- 验证 API Key 权限
- 使用 `npm run tool:diagnose-auth` 诊断

**数据库连接失败**
- 验证数据库服务运行中
- 检查 `.env` 配置
- 确认数据库已创建

### 获取帮助

1. 查看详细日志输出
2. 参考相关文档
3. 运行诊断工具
4. 检查环境配置

---

Author: xiaoweihsueh@gmail.com  
Date: October 26, 2025

