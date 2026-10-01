# Trade Mode, Leverage, Stop Loss, and Take Profit Implementation

## Overview

This document describes the implementation of **trade mode** (cash/isolated/cross margin), **leverage**, **stop loss**, and **take profit** support across the iTrade trading system, enabling strategies to specify margin trading modes, leverage for futures/perpetual contracts, stop loss protection, and take profit targets.

## Implementation Summary

### 1. Core Type Additions

**File**: `packages/core/src/types/index.ts`

Added optional fields to `StrategyResult`:

```typescript
export interface StrategyResult {
  action: 'buy' | 'sell' | 'hold';
  quantity?: Decimal;
  price?: Decimal;
  stopLoss?: Decimal;
  takeProfit?: Decimal;
  confidence?: number;
  reason?: string;
  // NEW: Trading mode and leverage (for futures/margin)
  tradeMode?: 'cash' | 'isolated' | 'cross'; // cash=spot, isolated/cross=margin/futures
  leverage?: number; // Leverage multiplier (e.g., 1, 2, 5, 10)
}
```

### 2. Interface Updates

**File**: `packages/core/src/interfaces/index.ts`

#### ExecuteOrderParameters

Added `tradeMode`, `leverage`, `stopLoss`, and `takeProfit` to order execution parameters:

```typescript
export interface ExecuteOrderParameters {
  strategyName: string;
  symbol: string;
  side: OrderSide;
  quantity: Decimal;
  type: OrderType;
  price?: Decimal;
  stopPrice?: Decimal;
  takeProfit?: Decimal;
  tradeMode?: 'cash' | 'isolated' | 'cross'; // NEW
  leverage?: number; // NEW
}
```

#### IExchange.createOrder

Renamed `stopPrice` to `stopLoss` for clarity and added optional `options` parameter with `tradeMode`, `leverage`, and `takeProfitPrice`:

```typescript
createOrder(
  symbol: string,
  side: OrderSide,
  type: OrderType,
  quantity: Decimal,
  price?: Decimal,
  stopLoss?: Decimal,        // ← Renamed from stopPrice
  timeInForce?: TimeInForce,
  clientOrderId?: string,
  options?: {
    tradeMode?: 'cash' | 'isolated' | 'cross';
    leverage?: number;
    takeProfitPrice?: Decimal;
  },
): Promise<Order>;
```

### 3. TradingEngine Updates

**File**: `packages/core/src/engine/TradingEngine.ts`

Updated `executeStrategySignal` to pass `tradeMode` and `leverage` from strategy signals to order execution:

```typescript
await this.executeOrder({
  strategyName,
  symbol,
  side,
  quantity: signal.quantity,
  type: orderType,
  price: signal.price,
  stopPrice: signal.stopLoss,
  tradeMode: signal.tradeMode, // Passed through
  leverage: signal.leverage, // Passed through
});
```

Updated `executeOrder` to forward options to exchange:

```typescript
const executedOrder = await exchange.createOrder(
  symbol,
  side,
  type,
  adjustedQuantity,
  adjustedPrice,
  adjustedStopPrice,
  'GTC' as TimeInForce,
  order.clientOrderId,
  {
    tradeMode,
    leverage,
  },
);
```

### 4. Exchange Implementations

#### OKX Exchange (✅ Fully Implemented)

**File**: `packages/exchange-connectors/src/okx/OKXExchange.ts`

**Key Implementation** with stop loss and take profit:

