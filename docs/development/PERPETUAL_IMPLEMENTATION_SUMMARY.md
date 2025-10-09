# Perpetual 支持实现总结

## 已完成 ✅

### 1. 数据库层 (packages/data-manager)

#### Strategy Entity
- ✅ 添加 `MarketType` enum (`spot`, `perpetual`, `futures`, `margin`)
- ✅ 添加 `marketType` 字段，默认值为 `spot`
- ✅ 添加 `marketType` 索引

**文件**: `packages/data-manager/src/entities/Strategy.ts`

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
  // ...
  @Column({
    type: 'enum',
    enum: MarketType,
    default: MarketType.SPOT,
  })
  marketType!: MarketType;
}
```

#### Strategy Repository
- ✅ 自动检测和计算 `marketType`
- ✅ 在 `create()` 和 `update()` 时自动填充

**文件**: `packages/data-manager/src/repositories/StrategyRepository.ts`

```typescript
import { detectMarketType } from '@itrade/utils';

async create(data): Promise<StrategyEntity> {
  if (entityData.symbol && entityData.exchange) {
    entityData.normalizedSymbol = normalizeSymbol(entityData.symbol, entityData.exchange);
    entityData.marketType = detectMarketType(entityData.symbol); // ✨ 自动检测
  }
}
```

### 2. 工具层 (packages/utils)

#### ExchangeUtils
- ✅ 添加 `MarketType` 类型定义
- ✅ 实现 `detectMarketType()` 函数
- ✅ 实现 `isFuturesMarket()` 函数
- ✅ 更新 `getSymbolVariants()` 包含 marketType

**文件**: `packages/utils/src/ExchangeUtils.ts`

```typescript
export type MarketType = 'spot' | 'futures' | 'perpetual' | 'margin';

// 自动检测市场类型
export function detectMarketType(symbol: string): MarketType {
  if (symbol.includes(':')) return 'perpetual';
  if (symbol.includes('_PERP') || symbol.includes('_SWAP')) return 'perpetual';
  if (symbol.includes('-SWAP')) return 'perpetual';
  if (symbol.includes('-INTX')) return 'perpetual';
  return 'spot';
}

// 判断是否为 futures/perpetual
export function isFuturesMarket(symbolOrMarketType: string | MarketType): boolean {
  const marketType = /* ... */;
  return marketType === 'futures' || marketType === 'perpetual';
}
```

### 3. Exchange Connector - Binance

#### 双 API 支持
- ✅ 添加 Spot 和 Futures API URLs
- ✅ 创建 `spotClient` 和 `futuresClient`
- ✅ 实现 `getClient(marketType)` 方法
- ✅ 实现 `isFuturesMarket(marketType)` 辅助方法

**文件**: `packages/exchange-connectors/src/binance/BinanceExchange.ts`

```typescript
export class BinanceExchange extends BaseExchange {
  // Spot API URLs
  private static readonly SPOT_MAINNET_URL = 'https://api.binance.com';
  private static readonly SPOT_TESTNET_URL = 'https://testnet.binance.vision';
  
  // Futures API URLs (Perpetual)
  private static readonly FUTURES_MAINNET_URL = 'https://fapi.binance.com';
  private static readonly FUTURES_TESTNET_URL = 'https://testnet.binancefuture.com';

  private spotClient: AxiosInstance;
  private futuresClient: AxiosInstance;
  
  constructor(isTestnet = false) {
    // 初始化两个 clients
    this.spotClient = axios.create({ baseURL: SPOT_URL });
    this.futuresClient = axios.create({ baseURL: FUTURES_URL });
  }
  
  private getClient(marketType?: string): AxiosInstance {
    return this.isFuturesMarket(marketType) ? this.futuresClient : this.spotClient;
  }
}
```

## 待完成 🚧

### 1. BinanceExchange API 方法更新

需要更新所有 public API 方法以支持 `marketType` 参数：

**模式**:
```typescript
// 之前
async someMethod(symbol: string, ...params) {
  await this.httpClient.get('/api/v3/endpoint', { params: { symbol } });
}

