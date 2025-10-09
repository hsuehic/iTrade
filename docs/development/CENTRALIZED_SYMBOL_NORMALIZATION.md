# 统一的 Symbol Normalization 实现

## 概述

本次重构将 symbol normalization 逻辑集中到一个地方管理，避免在多个应用中重复实现，提高代码可维护性。

## 架构设计

### 单一数据源 (Single Source of Truth)

```
┌─────────────────────────────────────────────────────────────┐
│                     packages/utils                          │
│                  ExchangeUtils.ts                           │
│            ┌────────────────────────┐                       │
│            │  normalizeSymbol()     │                       │
│            │  - Binance: BTCUSDT    │                       │
│            │  - OKX: BTC-USDT-SWAP  │                       │
│            │  - Coinbase: BTC-USDC-INTX │                   │
│            └────────────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
┌───────▼────────┐ ┌──────▼──────┐ ┌───────▼────────┐
│  data-manager  │ │   console   │ │   web/mobile   │
│  (自动计算)     │ │  (直接使用) │ │   (直接使用)    │
│  保存到数据库   │ │              │ │                │
└────────────────┘ └─────────────┘ └────────────────┘
```

### 数据流

```
1. 用户创建/更新 Strategy
   ↓
2. StrategyRepository.create/update
   - 调用 normalizeSymbol(symbol, exchange)
   - 自动填充 normalizedSymbol 字段
   ↓
3. 保存到数据库
   - symbol: 'BTC/USDT:USDT' (原始格式)
   - normalizedSymbol: 'BTCUSDT' (exchange-specific)
   ↓
4. API 返回给前端
   - 包含两个字段
   ↓
5. 前端直接使用 normalizedSymbol
   - 不需要客户端 normalize
```

## 实现细节

### 1. 共享工具包 (packages/utils)

**新增文件**: `packages/utils/src/ExchangeUtils.ts`

```typescript
export function normalizeSymbol(symbol: string, exchangeId: string): string {
  // 单一的 normalization 逻辑
  // 支持 Binance, OKX, Coinbase
}
```

**导出**: `packages/utils/src/index.ts`

```typescript
export { normalizeSymbol, getSymbolVariants } from './ExchangeUtils';
export type { ExchangeId } from './ExchangeUtils';
```

### 2. 数据库层 (packages/data-manager)

#### 实体更新

**文件**: `packages/data-manager/src/entities/Strategy.ts`

```typescript
@Entity('strategies')
export class StrategyEntity {
  @Column({ type: 'text', nullable: true })
  symbol?: string;

  @Column({ type: 'text', nullable: true })
  normalizedSymbol?: string;  // ✨ 新增字段
  
  // ... other fields
}
```

#### Repository 自动计算

**文件**: `packages/data-manager/src/repositories/StrategyRepository.ts`

```typescript
import { normalizeSymbol } from '@itrade/utils';

async create(data): Promise<StrategyEntity> {
  const entityData: any = { ...strategyData };
  
  // 自动计算 normalizedSymbol
  if (entityData.symbol && entityData.exchange) {
    entityData.normalizedSymbol = normalizeSymbol(
      entityData.symbol, 
      entityData.exchange
    );
  }
  
  return await this.repository.save(entityData);
}

async update(id, updates): Promise<void> {
  const updateData: any = { ...updates };
  
  // 重新计算 normalizedSymbol (如果 symbol 或 exchange 变更)
  if (updateData.symbol || updateData.exchange) {
    const existing = await this.repository.findOne({ where: { id } });
    if (existing) {
      const symbol = updateData.symbol || existing.symbol;
      const exchange = updateData.exchange || existing.exchange;
      if (symbol && exchange) {
        updateData.normalizedSymbol = normalizeSymbol(symbol, exchange);
      }
    }
  }
  
  await this.repository.update({ id }, updateData);
}
```

### 3. Console 应用

**文件**: `apps/console/src/strategy-manager.ts`

