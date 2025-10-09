# Perpetual 合约支持 - 实现完成

## ✅ 已完成的工作

### 1. 数据库层 ✓

#### Strategy Entity (packages/data-manager/src/entities/Strategy.ts)
- ✅ 添加 `MarketType` enum (`spot`, `perpetual`, `futures`, `margin`)
- ✅ 添加 `marketType` 字段到 `StrategyEntity`
- ✅ 添加 `marketType` 索引
- ✅ 导出 `MarketType` 类型

```typescript
export enum MarketType {
  SPOT = 'spot',
  PERPETUAL = 'perpetual',
  FUTURES = 'futures',
  MARGIN = 'margin',
}

@Entity('strategies')
@Index(['marketType'])
export class StrategyEntity {
  @Column({
    type: 'enum',
    enum: MarketType,
    default: MarketType.SPOT,
  })
  marketType!: MarketType;
}
```

#### Strategy Repository (packages/data-manager/src/repositories/StrategyRepository.ts)
- ✅ 自动检测和计算 `marketType`
- ✅ 在 `create()` 时自动填充
- ✅ 在 `update()` 时重新计算

```typescript
import { detectMarketType } from '@itrade/utils';

async create(data): Promise<StrategyEntity> {
  if (entityData.symbol && entityData.exchange) {
    entityData.normalizedSymbol = normalizeSymbol(entityData.symbol, entityData.exchange);
    entityType.marketType = detectMarketType(entityData.symbol); // ✨ 自动检测
  }
  // ...
}
```

#### 数据库 Schema 同步
- ✅ 运行 `pnpm run sync-schema` 成功
- ✅ `marketType` 字段已添加到数据库
- ✅ 索引已创建

### 2. 工具层 ✓

#### ExchangeUtils (packages/utils/src/ExchangeUtils.ts)
- ✅ 添加 `MarketType` 类型
- ✅ 实现 `detectMarketType()` 函数
- ✅ 实现 `isFuturesMarket()` 函数
- ✅ 更新 `getSymbolVariants()` 包含 marketType

**检测逻辑**:
```typescript
export function detectMarketType(symbol: string): MarketType {
  if (symbol.includes(':')) return 'perpetual';        // BTC/USDT:USDT
  if (symbol.includes('_PERP')) return 'perpetual';    // BTCUSDT_PERP
  if (symbol.includes('-SWAP')) return 'perpetual';    // BTC-USDT-SWAP
  if (symbol.includes('-INTX')) return 'perpetual';    // BTC-USDC-INTX (Coinbase)
  return 'spot';
}
```

### 3. Exchange Connector - Binance ✓

#### 双 API 基础设施 (packages/exchange-connectors/src/binance/BinanceExchange.ts)
- ✅ 添加 Spot API URLs
- ✅ 添加 Futures API URLs
- ✅ 创建 `spotClient` (axios instance)
- ✅ 创建 `futuresClient` (axios instance)
- ✅ 实现 `getClient(marketType)` 辅助方法
- ✅ 实现 `isFuturesMarket(marketType)` 辅助方法

```typescript
export class BinanceExchange extends BaseExchange {
  // Spot API
  private static readonly SPOT_MAINNET_URL = 'https://api.binance.com';
  private static readonly SPOT_TESTNET_URL = 'https://testnet.binance.vision';
  
  // Futures API (Perpetual)
  private static readonly FUTURES_MAINNET_URL = 'https://fapi.binance.com';
  private static readonly FUTURES_TESTNET_URL = 'https://testnet.binancefuture.com';
  
  private spotClient: AxiosInstance;
  private futuresClient: AxiosInstance;
  
  private getClient(marketType?: string): AxiosInstance {
    return this.isFuturesMarket(marketType) ? this.futuresClient : this.spotClient;
  }
}
```

### 4. Web 前端 ✓

#### Strategy Type (apps/web/app/strategy/page.tsx)
- ✅ 添加 `marketType?: string` 到 `Strategy` 类型
- ✅ 在策略卡片中显示 Perpetual/Futures badge
- ✅ 使用 `⚡ Perp` / `📈 Futures` 图标

```tsx
{strategy.marketType && strategy.marketType !== 'spot' && (
  <Badge variant="destructive" className="text-xs">
    {strategy.marketType === 'perpetual' ? '⚡ Perp' : '📈 Futures'}
  </Badge>
)}
```

### 5. Mobile 前端 ✓

#### Strategy Model (apps/mobile/lib/models/strategy.dart)
- ✅ 添加 `marketType` 字段
- ✅ 在 `fromJson` 中解析，默认值为 `'spot'`
- ✅ 在 `toJson` 中包含