// 之后
async someMethod(symbol: string, options?: { marketType?: string }, ...params) {
  const client = this.getClient(options?.marketType);
  const endpoint = this.isFuturesMarket(options?.marketType)
    ? '/fapi/v1/endpoint'  // Futures endpoint
    : '/api/v3/endpoint';   // Spot endpoint
  
  await client.get(endpoint, { params: { symbol } });
}
```

**需要更新的方法**:
- `getTicker(symbol, options?)` - 获取价格
- `getOrderBook(symbol, options?)` - 获取订单簿
- `getRecentTrades(symbol, options?)` - 获取最近成交
- `getKlines(symbol, interval, options?)` - 获取K线数据
- `placeOrder(order, options?)` - 下单
- `cancelOrder(symbol, orderId, options?)` - 撤单
- `getOrder(symbol, orderId, options?)` - 查询订单
- `getOpenOrders(symbol?, options?)` - 获取未成交订单
- `getAccountInfo(options?)` - 获取账户信息
- `subscribeToTicker(symbol, options?)` - 订阅价格WebSocket
- `subscribeToOrderBook(symbol, options?)` - 订阅订单簿WebSocket

**Endpoint 对比**:
```typescript
// Spot vs Futures endpoints
const ENDPOINTS = {
  ticker: {
    spot: '/api/v3/ticker/price',
    futures: '/fapi/v1/ticker/price'
  },
  orderBook: {
    spot: '/api/v3/depth',
    futures: '/fapi/v1/depth'
  },
  trades: {
    spot: '/api/v3/trades',
    futures: '/fapi/v1/trades'
  },
  klines: {
    spot: '/api/v3/klines',
    futures: '/fapi/v1/klines'
  },
  order: {
    spot: '/api/v3/order',
    futures: '/fapi/v1/order'
  },
  account: {
    spot: '/api/v3/account',
    futures: '/fapi/v2/account'
  }
};
```

### 2. TradingEngine 更新

需要在调用 exchange API 时传递 `marketType`:

**文件**: `packages/core/src/TradingEngine.ts`

```typescript
// 示例：订阅市场数据时传递 marketType
async subscribe(exchange: string, symbol: string, strategy: IStrategy) {
  const marketType = (strategy as any).marketType || 'spot';
  
  await this.exchanges.get(exchange)?.subscribeToTicker(
    symbol, 
    { marketType }  // ✨ 传递 marketType
  );
}
```

### 3. StrategyManager 更新

传递 strategy 的 marketType 给 TradingEngine:

**文件**: `apps/console/src/strategy-manager.ts`

```typescript
async addStrategy(strategyId: number) {
  const dbStrategy = await this.dataManager.getStrategy(strategyId);
  
  // 订阅时传递 marketType
  await this.tradeEngine.subscribe(
    dbStrategy.exchange,
    dbStrategy.normalizedSymbol,
    strategy,
    { marketType: dbStrategy.marketType }  // ✨ 传递 marketType
  );
}
```

### 4. 前端更新

#### Web (React)

**Strategy Type**:
```typescript
// apps/web/app/strategy/page.tsx
type Strategy = {
  // ... existing fields
  marketType?: string; // ✨ 添加字段
};
```

**UI 显示**:
```tsx
<div className="flex items-center gap-2">
  <Badge variant={strategy.marketType === 'perpetual' ? 'destructive' : 'default'}>
    {strategy.marketType === 'perpetual' ? '⚡ Perp' : '💼 Spot'}
  </Badge>
  <span className="font-mono">{strategy.normalizedSymbol}</span>
</div>
```

#### Mobile (Flutter)

**Strategy Model**:
```dart
// apps/mobile/lib/models/strategy.dart
class Strategy {
  final String marketType; // ✨ 添加字段
  
  factory Strategy.fromJson(Map<String, dynamic> json) {
    return Strategy(
      marketType: json['marketType'] as String? ?? 'spot',
      // ...
    );
  }
}
```

**UI 显示**:
```dart
Row(
  children: [
    if (strategy.marketType == 'perpetual')
      Icon(Icons.flash_on, size: 16, color: Colors.orange)
    else
      Icon(Icons.wallet, size: 16, color: Colors.blue),
    SizedBox(width: 4),
    Text(strategy.normalizedSymbol ?? 'N/A'),
  ],
)
```

### 5. 数据库 Schema 同步

运行 schema 同步命令：

```bash
cd packages/data-manager
pnpm run sync-schema
```

这会自动添加 `marketType` 字段和索引到数据库。

### 6. Backfill 现有数据 (可选)

为现有策略填充 `marketType`:

```typescript
// 一次性脚本
import { detectMarketType } from '@itrade/utils';
import { TypeOrmDataManager } from '@itrade/data-manager';