```typescript
// ❌ 删除: import { normalizeSymbolForExchange } from './utils/exchange-utils';
// ❌ 删除: apps/console/src/utils/exchange-utils.ts

// ✅ 直接使用数据库返回的 normalizedSymbol
const displaySymbol = (dbStrategy as any).normalizedSymbol || 
                      dbStrategy.symbol || 
                      'N/A';
this.logger.info(`Symbol: ${displaySymbol}`);
```

### 4. Web 应用

**类型更新**: `apps/web/app/strategy/page.tsx`

```typescript
type Strategy = {
  id: number;
  name: string;
  symbol?: string;
  normalizedSymbol?: string;  // ✨ 新增
  exchange?: string;
  // ...
};
```

**UI 显示**:

```tsx
<span className="font-mono font-medium">
  {strategy.normalizedSymbol || strategy.symbol || 'N/A'}
</span>
```

**优化**: 删除了本地的 `normalizeSymbolForExchange` 调用。

### 5. Mobile 应用 (Flutter)

**模型更新**: `apps/mobile/lib/models/strategy.dart`

```dart
class Strategy {
  final String? symbol;
  final String? normalizedSymbol; // ✨ 新增
  
  factory Strategy.fromJson(Map<String, dynamic> json) {
    return Strategy(
      symbol: json['symbol'] as String?,
      normalizedSymbol: json['normalizedSymbol'] as String?,
      // ...
    );
  }
}
```

**UI 显示**: `apps/mobile/lib/screens/strategy.dart` 和 `strategy_detail.dart`

```dart
Text(
  strategy.normalizedSymbol ?? strategy.symbol ?? 'N/A',
  // ...
)
```

**优化**: 删除了 `SupportedExchanges.normalizeSymbol()` 调用。

## Symbol Normalization 规则

### Binance

| 输入格式 | 输出格式 | 类型 |
|---------|---------|------|
| `BTC/USDT` | `BTCUSDT` | Spot |
| `BTC/USDT:USDT` | `BTCUSDT` | Perpetual |
| `BTCUSDT_PERP` | `BTCUSDTPERP` | Perpetual |

**⚠️ 重要说明**：Binance 的 Spot 和 Perpetual 使用相同的 normalized symbol（`BTCUSDT`），但是：
- 使用不同的 API endpoints（`api.binance.com` vs `fapi.binance.com`）
- 我们通过 **原始 `symbol` 字段** 来区分：
  - `BTC/USDT` → Spot
  - `BTC/USDT:USDT` → Perpetual（包含 `:`）
- 建议添加 `marketType` 字段以便更清晰地区分（参见：[Spot vs Futures 处理机制](../architecture/SPOT_VS_FUTURES_HANDLING.md)）

### OKX

| 输入格式 | 输出格式 | 类型 |
|---------|---------|------|
| `BTC/USDT` | `BTC-USDT` | Spot |
| `BTC/USDT:USDT` | `BTC-USDT-SWAP` | Perpetual |
| `BTC-USDT-SWAP` | `BTC-USDT-SWAP` | Perpetual |

### Coinbase

| 输入格式 | 输出格式 | 类型 |
|---------|---------|------|
| `BTC/USDC` | `BTC-USDC` | Spot |
| `BTC/USDC:USDC` | `BTC-USDC-INTX` | Perpetual |
| `BTC-USDC-INTX` | `BTC-USDC-INTX` | Perpetual |

**注意**: Coinbase 默认的 quote coin 是 USDC（而非 USD）。

## 数据库 Schema 更新

### 自动同步

运行以下命令自动添加 `normalizedSymbol` 列：

```bash
cd packages/data-manager
pnpm run sync-schema
```

### 查看 Schema

```sql
-- 新增的列
ALTER TABLE strategies 
ADD COLUMN "normalizedSymbol" TEXT;

-- 索引 (可选，提高查询性能)
CREATE INDEX idx_strategies_normalized_symbol 
ON strategies("normalizedSymbol");
```

