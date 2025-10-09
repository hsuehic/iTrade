# Spot vs Futures 处理机制

## 问题

Binance 的 Spot 和 Perpetual Futures 使用相同的 symbol 格式（如 `BTCUSDT`），但是：
- 使用不同的 API endpoints
- 有不同的订单类型和参数
- 价格可能略有差异

**如何区分？**

## 解决方案

### 1. 数据库层 - 保留原始格式

```typescript
// Strategy Entity
{
  id: 1,
  name: 'BTC Spot Strategy',
  exchange: 'binance',
  symbol: 'BTC/USDT',           // 原始格式（用于区分类型）
  normalizedSymbol: 'BTCUSDT'   // 交易所格式（用于 API 调用）
}

{
  id: 2,
  name: 'BTC Perp Strategy',
  exchange: 'binance',
  symbol: 'BTC/USDT:USDT',      // 原始格式（包含 : 表示 perpetual）
  normalizedSymbol: 'BTCUSDT'   // 交易所格式（与 spot 相同）
}
```

### 2. 判断逻辑

```typescript
// 工具函数：判断是否为 futures/perpetual
function isFutures(symbol: string): boolean {
  return symbol.includes(':');
}

// 使用示例
const strategy = await getStrategy(1);

if (isFutures(strategy.symbol)) {
  // 使用 Futures API
  const price = await binance.getFuturesPrice(strategy.normalizedSymbol);
} else {
  // 使用 Spot API
  const price = await binance.getSpotPrice(strategy.normalizedSymbol);
}
```

### 3. Binance API 端点对比

#### Spot API

```
Base URL: https://api.binance.com
WebSocket: wss://stream.binance.com:9443/ws

示例：
GET /api/v3/ticker/price?symbol=BTCUSDT
GET /api/v3/depth?symbol=BTCUSDT&limit=100
POST /api/v3/order (下单)
```

#### USDT-M Futures API (Perpetual)

```
Base URL: https://fapi.binance.com
WebSocket: wss://fstream.binance.com/ws

示例：
GET /fapi/v1/ticker/price?symbol=BTCUSDT
GET /fapi/v1/depth?symbol=BTCUSDT&limit=100
POST /fapi/v1/order (下单)
```

#### 测试网

```
Spot Testnet: https://testnet.binance.vision
Futures Testnet: https://testnet.binancefuture.com
```

## 当前实现状态

### ✅ 已实现

1. **Symbol 格式区分**
   - `packages/utils/ExchangeUtils.ts` - 支持 spot 和 futures 格式
   - 数据库保存原始 `symbol` 和 `normalizedSymbol`

2. **BinanceExchange (Spot only)**
   - 当前只实现了 Spot API
   - 位置：`packages/exchange-connectors/src/binance/BinanceExchange.ts`

### 🚧 待实现

1. **BinanceFuturesExchange**
   - 需要创建单独的 Futures connector
   - 使用不同的 base URL 和 endpoints

2. **动态选择 Exchange**
   - 在 TradingEngine 中根据 symbol 格式选择正确的 exchange

## 实现方案

### 方案 A：统一 Exchange（推荐）

在 `BinanceExchange` 中自动检测并路由到正确的 API：

```typescript
export class BinanceExchange extends BaseExchange {
  private static readonly SPOT_BASE_URL = 'https://api.binance.com';
  private static readonly FUTURES_BASE_URL = 'https://fapi.binance.com';
  
  private spotClient: AxiosInstance;
  private futuresClient: AxiosInstance;
  
  constructor(isTestnet = false) {
    super('binance', /* base url */, /* ws url */);
    
    this.spotClient = axios.create({
      baseURL: isTestnet 
        ? 'https://testnet.binance.vision' 
        : BinanceExchange.SPOT_BASE_URL
    });
    
    this.futuresClient = axios.create({
      baseURL: isTestnet 
        ? 'https://testnet.binancefuture.com' 
        : BinanceExchange.FUTURES_BASE_URL
    });
  }
  
  // 内部方法：选择正确的 client
  private getClient(symbol: string): AxiosInstance {
    return this.isFuturesSymbol(symbol) ? this.futuresClient : this.spotClient;
  }
  
  private isFuturesSymbol(symbol: string): boolean {
    // 检查原始格式是否包含 :
    // 但这里我们只有 normalized symbol (BTCUSDT)
    // 需要在调用时传入原始格式或者在 strategy 中携带类型
  }
  
  public async getTicker(symbol: string, marketType?: 'spot' | 'futures'): Promise<Ticker> {
    const client = marketType === 'futures' ? this.futuresClient : this.spotClient;
    const endpoint = marketType === 'futures' ? '/fapi/v1/ticker/price' : '/api/v3/ticker/price';
    
    // ... 实现
  }
}
```