```typescript
public async createOrder(
  // ... standard parameters
  options?: {
    tradeMode?: 'cash' | 'isolated' | 'cross';
    leverage?: number;
  },
): Promise<Order> {
  const instId = this.normalizeSymbol(symbol);

  // Determine instrument type
  const isSwap = instId.endsWith('-SWAP') || /-\d{6}$/.test(instId);

  // Determine tdMode: use option if provided, else default
  // SPOT: cash (non-margin trading)
  // SWAP/FUTURES: isolated (safer than cross), or cross if specified
  let tdMode = options?.tradeMode;
  if (!tdMode) {
    tdMode = isSwap ? 'isolated' : 'cash';
  }

  const orderData: any = {
    instId,
    tdMode, // cash=spot, isolated=isolated margin, cross=cross margin
    side: side.toLowerCase(),
    ordType: this.normalizeOrderType(type),
    sz: quantity.toString(),
  };

  // Leverage is NOT an order-body parameter on OKX: v5 documents no `lever`
  // field on POST /api/v5/trade/order (the `lever` entries in the reference are
  // response fields). It is set through a separate call before the order, and
  // skipped for a reduce-only order so a close never re-levers the position.
  if (isSwap && options?.leverage && !options?.reduceOnly) {
    await this.setOkxLeverage(instId, options.leverage, tdMode);
  }

  // ... rest of order creation
}
```

**OKX Trade Mode Mapping**:

| Unified Mode | OKX tdMode | Description                           |
| ------------ | ---------- | ------------------------------------- |
| `cash`       | `cash`     | Spot trading (no margin)              |
| `isolated`   | `isolated` | Isolated margin (default for futures) |
| `cross`      | `cross`    | Cross margin                          |

**Default Behavior**:

- **SPOT** (`BTC-USDT`): `tdMode = 'cash'`
- **SWAP/FUTURES** (`BTC-USDT-SWAP`): `tdMode = 'isolated'` (safer default than cross)

#### Binance Exchange (✅ Fully Implemented)

**File**: `packages/exchange-connectors/src/binance/BinanceExchange.ts`

**Leverage & Margin Type Implementation**:

Binance requires leverage to be set **separately before order creation** (as does OKX, via `POST /api/v5/account/set-leverage`; neither venue accepts a leverage field on the order body):

```typescript
// Assert the margin type independently of the leverage cache (2026-10-01:
// it used to live inside setLeverage(), which is skipped on a cache hit)
if (
  isFutures &&
  !options?.reduceOnly &&
  options?.tradeMode &&
  options.tradeMode !== TradeMode.CASH
) {
  await this.setMarginType(
    normalizedSymbol,
    options.tradeMode === TradeMode.CROSS ? 'cross' : 'isolated',
  );
}

// Auto-set leverage before placing order
if (isFutures && options?.leverage) {
  const currentLeverage = this.leverageCache.get(normalizedSymbol);
  if (currentLeverage !== options.leverage) {
    await this.setLeverage(normalizedSymbol, options.leverage);
    this.leverageCache.set(normalizedSymbol, options.leverage);
  }
}

// Private method: Set leverage via Binance Futures API
private async setLeverage(symbol: string, leverage: number) {
  await this.futuresClient.post('/fapi/v1/leverage', {
    symbol,
    leverage,
    timestamp: Date.now(),
  });
}
```

**Key Features:**

- ✅ Auto-sets leverage before order creation
- ✅ Caches leverage per symbol to avoid redundant API calls
- ✅ Supports margin type (isolated/cross)
- ✅ Handles "leverage already set" errors gracefully
- ✅ Uses Binance Futures API (`/fapi/v1/leverage`)

**Take Profit Implementation**:

```typescript
public async createOrder(
  // ... standard parameters
  _options?: {
    tradeMode?: 'cash' | 'isolated' | 'cross';
    leverage?: number;
    takeProfitPrice?: Decimal;
  },
): Promise<Order> {
  // ... standard params

  // Binance supports take profit through stopPrice for TAKE_PROFIT orders
  if (_options?.takeProfitPrice) {
    params.stopPrice = _options.takeProfitPrice.toString();
    // If price is provided, use TAKE_PROFIT_LIMIT, otherwise TAKE_PROFIT
    if (price) {
      params.type = 'TAKE_PROFIT_LIMIT';
      params.price = price.toString();
    } else {
      params.type = 'TAKE_PROFIT';
    }
  }

  // ... rest of order creation
}
```

