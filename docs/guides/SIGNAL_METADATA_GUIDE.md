# Signal Metadata Guide - 信号元数据使用指南

## 📋 概述

本指南介绍如何在策略中使用 `StrategyResult.metadata` 来区分不同类型的交易信号（主信号、止盈信号、止损信号等）。

## 🎯 使用场景

在交易策略中，通常需要生成两种类型的信号：

1. **主信号（Entry Signal）** - 根据市场行情产生的入场信号
2. **止盈/止损信号（Take Profit/Stop Loss Signal）** - 根据订单成交情况产生的出场信号

需要在订单创建和成交时，能够区分这些不同类型的订单，以便：

- 实现不同的处理逻辑
- 追踪订单之间的父子关系
- 计算实际盈亏

## 🔧 实现方案

### 核心机制

**clientOrderId 自动传递流程：**

```
Strategy Signal (with metadata.clientOrderId)
        ↓
TradingEngine.executeStrategySignal() 提取 metadata.clientOrderId
        ↓
TradingEngine.executeOrder(params) 接收 clientOrderId
        ↓
Exchange.createOrder(..., clientOrderId) 使用该 ID 创建订单
        ↓
Order.clientOrderId === metadata.clientOrderId ✅ 匹配成功
        ↓
Strategy.onOrderCreated(order) 可以通过 clientOrderId 关联到 metadata
```

### 1. StrategyResult 接口扩展

在 `StrategyResult` 接口中添加了 `metadata` 字段：

```typescript
export interface StrategyResult {
  action: 'buy' | 'sell' | 'hold';
  quantity?: Decimal;
  price?: Decimal;
  // ... 其他字段 ...
  
  // 🆕 信号元数据
  metadata?: {
    signalType?: 'entry' | 'take_profit' | 'stop_loss' | 'trailing_stop' | string;
    parentOrderId?: string; // 关联父订单（用于 TP/SL）
    [key: string]: any; // 可扩展的自定义字段
  };
}
```

### 2. 策略实现示例

以 `MovingWindowGridsStrategy` 为例：

#### 2.1 添加状态跟踪

```typescript
export class MovingWindowGridsStrategy extends BaseStrategy<MovingWindowGridsParameters> {
  // 订单元数据映射：clientOrderId -> metadata
  private orderMetadataMap: Map<string, any> = new Map();
  
  // 待处理的止盈订单队列
  private pendingTakeProfitOrders: Map<string, Order> = new Map();
  
  // 止盈订单追踪
  private takeProfitOrders: Map<string, Order> = new Map();
  
  // 订单序列号
  private orderSequence: number = 0;
  
  // ...
}
```

#### 2.2 生成主信号（入场信号）

```typescript
/**
 * 生成主信号 - 根据市场行情产生
 */
private generateEntrySignal(price: Decimal, quantity: Decimal): StrategyResult {
  const clientOrderId = this.generateClientOrderId('entry');
  const metadata = {
    signalType: 'entry',
    reason: 'volatility_breakout',
    timestamp: Date.now(),
    clientOrderId, // 预存用于后续关联
  };

  // 保存 metadata 映射
  this.orderMetadataMap.set(clientOrderId, metadata);

  this._logger.info(`🎯 [Entry Signal Generated] clientOrderId: ${clientOrderId}`);

  return {
    action: 'buy',
    price,
    quantity,
    leverage: 10,
    tradeMode: 'isolated',
    reason: 'volatility_breakout',
    metadata, // ✅ 关键：附加元数据
  };
}
```

#### 2.3 生成止盈信号

```typescript
/**
 * 生成止盈信号 - 根据订单成交情况产生
 */
private generateTakeProfitSignal(parentOrder: Order): StrategyResult {
  const clientOrderId = this.generateClientOrderId('tp');
  
  // 计算止盈价格
  const entryPrice = parentOrder.averagePrice || parentOrder.price!;
  const takeProfitPrice = entryPrice.mul(1 + this.takeProfitRatio);

  const metadata = {
    signalType: 'take_profit',
    parentOrderId: parentOrder.clientOrderId, // ✅ 关联父订单
    entryPrice: entryPrice.toString(),
    takeProfitPrice: takeProfitPrice.toString(),
    profitRatio: this.takeProfitRatio,
    timestamp: Date.now(),
    clientOrderId,
  };

  // 保存 metadata 映射
  this.orderMetadataMap.set(clientOrderId, metadata);

  this._logger.info(`💰 [Take Profit Signal Generated] clientOrderId: ${clientOrderId}`);
  this._logger.info(`   Parent Order: ${parentOrder.clientOrderId}`);

  return {
    action: 'sell',
    price: takeProfitPrice,
    quantity: parentOrder.executedQuantity || parentOrder.quantity,
    reason: 'take_profit',
    metadata, // ✅ 关键：附加元数据
  };
}
```

#### 2.4 在 analyze 方法中处理

