# iTrade 策略管理系统 - 快速开始

本指南将帮助你快速启动和运行 iTrade 策略管理系统。

## 系统要求

- Node.js 18+
- PostgreSQL 12+
- pnpm

## 安装步骤

### 1. 安装依赖

```bash
# 在项目根目录
pnpm install
```

### 2. 配置数据库

#### 2.1 创建数据库

```bash
# 连接到 PostgreSQL
psql -U postgres

# 创建数据库
CREATE DATABASE itrade;

# 退出
\q
```

#### 2.2 配置连接信息

```bash
# 在 data-manager 包中创建 .env 文件
cd packages/data-manager
cp .env.example .env
```

编辑 `.env` 文件：

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password
DATABASE_NAME=itrade
DATABASE_SSL=false
```

#### 2.3 同步数据库 Schema

```bash
# 在 data-manager 目录
pnpm exec tsx sync-scheme-to-db.ts
```

你应该看到类似的输出：
```
✅ Database connected
✅ Schema synchronized successfully
```

### 3. 启动 Web Manager

在新的终端窗口：

```bash
cd apps/web
pnpm dev
```

访问 http://localhost:3000

**首次使用**: 
1. 注册一个账户
2. 登录系统

### 4. 创建策略

1. 在 Web UI 中导航到 `/strategy` 页面
2. 点击 "Create Strategy"
3. 填写策略信息：

**示例配置**:
```
Name: My First MA Strategy
Type: Moving Average
Exchange: binance
Symbol: BTC/USDT
Description: Simple moving average crossover strategy

Parameters (JSON):
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

4. 创建后，点击 "Start" 按钮启用策略

### 5. 启动 Console Application

在新的终端窗口：

```bash
cd apps/console
pnpm dev
```

你应该看到：
```
Connecting to database...
✅ Database connected
📊 iTrade Console started with database-driven strategy management
Loading 1 active strategies...
Added strategy: My First MA Strategy (ID: 1)
Strategy Manager started
Trading system is running with active strategies from database...
```

### 6. 查看分析面板

在 Web UI 中导航到 `/analytics` 页面查看：
- 总 PnL
- Realized PnL
- Unrealized PnL
- 订单历史

## 验证系统运行

### Console 日志

你应该在 Console 中看到：
```
📈 Ticker #1: BTC/USDT = 50000.00
📊 Strategy collected 1/5 data points
...
📊 Strategy collected 5/5 data points
📈 FastMA=50000.12, SlowMA=50000.05, Diff=0.0001%, Position=0
🎯 Strategy Signal: strategy_1 - buy BTC/USDT @ 50000.12
```

### Web UI

- 在 `/strategy` 页面，策略状态应显示为 "ACTIVE"
- "Last Run" 时间应该在更新
- 在 `/analytics` 页面可以看到订单数据（如果有交易信号）

## 测试策略管理

### 测试 1: 停止策略

1. 在 Web UI 点击 "Stop" 按钮
2. 查看 Console 日志，应该看到：
   ```
   Detected stopped strategy: strategy_1
   Removed strategy: strategy_1 (ID: 1)
   ```

### 测试 2: 启动策略

1. 在 Web UI 点击 "Start" 按钮
2. 查看 Console 日志，应该看到：
   ```
   Detected new active strategy: My First MA Strategy
   Added strategy: My First MA Strategy (ID: 1)
   ```

### 测试 3: 创建多个策略

1. 创建第二个策略（不同的参数或交易对）
2. 启用两个策略
3. Console 应该同时运行两个策略

## 常见问题

### Q: Console 提示 "Failed to connect to database"

**A**: 检查：
1. PostgreSQL 是否运行: `pg_isready`
2. `.env` 文件配置是否正确
3. 数据库是否存在: `psql -U postgres -l | grep itrade`

### Q: 策略未被加载

**A**: 检查：
1. 策略状态是否为 "ACTIVE"
2. Console 日志中是否有错误信息
3. 策略参数 JSON 格式是否正确

### Q: Web UI 无法创建策略

**A**: 检查：
1. 是否已登录
2. 浏览器控制台是否有错误
3. Web server 日志

### Q: 订单未保存到数据库

**A**: 检查：
1. OrderTracker 是否正常启动
2. Console 日志中是否有数据库错误
3. 策略是否真的生成了交易信号

## 下一步

现在系统已经运行，你可以：

1. **开发自定义策略**: 参考 `packages/strategies` 中的示例
2. **添加更多交易所**: 参考 `packages/exchange-connectors`
3. **调整 PnL 计算**: 修改 `apps/console/src/order-tracker.ts`
4. **自定义 UI**: 修改 `apps/web/app` 中的页面

## 更多资源

- [完整指南](./STRATEGY_MANAGEMENT_GUIDE.md)
- [API 文档](./docs/API-REFERENCE-MARKET-DATA.md)
- [策略开发](./docs/strategy-example-en.md)

## 获取帮助

如果遇到问题：
1. 查看 Console 日志
2. 查看 Web server 日志
3. 检查数据库连接
4. 参考 [故障排查文档](./docs/TROUBLESHOOTING.md)

---

**祝交易愉快！** 🚀