async function backfillMarketType() {
  const dm = new TypeOrmDataManager(config);
  await dm.initialize();
  
  const strategies = await dm.getStrategies();
  
  for (const strategy of strategies) {
    if (!strategy.marketType && strategy.symbol) {
      const marketType = detectMarketType(strategy.symbol);
      await dm.updateStrategy(strategy.id, { marketType });
      console.log(`Updated strategy ${strategy.id}: ${marketType}`);
    }
  }
  
  console.log(`Backfilled ${strategies.length} strategies`);
}
```

## 使用示例

### 创建 Spot 策略

```typescript
// Web/API
const strategy = await createStrategy({
  name: 'BTC Spot MA',
  exchange: 'binance',
  symbol: 'BTC/USDT',  // 无 : 表示 spot
  // marketType 自动检测为 'spot'
});
```

### 创建 Perpetual 策略

```typescript
// Web/API
const strategy = await createStrategy({
  name: 'BTC Perp MA',
  exchange: 'binance',
  symbol: 'BTC/USDT:USDT',  // 包含 : 表示 perpetual
  // marketType 自动检测为 'perpetual'
});
```

### 在 Strategy 中使用

```typescript
// Strategy 执行时
class MyStrategy implements IStrategy {
  async onTick(ticker: Ticker, context: any) {
    const strategy = context.strategy;
    
    // marketType 自动传递给 exchange API
    if (strategy.marketType === 'perpetual') {
      // Perpetual 特有逻辑
      console.log('Trading perpetual contract');
    } else {
      // Spot 特有逻辑
      console.log('Trading spot market');
    }
  }
}
```

## 测试

### 单元测试

```typescript
describe('MarketType detection', () => {
  it('should detect spot', () => {
    expect(detectMarketType('BTC/USDT')).toBe('spot');
  });
  
  it('should detect perpetual', () => {
    expect(detectMarketType('BTC/USDT:USDT')).toBe('perpetual');
    expect(detectMarketType('BTC-USDT-SWAP')).toBe('perpetual');
    expect(detectMarketType('BTCUSDT_PERP')).toBe('perpetual');
  });
});

describe('BinanceExchange API routing', () => {
  it('should use spot client for spot market', async () => {
    const exchange = new BinanceExchange();
    // 测试 spot API calls
  });
  
  it('should use futures client for perpetual market', async () => {
    const exchange = new BinanceExchange();
    // 测试 futures API calls
  });
});
```

### 集成测试

```typescript
describe('Strategy with perpetual', () => {
  it('should create perpetual strategy', async () => {
    const strategy = await strategyRepository.create({
      name: 'Test Perp',
      symbol: 'BTC/USDT:USDT',
      exchange: 'binance',
      userId: 'user1',
    });
    
    expect(strategy.marketType).toBe('perpetual');
    expect(strategy.normalizedSymbol).toBe('BTCUSDT');
  });
});
```

## 关键注意事项

### 1. API 差异

- **Spot**: 使用 `api.binance.com`, endpoints 以 `/api/v3/` 开头
- **Futures**: 使用 `fapi.binance.com`, endpoints 以 `/fapi/v1/` 或 `/fapi/v2/` 开头

### 2. 订单参数差异

Futures 支持额外的参数：
- `positionSide`: LONG / SHORT (单向/双向持仓)
- `reduceOnly`: 只减仓
- `closePosition`: 全平
- `workingType`: MARK_PRICE / CONTRACT_PRICE

### 3. 账户信息差异

- Spot: 返回资产余额
- Futures: 返回保证金余额 + 持仓信息

### 4. WebSocket 差异

- Spot: `wss://stream.binance.com:9443/ws/`
- Futures: `wss://fstream.binance.com/ws/`

### 5. 价格差异

Spot 和 Perpetual 价格可能略有不同（基差），策略需要注意。

## 优先级

1. ⏫ **P0** - 数据库 schema 同步（已完成）
2. ⏫ **P0** - 前端显示 marketType（待完成）
3. 🔼 **P1** - BinanceExchange API 方法更新（部分完成）
4. 🔼 **P1** - TradingEngine 传递 marketType（待完成）
5. ➡️ **P2** - 完整测试覆盖
6. ⏬ **P3** - Backfill 现有数据

## 下一步行动

1. **同步数据库 schema**: `cd packages/data-manager && pnpm run sync-schema`
2. **更新前端**: 添加 marketType 字段显示
3. **完成 BinanceExchange**: 更新关键 API 方法
4. **测试**: 创建 spot 和 perpetual 策略并验证

## 相关文档

- [Spot vs Futures 处理机制](../architecture/SPOT_VS_FUTURES_HANDLING.md)
- [统一的 Symbol Normalization](./CENTRALIZED_SYMBOL_NORMALIZATION.md)
- [Binance API 文档](https://binance-docs.github.io/apidocs/spot/en/)
- [Binance Futures API 文档](https://binance-docs.github.io/apidocs/futures/en/)