**Binance Order Types**:

- `TAKE_PROFIT`: Market order triggered at take profit price
- `TAKE_PROFIT_LIMIT`: Limit order triggered at take profit price

#### Coinbase Exchange (✅ Fully Implemented)

**File**: `packages/exchange-connectors/src/coinbase/CoinbaseExchange.ts`

**Trading Support:**

- ✅ **Spot Trading** - Full support with take profit
- ✅ **Perpetual Futures** - Via Coinbase Advanced Trade API
- ✅ **Leverage** - Per-order parameter (up to 10x)
- ✅ **Margin Type** - Isolated/Cross support
- ❌ **Stop Loss** - Not supported (use stop limit orders for take profit)

**Leverage Implementation for Perpetual Futures**:

Coinbase Advanced Trade API supports leverage as a **per-order parameter**:

```typescript
// Detect perpetual futures by symbol format
const isPerpetual = productId.includes('-PERP') || symbol.includes(':');

// Add leverage to order body for perpetual futures
if (isPerpetual && options?.leverage) {
  body.leverage = options.leverage.toString(); // Up to 10x
  console.log(
    `[Coinbase] Setting leverage ${options.leverage}x for perpetual ${productId}`,
  );
}

// Add margin type: the connector sends a fixed ISOLATED field, but Coinbase's
// perpetual venue is cross-only and reports `marginType: 'cross'` for the
// position, so the value is not user-selectable.
if (isPerpetual) {
  body.margin_type = 'ISOLATED';
}
```

**Key Features:**

- ✅ Leverage specified per-order in request body
- ✅ Supports up to 10x leverage for perpetuals
- ⚠️ Margin type: not selectable (cross-only venue; the connector sends a fixed `margin_type: 'ISOLATED'` field that the venue reports back as `cross`)
- ✅ Auto-detects perpetual contracts (`-PERP` suffix)
- ✅ Same unified interface as OKX/Binance

**Prerequisites:**

1. **Onboard for Perpetuals** - Complete onboarding via Coinbase Advanced Trade UI
2. **Transfer Margin** - Move USDC to "Perpetuals Portfolio" for margin
3. **API Trading** - Use iTrade to place orders with leverage parameter

**Symbol Format:**

- Spot: `BTC-USD`, `ETH-USD`
- Perpetual: `BTC-PERP`, `ETH-PERP`

**Take Profit Implementation** (spot and futures):

```typescript
public async createOrder(
  // ... standard parameters
  _options?: {
    tradeMode?: 'cash' | 'isolated' | 'cross';
    leverage?: number;
    takeProfitPrice?: Decimal;
  },
): Promise<Order> {
  // If take profit is provided, use stop limit order
  if (_options?.takeProfitPrice) {
    order_configuration.stop_limit_stop_limit_gtc = {
      base_size: quantity.toString(),
      limit_price: price?.toString() || _options.takeProfitPrice.toString(),
      stop_price: _options.takeProfitPrice.toString(),
      stop_direction: side === OrderSide.BUY
        ? 'STOP_DIRECTION_STOP_DOWN'
        : 'STOP_DIRECTION_STOP_UP',
    };
  }

  // ... rest of order creation
}
```

**Coinbase Configuration**:

- Uses `stop_limit_stop_limit_gtc` for take profit orders
- `stop_direction` determines when order triggers
- Spot trading only (no margin/leverage support)

#### BaseExchange Abstract Class

**File**: `packages/exchange-connectors/src/base/BaseExchange.ts`

Updated abstract method signature:

```typescript
public abstract createOrder(
  symbol: string,
  side: OrderSide,
  type: OrderType,
  quantity: Decimal,
  price?: Decimal,
  stopPrice?: Decimal,
  timeInForce?: TimeInForce,
  clientOrderId?: string,
  options?: {
    tradeMode?: 'cash' | 'isolated' | 'cross';
    leverage?: number;
  },
): Promise<Order>;
```

