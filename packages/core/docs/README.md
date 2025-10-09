# Core 包文档

iTrade Core - 核心交易引擎和基础设施

## 📚 文档索引

### OrderSyncService (订单状态同步服务)

**核心文档**：
- **[机制详解](./ORDER_SYNC_MECHANISM.md)** - 完整的技术设计和架构
- **[实现文档](./ORDER_SYNC_IMPLEMENTATION.md)** - 实现细节和使用指南
- **[快速参考](./ORDER_SYNC_SUMMARY.md)** - 快速查阅手册
- **[重构说明](./ORDER_SYNC_REFACTORING.md)** - 从应用层移到核心层的重构

**快速开始**：
```typescript
import { OrderSyncService } from '@itrade/core';

const service = new OrderSyncService(exchanges, dataManager, {
  syncInterval: 5000,
  batchSize: 5,
});

service.on('info', (msg) => logger.info(msg));
await service.start();
```

## 🏗️ Core 包架构

### 主要组件

1. **TradingEngine** - 交易引擎
   - 策略管理
   - 订单执行
   - 市场数据处理

2. **OrderManager** - 订单管理器
   - 订单状态追踪
   - 订单索引
   - 订单统计

3. **OrderSyncService** - 订单状态同步
   - 定时轮询
   - 状态比对
   - 事件触发

4. **EventBus** - 事件总线
   - 组件间通信
   - 事件分发
   - 监听管理

5. **BaseStrategy** - 策略基类
   - 策略接口
   - 生命周期管理
   - 市场数据订阅

### 类型系统

- `Order` - 订单类型
- `OrderStatus` - 订单状态
- `Ticker`, `OrderBook`, `Kline` - 市场数据类型
- `StrategyParameters` - 策略参数
- `SubscriptionConfig` - 订阅配置

## 🔌 接口

### IExchange
交易所接口，定义了与交易所交互的标准方法。

### IStrategy
策略接口，所有策略必须实现。

### IOrderDataManager
数据管理器接口，用于解耦数据库实现。

## 📖 使用示例

### 基本用法

```typescript
import { TradingEngine, OrderSyncService } from '@itrade/core';

// 创建引擎
const engine = new TradingEngine(riskManager, portfolioManager, logger);

// 添加交易所
engine.addExchange('binance', binanceExchange);

// 添加策略
engine.addStrategy('my-strategy', myStrategy);

// 启动引擎
await engine.start();

// 启动订单同步（可选但推荐）
const orderSync = new OrderSyncService(exchanges, dataManager);
await orderSync.start();
```

### 高级用法

查看各个文档了解更多：
- [订单同步机制](./ORDER_SYNC_MECHANISM.md)
- [订单同步实现](./ORDER_SYNC_IMPLEMENTATION.md)

## 🧪 测试

```bash
cd packages/core
pnpm test
```

## 🔗 相关文档

- [项目文档中心](../../../docs/README.md)
- [Console 应用文档](../../../apps/console/docs/README.md)
- [开发文档](../../../docs/development/)

---

**需要帮助？** 查看[项目快速启动](../../../docs/guides/PROJECT_QUICK_START.md)

