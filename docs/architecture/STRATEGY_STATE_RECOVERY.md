# 🔄 策略状态恢复与订单管理机制

## 📋 问题分析

你提出的问题触及了交易系统的核心：**如何在应用重启或崩溃后恢复策略的完整状态**。这涉及到几个关键问题：

### 🔍 核心挑战

1. **策略运行状态**：策略内部的计算状态（如移动平均值、RSI历史数据）
2. **订单状态同步**：哪些订单是open的、部分成交的、已成交的
3. **持仓状态**：当前策略持有多少仓位
4. **策略逻辑状态**：策略是否在等待某个条件、上一个信号是什么

## 🏗️ 当前系统架构分析

### ✅ 已有的机制

#### 1. 数据持久化层
```typescript
// 订单与策略关联
@Entity('orders')
export class OrderEntity {
  @ManyToOne(() => StrategyEntity, (s) => s.orders)
  strategy?: StrategyEntity;  // 📌 订单关联到策略
  
  @Column({ type: 'enum', enum: OrderStatus })
  status!: OrderStatus;       // 📌 订单状态持久化
  
  @Column() executedQuantity?: Decimal;    // 📌 成交数量
  @Column() realizedPnl?: Decimal;         // 📌 已实现盈亏
  @Column() unrealizedPnl?: Decimal;       // 📌 未实现盈亏
}

// 策略状态持久化
@Entity('strategies') 
export class StrategyEntity {
  @OneToMany(() => OrderEntity, (o) => o.strategy)
  orders?: OrderEntity[];     // 📌 策略的所有订单
  
  @Column({ type: 'jsonb' })
  parameters?: StrategyParameters;  // 📌 策略参数
  
  @Column() lastExecutionTime?: Date;  // 📌 最后执行时间
}
```

#### 2. 订单同步机制
```typescript
// OrderSyncService - 定时同步订单状态
export class OrderSyncService {
  // 📌 每5秒轮询未完成订单
  private async syncOpenOrders(): Promise<void> {
    const openOrders = await this.dataManager.getOrders({
      status: OrderStatus.NEW,
    });
    
    const partiallyFilledOrders = await this.dataManager.getOrders({
      status: OrderStatus.PARTIALLY_FILLED,
    });
    
    // 从交易所获取最新状态并更新数据库
    for (const order of [...openOrders, ...partiallyFilledOrders]) {
      const exchangeOrder = await exchange.getOrder(order.id);
      if (hasOrderChanged(order, exchangeOrder)) {
        await this.dataManager.updateOrder(order.id, exchangeOrder);
        this.eventBus.emit('orderUpdated', exchangeOrder);
      }
    }
  }
}
```

#### 3. 策略管理器
```typescript
// StrategyManager - 策略生命周期管理
export class StrategyManager {
  // 📌 启动时从数据库加载活跃策略
  private async loadActiveStrategies(): Promise<void> {
    const activeStrategies = await this.dataManager.getStrategies({
      status: StrategyStatus.ACTIVE,
    });
    
    for (const dbStrategy of activeStrategies) {
      await this.addStrategy(dbStrategy.id);
    }
  }
}
```

### ❌ 缺失的机制

1. **策略内部状态恢复**：技术指标的历史数据
2. **策略决策状态**：当前的交易信号和等待状态
3. **完整的持仓追踪**：策略级别的持仓管理
4. **状态一致性验证**：重启后的数据完整性检查

## 🚀 完整解决方案

### 1. 策略状态持久化