## Usage Examples

### Strategy Example: Specify Trade Mode and Leverage

```typescript
export class MyFuturesStrategy extends BaseStrategy {
  public override async analyze(marketData: {
    klines?: Kline[];
  }): Promise<StrategyResult> {
    // ... analysis logic

    if (shouldBuy) {
      return {
        action: 'buy',
        quantity: new Decimal(100),
        price: currentPrice,
        tradeMode: 'isolated', // Use isolated margin
        leverage: 5, // 5x leverage
        reason: 'Buy signal with 5x leverage',
      };
    }

    return { action: 'hold' };
  }
}
```

### Strategy Configuration

```typescript
const strategy = new MyFuturesStrategy({
  exchange: 'okx',
  symbol: 'BTC/USDT:USDT', // Perpetual futures
  // ... other parameters
});
```

When this strategy generates a signal with `tradeMode: 'isolated'` and `leverage: 5`, the TradingEngine will:

1. Extract `tradeMode` and `leverage` from the signal
2. Pass them to `executeOrder` parameters
3. Forward them to the exchange's `createOrder` method
4. OKX will create an order with `tdMode='isolated'` and `lever='5'`

## Trade Mode Reference

### Cash Mode (`cash`)

- **Use Case**: Spot trading without margin
- **Risk**: Low (limited to available balance)
- **Exchanges**: All (Binance SPOT, OKX SPOT, Coinbase)
- **Leverage**: Not applicable (1x only)

### Isolated Margin Mode (`isolated`)

- **Use Case**: Margin/futures trading with position-specific margin
- **Risk**: Medium (limited to position margin)
- **Exchanges**: OKX SWAP/FUTURES, Binance FUTURES (future support)
- **Leverage**: Configurable (e.g., 2x, 5x, 10x, 20x)
- **Advantage**: Liquidation only affects individual position

### Cross Margin Mode (`cross`)

- **Use Case**: Margin/futures trading with shared account margin
- **Risk**: High (entire account can be liquidated)
- **Exchanges**: OKX SWAP/FUTURES, Binance FUTURES (future support)
- **Leverage**: Configurable (e.g., 2x, 5x, 10x, 20x)
- **Advantage**: More flexible margin management

## Default Behavior

### OKX Exchange

| Symbol Type  | Example         | Default tdMode | Default Leverage           |
| ------------ | --------------- | -------------- | -------------------------- |
| SPOT         | `BTC-USDT`      | `cash`         | N/A (1x)                   |
| SWAP/FUTURES | `BTC-USDT-SWAP` | `isolated`     | None (must set explicitly) |

### Binance Exchange

| Symbol Type | Example             | Default Mode | Default Leverage |
| ----------- | ------------------- | ------------ | ---------------- |
| SPOT        | `BTCUSDT`           | `cash`       | N/A (1x)         |
| FUTURES     | `BTCUSDT` (futures) | Reserved     | Reserved         |

### Coinbase Exchange

| Symbol Type | Example    | Default Mode | Default Leverage |
| ----------- | ---------- | ------------ | ---------------- |
| SPOT        | `BTC-USDT` | `cash`       | N/A (1x)         |

## Error Handling

### OKX API Errors

Enhanced error messages now include detailed error information:

```typescript
if (response.data.code !== '0') {
  const details = Array.isArray(response.data.data)
    ? JSON.stringify(response.data.data[0] || {})
    : '';
  throw new Error(
    `OKX API error [${response.data.code}]: ${response.data.msg} ${details}`,
  );
}
```

**Common Errors**:

- **Code 51000**: Parameter error (invalid tdMode, leverage, or instrument)
- **Code 51008**: Order placement failed (insufficient margin, position limit)
- **Code 51116**: Leverage not set for isolated/cross margin
- **Code 51201**: Instrument not found

### Strategy Error Handling

