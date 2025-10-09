# Strategy Management System Guide

## 概述

iTrade 现在支持通过 Web Manager 管理策略，Console 应用程序会自动从数据库加载和执行启用的策略。

## 系统架构

```
┌─────────────────┐
│  Web Manager    │  创建、启用/停止策略
│  (/strategy)    │
└────────┬────────┘
         │ HTTP API
         ▼
┌─────────────────┐
│   PostgreSQL    │  存储策略配置和状态
│    Database     │
└────────┬────────┘
         │ TypeORM
         ▼
┌─────────────────┐
│ Console App     │  读取并执行策略
│ (Strategy Mgr)  │  保存订单和PnL数据
└─────────────────┘
```

## 功能特性

### 1. Web Manager (Web UI)

**策略管理** (`/strategy`)
- 创建新策略
- 启用/停止策略
- 删除策略（仅限已停止的策略）
- 查看策略状态和最后执行时间

**分析面板** (`/analytics`)
- 查看整体 PnL
- 查看 Realized PnL 和 Unrealized PnL
- 按策略查看 PnL
- 查看所有订单历史

### 2. Console Application

**策略动态加载**
- 启动时从数据库加载所有 `active` 状态的策略
- 每秒检查一次数据库，自动加载新启用的策略
- 自动移除已停止的策略

**订单追踪**
- 监听所有订单事件（创建、成交、部分成交、取消、拒绝）
- 自动保存订单到数据库
- 计算并保存 PnL 数据

## 数据库设置

### 1. 配置数据库连接

创建 `packages/data-manager/.env` 文件：

```bash
cd packages/data-manager
cp .env.example .env
```

编辑 `.env` 文件，配置你的 PostgreSQL 连接信息：

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password
DATABASE_NAME=itrade
DATABASE_SSL=false
```

### 2. 同步数据库 Schema

运行以下命令来创建/更新数据库表：

```bash
cd packages/data-manager
pnpm exec tsx sync-scheme-to-db.ts
```

这会根据 Entity 定义自动创建或更新以下表：
- `strategies` - 策略配置和状态
- `orders` - 订单记录（包含 PnL 字段）
- 其他相关表（users, positions, order_fills, etc.）

## 使用流程

### 步骤 1: 启动 Web Manager

```bash
cd apps/web
pnpm dev
```

访问 http://localhost:3000 并登录。

### 步骤 2: 创建策略

1. 导航到 `/strategy` 页面
2. 点击 "Create Strategy" 按钮
3. 填写策略信息：
   - **Name**: 策略名称（唯一）
   - **Type**: 策略类型（moving_average, rsi, macd, etc.）
   - **Exchange**: 交易所名称（如 "binance"）
   - **Symbol**: 交易对（如 "BTC/USDT"）
   - **Parameters**: JSON 格式的策略参数

示例参数（移动平均策略）：
```json
{
  "fastPeriod": 12,
  "slowPeriod": 26,
  "threshold": 0.001,
  "subscription": {
    "ticker": true,
    "klines": true,
    "method": "rest"
  }
}
```

### 步骤 3: 启用策略

在策略卡片上点击 "Start" 按钮，策略状态会变为 `ACTIVE`。

### 步骤 4: 启动 Console

```bash
cd apps/console
pnpm dev
```

Console 会：
1. 连接到数据库
2. 加载所有 `active` 状态的策略
3. 将策略添加到 TradingEngine
4. 开始执行策略并监听信号
5. 每秒检查数据库，自动同步策略状态

### 步骤 5: 监控和分析

- 在 Console 中查看实时日志
- 在 Web Manager 的 `/analytics` 页面查看 PnL 和订单统计
- 在 `/strategy` 页面查看策略状态

## API Endpoints

### 策略管理

```
GET    /api/strategies              # 获取所有策略
POST   /api/strategies              # 创建策略
GET    /api/strategies/:id          # 获取单个策略
PATCH  /api/strategies/:id          # 更新策略
DELETE /api/strategies/:id          # 删除策略
POST   /api/strategies/:id/status   # 更新策略状态
```

### 分析和订单

```
GET /api/analytics/pnl              # 获取 PnL 统计
GET /api/analytics/pnl?strategyId=1 # 获取特定策略的 PnL
GET /api/orders                     # 获取所有订单
GET /api/orders?strategyId=1        # 获取特定策略的订单
```

## Entity 字段说明

### StrategyEntity

```typescript
{
  id: number;                  // 主键
  name: string;                // 策略名称（唯一）
  description?: string;        // 描述
  type: StrategyType;          // 策略类型
  status: StrategyStatus;      // 状态：active, stopped, paused, error
  exchange?: string;           // 交易所
  symbol?: string;             // 交易对
  parameters?: any;            // 策略参数（JSONB）
  errorMessage?: string;       // 错误信息
  lastExecutionTime?: Date;    // 最后执行时间
  userId: string;              // 用户ID
  createdAt: Date;            // 创建时间
  updatedAt: Date;            // 更新时间
}
```

### OrderEntity (新增字段)

```typescript
{
  // ... 原有字段 ...
  exchange?: string;           // 交易所
  realizedPnl?: Decimal;       // 已实现盈亏
  unrealizedPnl?: Decimal;     // 未实现盈亏
  averagePrice?: Decimal;      // 平均成交价
  commission?: Decimal;        // 手续费
  commissionAsset?: string;    // 手续费币种
}
```

## 支持的策略类型

目前支持：
- `moving_average` - 移动平均策略

未来可扩展：
- `rsi` - RSI 策略
- `macd` - MACD 策略
- `bollinger_bands` - 布林带策略
- `custom` - 自定义策略

## 注意事项

1. **安全性**: 
   - 删除策略前必须先停止
   - 只能操作自己创建的策略

2. **性能**:
   - Console 每秒检查一次数据库（可调整）
   - 大量策略可能影响性能

3. **错误处理**:
   - 策略加载失败会自动标记为 `error` 状态
   - 查看 Console 日志了解详细错误信息

4. **数据持久化**:
   - 所有订单和策略信号都会保存到数据库
   - PnL 计算基于订单成交数据

## 故障排查

### Console 无法连接数据库
- 检查 `.env` 文件配置
- 确保 PostgreSQL 正在运行
- 验证数据库用户权限

### 策略未被加载
- 确认策略状态为 `active`
- 检查 Console 日志中的错误信息
- 验证策略参数格式正确

### PnL 数据不准确
- 检查订单是否正确保存
- 查看 OrderTracker 日志
- 验证 PnL 计算逻辑

## 开发指南

### 添加新的策略类型

1. 在 `packages/strategies` 中实现策略类
2. 在 `StrategyType` enum 中添加类型
3. 在 `StrategyManager.createStrategyInstance()` 中添加映射
4. 在 Web UI 的选择器中添加选项

### 自定义 PnL 计算

修改 `OrderTracker.calculatePnL()` 方法来实现你的 PnL 计算逻辑。

## 更多信息

- [API Reference](./docs/API-REFERENCE-MARKET-DATA.md)
- [Strategy Development](./docs/strategy-example-en.md)
- [Troubleshooting](./docs/TROUBLESHOOTING.md)

