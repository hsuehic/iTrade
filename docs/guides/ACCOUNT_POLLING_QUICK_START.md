# Account Polling Service - 快速开始

## 5分钟快速上手

### 第1步：运行数据库迁移

```bash
cd packages/data-manager
pnpm run migration:run
```

✅ 这会创建 `account_snapshots` 表

### 第2步：配置环境变量

在项目根目录创建 `.env` 文件：

```bash
# 数据库配置
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=itrade

# 账户轮询配置（可选，有默认值）
ACCOUNT_POLLING_INTERVAL=60000        # 60秒
ACCOUNT_POLLING_PERSISTENCE=true      # 启用持久化

# 交易所API密钥
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET_KEY=your_binance_secret_key
```

### 第3步：启动Console应用

```bash
cd apps/console
pnpm run dev
```

✅ 看到以下日志表示成功：
```
✅ Account polling service started
💰 Account polling service active (polling interval: 60s)
📊 Account polling completed: 1/1 exchanges successful
💾 Account snapshot saved: binance - Balance: 10000.00 USDT
```

### 第4步：启动Web Dashboard

```bash
cd apps/web
pnpm run dev
```

访问 http://localhost:3000/dashboard

✅ 你应该看到：
- 📊 4个统计卡片显示账户数据
- 📈 账户余额历史图表
- 📋 策略性能表格

## 功能验证

### 验证数据正在写入数据库

```sql
-- 连接到PostgreSQL
psql -U postgres -d itrade

-- 查看最新的快照
SELECT 
  exchange,
  timestamp,
  total_balance,
  position_count
FROM account_snapshots
ORDER BY timestamp DESC
LIMIT 5;
```

### 验证API正常工作

```bash
# 测试账户API
curl http://localhost:3000/api/analytics/account?period=7d

# 测试策略API
curl http://localhost:3000/api/analytics/strategies?limit=5
```

## Dashboard功能

### 1. 账户概览卡片

- **总资产**: 显示所有交易所的总资产和涨跌幅
- **未实现盈亏**: 当前持仓的浮动盈亏
- **活跃策略**: 正在运行的策略数量
- **策略盈亏**: 所有策略的累计盈亏

### 2. 账户余额图表

- 显示各交易所余额的历史变化
- 支持切换7天/30天/90天视图
- 堆叠面积图显示占比

### 3. 策略性能表格

- **Strategies标签**: Top 10表现最好的策略
- **Exchanges标签**: 各交易所的收益对比
- **Symbols标签**: 各交易对的收益对比

## 配置调整

### 更改轮询间隔

```bash
# 在 .env 文件中
ACCOUNT_POLLING_INTERVAL=30000  # 改为30秒
```

### 停用持久化（仅用于测试）

```bash
# 在 .env 文件中
ACCOUNT_POLLING_PERSISTENCE=false
```

### 添加更多交易所

```typescript
// 在 apps/console/src/main.ts 中
// OKX已集成，只需配置环境变量
OKX_API_KEY=your_okx_api_key
OKX_SECRET_KEY=your_okx_secret_key
OKX_PASSPHRASE=your_okx_passphrase
```

## 常见问题

### Q: Dashboard显示"No data available"

**A**: 等待1-2分钟让第一次轮询完成，或刷新页面

### Q: 想要更快的数据更新

**A**: 设置 `ACCOUNT_POLLING_INTERVAL=30000` (30秒)，但注意不要太频繁以免触发API限流

### Q: 如何查看更多历史数据

**A**: 在图表右上角切换到"90 days"视图

### Q: 如何清理旧数据

**A**: 在数据库中运行：
```sql
DELETE FROM account_snapshots 
WHERE timestamp < NOW() - INTERVAL '90 days';
```

## 下一步

- 📖 阅读[完整文档](../packages/core/docs/ACCOUNT_POLLING_SERVICE.md)
- 🎨 查看[Dashboard使用指南](../apps/web/docs/DASHBOARD.md)
- 🔧 了解[实现细节](../docs/development/ACCOUNT_POLLING_IMPLEMENTATION.md)
- 📝 创建你的第一个策略

## 获取帮助

如有问题，请：
1. 检查Console日志
2. 查看浏览器控制台错误
3. 查阅相关文档
4. 提交Issue

---

**恭喜！** 🎉 你已经成功设置了Account Polling Service和Dashboard！