#### 添加策略状态表
```typescript
@Entity('strategy_states')
export class StrategyStateEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => StrategyEntity, { onDelete: 'CASCADE' })
  strategy!: StrategyEntity;

  @Column({ type: 'jsonb' })
  internalState!: Record<string, unknown>;  // 策略内部状态

  @Column({ type: 'jsonb' })
  indicatorData!: Record<string, unknown>;  // 技术指标历史数据

  @Column({ type: 'varchar' })
  lastSignal?: string;                      // 最后交易信号

  @Column({ type: 'timestamp' })
  signalTime?: Date;                        // 信号时间

  @Column({ type: 'decimal', precision: 28, scale: 10 })
  currentPosition!: Decimal;                // 当前持仓

  @Column({ type: 'decimal', precision: 28, scale: 10 })
  averagePrice?: Decimal;                   // 持仓均价

  @UpdateDateColumn()
  updatedAt!: Date;
}
```

#### 策略基类扩展
```typescript
export abstract class BaseStrategy implements IStrategy {
  protected strategyId?: number;
  protected persistentState: Record<string, unknown> = {};
  
  // 📌 保存策略状态到数据库
  protected async saveState(): Promise<void> {
    if (!this.strategyId) return;
    
    const stateData = {
      internalState: this.persistentState,
      indicatorData: this.getIndicatorData(),
      lastSignal: this.lastSignal,
      signalTime: this.lastSignalTime,
      currentPosition: this.getCurrentPosition(),
      averagePrice: this.getAveragePrice(),
    };
    
    await this.dataManager.saveStrategyState(this.strategyId, stateData);
  }
  
  // 📌 从数据库恢复策略状态
  protected async restoreState(): Promise<void> {
    if (!this.strategyId) return;
    
    const savedState = await this.dataManager.getStrategyState(this.strategyId);
    if (savedState) {
      this.persistentState = savedState.internalState;
      this.restoreIndicatorData(savedState.indicatorData);
      this.lastSignal = savedState.lastSignal;
      this.lastSignalTime = savedState.signalTime;
      this.setCurrentPosition(savedState.currentPosition);
      this.setAveragePrice(savedState.averagePrice);
    }
  }
  
  // 📌 子类需要实现的状态保存方法
  protected abstract getIndicatorData(): Record<string, unknown>;
  protected abstract restoreIndicatorData(data: Record<string, unknown>): void;
  protected abstract getCurrentPosition(): Decimal;
  protected abstract setCurrentPosition(position: Decimal): void;
}
```

### 2. MovingAverageStrategy 状态恢复示例

```typescript
export class MovingAverageStrategy extends BaseStrategy {
  private priceHistory: Decimal[] = [];
  private fastMA?: Decimal;
  private slowMA?: Decimal;
  private currentPosition: Decimal = new Decimal(0);
  private averagePrice?: Decimal;

  // 📌 保存指标数据
  protected getIndicatorData(): Record<string, unknown> {
    return {
      priceHistory: this.priceHistory.map(p => p.toString()),
      fastMA: this.fastMA?.toString(),
      slowMA: this.slowMA?.toString(),
      lastUpdate: new Date(),
    };
  }

  // 📌 恢复指标数据
  protected restoreIndicatorData(data: Record<string, unknown>): void {
    if (data.priceHistory) {
      this.priceHistory = (data.priceHistory as string[])
        .map(p => new Decimal(p));
    }
    if (data.fastMA) {
      this.fastMA = new Decimal(data.fastMA as string);
    }
    if (data.slowMA) {
      this.slowMA = new Decimal(data.slowMA as string);
    }
    
    this.logger.info(`📊 Restored strategy state: ${this.priceHistory.length} price points`);
  }

  // 📌 策略初始化时恢复状态
  protected async onInitialize(): Promise<void> {
    await this.restoreState();
    
    // 如果没有历史数据，从交易所获取
    if (this.priceHistory.length === 0) {
      await this.fetchHistoricalData();
    }
  }
  
  // 📌 每次分析后保存状态
  public async analyze(marketData: MarketData): Promise<StrategyResult> {
    const result = await super.analyze(marketData);
    
    // 更新内部状态
    this.updateIndicators(marketData);
    
    // 保存状态到数据库
    await this.saveState();
    
    return result;
  }
}
```

### 3. 订单状态恢复服务

