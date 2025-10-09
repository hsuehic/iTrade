# Account Polling Service

## 概述

AccountPollingService 是一个用于定时轮询交易所账户信息的服务，提供以下功能：

- ✅ 定时轮询多个交易所的余额（Balance）和持仓（Position）
- ✅ 自动持久化数据到数据库
- ✅ 为 Risk Manager 提供实时账户数据
- ✅ 为 Web Dashboard 提供历史数据和图表
- ✅ 失败重试机制
- ✅ 事件驱动架构

## 功能特性

### 1. 多交易所支持

同时轮询多个交易所（Binance、OKX、Coinbase 等）的账户信息。

### 2. 数据持久化

自动将账户快照保存到数据库，包括：
- 总余额（Total Balance）
- 可用余额（Available Balance）
- 锁定余额（Locked Balance）
- 持仓总价值（Position Value）
- 未实现盈亏（Unrealized P&L）
- 持仓数量（Position Count）
- 详细的余额和持仓信息

### 3. 灵活配置

```typescript
const config: AccountPollingConfig = {
  pollingInterval: 60000,        // 轮询间隔：60秒（默认）
  enablePersistence: true,       // 启用持久化（默认）
  exchanges: ['binance', 'okx'], // 要轮询的交易所列表
  retryAttempts: 3,             // 失败重试次数（默认3次）
  retryDelay: 5000,             // 重试延迟：5秒
};
```

### 4. 事件监听

```typescript
accountPollingService.on('started', () => {
  console.log('服务已启动');
});

accountPollingService.on('exchangePolled', (data) => {
  console.log(`${data.exchange}: ${data.balances.length} balances, ${data.positions.length} positions`);
});

accountPollingService.on('snapshotSaved', (snapshot) => {
  console.log(`快照已保存: ${snapshot.exchange} - ${snapshot.totalBalance} USDT`);
});

accountPollingService.on('pollingError', (error) => {
  console.error(`轮询错误: ${error.exchange} - ${error.error}`);
});
```

## 使用指南

### 1. 基本使用

```typescript
import { AccountPollingService } from '@itrade/core';
import { TypeOrmDataManager } from '@itrade/data-manager';
import { BinanceExchange, OKXExchange } from '@itrade/exchange-connectors';
import { ConsoleLogger } from '@itrade/logger';

// 初始化数据库
const dataManager = new TypeOrmDataManager({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'postgres',
  database: 'itrade',
});
await dataManager.initialize();

// 创建日志记录器
const logger = new ConsoleLogger(LogLevel.INFO);

// 创建服务实例
const accountPollingService = new AccountPollingService(
  {
    pollingInterval: 60000,  // 1分钟
    enablePersistence: true,
    exchanges: ['binance', 'okx'],
  },
  logger
);

// 注册交易所
const binance = new BinanceExchange();
await binance.connect({ /* credentials */ });
accountPollingService.registerExchange('binance', binance);

const okx = new OKXExchange();
await okx.connect({ /* credentials */ });
accountPollingService.registerExchange('okx', okx);

// 设置数据管理器
accountPollingService.setDataManager(dataManager);

// 启动服务
await accountPollingService.start();
```

### 2. 环境变量配置

在 `.env` 文件中配置：

```bash
# 账户轮询配置
ACCOUNT_POLLING_INTERVAL=60000           # 轮询间隔（毫秒），默认60000（1分钟）
ACCOUNT_POLLING_PERSISTENCE=true         # 是否启用持久化，默认true
```

### 3. 手动触发轮询

```typescript
// 立即执行一次轮询
const results = await accountPollingService.pollNow();

// 查看结果
results.forEach(result => {
  if (result.success) {
    console.log(`${result.exchange}: 成功`);
    console.log(`  - 余额数量: ${result.balances?.length}`);
    console.log(`  - 持仓数量: ${result.positions?.length}`);
  } else {
    console.error(`${result.exchange}: 失败 - ${result.error}`);
  }
});
```

### 4. 查询历史数据

```typescript
// 获取最新快照
const latestSnapshot = await accountPollingService.getLatestSnapshot('binance');
console.log(`最新余额: ${latestSnapshot?.totalBalance}`);

// 获取历史快照
const startTime = new Date('2024-01-01');
const endTime = new Date();
const history = await accountPollingService.getSnapshotHistory(
  'binance',
  startTime,
  endTime
);
console.log(`历史记录: ${history.length} 条`);
```

### 5. 获取服务状态

```typescript
const status = accountPollingService.getStatus();
console.log('服务状态:', status);
/*
{
  isRunning: true,
  registeredExchanges: ['binance', 'okx', 'coinbase'],
  config: {
    pollingInterval: 60000,
    enablePersistence: true,
    exchanges: ['binance', 'okx', 'coinbase'],
    retryAttempts: 3,
    retryDelay: 5000
  }
}
*/
```

