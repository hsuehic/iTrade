# 🔄 策略状态恢复 - 使用指南

## 🎯 概述

这个功能解决了你提出的关键问题：**当应用重启或崩溃时，如何保持策略的运行状态和订单状态**。

## 📊 解决的问题

### ❌ 重启前的问题
```
应用崩溃 → 策略状态丢失 → 不知道：
- 哪些订单是open的？
- 当前持仓是多少？
- 策略内部指标数据丢失
- 不知道上一个信号是什么
```

### ✅ 重启后的效果
```
应用重启 → 自动恢复 → 知道：
- ✅ 所有未完成订单状态
- ✅ 当前精确持仓
- ✅ 技术指标历史数据
- ✅ 策略决策状态
- ✅ 与交易所数据同步
```

## 🚀 快速开始

### 1. 在Console应用中启用

```typescript
// apps/console/src/main.ts
import { StrategyStateManager } from '@itrade/core';

async function main() {
  // ... 现有代码

  // 创建状态管理器
  const stateManager = new StrategyStateManager(
    dataManager,           // 数据管理器
    logger,               // 日志器
    {
      autosaveInterval: 30000,    // 30秒自动保存
      maxRecoveryTime: 60000,     // 60秒最大恢复时间
    }
  );

  // 创建增强的策略管理器
  const strategyManager = new EnhancedStrategyManager(
    engine,
    dataManager,
    exchanges,          // 交易所映射
    stateManager,       // 状态管理器
    logger
  );

  // 启动时自动恢复所有策略
  await strategyManager.start();
}
```

### 2. 策略自动状态保存

```typescript
// 策略运行时自动保存状态
export class MovingAverageStrategy extends BaseStrategy {
  private priceHistory: Decimal[] = [];
  private fastMA?: Decimal;
  private slowMA?: Decimal;

  // ✅ 每次分析后自动保存状态
  public async analyze(marketData: MarketData): Promise<StrategyResult> {
    // 更新指标
    this.updateIndicators(marketData);
    
    // 生成交易信号
    const signal = this.generateSignal();
    
    // 🔥 关键：自动保存策略状态
    await this.saveState({
      internalState: {
        priceCount: this.priceHistory.length,
        lastPrice: marketData.ticker?.price.toString(),
      },
      indicatorData: {
        priceHistory: this.priceHistory.map(p => p.toString()),
        fastMA: this.fastMA?.toString(),
        slowMA: this.slowMA?.toString(),
      },
      lastSignal: signal.action,
      signalTime: new Date(),
      currentPosition: this.getCurrentPosition().toString(),
      averagePrice: this.getAveragePrice()?.toString(),
    });

    return signal;
  }

  // ✅ 启动时自动恢复状态
  protected async onInitialize(): Promise<void> {
    const recovery = await this.recoverState();
    
    if (recovery.success && recovery.recoveredState) {
      // 恢复技术指标数据
      const { indicatorData } = recovery.recoveredState;
      
      if (indicatorData.priceHistory) {
        this.priceHistory = (indicatorData.priceHistory as string[])
          .map(p => new Decimal(p));
      }
      
      if (indicatorData.fastMA) {
        this.fastMA = new Decimal(indicatorData.fastMA as string);
      }
      
      if (indicatorData.slowMA) {
        this.slowMA = new Decimal(indicatorData.slowMA as string);
      }

      this.logger.info(`📊 Strategy state recovered:`, {
        pricePoints: this.priceHistory.length,
        position: recovery.totalPosition,
        openOrders: recovery.openOrders.length,
      });
    }
  }
}
```

## 🔧 实际使用场景

### 场景1: 正常重启恢复

```bash
# 停止服务
pm2 stop iTrade-console

# 启动服务 - 自动恢复所有策略状态
pm2 start iTrade-console
```

**日志输出**:
```
🔄 Starting recovery for strategy 1...
📊 Strategy MovingAverage recovered:
   - Position: 0.5 BTC
   - Open orders: 2
   - Price history: 120 points  
   - Recovery time: 1.2s
✅ Strategy 1 fully operational
```

### 场景2: 异常崩溃恢复

```bash
# 应用意外崩溃，重启后：
[2025-01-10 10:30:15] 🔄 Detecting unplanned restart...
[2025-01-10 10:30:16] 📊 Recovering 3 active strategies...
[2025-01-10 10:30:17] ⚠️  Strategy 2 has sync issues:
   - Order ABC123 status mismatch (DB: NEW, Exchange: FILLED)
   - Auto-fixing: NEW → FILLED
[2025-01-10 10:30:18] ✅ All strategies recovered successfully
```

### 场景3: 数据一致性问题

```bash
# 发现数据不一致时：
[2025-01-10 10:30:20] ⚠️  Strategy 3 data inconsistency detected:
   - DB Position: 1.0 BTC
   - Exchange Position: 0.8 BTC  
   - Recommending manual review
[2025-01-10 10:30:21] 📧 Alert sent to admin
```

## 📈 监控和告警

### 状态恢复监控面板