Strategies should handle order rejection gracefully:

```typescript
try {
  const signal = await strategy.analyze(marketData);
  await engine.executeOrder({
    // ... parameters
    tradeMode: signal.tradeMode,
    leverage: signal.leverage,
  });
} catch (error) {
  logger.error('Order execution failed', error);
  // Strategy can adjust parameters and retry
}
```

## Testing

### Verification Steps

1. **Build Packages**:

   ```bash
   pnpm -C packages/core build
   pnpm -C packages/exchange-connectors build
   pnpm -C packages/strategies build
   ```

2. **Run Test Strategy**:

   ```bash
   cd apps/console
   pnpm dev
   ```

3. **Verify Logs**:
   - Check that strategies start successfully
   - Monitor kline updates and strategy analysis
   - Verify order placement (when signals generated)

### Test Results

✅ **Core types updated** - `StrategyResult` includes `tradeMode`, `leverage`, `stopLoss`, and `takeProfit`  
✅ **Interfaces updated** - `ExecuteOrderParameters` and `IExchange.createOrder` (renamed `stopPrice` → `stopLoss`)  
✅ **TradingEngine updated** - Passes `tradeMode`, `leverage`, `stopLoss`, and `takeProfit` through  
✅ **OKX Exchange implemented** - Full support for `tdMode`, `slTriggerPx`, `tpTriggerPx`; leverage goes through `POST /api/v5/account/set-leverage`, never an order-body field  
✅ **Binance Exchange implemented** - Full leverage support via `/fapi/v1/leverage` + margin type + stop loss + take profit  
✅ **Coinbase Exchange implemented** - Perpetual futures with per-order `leverage` (up to 10x) and a fixed (non-selectable) `margin_type`; the venue is cross-only  
✅ **System integration verified** - All packages rebuilt successfully

## Future Enhancements

1. **Binance Futures Support**:
   - Implement `_options` parameter handling in `BinanceExchange.createOrder`
   - Add separate futures API client
   - Map `tradeMode` to Binance margin modes

2. **Leverage Management**:
   - Add pre-flight leverage validation
   - Implement leverage adjustment API calls
   - Add leverage change event handling

3. **Risk Management**:
   - Add margin requirement checks in `RiskManager`
   - Implement position-level leverage limits
   - Add liquidation price calculations

4. **Dynamic Leverage**:
   - Allow strategies to adjust leverage based on volatility
   - Implement adaptive risk management
   - Add leverage optimization algorithms

## Migration Guide

### For Existing Strategies

No changes required. Strategies that don't specify `tradeMode` or `leverage` will use default values:

- **SPOT**: `tradeMode='cash'`, no leverage
- **SWAP/FUTURES (OKX)**: `tradeMode='isolated'`, no leverage (must set explicitly)

### For New Futures Strategies

To use leverage on OKX futures:

```typescript
return {
  action: 'buy',
  quantity: new Decimal(100),
  price: targetPrice,
  tradeMode: 'isolated', // Required for leverage
  leverage: 5, // Desired leverage (2-125x on OKX)
};
```

## Exchange-Specific Parameter Mapping

### OKX Parameters

| iTrade Parameter        | OKX Parameter                                      | Description                               |
| ----------------------- | -------------------------------------------------- | ----------------------------------------- |
| `tradeMode: 'cash'`     | `tdMode: 'cash'`                                   | Spot trading (no margin)                  |
| `tradeMode: 'isolated'` | `tdMode: 'isolated'`                               | Isolated margin                           |
| `tradeMode: 'cross'`    | `tdMode: 'cross'`                                  | Cross margin                              |
| `leverage: 5`           | POST `/api/v5/account/set-leverage` (`lever: '5'`) | Set before order; skipped for reduce-only |
| `stopLoss`              | `slTriggerPx`                                      | Stop loss trigger price                   |
| `takeProfitPrice`       | `tpTriggerPx`                                      | Take profit trigger price                 |
| `price` (with SL)       | `slOrdPx`                                          | Stop loss order price                     |
| `price` (with TP)       | `tpOrdPx`                                          | Take profit order price                   |