```typescript
export class StrategyStateRecoveryService {
  constructor(
    private dataManager: IDataManager,
    private exchanges: Map<string, IExchange>,
    private logger: ILogger
  ) {}

  // 📌 恢复策略的完整状态
  async recoverStrategyState(strategyId: number): Promise<StrategyRecoveryInfo> {
    const recovery: StrategyRecoveryInfo = {
      strategyId,
      openOrders: [],
      partialOrders: [],
      recentTrades: [],
      currentPosition: new Decimal(0),
      unrealizedPnl: new Decimal(0),
      issues: [],
    };

    try {
      // 1. 获取策略的所有订单
      const allOrders = await this.dataManager.getOrdersByStrategy(strategyId);
      
      // 2. 分类订单状态
      recovery.openOrders = allOrders.filter(o => o.status === OrderStatus.NEW);
      recovery.partialOrders = allOrders.filter(o => o.status === OrderStatus.PARTIALLY_FILLED);
      const filledOrders = allOrders.filter(o => o.status === OrderStatus.FILLED);
      
      // 3. 与交易所同步未完成订单状态
      await this.syncOrdersWithExchange(recovery.openOrders);
      await this.syncOrdersWithExchange(recovery.partialOrders);
      
      // 4. 计算当前持仓
      recovery.currentPosition = this.calculatePosition(filledOrders, recovery.partialOrders);
      
      // 5. 计算未实现盈亏
      const currentPrice = await this.getCurrentPrice(strategyId);
      recovery.unrealizedPnl = this.calculateUnrealizedPnl(
        recovery.currentPosition,
        this.getAveragePrice(filledOrders),
        currentPrice
      );
      
      // 6. 检查数据一致性
      await this.validateDataConsistency(recovery);
      
      this.logger.info(`✅ Strategy ${strategyId} state recovered`, {
        openOrders: recovery.openOrders.length,
        partialOrders: recovery.partialOrders.length,
        position: recovery.currentPosition.toString(),
        unrealizedPnl: recovery.unrealizedPnl.toString(),
      });

    } catch (error) {
      recovery.issues.push({
        type: 'recovery_error',
        message: (error as Error).message,
        timestamp: new Date(),
      });
      
      this.logger.error(`❌ Failed to recover strategy ${strategyId} state`, error as Error);
    }

    return recovery;
  }

  // 📌 与交易所同步订单状态
  private async syncOrdersWithExchange(orders: OrderEntity[]): Promise<void> {
    for (const order of orders) {
      try {
        const exchange = this.exchanges.get(order.exchange!);
        if (!exchange) continue;

        const exchangeOrder = await exchange.getOrder(order.id);
        
        // 检查状态是否有变化
        if (this.hasOrderChanged(order, exchangeOrder)) {
          await this.dataManager.updateOrder(order.id, {
            status: exchangeOrder.status,
            executedQuantity: exchangeOrder.executedQuantity,
            updateTime: new Date(),
          });
          
          this.logger.info(`🔄 Order ${order.id} synced: ${order.status} → ${exchangeOrder.status}`);
        }
      } catch (error) {
        this.logger.warn(`⚠️ Failed to sync order ${order.id}: ${(error as Error).message}`);
      }
    }
  }
}

// 📌 恢复信息类型定义
export interface StrategyRecoveryInfo {
  strategyId: number;
  openOrders: OrderEntity[];
  partialOrders: OrderEntity[];
  recentTrades: OrderEntity[];
  currentPosition: Decimal;
  unrealizedPnl: Decimal;
  issues: Array<{
    type: string;
    message: string;
    timestamp: Date;
  }>;
}
```

### 4. 增强的策略管理器