```typescript
// 获取恢复统计
const stats = stateManager.getRecoveryStats();

console.log('📊 Recovery Statistics:', {
  inProgress: stats.inProgress,           // 正在恢复的策略数
  cacheSize: stats.cacheSize,            // 缓存的策略数
  lastAutosave: stats.lastAutosave,      // 最后自动保存时间
});

// 监听恢复事件
stateManager.on('recoveryCompleted', (result) => {
  if (result.issues.length > 0) {
    console.warn(`⚠️ Strategy ${result.strategyId} has ${result.issues.length} issues`);
    // 发送告警到监控系统
    alertingSystem.send('strategy_recovery_issues', result);
  }
});
```

### 设置告警规则

```typescript
// 设置自动告警
stateManager.on('recoveryFailed', ({ strategyId, error }) => {
  // 策略恢复失败 - 紧急告警
  alertingSystem.sendCritical('strategy_recovery_failed', {
    strategyId,
    error: error.message,
    time: new Date(),
  });
});

stateManager.on('dataInconsistency', ({ strategyId, details }) => {
  // 数据不一致 - 警告告警  
  alertingSystem.sendWarning('data_inconsistency', {
    strategyId,
    details,
    time: new Date(),
  });
});
```

## 🎯 最佳实践

### 1. 定期状态验证
```typescript
// 每小时验证一次策略状态一致性
setInterval(async () => {
  for (const strategyId of activeStrategies) {
    const result = await stateManager.recoverStrategyState(strategyId);
    if (result.issues.length > 0) {
      logger.warn(`Strategy ${strategyId} consistency check failed`, result.issues);
    }
  }
}, 60 * 60 * 1000); // 1小时
```

### 2. 优雅关闭
```typescript
// 应用关闭时保存所有状态
process.on('SIGTERM', async () => {
  logger.info('🔄 Graceful shutdown initiated...');
  
  // 保存所有策略状态
  await stateManager.shutdown();
  
  // 保存最终订单状态
  await orderSyncService.finalSync();
  
  logger.info('✅ Graceful shutdown complete');
  process.exit(0);
});
```

### 3. 手动干预接口
```typescript
// 提供手动修复接口
app.post('/api/admin/strategy/:id/fix-state', async (req, res) => {
  const { id } = req.params;
  const { manualPosition, manualOrders } = req.body;
  
  // 管理员手动修正策略状态
  await stateManager.fixStrategyState(parseInt(id), {
    position: manualPosition,
    orders: manualOrders,
    reason: 'Manual admin correction',
    operator: req.user.id,
  });
  
  res.json({ success: true });
});
```

## 🔬 测试策略恢复

### 测试脚本
```bash
#!/bin/bash
# test-recovery.sh

echo "🧪 Testing strategy state recovery..."

# 1. 启动策略
echo "Starting strategy..."
curl -X POST http://localhost:3000/api/strategies -d '{
  "name": "Test Strategy",
  "type": "moving_average",
  "exchange": "binance",
  "symbol": "BTC/USDT"
}'

# 2. 等待策略运行一段时间
echo "Waiting for strategy to accumulate state..."
sleep 30

# 3. 模拟崩溃（强制结束进程）
echo "Simulating crash..."
pkill -9 iTrade-console

# 4. 重启应用
echo "Restarting application..."
pm2 start iTrade-console

# 5. 验证恢复
echo "Verifying recovery..."
sleep 10
curl http://localhost:3000/api/strategies/1/state

echo "✅ Recovery test complete"
```

## 🚨 故障排查

### 常见问题解决

#### Q: 策略恢复失败
```bash
# 检查数据库连接
curl http://localhost:3000/api/health/database

# 查看恢复日志
tail -f logs/strategy-recovery.log

# 手动触发恢复
curl -X POST http://localhost:3000/api/admin/strategy/1/recover
```

#### Q: 订单状态不一致
```bash
# 强制与交易所同步
curl -X POST http://localhost:3000/api/admin/orders/sync-all

# 检查交易所连接
curl http://localhost:3000/api/health/exchanges

# 查看订单同步日志
tail -f logs/order-sync.log
```

#### Q: 持仓计算错误
```bash
# 重新计算持仓
curl -X POST http://localhost:3000/api/admin/strategy/1/recalculate-position

# 与交易所持仓对比
curl http://localhost:3000/api/admin/strategy/1/compare-position
```

## 🎉 总结

现在你的系统具备了完整的状态恢复能力：

- ✅ **策略状态持久化**：技术指标、决策状态自动保存
- ✅ **订单状态同步**：与交易所实时同步，确保数据一致性
- ✅ **智能恢复机制**：应用重启时自动恢复完整状态
- ✅ **数据一致性验证**：自动检测和修复不一致数据
- ✅ **监控和告警**：及时发现和处理状态问题
- ✅ **优雅降级**：部分恢复失败时的容错机制

这样，无论是正常重启还是意外崩溃，策略都能完整恢复运行状态，确保交易系统的稳定性和连续性！🚀