### Binance Parameters

| iTrade Parameter             | Binance Parameter                       | Description             |
| ---------------------------- | --------------------------------------- | ----------------------- |
| `tradeMode: 'isolated'`      | POST `/fapi/v1/marginType` (`ISOLATED`) | Set before order        |
| `tradeMode: 'cross'`         | POST `/fapi/v1/marginType` (`CROSSED`)  | Set before order        |
| `leverage: 5`                | POST `/fapi/v1/leverage`                | Set before order        |
| `stopLoss`                   | `stopPrice`                             | Stop loss trigger price |
| `takeProfitPrice` (no price) | `type: 'TAKE_PROFIT'`                   | Market order at TP      |
| `takeProfitPrice` + `price`  | `type: 'TAKE_PROFIT_LIMIT'`             | Limit order at TP       |
| `takeProfitPrice`            | `stopPrice`                             | Trigger price           |

### Coinbase Parameters

| iTrade Parameter     | Coinbase Parameter                    | Description                                             |
| -------------------- | ------------------------------------- | ------------------------------------------------------- |
| `leverage: 5`        | `leverage: "5"`                       | Per-order leverage (up to 10x)                          |
| `tradeMode` (either) | `margin_type: "ISOLATED"` (hardcoded) | Ignored — venue is cross-only; reported back as `cross` |
| `stopLoss`           | N/A                                   | ❌ Not supported                                        |
| `takeProfitPrice`    | `stop_limit_stop_limit_gtc`           | Stop limit order                                        |
| `takeProfitPrice`    | `stop_price`                          | Trigger price                                           |
| `price`              | `limit_price`                         | Limit order price                                       |
| `side + TP`          | `stop_direction`                      | `STOP_UP` or `STOP_DOWN`                                |

> Note: the connector sends a hardcoded `margin_type: 'ISOLATED'` field on perpetual
> orders, but Coinbase's perpetual venue is cross-margin only — its connector reports
> `marginType: 'cross'` for the resulting position. Because a requested mode would
> therefore misreport the position, the web order form does not offer a mode selector
> for Coinbase (see the 2026-10-01 section below).

**Important Notes:**

- Perpetual futures symbols: `BTC-PERP`, `ETH-PERP`
- Spot symbols: `BTC-USD`, `ETH-USD`
- Leverage: Up to 10x (specified per-order in request body)
- Requires onboarding and USDC in perpetuals portfolio

## Margin-Mode Audit & Fix (2026-10-01)

**Symptom.** Strategy 634 (`2026-10-WLD-L-1`, `LadderEntrySingleTPStrategy`,
WLDUSDC perp, `leverage: 5`) runs with `tradeMode: 'isolated'` in its signals,
yet the position on Binance came back as `cross`.

**Root cause.** `tradeMode` was never applied on its own. In
`BinanceExchange.createOrder` the margin type was set _inside_ `setLeverage()`,
and `setLeverage()` is only called when the requested leverage differs from the
in-process `leverageCache`:

| Order # | requested leverage matches cache? | `setLeverage()` | margin type applied |
| ------- | --------------------------------- | --------------- | ------------------- |
| 1st     | no                                | yes             | yes                 |
| 2nd+    | yes                               | skipped         | **never**           |

`setMarginType()` additionally swallowed every error except `-4046`, so a `-4047`
rejection (open orders still reference the symbol) or `-4048` (a position still
exists) was invisible. Binance USDⓈ-M accounts default to **CROSSED** while the
OKX connector defaults to `ISOLATED` — hence a Binance-only drift.

**Fix.**