## 优势

### ✅ 维护性

- **单一数据源**: normalization 逻辑只在一个地方 (`packages/utils/ExchangeUtils.ts`)
- **自动计算**: 在数据保存时自动计算，无需客户端处理
- **类型安全**: TypeScript 类型定义统一

### ✅ 性能

- **减少计算**: normalization 只在创建/更新时计算一次
- **前端优化**: 客户端无需重复计算
- **网络效率**: API 响应包含完整数据

### ✅ 一致性

- **数据一致**: 所有应用使用相同的 normalized symbol
- **易于调试**: 可以直接在数据库中查看 normalized 结果
- **向后兼容**: 保留原始 `symbol` 字段

### ✅ 扩展性

- **新增交易所**: 只需在 `ExchangeUtils.ts` 中添加规则
- **修改规则**: 只需更新一个文件
- **Backfill**: 可以批量更新现有数据

## 使用示例

### 创建 Strategy

```typescript
// Web/Console/Mobile API 调用
const strategy = await createStrategy({
  name: 'My Strategy',
  exchange: 'binance',
  symbol: 'BTC/USDT:USDT',  // 用户输入
  // ...
});

// 返回的数据
{
  id: 1,
  name: 'My Strategy',
  exchange: 'binance',
  symbol: 'BTC/USDT:USDT',          // 原始格式
  normalizedSymbol: 'BTCUSDT',      // 自动生成 ✨
  // ...
}
```

### 显示 Strategy

```typescript
// Web (React)
<span>{strategy.normalizedSymbol || strategy.symbol || 'N/A'}</span>

// Mobile (Flutter)
Text(strategy.normalizedSymbol ?? strategy.symbol ?? 'N/A')

// Console (Node.js)
console.log(`Symbol: ${strategy.normalizedSymbol || strategy.symbol}`);
```

## 迁移步骤

### 1. 更新依赖

```bash
# 确保所有包都使用最新的 @itrade/utils
pnpm install
```

### 2. 同步数据库 Schema

```bash
cd packages/data-manager
pnpm run sync-schema
```

### 3. Backfill 现有数据 (可选)

如果需要为现有策略生成 `normalizedSymbol`:

```typescript
// 运行一次性脚本
import { normalizeSymbol } from '@itrade/utils';
import { TypeOrmDataManager } from '@itrade/data-manager';

async function backfillNormalizedSymbols() {
  const dataManager = new TypeOrmDataManager(config);
  await dataManager.initialize();
  
  const strategies = await dataManager.getStrategies();
  
  for (const strategy of strategies) {
    if (strategy.symbol && strategy.exchange && !strategy.normalizedSymbol) {
      const normalizedSymbol = normalizeSymbol(strategy.symbol, strategy.exchange);
      await dataManager.updateStrategy(strategy.id, { normalizedSymbol });
    }
  }
  
  console.log(`Backfilled ${strategies.length} strategies`);
}
```

### 4. 部署顺序

1. **Backend**: 先部署 `packages/data-manager` 和 `packages/utils`
2. **Console**: 部署 console 应用
3. **Web**: 部署 web 应用
4. **Mobile**: 发布新版本 mobile 应用

## 测试

### 单元测试

```typescript
// packages/utils/__tests__/ExchangeUtils.test.ts
import { normalizeSymbol } from '../src/ExchangeUtils';

describe('normalizeSymbol', () => {
  it('should normalize Binance spot symbol', () => {
    expect(normalizeSymbol('BTC/USDT', 'binance')).toBe('BTCUSDT');
  });
  
  it('should normalize Binance perpetual symbol', () => {
    expect(normalizeSymbol('BTC/USDT:USDT', 'binance')).toBe('BTCUSDT');
  });
  
  it('should normalize OKX spot symbol', () => {
    expect(normalizeSymbol('BTC/USDT', 'okx')).toBe('BTC-USDT');
  });
  
  it('should normalize OKX perpetual symbol', () => {
    expect(normalizeSymbol('BTC/USDT:USDT', 'okx')).toBe('BTC-USDT-SWAP');
  });
  
  it('should normalize Coinbase spot symbol', () => {
    expect(normalizeSymbol('BTC/USDC', 'coinbase')).toBe('BTC-USDC');
  });
  
  it('should normalize Coinbase perpetual symbol', () => {
    expect(normalizeSymbol('BTC/USDC:USDC', 'coinbase')).toBe('BTC-USDC-INTX');
  });
});
```

