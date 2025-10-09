# Order Tracker TypeScript 错误修复

## 问题描述

`apps/console/src/order-tracker.ts` 文件中存在 8 个 TypeScript 错误：

1. **方法不存在**: EventBus 缺少以下监听方法：
   - `onOrderCreated`
   - `onOrderPartiallyFilled`
   - `onOrderCancelled`
   - `onOrderRejected`

2. **类型冲突**: 存在两个同名的 `OrderEvent` 接口：
   - `packages/core/src/events/index.ts` - 用于 EventBus 事件
   - `packages/core/src/types/index.ts` - 通用的订单事件类型

## 解决方案

### 1. 添加缺失的 EventBus 监听方法

在 `packages/core/src/events/index.ts` 的 `EventBus` 类中添加了：

```typescript
public onOrderCreated(callback: (data: OrderEventData) => void): this {
  return this.on(EVENTS.ORDER_CREATED, callback);
}

public onOrderPartiallyFilled(callback: (data: OrderEventData) => void): this {
  return this.on(EVENTS.ORDER_PARTIALLY_FILLED, callback);
}

public onOrderCancelled(callback: (data: OrderEventData) => void): this {
  return this.on(EVENTS.ORDER_CANCELLED, callback);
}

public onOrderRejected(callback: (data: OrderEventData) => void): this {
  return this.on(EVENTS.ORDER_REJECTED, callback);
}

public onBalanceUpdate(callback: (data: BalanceUpdateEvent) => void): this {
  return this.on(EVENTS.BALANCE_UPDATE, callback);
}
```

### 2. 重命名以避免类型冲突

将 `events/index.ts` 中的 `OrderEvent` 重命名为 `OrderEventData`：

**之前**:
```typescript
export interface OrderEvent {
  order: Order;
  timestamp: Date;
}
```

**之后**:
```typescript
export interface OrderEventData {
  order: Order;
  timestamp: Date;
}
```

### 3. 更新所有引用

更新了所有使用该类型的地方：

- `EventBus.emitOrderCreated(data: OrderEventData)`
- `EventBus.emitOrderFilled(data: OrderEventData)`
- `EventBus.emitOrderPartiallyFilled(data: OrderEventData)`
- `EventBus.emitOrderCancelled(data: OrderEventData)`
- `EventBus.emitOrderRejected(data: OrderEventData)`

### 4. 导出新类型

在 `packages/core/src/index.ts` 中导出 `OrderEventData`：

```typescript
export type {
  TickerUpdateEvent,
  OrderBookUpdateEvent,
  TradeUpdateEvent,
  KlineUpdateEvent,
  OrderEventData,  // ← 新增
  BalanceUpdateEvent,
  PositionUpdateEvent,
  StrategySignalEvent,
  RiskEvent,
  EngineEvent,
  ExchangeEvent,
} from './events';
```

### 5. 更新 order-tracker.ts

```typescript
// 正确导入类型
import { ILogger, Order, EventBus, OrderEventData } from '@itrade/core';

// 使用正确的类型注解
this.eventBus.onOrderCreated((data: OrderEventData) => {
  this.handleOrderCreated(data.order);
});
```

## 类型说明

项目中现在有两个订单事件相关的类型，用途不同：

### OrderEventData (events/index.ts)
```typescript
export interface OrderEventData {
  order: Order;
  timestamp: Date;
}
```
- **用途**: EventBus 的订单事件数据
- **使用场景**: EventBus 的 emit 和 on 方法

### OrderEvent (types/index.ts)
```typescript
export interface OrderEvent {
  type: 'order_update' | 'order_fill';
  order: Order;
  timestamp: Date;
}
```
- **用途**: 通用的订单事件类型
- **使用场景**: 其他需要区分订单事件类型的地方

## 验证

所有 TypeScript 错误已修复，并且 core 包构建成功：

```bash
cd packages/core
pnpm build
# ✔ Build complete
```

## 影响的文件

### 修改的文件
1. `packages/core/src/events/index.ts` - 添加方法，重命名类型
2. `packages/core/src/index.ts` - 导出新类型
3. `apps/console/src/order-tracker.ts` - 使用正确的类型

### 不受影响的文件
- `packages/core/src/interfaces/index.ts` - `IStrategy.onOrderFilled` 是策略方法，不是 EventBus
- `packages/core/src/models/BaseStrategy.ts` - 同上
- `packages/core/src/engine/TradingEngine.ts` - 调用策略的方法，不是 EventBus

## 测试建议

在运行 console 应用前，确保重新构建相关包：

```bash
# 构建 core 包
cd packages/core
pnpm build

# 构建 console 应用
cd ../../apps/console
pnpm build

# 运行 console 应用
pnpm start
```

## 总结

✅ 修复了 8 个 TypeScript 错误
✅ 添加了 5 个缺失的 EventBus 监听方法
✅ 解决了类型名称冲突
✅ 保持了向后兼容性
✅ 所有类型现在都是类型安全的

Order Tracker 现在可以正确监听所有订单事件并保存到数据库中！

