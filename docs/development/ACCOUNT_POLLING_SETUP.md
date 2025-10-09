# Account Polling Setup Guide

## 📋 概述

本指南介绍如何设置和运行账户数据轮询服务，自动从交易所获取余额和持仓数据并保存到数据库。

## 🚀 快速开始

### 步骤 1: 配置环境变量

在 `apps/console` 目录下创建 `.env` 文件：

```bash
cd apps/console
touch .env
```

添加以下配置（根据您的实际情况修改）：

```bash
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_DB=itrade
DB_SSL=false

# Binance 交易所
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET_KEY=your_binance_secret_key

# OKX 交易所（可选）
OKX_API_KEY=your_okx_api_key
OKX_SECRET_KEY=your_okx_secret_key
OKX_PASSPHRASE=your_okx_passphrase

# Coinbase 交易所（可选）
COINBASE_API_KEY=your_coinbase_api_key
COINBASE_SECRET_KEY=your_coinbase_secret_key

# 轮询间隔（毫秒）
ACCOUNT_POLLING_INTERVAL=60000  # 1分钟
```

### 步骤 2: 初始化历史数据（只运行一次）

```bash
cd apps/console
pnpm run init-history
```

**输出示例**:
```
🚀 Initializing historical account data...
✅ Database connected
📡 Connecting to Binance...
📊 Fetching Binance account data...
✅ Binance: 5 balances, 2 positions
💾 BINANCE: Equity=$10234.56, Balance=$10000.00, Positions=2, Unrealized P&L=$234.56
✅ Historical data initialization completed!
```

### 步骤 3: 启动持续轮询服务

```bash
cd apps/console
pnpm run cron
```

**输出示例**:
```
🚀 Initializing Account Polling Cron Job...
✅ Database connected
✅ Binance exchange initialized
✅ Account Polling Service initialized
⏱️  Polling interval: 60s
🔄 Starting continuous account polling...
✅ Account polling service started successfully!
⏱️  Polling every 60 seconds
📊 Latest data will be saved to database automatically
💡 Press Ctrl+C to stop
```

## 📊 脚本说明

### init-history.ts

**用途**: 初始化历史数据（只运行一次）

**功能**:
- 连接配置的交易所
- 获取当前账户余额和持仓
- 创建初始快照保存到数据库

**何时运行**:
- 第一次设置系统时
- 添加新交易所后
- 需要重建历史基准数据时

### cron.ts

**用途**: 持续轮询最新数据

**功能**:
- 按配置的间隔持续轮询
- 获取最新余额和持仓
- 自动保存到数据库
- 提供实时数据给 Dashboard

**何时运行**:
- 在后台持续运行
- 作为系统服务运行
- 需要实时数据更新时

## 🔧 配置详解

### DB_*

数据库连接配置，必须与 Web Manager 使用同一个数据库。

### *_API_KEY / *_SECRET_KEY

交易所 API 凭证。

**获取方式**:
- Binance: https://www.binance.com/en/my/settings/api-management
- OKX: https://www.okx.com/account/my-api  
- Coinbase: https://www.coinbase.com/settings/api

**权限要求**:
- ✅ 只读权限（Read）
- ❌ 不需要交易权限（Trade）
- ❌ 不需要提现权限（Withdraw）

### ACCOUNT_POLLING_INTERVAL

轮询间隔（毫秒）

**推荐值**:
- `60000` (1分钟) - **默认推荐**
- `300000` (5分钟) - 降低API调用频率
- `30000` (30秒) - 更频繁的数据更新

## 📂 数据存储

数据保存在 `account_snapshots` 表中：

```sql
SELECT 
  exchange,
  timestamp,
  total_balance,
  position_count,
  unrealized_pnl
FROM account_snapshots
ORDER BY timestamp DESC
LIMIT 10;
```

## 🔍 验证数据

### 方法 1: 检查数据库

```sql
-- 查看最新快照
SELECT * FROM account_snapshots 
ORDER BY timestamp DESC 
LIMIT 5;

-- 查看各交易所最新余额
SELECT 
  exchange,
  timestamp,
  total_balance,
  position_count
FROM account_snapshots
WHERE timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC;
```