```typescript
public override async analyze(data: DataUpdate): Promise<StrategyResult> {
  this.ensureInitialized();

  // 🆕 优先处理待生成的止盈订单
  if (this.pendingTakeProfitOrders.size > 0) {
    const nextEntry = this.pendingTakeProfitOrders.entries().next();
    if (!nextEntry.done && nextEntry.value) {
      const [orderId, parentOrder] = nextEntry.value;
      this.pendingTakeProfitOrders.delete(orderId);
      
      return this.generateTakeProfitSignal(parentOrder);
    }
  }

  // ... 正常的市场分析逻辑
  if (shouldGenerateEntrySignal) {
    return this.generateEntrySignal(price, quantity);
  }

  return { action: 'hold' };
}
```

#### 2.5 在 onOrderCreated 中区分订单类型

```typescript
public override async onOrderCreated(order: Order): Promise<void> {
  if (!order.clientOrderId) {
    return;
  }

  const metadata = this.orderMetadataMap.get(order.clientOrderId);
  
  if (!metadata) {
    this._logger.warn(`⚠️ [Order Created] No metadata found`);
    return;
  }

  const signalType = metadata.signalType;

  if (signalType === 'entry') {
    // ✅ 处理主订单创建
    this._logger.info(`🎯 [Entry Order Created]`);
    this._logger.info(`   Client Order ID: ${order.clientOrderId}`);
    this._logger.info(`   Price: ${order.price?.toString()}`);
    
    this.orders.set(order.clientOrderId, order);
    
  } else if (signalType === 'take_profit') {
    // ✅ 处理止盈订单创建
    this._logger.info(`💰 [Take Profit Order Created]`);
    this._logger.info(`   Parent Order: ${metadata.parentOrderId}`);
    this._logger.info(`   Entry Price: ${metadata.entryPrice}`);
    this._logger.info(`   TP Price: ${order.price?.toString()}`);
    
    this.takeProfitOrders.set(order.clientOrderId, order);
    this.orders.set(order.clientOrderId, order);
  }
}
```

#### 2.6 在 onOrderFilled 中触发止盈订单

```typescript
public override async onOrderFilled(order: Order): Promise<void> {
  if (!order.clientOrderId || !this.orders.has(order.clientOrderId)) {
    return;
  }

  const metadata = this.orderMetadataMap.get(order.clientOrderId);
  if (!metadata) {
    return;
  }

  const signalType = metadata.signalType;

  if (signalType === 'entry') {
    // ✅ 主订单成交，触发止盈订单创建
    this._logger.info(`✅ [Entry Order Filled]`);
    this._logger.info(`   Average Price: ${order.averagePrice?.toString()}`);
    this._logger.info(`   💡 Scheduling take profit order...`);
    
    // 加入待处理队列，下次 analyze 时会生成止盈信号
    this.pendingTakeProfitOrders.set(order.clientOrderId, order);
    
  } else if (signalType === 'take_profit') {
    // ✅ 止盈订单成交，计算盈利
    this._logger.info(`💰 [Take Profit Order Filled]`);
    
    const entryPrice = new Decimal(metadata.entryPrice);
    const exitPrice = order.averagePrice || order.price!;
    const profit = exitPrice.minus(entryPrice).mul(order.executedQuantity || order.quantity);
    const profitPercent = exitPrice.minus(entryPrice).dividedBy(entryPrice).mul(100);
    
    this._logger.info(`   💵 Realized Profit: ${profit.toString()} (+${profitPercent.toFixed(2)}%)`);
    
    // 清理订单和元数据
    this.takeProfitOrders.delete(order.clientOrderId);
    this.orders.delete(metadata.parentOrderId);
    this.orderMetadataMap.delete(order.clientOrderId);
    this.orderMetadataMap.delete(metadata.parentOrderId);
  }
}
```

## 🔗 clientOrderId 自动传递机制

### TradingEngine 的自动处理

**关键修改：**

1. **ExecuteOrderParameters 接口扩展**
   ```typescript
   export interface ExecuteOrderParameters {
     // ... 其他字段
     clientOrderId?: string; // 🆕 从信号 metadata 传递
   }
   ```

2. **executeStrategySignal 自动提取**
   ```typescript
   // TradingEngine 内部实现
   private async executeStrategySignal(signal: StrategyResult) {
     // 🔥 自动从 metadata 中提取 clientOrderId
     const clientOrderId = signal.metadata?.clientOrderId;
     
     await this.executeOrder({
       // ... 其他参数
       clientOrderId, // 传递给 executeOrder
     });
   }
   ```

3. **executeOrder 优先使用提供的 ID**
   ```typescript
   // TradingEngine 内部实现
   public async executeOrder(params: ExecuteOrderParameters) {
     // 如果信号提供了 clientOrderId，使用它；否则自动生成
     const clientOrderId = params.clientOrderId || generateClientOrderId();
     
     // 创建订单时使用该 ID
     const order = await exchange.createOrder(..., clientOrderId);
     
     return order; // order.clientOrderId === params.clientOrderId ✅
   }
   ```

### 为什么需要这个机制？

**问题：** 如果策略生成的 `metadata.clientOrderId` 和最终订单的 `order.clientOrderId` 不一致，就无法关联。