### 6. 动态更新配置

```typescript
// 更新轮询间隔为30秒
accountPollingService.updateConfig({
  pollingInterval: 30000
});

// 更新要轮询的交易所列表
accountPollingService.updateConfig({
  exchanges: ['binance', 'okx', 'coinbase']
});
```

## 数据库集成

### 1. 数据表结构

```sql
CREATE TABLE account_snapshots (
  id SERIAL PRIMARY KEY,
  exchange VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  total_balance DECIMAL(28, 10) NOT NULL,
  available_balance DECIMAL(28, 10) NOT NULL,
  locked_balance DECIMAL(28, 10) NOT NULL,
  total_position_value DECIMAL(28, 10) NOT NULL,
  unrealized_pnl DECIMAL(28, 10) NOT NULL,
  position_count INTEGER NOT NULL,
  balances JSONB NOT NULL,
  positions JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_account_snapshots_exchange_timestamp 
  ON account_snapshots(exchange, timestamp);
CREATE INDEX idx_account_snapshots_timestamp 
  ON account_snapshots(timestamp);
```

### 2. 数据查询示例

```typescript
import { TypeOrmDataManager } from '@itrade/data-manager';

const dm = new TypeOrmDataManager(/* config */);
await dm.initialize();

// 获取最新快照
const latestSnapshot = await dm.getLatestAccountSnapshot('binance');

// 获取历史数据
const history = await dm.getAccountSnapshotHistory(
  'binance',
  new Date('2024-01-01'),
  new Date()
);

// 获取统计数据
const stats = await dm.getAccountSnapshotStatistics(
  'binance',
  new Date('2024-01-01'),
  new Date()
);
console.log('统计:', {
  count: stats.count,
  avgBalance: stats.avgBalance.toString(),
  maxBalance: stats.maxBalance.toString(),
  minBalance: stats.minBalance.toString(),
  totalPnl: stats.totalPnl.toString()
});

// 获取时间序列数据（用于图表）
const timeSeries = await dm.getBalanceTimeSeries(
  'binance',
  new Date('2024-01-01'),
  new Date(),
  'day'  // 'hour' | 'day' | 'week'
);
```

## Web Dashboard 集成

### 1. API 端点

已创建以下 API 端点供 Web 应用使用：

#### GET `/api/analytics/account`

获取账户分析数据。

**Query Parameters:**
- `exchange` (optional): 交易所名称，默认 'all'
- `period` (optional): 时间周期 ('7d' | '30d' | '90d')，默认 '30d'

**Response:**
```json
{
  "summary": {
    "totalBalance": 10000.00,
    "totalPositionValue": 5000.00,
    "totalEquity": 15000.00,
    "totalUnrealizedPnl": 250.00,
    "totalPositions": 3,
    "balanceChange": 5.5,
    "period": "30d"
  },
  "exchanges": [
    {
      "exchange": "binance",
      "balance": 7000.00,
      "positionValue": 3000.00,
      "unrealizedPnl": 150.00,
      "positionCount": 2
    }
  ],
  "chartData": [
    {
      "date": "2024-01-01",
      "binance": 7000,
      "okx": 3000
    }
  ]
}
```

#### GET `/api/analytics/strategies`

获取策略分析数据。

**Query Parameters:**
- `limit` (optional): 返回top策略的数量，默认 10

**Response:**
```json
{
  "summary": {
    "total": 15,
    "active": 8,
    "inactive": 7,
    "totalPnl": 1250.50,
    "totalOrders": 450,
    "totalFilledOrders": 425,
    "avgFillRate": "94.44"
  },
  "topPerformers": [
    {
      "id": 1,
      "name": "Grid Trading BTC",
      "symbol": "BTCUSDT",
      "exchange": "binance",
      "totalPnl": 500.25,
      "roi": "15.50",
      "totalOrders": 150,
      "filledOrders": 145,
      "fillRate": "96.67"
    }
  ],
  "byExchange": [
    {
      "exchange": "binance",
      "count": 10,
      "totalPnl": 800.00,
      "activeCount": 5
    }
  ],
  "bySymbol": [
    {
      "symbol": "BTCUSDT",
      "count": 5,
      "totalPnl": 600.00,
      "activeCount": 3
    }
  ]
}
```

### 2. Dashboard 组件

Web Dashboard 现在包含以下组件：

1. **TradingDashboardCards** - 显示关键指标：
   - 总资产（Total Equity）
   - 未实现盈亏（Unrealized P&L）
   - 活跃策略数量（Active Strategies）
   - 策略总盈亏（Strategy P&L）

2. **AccountBalanceChart** - 账户余额历史图表：
   - 支持多交易所叠加显示
   - 可选时间范围（7天/30天/90天）
   - 实时数据更新

3. **StrategyPerformanceTable** - 策略性能表格：
   - Top 10 表现最好的策略
   - 按交易所分组统计
   - 按交易对分组统计

