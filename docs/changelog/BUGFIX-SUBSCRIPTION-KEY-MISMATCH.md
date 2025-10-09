# Bug 修复：订阅键不匹配导致无法正确取消订阅

## 问题描述

在自动订阅管理功能中发现了一个 bug：当删除一个 strategy 时，无法正确取消共享的订阅，因为 subscribe 和 unsubscribe 使用的订阅键不匹配。

## Bug 详情

### 原因分析

**订阅时（subscribeData）**：
```typescript
const key: SubscriptionKey = {
  exchange: exchange.name,
  symbol,
  type,
  params: normalizedConfig,  // ✅ 包含 params
};
```

**取消订阅时（unsubscribeData）**：
```typescript
const key: SubscriptionKey = {
  exchange: exchange.name,
  symbol,
  type,
  // ❌ 缺少 params！
};
```

由于 `SubscriptionManager.getSubscriptionId()` 使用 params 生成唯一 ID：
```typescript
private getSubscriptionId(key: SubscriptionKey): string {
  const parts = [key.exchange, key.symbol, key.type];
  
  if (key.params) {
    const paramsStr = JSON.stringify(key.params);
    parts.push(paramsStr);  // params 影响 ID 生成
  }
  
  return parts.join(':');
}
```

**结果**：
- 订阅 ID: `"binance:BTC/USDT:ticker:{...config}"`
- 取消订阅 ID: `"binance:BTC/USDT:ticker"` ❌

两者不匹配，导致：
1. 找不到对应的订阅
2. 引用计数无法正确递减
3. 订阅永远不会被取消
4. 定时器泄漏

## 影响范围

### 受影响的场景

1. **多策略共享订阅**
   ```typescript
   // 两个策略共享同一订阅
   await engine.addStrategy('strategy-1', strategyA);
   await engine.addStrategy('strategy-2', strategyB);
   
   // ❌ Bug: 删除 strategy-1 时，找不到订阅
   await engine.removeStrategy('strategy-1');
   
   // ❌ Bug: 删除 strategy-2 时，订阅仍然存在
   await engine.removeStrategy('strategy-2');
   
   // 结果：定时器泄漏，订阅永不清理
   ```

2. **资源泄漏**
   ```typescript
   // 添加和删除策略多次
   for (let i = 0; i < 100; i++) {
     await engine.addStrategy(`strategy-${i}`, strategy);
     await engine.removeStrategy(`strategy-${i}`);
   }
   
   // ❌ Bug: 100 个定时器仍在运行
   ```

## 修复方案

### 修复内容

1. **unsubscribeStrategyData 方法**
   - 传递完整的配置到 `unsubscribeData`

2. **unsubscribeData 方法**
   - 接收 `config` 参数
   - 使用 `normalizeDataConfig` 生成与订阅时相同的配置
   - 生成包含 params 的完整 key

### 修复后的代码

```typescript
/**
 * Auto-unsubscribe strategy data
 */
private async unsubscribeStrategyData(strategyName: string): Promise<void> {
  const strategy = this._strategies.get(strategyName);
  if (!strategy || !strategy.parameters.subscription) {
    return;
  }

  const config = strategy.parameters.subscription;
  const symbol = strategy.parameters.symbol;
  if (!symbol) return;

  const exchanges = this.getTargetExchanges(config.exchange);

  for (const exchange of exchanges) {
    // ✅ 传递配置
    if (config.ticker) {
      await this.unsubscribeData(
        strategyName,
        exchange,
        symbol,
        'ticker',
        config.ticker  // ✅ 传递完整配置
      );
    }
    // ... 其他数据类型
  }
}

/**
 * Unsubscribe from specific data type
 */
private async unsubscribeData(
  strategyName: string,
  exchange: IExchange,
  symbol: string,
  type: DataType,
  config: any  // ✅ 新增参数
): Promise<void> {
  // ✅ 标准化配置，与订阅时保持一致
  const normalizedConfig = this.normalizeDataConfig(type, config);
  
  const key: SubscriptionKey = {
    exchange: exchange.name,
    symbol,
    type,
    params: normalizedConfig,  // ✅ 包含 params
  };

  const result = this.subscriptionManager.unsubscribe(strategyName, key);

  if (result.shouldCancel) {
    // ✅ 真正取消订阅
    if (result.timerId) {
      clearInterval(result.timerId);
    }
    this.logger.info(
      `Cancelled subscription: ${exchange.name} ${symbol} ${type}`
    );
  } else {
    // ✅ 保留订阅（其他策略还在使用）
    this.logger.debug(
      `Kept subscription (still used by other strategies): ${exchange.name} ${symbol} ${type}`
    );
  }
}
```