```typescript
export class EnhancedStrategyManager extends StrategyManager {
  private recoveryService: StrategyStateRecoveryService;

  constructor(
    engine: TradingEngine,
    dataManager: TypeOrmDataManager,
    exchanges: Map<string, IExchange>,
    logger: ILogger
  ) {
    super(engine, dataManager, logger);
    this.recoveryService = new StrategyStateRecoveryService(dataManager, exchanges, logger);
  }

  // 📌 增强的策略加载，包含状态恢复
  private async addStrategyWithRecovery(strategyId: number): Promise<void> {
    try {
      // 1. 恢复策略状态
      const recoveryInfo = await this.recoveryService.recoverStrategyState(strategyId);
      
      // 2. 创建策略实例
      const dbStrategy = await this.dataManager.getStrategy(strategyId);
      const strategyInstance = this.createStrategyInstance(dbStrategy);
      
      // 3. 设置恢复信息
      if (strategyInstance instanceof BaseStrategy) {
        await (strategyInstance as any).setRecoveryInfo(recoveryInfo);
      }
      
      // 4. 注册到交易引擎
      await this.engine.registerStrategy(strategyInstance);
      
      this.strategies.set(strategyId, {
        name: dbStrategy.name,
        instance: strategyInstance,
      });
      
      // 5. 记录恢复结果
      this.logger.info(`🔄 Strategy ${dbStrategy.name} recovered`, {
        position: recoveryInfo.currentPosition.toString(),
        openOrders: recoveryInfo.openOrders.length,
        issues: recoveryInfo.issues.length,
      });
      
      // 6. 如果有问题，发出警告
      if (recoveryInfo.issues.length > 0) {
        this.logger.warn(`⚠️ Strategy ${dbStrategy.name} has recovery issues:`, 
          recoveryInfo.issues
        );
      }
      
    } catch (error) {
      this.logger.error(`❌ Failed to add strategy ${strategyId} with recovery`, error as Error);
      
      // 更新策略状态为错误
      await this.dataManager.updateStrategyStatus(strategyId, StrategyStatus.ERROR, 
        `Recovery failed: ${(error as Error).message}`
      );
    }
  }
}
```

## 🔧 实施步骤

### Phase 1: 基础设施 (1-2周)
1. ✅ 创建 `StrategyStateEntity` 表
2. ✅ 扩展 `BaseStrategy` 类支持状态保存/恢复
3. ✅ 实现 `StrategyStateRecoveryService`
4. ✅ 增强数据管理器支持状态操作

### Phase 2: 策略适配 (1周)
1. ✅ 更新 `MovingAverageStrategy` 支持状态恢复
2. ✅ 添加其他策略的状态恢复支持
3. ✅ 测试策略重启后的状态一致性

### Phase 3: 集成测试 (1周)
1. ✅ 端到端测试策略重启恢复
2. ✅ 压力测试订单同步机制
3. ✅ 验证数据一致性和完整性

## 📊 监控和维护

### 状态恢复监控
```typescript
// 添加监控指标
interface StrategyRecoveryMetrics {
  totalRecoveries: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  averageRecoveryTime: number;
  dataInconsistencies: number;
}
```

### 定期健康检查
```typescript
// 每小时检查策略状态一致性
setInterval(async () => {
  await this.validateAllStrategyStates();
}, 60 * 60 * 1000);
```

## 🎯 最佳实践

### 1. 数据一致性
- 📌 所有订单操作都必须记录到数据库
- 📌 策略状态变化及时持久化
- 📌 定期与交易所数据同步验证

### 2. 错误处理
- 📌 优雅降级：部分数据丢失时的恢复策略
- 📌 数据修复：自动检测和修复不一致状态
- 📌 人工干预：提供手动修正机制

### 3. 性能优化
- 📌 批量操作：减少数据库访问次数
- 📌 增量更新：只保存变化的状态
- 📌 缓存机制：常用数据内存缓存

这个方案确保了策略在任何情况下都能正确恢复其运行状态，包括未完成的订单、当前持仓、技术指标历史数据等。你觉得这个方案如何？有什么特定的部分需要我详细说明吗？