## Risk Manager 集成

AccountPollingService 为 Risk Manager 提供实时账户数据：

```typescript
import { RiskManager } from '@itrade/risk-manager';

const riskManager = new RiskManager(/* config */);

// 从持久化数据中获取最新账户信息
const latestSnapshot = await dataManager.getLatestAccountSnapshot('binance');

if (latestSnapshot) {
  // 更新风险管理指标
  riskManager.updatePortfolioMetrics(
    latestSnapshot.totalBalance.add(latestSnapshot.totalPositionValue),
    latestSnapshot.positions.map(p => ({
      symbol: p.symbol,
      side: p.side,
      quantity: p.quantity,
      avgPrice: p.avgPrice,
      markPrice: p.markPrice,
      unrealizedPnl: p.unrealizedPnl,
      leverage: p.leverage,
      timestamp: new Date(p.timestamp)
    }))
  );
}
```

## 最佳实践

### 1. 轮询间隔设置

- **生产环境**：建议设置为 60-300 秒（1-5分钟）
- **开发环境**：可以设置为 30-60 秒
- **高频交易**：可以设置为 10-30 秒

### 2. 错误处理

```typescript
accountPollingService.on('pollingError', (error) => {
  // 记录错误
  logger.error(`Polling error: ${error.exchange}`, error.error);
  
  // 发送告警（如果连续失败）
  if (consecutiveFailures[error.exchange] > 3) {
    sendAlert(`${error.exchange} 连续失败多次`);
  }
});
```

### 3. 数据清理

定期清理旧数据以控制数据库大小：

```typescript
const snapshotRepo = dataManager.getAccountSnapshotRepository();

// 删除90天前的数据
const deletedCount = await snapshotRepo.deleteOlderThan(90);
console.log(`已清理 ${deletedCount} 条旧记录`);
```

### 4. 监控和告警

```typescript
// 监控服务健康状态
setInterval(() => {
  const status = accountPollingService.getStatus();
  
  if (!status.isRunning) {
    sendAlert('AccountPollingService 未运行');
  }
  
  // 检查最近的快照是否太旧
  for (const exchange of status.config.exchanges) {
    const latest = await dataManager.getLatestAccountSnapshot(exchange);
    if (latest) {
      const ageMinutes = (Date.now() - latest.timestamp.getTime()) / 60000;
      if (ageMinutes > 10) {
        sendAlert(`${exchange} 数据已过时 ${ageMinutes.toFixed(0)} 分钟`);
      }
    }
  }
}, 300000); // 每5分钟检查一次
```

## 故障排查

### 问题1：轮询失败

**症状**：收到 `pollingError` 事件

**可能原因**：
- 交易所API限流
- 网络问题
- API密钥无效
- 交易所维护

**解决方案**：
1. 检查日志中的具体错误信息
2. 验证API密钥是否有效
3. 增加重试延迟
4. 减少轮询频率

### 问题2：数据未持久化

**症状**：数据库中没有新记录

**可能原因**：
- `enablePersistence` 设置为 false
- DataManager 未正确初始化
- 数据库连接问题

**解决方案**：
```typescript
// 检查配置
const config = accountPollingService.getConfig();
console.log('Persistence enabled:', config.enablePersistence);

// 手动测试保存
await dataManager.saveAccountSnapshot({
  exchange: 'test',
  timestamp: new Date(),
  // ... other fields
});
```

### 问题3：内存泄漏

**症状**：内存使用持续增长

**可能原因**：
- 事件监听器未清理
- 定时器未停止

**解决方案**：
```typescript
// 确保正确停止服务
process.on('SIGINT', async () => {
  await accountPollingService.stop();
  await dataManager.close();
  process.exit(0);
});
```

## 性能优化

### 1. 批量处理

轮询服务会并行处理多个交易所以提高效率：

```typescript
// 并行轮询所有交易所
const [balances, positions] = await Promise.all([
  exchange.getBalances(),
  exchange.getPositions()
]);
```

### 2. 数据库索引

确保数据库有适当的索引：

```sql
-- 已自动创建的索引
CREATE INDEX idx_account_snapshots_exchange_timestamp 
  ON account_snapshots(exchange, timestamp);
```

### 3. 数据压缩

使用 JSONB 存储余额和持仓数据，PostgreSQL 会自动压缩。

## 下一步

- 考虑添加 WebSocket 支持以实时推送账户变化
- 添加多用户支持，为每个用户独立轮询
- 添加更多统计维度（日收益、月收益等）
- 集成到移动应用

## 相关文档

- [Risk Manager 文档](../../risk-manager/README.md)
- [Data Manager 文档](../../data-manager/README.md)
- [Exchange Connectors 文档](../../exchange-connectors/README.md)
- [Web Dashboard 使用指南](../../../apps/web/docs/DASHBOARD.md)