## 验证测试

### 测试用例 1：多策略共享订阅

```typescript
import { TradingEngine } from '@itrade/core';
import { MovingAverageStrategy } from '@itrade/strategies';

async function testSharedSubscription() {
  const engine = new TradingEngine(riskManager, portfolioManager, logger);
  engine.addExchange('binance', binance);

  // 创建两个使用相同订阅的策略
  const strategy1 = new MovingAverageStrategy({
    symbol: 'BTC/USDT',
    subscription: { ticker: true }
  });

  const strategy2 = new MovingAverageStrategy({
    symbol: 'BTC/USDT',
    subscription: { ticker: true }
  });

  // 添加策略
  await engine.addStrategy('strategy-1', strategy1);
  let stats = engine.getSubscriptionStats();
  console.log('After adding strategy-1:', stats);
  // ✅ 期望: { total: 1, byType: { ticker: 1 } }

  await engine.addStrategy('strategy-2', strategy2);
  stats = engine.getSubscriptionStats();
  console.log('After adding strategy-2:', stats);
  // ✅ 期望: { total: 1, byType: { ticker: 1 } } (共享订阅)

  // 启动引擎
  await engine.start();

  // 删除第一个策略
  await engine.removeStrategy('strategy-1');
  stats = engine.getSubscriptionStats();
  console.log('After removing strategy-1:', stats);
  // ✅ 期望: { total: 1, byType: { ticker: 1 } } (保留订阅)

  // 删除第二个策略
  await engine.removeStrategy('strategy-2');
  stats = engine.getSubscriptionStats();
  console.log('After removing strategy-2:', stats);
  // ✅ 期望: { total: 0, byType: {} } (取消订阅)

  await engine.stop();
}
```

### 测试用例 2：资源清理验证

```typescript
async function testResourceCleanup() {
  const engine = new TradingEngine(riskManager, portfolioManager, logger);
  engine.addExchange('binance', binance);

  await engine.start();

  // 添加和删除策略多次
  for (let i = 0; i < 10; i++) {
    const strategy = new MovingAverageStrategy({
      symbol: 'BTC/USDT',
      subscription: {
        ticker: {
          enabled: true,
          interval: 1000
        },
        method: 'rest'
      }
    });

    await engine.addStrategy(`strategy-${i}`, strategy);
    await engine.removeStrategy(`strategy-${i}`);
  }

  const stats = engine.getSubscriptionStats();
  console.log('Final stats:', stats);
  // ✅ 期望: { total: 0 } (所有订阅都已清理)

  await engine.stop();
}
```

### 测试用例 3：日志验证

```typescript
async function testLogging() {
  const engine = new TradingEngine(riskManager, portfolioManager, logger);
  engine.addExchange('binance', binance);

  const strategy1 = new MovingAverageStrategy({
    symbol: 'BTC/USDT',
    subscription: { ticker: true }
  });

  const strategy2 = new MovingAverageStrategy({
    symbol: 'BTC/USDT',
    subscription: { ticker: true }
  });

  await engine.addStrategy('strategy-1', strategy1);
  // 日志: "Created new subscription: binance:BTC/USDT:ticker:{...}"

  await engine.addStrategy('strategy-2', strategy2);
  // 日志: "Strategy strategy-2 reusing subscription: ... (refCount: 2)"

  await engine.start();

  await engine.removeStrategy('strategy-1');
  // 日志: "Strategy strategy-1 unsubscribed from: ... (refCount: 1)"
  // 日志: "Kept subscription (still used by other strategies): ..."

  await engine.removeStrategy('strategy-2');
  // 日志: "Strategy strategy-2 unsubscribed from: ... (refCount: 0)"
  // 日志: "Cancelled subscription: binance BTC/USDT ticker"

  await engine.stop();
}
```

## 引用计数机制说明

### 工作原理

`SubscriptionManager` 使用引用计数来管理共享订阅：

```typescript
interface SubscriptionInfo {
  key: SubscriptionKey;
  refCount: number;           // ✅ 引用计数
  strategies: Set<string>;    // ✅ 使用此订阅的策略列表
  timerId?: NodeJS.Timeout;
  method: 'websocket' | 'rest';
}
```