**问题**：normalized symbol 丢失了 spot/futures 信息。

### 方案 B：Strategy 添加 marketType 字段（推荐✅）

在 Strategy entity 中添加 `marketType` 字段：

```typescript
// Strategy Entity
export class StrategyEntity {
  @Column({ type: 'text', nullable: true })
  symbol?: string;
  
  @Column({ type: 'text', nullable: true })
  normalizedSymbol?: string;
  
  @Column({ 
    type: 'enum',
    enum: ['spot', 'futures', 'perpetual'],
    default: 'spot'
  })
  marketType!: string; // ✨ 新增字段
}
```

**自动计算** marketType：

```typescript
// StrategyRepository.create()
if (entityData.symbol && entityData.exchange) {
  entityData.normalizedSymbol = normalizeSymbol(entityData.symbol, entityData.exchange);
  
  // 自动检测市场类型
  if (entityData.symbol.includes(':')) {
    entityData.marketType = 'perpetual';
  } else {
    entityData.marketType = 'spot';
  }
}
```

然后在 `BinanceExchange` 中：

```typescript
public async getTicker(symbol: string, options?: { marketType?: string }): Promise<Ticker> {
  const client = options?.marketType === 'perpetual' || options?.marketType === 'futures'
    ? this.futuresClient 
    : this.spotClient;
  
  const endpoint = options?.marketType === 'perpetual' || options?.marketType === 'futures'
    ? '/fapi/v1/ticker/price'
    : '/api/v3/ticker/price';
  
  const resp = await client.get(endpoint, {
    params: { symbol }
  });
  
  // ... 处理响应
}
```

### 方案 C：分离的 Exchange Classes

创建两个独立的 exchange classes：

```typescript
// packages/exchange-connectors/src/binance/BinanceSpotExchange.ts
export class BinanceSpotExchange extends BaseExchange {
  constructor(isTestnet = false) {
    super('binance-spot', SPOT_BASE_URL, SPOT_WS_URL);
  }
}

// packages/exchange-connectors/src/binance/BinanceFuturesExchange.ts
export class BinanceFuturesExchange extends BaseExchange {
  constructor(isTestnet = false) {
    super('binance-futures', FUTURES_BASE_URL, FUTURES_WS_URL);
  }
}
```

在 Strategy 中：

```typescript
{
  exchange: 'binance-spot',    // 或 'binance-futures'
  symbol: 'BTC/USDT',
  normalizedSymbol: 'BTCUSDT'
}
```

**缺点**：用户需要选择 `binance-spot` 还是 `binance-futures`，不够直观。

## 推荐实现：方案 B + 优化

### 步骤 1：添加 marketType 字段

```sql
-- Migration
ALTER TABLE strategies 
ADD COLUMN "marketType" VARCHAR(20) DEFAULT 'spot';

CREATE INDEX idx_strategies_market_type 
ON strategies("marketType");
```

### 步骤 2：更新 StrategyEntity

```typescript
export enum MarketType {
  SPOT = 'spot',
  FUTURES = 'futures',
  PERPETUAL = 'perpetual',
  MARGIN = 'margin',
}

export class StrategyEntity {
  // ... existing fields
  
  @Column({ 
    type: 'enum',
    enum: MarketType,
    default: MarketType.SPOT
  })
  marketType!: MarketType;
}
```