#### Strategy List UI (apps/mobile/lib/screens/strategy.dart)
- ✅ 显示 market type 图标
- ✅ Perpetual 显示 `⚡` 图标 (orange)
- ✅ Futures 显示 `📈` 图标 (orange)

```dart
if (strategy.marketType != 'spot') ...[
  Icon(
    strategy.marketType == 'perpetual' ? Icons.flash_on : Icons.trending_up,
    size: 14,
    color: Colors.orange,
  ),
  const SizedBox(width: 4),
],
```

## 📋 使用方法

### 创建 Spot 策略

```typescript
const strategy = await createStrategy({
  name: 'BTC Spot MA Strategy',
  exchange: 'binance',
  symbol: 'BTC/USDT',  // 无 : 表示 spot
  // marketType 自动检测为 'spot'
});
```

### 创建 Perpetual 策略

```typescript
const strategy = await createStrategy({
  name: 'BTC Perpetual MA Strategy',
  exchange: 'binance',
  symbol: 'BTC/USDT:USDT',  // 包含 : 表示 perpetual
  // marketType 自动检测为 'perpetual'
});
```

### 数据库中的数据

```sql
-- Spot 策略
{
  "symbol": "BTC/USDT",
  "normalizedSymbol": "BTCUSDT",
  "marketType": "spot"
}

-- Perpetual 策略
{
  "symbol": "BTC/USDT:USDT",
  "normalizedSymbol": "BTCUSDT",   -- 相同
  "marketType": "perpetual"         -- 用于区分
}
```

## 🔧 API 路由逻辑

### Binance API Endpoints

```typescript
// Spot
GET https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT

// Perpetual (USDT-M Futures)
GET https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT
```

### 在代码中使用

```typescript
// 在 BinanceExchange 方法中
async someMethod(symbol: string, options?: { marketType?: string }) {
  const client = this.getClient(options?.marketType);
  const endpoint = this.isFuturesMarket(options?.marketType)
    ? '/fapi/v1/endpoint'   // Futures
    : '/api/v3/endpoint';    // Spot
  
  const response = await client.get(endpoint, { params: { symbol } });
  // ...
}
```

## 🎨 UI 显示

### Web (React)
- Perpetual: 橙色 badge `⚡ Perp`
- Futures: 橙色 badge `📈 Futures`
- Spot: 不显示额外 badge

### Mobile (Flutter)
- Perpetual: 橙色闪电图标 `⚡`
- Futures: 橙色趋势图标 `📈`
- Spot: 无额外图标

## 📊 Symbol 格式支持

### Binance
```typescript
'BTC/USDT'          → spot       → BTCUSDT
'BTC/USDT:USDT'     → perpetual  → BTCUSDT
'BTCUSDT_PERP'      → perpetual  → BTCUSDTPERP
```

### OKX
```typescript
'BTC/USDT'          → spot       → BTC-USDT
'BTC/USDT:USDT'     → perpetual  → BTC-USDT-SWAP
```

### Coinbase
```typescript
'BTC/USDC'          → spot       → BTC-USDC
'BTC/USDC:USDC'     → perpetual  → BTC-USDC-INTX
```

## 🚧 待完成工作

### 1. BinanceExchange API 方法更新 (P1)

需要更新具体的 API 方法以实际使用 `getClient()` 和 `marketType` 参数：

- [ ] `getTicker(symbol, options?)` 
- [ ] `getOrderBook(symbol, options?)`
- [ ] `getRecentTrades(symbol, options?)`
- [ ] `getKlines(symbol, interval, options?)`
- [ ] `placeOrder(order, options?)`
- [ ] `cancelOrder(symbol, orderId, options?)`
- [ ] `getAccountInfo(options?)`
- [ ] WebSocket 订阅方法

**模式**:
```typescript
async getTicker(symbol: string, options?: { marketType?: string }): Promise<Ticker> {
  const client = this.getClient(options?.marketType);
  const endpoint = this.isFuturesMarket(options?.marketType)
    ? '/fapi/v1/ticker/price'
    : '/api/v3/ticker/price';
  
  const response = await client.get(endpoint, { params: { symbol } });
  return this.transformTicker(response.data);
}
```

### 2. TradingEngine 更新 (P1)

在调用 exchange API 时传递 `marketType`:

```typescript
// packages/core/src/TradingEngine.ts
async subscribe(exchange: string, symbol: string, strategy: IStrategy) {
  const marketType = (strategy as any).marketType || 'spot';
  
  await this.exchanges.get(exchange)?.subscribeToTicker(
    symbol,
    { marketType }  // 传递 marketType
  );
}
```