### 订阅流程

1. **第一个策略订阅**
   ```typescript
   subscriptionManager.subscribe('strategy-1', key, 'rest', timerId);
   // refCount: 1
   // strategies: ['strategy-1']
   ```

2. **第二个策略订阅（共享）**
   ```typescript
   subscriptionManager.subscribe('strategy-2', key, 'rest');
   // refCount: 2
   // strategies: ['strategy-1', 'strategy-2']
   // timerId 不变（复用）
   ```

3. **第一个策略取消订阅**
   ```typescript
   const result = subscriptionManager.unsubscribe('strategy-1', key);
   // refCount: 1
   // strategies: ['strategy-2']
   // result.shouldCancel: false ✅ 不取消
   ```

4. **第二个策略取消订阅**
   ```typescript
   const result = subscriptionManager.unsubscribe('strategy-2', key);
   // refCount: 0
   // strategies: []
   // result.shouldCancel: true ✅ 取消订阅
   // result.timerId: <定时器> ✅ 返回定时器以便清理
   ```

### 关键代码

```typescript
public unsubscribe(
  strategyName: string,
  key: SubscriptionKey
): { shouldCancel: boolean; timerId?: NodeJS.Timeout } {
  const subscriptionId = this.getSubscriptionId(key);
  const subscription = this.subscriptions.get(subscriptionId);

  if (!subscription) {
    // ❌ Bug 修复前：key 不匹配，经常进入这里
    // ✅ Bug 修复后：key 匹配，正确找到订阅
    return { shouldCancel: false };
  }

  // 从订阅中删除策略
  subscription.strategies.delete(strategyName);
  subscription.refCount--;

  // ✅ 只有当 refCount === 0 时才取消订阅
  if (subscription.refCount === 0) {
    this.subscriptions.delete(subscriptionId);
    return { shouldCancel: true, timerId: subscription.timerId };
  }

  // ✅ 还有其他策略在使用，保留订阅
  return { shouldCancel: false };
}
```

## 影响和收益

### Bug 修复前 ❌

```
添加 strategy-1  →  创建订阅（ID: "binance:BTC/USDT:ticker:{...}"）
添加 strategy-2  →  找到订阅，refCount: 2 ✅
删除 strategy-1  →  查找订阅（ID: "binance:BTC/USDT:ticker"）❌ 找不到
                   →  订阅保留，refCount: 2 ❌
删除 strategy-2  →  查找订阅（ID: "binance:BTC/USDT:ticker"）❌ 找不到
                   →  订阅保留，refCount: 2 ❌
                   →  定时器永远运行 ❌
                   →  内存泄漏 ❌
```

### Bug 修复后 ✅

```
添加 strategy-1  →  创建订阅（ID: "binance:BTC/USDT:ticker:{...}"）
添加 strategy-2  →  找到订阅，refCount: 2 ✅
删除 strategy-1  →  查找订阅（ID: "binance:BTC/USDT:ticker:{...}"）✅ 找到
                   →  refCount: 1 ✅
                   →  保留订阅（strategy-2 还在使用）✅
删除 strategy-2  →  查找订阅（ID: "binance:BTC/USDT:ticker:{...}"）✅ 找到
                   →  refCount: 0 ✅
                   →  取消订阅 ✅
                   →  清理定时器 ✅
                   →  无内存泄漏 ✅
```

## 相关文件

- `packages/core/src/engine/TradingEngine.ts`
  - `unsubscribeStrategyData()` - 修复：传递完整配置
  - `unsubscribeData()` - 修复：接收并使用配置生成完整 key

- `packages/core/src/engine/SubscriptionManager.ts`
  - `unsubscribe()` - 引用计数逻辑（无需修改）
  - `getSubscriptionId()` - ID 生成逻辑（无需修改）

## 总结

这个 bug 是一个经典的"键不匹配"问题：

✅ **Bug 本质**：订阅和取消订阅使用不同的键  
✅ **修复方法**：确保键的生成逻辑一致  
✅ **副作用**：无，完全向后兼容  
✅ **测试**：编译通过，逻辑正确  
✅ **影响**：修复了资源泄漏和引用计数失效  

感谢用户发现这个问题！🎉

---

**Bug ID**: SUB-001  
**严重程度**: 高（资源泄漏）  
**状态**: ✅ 已修复  
**版本**: 1.3.1  
**日期**: 2025-10-09

