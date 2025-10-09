# Account Polling Cron - 快速启动指南

## 🚀 快速开始

### 前提条件

1. 已配置 `.env` 文件（参考 [ACCOUNT_POLLING_SETUP.md](./ACCOUNT_POLLING_SETUP.md)）
2. PostgreSQL 数据库已运行
3. 交易所 API 凭证已配置

### 环境变量配置

在 `apps/console/.env` 文件中配置：

```bash
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_DB=itrade

# Binance
BINANCE_API_KEY=your_api_key
BINANCE_SECRET_KEY=your_secret_key

# OKX (可选)
OKX_API_KEY=your_api_key
OKX_SECRET_KEY=your_secret_key  
OKX_PASSPHRASE=your_passphrase

# Coinbase (可选)
COINBASE_API_KEY=your_api_key
COINBASE_SECRET_KEY=your_secret_key

# 轮询间隔 (默认 60秒)
ACCOUNT_POLLING_INTERVAL=60000
```

## ⚙️ 方式 1: 使用 main.ts (推荐)

最简单的方式是使用现有的 `main.ts`，它已经集成了 AccountPollingService：

```bash
cd apps/console
pnpm run dev
```

这会启动完整的 console 应用，包括：
- ✅ Account Polling Service（自动轮询）
- ✅ Strategy Manager
- ✅ Order Tracker
- ✅ Trading Engine

**优点**:
- 一次性启动所有服务
- 已经过测试和验证
- 自动保存账户快照到数据库

## ⚙️ 方式 2: 单独运行 Cron 服务

如果只想运行账户轮询服务：

### 步骤 1: 初始化历史数据（只运行一次）

```bash
pnpm run init-history
```

### 步骤 2: 启动持续轮询

```bash
pnpm run cron
```

**注意**: 由于 TypeORM 装饰器的技术限制，这些脚本可能需要先构建再运行。

## 📊 验证数据

### 方法 1: 查询数据库

```sql
-- 查看最新快照
SELECT * FROM account_snapshots 
ORDER BY timestamp DESC 
LIMIT 5;

-- 查看各交易所快照数量
SELECT exchange, COUNT(*) as count
FROM account_snapshots
GROUP BY exchange;
```

### 方法 2: 访问 Dashboard

打开 Web Manager:
- http://localhost:3000/dashboard
- 应该能看到实时的账户数据
- 卡片中的数字会平滑动画更新

## 🔍 main.ts 中的 Account Polling 配置

`apps/console/src/main.ts` 已经包含了 AccountPollingService 的完整配置：

```typescript
// Initialize Account Polling Service
const accountPollingService = new AccountPollingService(
  {
    pollingInterval: parseInt(process.env.ACCOUNT_POLLING_INTERVAL || '60000'),
    enablePersistence: process.env.ACCOUNT_POLLING_PERSISTENCE !== 'false',
    exchanges: Array.from(exchanges.keys()),
    retryAttempts: 3,
    retryDelay: 5000,
  },
  logger
);

// Register exchanges and start polling
for (const [name, exchange] of exchanges) {
  accountPollingService.registerExchange(name, exchange);
}
accountPollingService.setDataManager(dataManager);
await accountPollingService.start();
```

## 🎯 推荐工作流

**开发/测试环境**:
```bash
cd apps/console
pnpm run dev
```

**生产环境 (使用 PM2)**:
```bash
# 安装 PM2
npm install -g pm2

# 启动服务
cd apps/console
pm2 start "pnpm run dev" --name itrade-console

# 查看状态
pm2 status

# 查看日志
pm2 logs itrade-console

# 停止服务
pm2 stop itrade-console
```

## 📝 环境变量参考

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ACCOUNT_POLLING_INTERVAL` | 轮询间隔（毫秒） | 60000 (1分钟) |
| `ACCOUNT_POLLING_PERSISTENCE` | 是否持久化数据 | true |
| `DB_HOST` | 数据库主机 | localhost |
| `DB_PORT` | 数据库端口 | 5432 |
| `DB_USER` | 数据库用户 | postgres |
| `DB_PASSWORD` | 数据库密码 | postgres |
| `DB_DB` | 数据库名称 | itrade |

## ✅ 成功标志

运行后你应该看到类似的日志：

```
✅ Database connected
✅ Binance exchange connected
✅ Account polling service started
🔄 Account polling service initialized and running
💰 Account polling service active (polling interval: 60s)
```

每分钟（或配置的间隔）会看到：

```
📊 Account polling completed: 3/3 exchanges successful
💾 binance snapshot saved: Equity=10234.56, Positions=2
💾 okx snapshot saved: Equity=5678.90, Positions=1  
💾 coinbase snapshot saved: Equity=3456.78, Positions=0
```

## 🐛 故障排除

### 问题: TypeORM 装饰器错误

如果运行 `init-history.ts` 或 `cron.ts` 遇到装饰器错误，请使用 `main.ts`:

```bash
pnpm run dev
```

### 问题: 数据库连接失败

检查 `.env` 配置和数据库服务状态:

```bash
# 测试数据库连接
psql -h localhost -U postgres -d itrade

# 检查 PostgreSQL 服务
pg_ctl status
```

### 问题: 交易所API错误

确认 API 凭证正确：
- API Key 和 Secret Key 正确
- API 权限包含读取权限
- IP 白名单配置（如有）

## 📚 相关文档

- [完整设置指南](./ACCOUNT_POLLING_SETUP.md)
- [Dashboard 使用指南](../../../docs/guides/DASHBOARD_ANIMATION_GUIDE.md)
- [Console 应用文档](./README.md)

---

**建议**: 生产环境使用 `main.ts` 启动完整服务，开发环境可以使用独立的 cron 脚本进行测试。