1. `BinanceExchange.createOrder` asserts the margin type on every futures order
   that requests one (`POST /fapi/v1/marginType`), independent of the leverage
   cache. It stays non-throwing (margin type must never block an order) but a
   rejection is now logged once per symbol instead of being discarded; `-4046`
   stays quiet and also re-arms the warning (a mode flipped by hand is corrected
   by the next order, and a later drift warns again). Reduce-only (closing)
   orders are skipped — the symbol still holds the position being closed, so the
   switch could only be rejected. Note the request is deliberately re-sent on
   every opening order rather than cached: a process-lifetime cache is exactly
   what caused this bug, and an operator who flips a symbol's mode by hand would
   otherwise never be corrected. **Accepted cost:** a ladder strategy placing N
   entries adds N margin-type requests (one extra round-trip per opening order),
   which is the price of trusting the exchange state over a local cache.
   The same reduce-only rule now covers leverage: `setLeverage` is not called for
   a reduce-only order (Binance), and OKX skips its account-level leverage call —
   a close must never re-lever the position it is reducing. This holds at the
   connector level, so it also protects callers that bypass the web service.
2. Manual (web) orders resolve the mode/leverage through one pure function,
   `resolvePerpOrderSettings` (`apps/web/lib/services/perp-order-settings.ts`):
   Binance perpetual opening orders ask for `ISOLATED` when the caller omits a
   mode. No default mode is sent for OKX (its connector has its own `tdMode`
   default, and an explicitly requested mode is still passed through), Coinbase (cross-only perp
   market, so a "requested mode" would misreport the position; leverage defaults
   to 5x) or spot symbols, and nothing is ever sent for a `CLOSE_*` order.
3. The web transaction form exposes **Margin Mode** (`isolated` / `cross`,
   default `isolated`; Binance + OKX only — Coinbase's perp market is cross-only
   and its connector reports `marginType: 'cross'`, so the field is neither shown
   nor sent) and **Leverage** when the symbol is a perpetual **opening** order.
   Leverage accepts whole numbers, 1–125 for Binance/OKX and 1–10 for Coinbase
   (its perp cap), and is only validated when it would actually be sent — a value
   left over from an earlier perpetual entry must never block a spot or a
   `CLOSE_*` submit. Closing actions hide both fields and submit unchanged.
4. Audit trail: `orders.tradeMode` (text) and `orders.leverage` (`numeric`, so a
   fractional value from any venue cannot break the insert) record what the order
   _asked_ for, on opening perpetual orders. This is the request, not proof the
   exchange applied it — when Binance rejects the switch the previous mode stays
   in place. Later partial order updates never clear the columns (`OrderRepository.save`
   upserts only the columns it is given).

**Out of scope / manual.** An existing position's margin mode cannot be switched
through this path: Binance requires the symbol to have no position and no open
orders. Cross positions already open (e.g. WLDUSDC) are switched by hand on the
exchange; the position page has no margin-mode editor.

**Deploy note.** Both columns are additive and `orders` is large, so the columns
arrive via the CD schema sync (`schema_check` in `.github/workflows/deploy.yml`
triggers the schema-migrator for changes under `packages/<pkg>/src/entities/`)
before the app containers are recreated. TypeORM selects every mapped column, so
app code deployed ahead of the sync would fail on a missing column.

## References

- [OKX Trade API Documentation](https://www.okx.com/docs-v5/en/#order-book-trading-trade-post-place-order)
- [OKX Stop Orders](https://www.okx.com/docs-v5/en/#order-book-trading-trade-post-place-order)
- [OKX Trade Modes](https://www.okx.com/docs-v5/en/#overview-trading-modes)
- [Binance SPOT API](https://binance-docs.github.io/apidocs/spot/en/#new-order-trade)
- [Binance Futures API](https://binance-docs.github.io/apidocs/futures/en/)
- [Coinbase Advanced Trade API](https://docs.cloud.coinbase.com/advanced-trade-api/docs/rest-api-orders)

---

Author: <xiaoweihsueh@gmail.com>  
Date: October 24, 2025