### 集成测试

```typescript
// packages/data-manager/__tests__/StrategyRepository.test.ts
it('should auto-generate normalizedSymbol on create', async () => {
  const strategy = await strategyRepository.create({
    name: 'Test',
    exchange: 'binance',
    symbol: 'BTC/USDT:USDT',
    userId: 'user1',
  });
  
  expect(strategy.normalizedSymbol).toBe('BTCUSDT');
});

it('should update normalizedSymbol when symbol changes', async () => {
  const strategy = await strategyRepository.create({
    name: 'Test',
    exchange: 'okx',
    symbol: 'BTC/USDT',
    userId: 'user1',
  });
  
  expect(strategy.normalizedSymbol).toBe('BTC-USDT');
  
  await strategyRepository.update(strategy.id, {
    symbol: 'BTC/USDT:USDT',
  });
  
  const updated = await strategyRepository.findById(strategy.id);
  expect(updated?.normalizedSymbol).toBe('BTC-USDT-SWAP');
});
```

## 文件清单

### 新增文件

```
packages/utils/src/ExchangeUtils.ts         # Symbol normalization 逻辑
```

### 修改文件

```
packages/utils/src/index.ts                           # 导出 ExchangeUtils
packages/data-manager/src/entities/Strategy.ts        # 添加 normalizedSymbol 字段
packages/data-manager/src/repositories/StrategyRepository.ts  # 自动计算逻辑
apps/web/app/strategy/page.tsx                        # 使用 normalizedSymbol
apps/console/src/strategy-manager.ts                  # 使用 normalizedSymbol
apps/mobile/lib/models/strategy.dart                  # 添加 normalizedSymbol 字段
apps/mobile/lib/screens/strategy.dart                 # 使用 normalizedSymbol
apps/mobile/lib/screens/strategy_detail.dart          # 使用 normalizedSymbol
```

### 删除文件

```
apps/console/src/utils/exchange-utils.ts  # 不再需要本地实现
apps/web/lib/exchanges.ts                 # 删除 normalizeSymbolForExchange
apps/mobile/lib/utils/exchange_config.dart # 删除 normalizeSymbol 方法
```

## 常见问题

### Q: 为什么不在前端 normalize？

A:

- 避免重复逻辑
- 减少客户端计算
- 数据库中存储方便查询和调试
- 保证所有客户端一致性

### Q: 如果 normalization 规则变更怎么办？

A:

1. 更新 `ExchangeUtils.ts` 中的规则
2. 运行 backfill 脚本更新现有数据
3. 新数据自动使用新规则

### Q: 原始 symbol 会丢失吗？

A: 不会。我们保留了两个字段：

- `symbol`: 用户输入的原始格式
- `normalizedSymbol`: 交易所特定格式

### Q: 移动端如何测试？

A:

- 确保 API 返回包含 `normalizedSymbol`
- 在模拟器/真机上验证显示
- 检查网络请求中的响应数据

## 总结

这次重构实现了：

✅ **集中管理**: Symbol normalization 逻辑统一在 `packages/utils`
✅ **自动化**: 数据库层自动计算和存储
✅ **简化客户端**: Web/Console/Mobile 直接使用 API 数据
✅ **类型安全**: 完整的 TypeScript 类型支持
✅ **向后兼容**: 保留原始 symbol 字段
✅ **易于维护**: 单一数据源，修改一处即可

这是一个更清晰、更易维护的架构设计！🎉