### 3. StrategyManager 更新 (P1)

```typescript
// apps/console/src/strategy-manager.ts
async addStrategy(strategyId: number) {
  const dbStrategy = await this.dataManager.getStrategy(strategyId);
  
  // 订阅时传递 marketType
  await this.tradeEngine.subscribe(
    dbStrategy.exchange,
    dbStrategy.normalizedSymbol,
    strategy,
    { marketType: dbStrategy.marketType }
  );
}
```

### 4. 测试 (P2)

- [ ] 单元测试：`detectMarketType()` 
- [ ] 单元测试：Symbol normalization
- [ ] 集成测试：创建 spot 策略
- [ ] 集成测试：创建 perpetual 策略
- [ ] 集成测试：BinanceExchange API routing
- [ ] E2E测试：Web 创建策略流程
- [ ] E2E测试：Mobile 创建策略流程

### 5. Backfill 现有数据 (P3, 可选)

为现有策略填充 `marketType`:

```typescript
import { detectMarketType } from '@itrade/utils';
import { TypeOrmDataManager } from '@itrade/data-manager';

async function backfillMarketType() {
  const dm = new TypeOrmDataManager(config);
  await dm.initialize();
  
  const strategies = await dm.getStrategies();
  
  for (const strategy of strategies) {
    if (strategy.symbol) {
      const marketType = detectMarketType(strategy.symbol);
      await dm.updateStrategy(strategy.id, { marketType });
      console.log(`Updated strategy ${strategy.id}: ${marketType}`);
    }
  }
}
```

## 📝 关键决策记录

### 为什么选择自动检测 marketType？

1. **用户友好**: 用户只需输入 symbol，系统自动识别类型
2. **避免错误**: 减少用户手动选择错误的可能
3. **一致性**: 使用标准的 CCXT 格式 (包含 `:` 表示衍生品)

### 为什么 Binance 需要两个 API clients？

1. **不同的 base URL**: Spot 和 Futures 使用完全不同的域名
2. **不同的 endpoints**: 路径结构不同 (`/api/v3/` vs `/fapi/v1/`)
3. **不同的响应格式**: 某些字段结构有差异
4. **独立的 rate limits**: 两个 API 有独立的限流

### 为什么保留 symbol 和 normalizedSymbol？

- `symbol`: 原始格式，包含类型信息 (`BTC/USDT:USDT`)
- `normalizedSymbol`: 交易所格式，用于 API 调用 (`BTCUSDT`)
- `marketType`: 明确的类型标识，便于查询和过滤

## 🔗 相关文档

- [Spot vs Futures 处理机制](../architecture/SPOT_VS_FUTURES_HANDLING.md) - 详细技术设计
- [统一的 Symbol Normalization](./CENTRALIZED_SYMBOL_NORMALIZATION.md) - Symbol 格式规范
- [Perpetual 实现总结](./PERPETUAL_IMPLEMENTATION_SUMMARY.md) - 实现指南

## 📦 相关 Package 版本

- `@itrade/data-manager`: 增加 `MarketType` enum 和字段
- `@itrade/utils`: 增加 `detectMarketType()` 和 `isFuturesMarket()`
- `@itrade/exchange-connectors`: Binance 增加双 API 支持

## ✅ 验证清单

- [x] `MarketType` enum 定义
- [x] `StrategyEntity.marketType` 字段
- [x] `marketType` 索引创建
- [x] 自动检测逻辑实现
- [x] StrategyRepository 自动填充
- [x] 数据库 schema 同步
- [x] BinanceExchange 双 client 初始化
- [x] Web UI 显示 marketType
- [x] Mobile UI 显示 marketType
- [x] ExchangeUtils 工具函数
- [ ] BinanceExchange API 方法更新 (待完成)
- [ ] TradingEngine 传递 marketType (待完成)
- [ ] 完整测试覆盖 (待完成)

## 🎯 下一步行动

1. ✅ **完成数据库和基础设施** (已完成)
2. ⏭️ **更新 BinanceExchange API 方法** (P1，按需实现)
3. ⏭️ **更新 TradingEngine** (P1，实际交易时需要)
4. ⏭️ **添加测试** (P2)

---

**实现状态**: 核心基础设施已完成 ✅  
**可用性**: 可以创建和显示 perpetual 策略 ✅  
**实际交易**: 需要完成 API 方法更新才能实际交易 ⚠️

**实现时间**: 2025-10-09  
**最后更新**: 2025-10-09