**解决：** TradingEngine 现在会：
- ✅ 自动从 `signal.metadata.clientOrderId` 提取
- ✅ 传递给交易所创建订单
- ✅ 确保 `order.clientOrderId` 和策略的 `metadata` 中的 ID 一致

**结果：** 策略可以通过 `clientOrderId` 精确匹配订单和元数据！

## 📊 工作流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    Strategy Workflow                            │
└─────────────────────────────────────────────────────────────────┘

1. 市场分析 (analyze)
   ↓
   检测到入场机会
   ↓
2. 生成主信号 (generateEntrySignal)
   ├─ 创建 metadata { signalType: 'entry' }
   ├─ 保存到 orderMetadataMap
   └─ 返回 StrategyResult with metadata
   ↓
3. TradingEngine 执行订单
   ↓
4. 订单创建回调 (onOrderCreated)
   ├─ 读取 metadata
   ├─ 识别为 'entry' 类型
   └─ 保存到主订单列表
   ↓
5. 订单成交回调 (onOrderFilled)
   ├─ 读取 metadata
   ├─ 识别为 'entry' 类型
   └─ 加入 pendingTakeProfitOrders 队列
   ↓
6. 下次 analyze 调用
   ↓
   发现 pendingTakeProfitOrders 有待处理订单
   ↓
7. 生成止盈信号 (generateTakeProfitSignal)
   ├─ 创建 metadata { signalType: 'take_profit', parentOrderId }
   ├─ 保存到 orderMetadataMap
   └─ 返回 StrategyResult with metadata
   ↓
8. TradingEngine 执行止盈订单
   ↓
9. 止盈订单创建 (onOrderCreated)
   ├─ 读取 metadata
   ├─ 识别为 'take_profit' 类型
   └─ 保存到止盈订单列表
   ↓
10. 止盈订单成交 (onOrderFilled)
    ├─ 读取 metadata
    ├─ 识别为 'take_profit' 类型
    ├─ 计算实际盈利
    └─ 清理相关订单和元数据
```

## 🎨 扩展示例

### 添加止损信号

```typescript
private generateStopLossSignal(parentOrder: Order): StrategyResult {
  const clientOrderId = this.generateClientOrderId('sl');
  
  const entryPrice = parentOrder.averagePrice || parentOrder.price!;
  const stopLossPrice = entryPrice.mul(1 - this.stopLossRatio);

  const metadata = {
    signalType: 'stop_loss',
    parentOrderId: parentOrder.clientOrderId,
    entryPrice: entryPrice.toString(),
    stopLossPrice: stopLossPrice.toString(),
    stopLossRatio: this.stopLossRatio,
    timestamp: Date.now(),
    clientOrderId,
  };

  this.orderMetadataMap.set(clientOrderId, metadata);

  return {
    action: 'sell',
    price: stopLossPrice,
    quantity: parentOrder.executedQuantity || parentOrder.quantity,
    reason: 'stop_loss',
    metadata,
  };
}
```

### 添加自定义字段

```typescript
const metadata = {
  signalType: 'entry',
  // 自定义字段
  strategyVersion: '2.0',
  confidence: 0.85,
  technicalIndicators: {
    rsi: 65,
    macd: 'bullish',
    volume: 'high',
  },
  riskLevel: 'medium',
  expectedProfit: 0.05,
  maxDrawdown: 0.02,
  // ... 任何你需要的数据
};
```

## ✅ 最佳实践

1. **始终保存 clientOrderId**

   ```typescript
   const metadata = {
     signalType: 'entry',
     clientOrderId, // ✅ 便于后续关联
     // ...
   };
   ```

2. **使用唯一的 clientOrderId 生成器**

   ```typescript
   private generateClientOrderId(type: string): string {
     this.orderSequence++;
     return `${this.getStrategyId()}_${type}_${Date.now()}_${this.orderSequence}`;
   }
   ```

3. **及时清理 metadata**

   ```typescript
   // 订单完成后清理
   this.orderMetadataMap.delete(order.clientOrderId);
   this.orderMetadataMap.delete(metadata.parentOrderId);
   ```

4. **添加详细的日志**

   ```typescript
   this._logger.info(`🎯 [Entry Signal Generated]`);
   this._logger.info(`   Metadata:`, JSON.stringify(metadata, null, 2));
   ```

5. **处理边界情况**

   ```typescript
   if (!order.clientOrderId) {
     this._logger.warn('Order has no clientOrderId, skipping');
     return;
   }
   
   const metadata = this.orderMetadataMap.get(order.clientOrderId);
   if (!metadata) {
     this._logger.warn('No metadata found for order');
     return;
   }
   ```

## 📚 相关文档

- [Strategy Development Guide](./STRATEGY_DEVELOPMENT_GUIDE.md)
- [Strategy Management Guide](./STRATEGY_MANAGEMENT_GUIDE.md)
- [Order Lifecycle Documentation](../development/ORDER_LIFECYCLE.md)

---

Author: <xiaoweihsueh@gmail.com>  
Date: October 27, 2025