### 方法 2: 访问 Dashboard

打开 Web Manager 的 Dashboard 页面：
- http://localhost:3000/dashboard
- 应该能看到实时更新的账户数据
- 卡片中的数字会平滑动画

## 🐛 故障排除

### 问题: 无法连接交易所

**错误**:
```
❌ Failed to initialize Binance: Invalid API key
```

**解决**:
1. 检查 API key 是否正确
2. 确认 API key 权限包含读取
3. 检查 API key 是否过期
4. 确认 IP 白名单设置（如果有）

### 问题: 数据库连接失败

**错误**:
```
❌ Database connection failed
```

**解决**:
1. 检查 `DB_*` 配置是否正确
2. 确认 PostgreSQL 服务正在运行
3. 确认数据库已创建
4. 测试连接: `psql -h localhost -U postgres -d itrade`

### 问题: 轮询服务停止

**解决**:
1. 检查日志输出中的错误信息
2. 重启服务: `pnpm run cron`
3. 检查 API 速率限制是否触发
4. 增加 `ACCOUNT_POLLING_INTERVAL` 值

## 🔄 使用流程

```
第一次设置:
1. 配置 .env 文件
2. 运行 pnpm run init-history
3. 启动 pnpm run cron

日常使用:
1. 保持 cron 服务运行
2. Dashboard 自动显示最新数据
3. 定期检查日志确保正常运行

添加新交易所:
1. 在 .env 添加新交易所配置
2. 重新运行 pnpm run init-history
3. 重启 cron 服务
```

## 📊 数据流程

```
交易所 API
    ↓
init-history.ts (初始化一次)
    ↓
数据库 (account_snapshots 表)
    ↑
cron.ts (持续轮询)
    ↑
交易所 API (每分钟)
    ↓
Dashboard Web UI (实时显示)
```

## 🎯 最佳实践

1. **定期备份**: 定期备份 `account_snapshots` 表
2. **监控日志**: 定期检查 cron 日志确保正常运行
3. **API 限制**: 注意交易所 API 调用限制
4. **安全性**: 
   - 不要提交 .env 文件到 git
   - 使用只读 API key
   - 限制 API key IP 白名单
5. **监控告警**: 设置监控当轮询失败时发送告警

## 📝 环境变量完整列表

```bash
# 数据库
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_DB=itrade
DB_SSL=false

# Binance
BINANCE_API_KEY=
BINANCE_SECRET_KEY=

# OKX
OKX_API_KEY=
OKX_SECRET_KEY=
OKX_PASSPHRASE=

# Coinbase
COINBASE_API_KEY=
COINBASE_SECRET_KEY=

# 配置
ACCOUNT_POLLING_INTERVAL=60000
```

## 🚀 生产环境部署

### 使用 PM2 管理

```bash
# 安装 PM2
npm install -g pm2

# 启动 cron 服务
pm2 start "pnpm run cron" --name itrade-cron

# 查看状态
pm2 status

# 查看日志
pm2 logs itrade-cron

# 设置开机自启
pm2 startup
pm2 save
```

### 使用 Systemd (Linux)

创建 `/etc/systemd/system/itrade-cron.service`:

```ini
[Unit]
Description=iTrade Account Polling Service
After=network.target postgresql.service

[Service]
Type=simple
User=your_user
WorkingDirectory=/path/to/iTrade/apps/console
ExecStart=/usr/bin/pnpm run cron
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务:
```bash
sudo systemctl daemon-reload
sudo systemctl enable itrade-cron
sudo systemctl start itrade-cron
sudo systemctl status itrade-cron
```

## 📚 相关文档

- [Dashboard 动画指南](../../docs/guides/DASHBOARD_ANIMATION_GUIDE.md)
- [Account Polling 实现文档](../../../packages/core/docs/ACCOUNT_POLLING_SERVICE.md)
- [Web Dashboard 验证](../../docs/development/WEB_DASHBOARD_VERIFICATION.md)

---

**更新日期**: 2025-10-09  
**版本**: 1.0.0