### 步骤 3：自动计算 marketType

```typescript
// packages/data-manager/src/repositories/StrategyRepository.ts
import { detectMarketType } from '@itrade/utils';

async create(data): Promise<StrategyEntity> {
  const entityData: any = { ...strategyData };
  
  if (entityData.symbol && entityData.exchange) {
    entityData.normalizedSymbol = normalizeSymbol(
      entityData.symbol, 
      entityData.exchange
    );
    
    // 自动检测市场类型
    entityData.marketType = detectMarketType(entityData.symbol);
  }
  
  return await this.repository.save(entityData);
}
```

### 步骤 4：添加工具函数

```typescript
// packages/utils/src/ExchangeUtils.ts
export type MarketType = 'spot' | 'futures' | 'perpetual' | 'margin';

/**
 * 检测交易对的市场类型
 */
export function detectMarketType(symbol: string): MarketType {
  const upperSymbol = symbol.toUpperCase();
  
  // 包含 : 表示衍生品
  if (upperSymbol.includes(':')) {
    return 'perpetual'; // 或 'futures'
  }
  
  // 包含 _PERP, _SWAP 等
  if (upperSymbol.includes('_PERP') || upperSymbol.includes('_SWAP')) {
    return 'perpetual';
  }
  
  // 包含 FUTURES
  if (upperSymbol.includes('FUTURES')) {
    return 'futures';
  }
  
  // 默认是现货
  return 'spot';
}

/**
 * 判断是否为 futures/perpetual
 */
export function isFuturesMarket(marketType: MarketType): boolean {
  return marketType === 'futures' || marketType === 'perpetual';
}
```

### 步骤 5：更新 BinanceExchange

```typescript
export class BinanceExchange extends BaseExchange {
  private spotClient: AxiosInstance;
  private futuresClient: AxiosInstance;
  
  constructor(isTestnet = false) {
    // 初始化两个 clients
  }
  
  public async getTicker(
    symbol: string, 
    options?: { marketType?: string }
  ): Promise<Ticker> {
    const isFutures = options?.marketType === 'perpetual' || 
                      options?.marketType === 'futures';
    
    const client = isFutures ? this.futuresClient : this.spotClient;
    const endpoint = isFutures ? '/fapi/v1/ticker/price' : '/api/v3/ticker/price';
    
    const resp = await client.get(endpoint, {
      params: { symbol }
    });
    
    return this.transformTicker(resp.data);
  }
  
  // 类似地更新其他方法
}
```

### 步骤 6：在 StrategyManager 中使用

```typescript
async addStrategy(strategyId: number): Promise<void> {
  const dbStrategy = await this.dataManager.getStrategy(strategyId);
  
  // ... 创建 strategy instance
  
  // 订阅市场数据时传入 marketType
  await this.tradeEngine.subscribe(
    dbStrategy.exchange,
    dbStrategy.normalizedSymbol,
    { marketType: dbStrategy.marketType }
  );
}
```

## 总结

### 当前状态
- ✅ Symbol normalization 支持 spot 和 perpetual 格式
- ⚠️ BinanceExchange 只实现了 Spot API
- ❌ 无法区分 spot 和 perpetual 的 API 调用

### 推荐方案
1. **添加 `marketType` 字段到 Strategy entity**
2. **在保存时自动检测和计算**
3. **BinanceExchange 支持两种 API endpoints**
4. **在调用 API 时传入 marketType**

### 优先级
- **P0**: 添加 `marketType` 字段和自动检测逻辑
- **P1**: 更新 BinanceExchange 支持 Futures API
- **P2**: 在所有 API 方法中支持 marketType 参数
- **P3**: 更新 UI 显示市场类型

### 注意事项

1. **价格差异**：Spot 和 Futures 价格可能略有不同
2. **订单类型**：Futures 支持更多订单类型（如只减仓）
3. **保证金**：Futures 需要保证金管理
4. **资金费率**：Perpetual 有资金费率机制
5. **结算**：Futures 有到期日，Perpetual 无到期日

这些差异需要在策略执行时特别处理。

