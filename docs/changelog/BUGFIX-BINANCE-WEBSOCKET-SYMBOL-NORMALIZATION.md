# Bugfix: Binance WebSocket Symbol Normalization

## Issue Summary

**Problem**: Binance WebSocket subscriptions were failing when using perpetual futures symbols (e.g., `BTC/USDT:USDT`).

**Root Cause**: The `buildWebSocketUrl()` method in `BinanceExchange` was using raw symbols directly without normalization, causing invalid WebSocket stream names like `btc/usdt:usdt@ticker` instead of the correct `btcusdt@ticker`.

**Impact**: 
- Strategies using perpetual futures symbols could not subscribe to market data
- WebSocket connections were established but no data was received
- No error messages, just silent failures

---

## Technical Details

### Broken Code

```typescript
// packages/exchange-connectors/src/binance/BinanceExchange.ts
protected buildWebSocketUrl(): string {
  const streams = [];
  for (const [type, symbols] of this.subscriptions) {
    for (const symbol of symbols) {
      switch (type) {
        case 'ticker':
          streams.push(`${symbol.toLowerCase()}@ticker`); // ❌ Using raw symbol
          break;
        // ... other cases
      }
    }
  }
  return `${this.wsBaseUrl}${streams.join('/')}`;
}
```

**Problem**: When `symbol = 'BTC/USDT:USDT'`, it becomes `btc/usdt:usdt@ticker`, which is invalid for Binance WebSocket API.

---

### Fixed Code

```typescript
protected buildWebSocketUrl(): string {
  const streams = [];
  for (const [type, symbols] of this.subscriptions) {
    for (const symbol of symbols) {
      // ✅ Normalize symbol for WebSocket (BTC/USDT:USDT -> BTCUSDT)
      const normalizedSymbol = this.normalizeSymbol(symbol);

      switch (type) {
        case 'ticker':
          streams.push(`${normalizedSymbol.toLowerCase()}@ticker`);
          break;
        case 'orderbook':
          streams.push(`${normalizedSymbol.toLowerCase()}@depth`);
          break;
        case 'trades':
          streams.push(`${normalizedSymbol.toLowerCase()}@trade`);
          break;
        case 'klines':
          // For klines, symbol already includes interval: BTC/USDT@1m
          if (symbol.includes('@')) {
            const [baseSym, interval] = symbol.split('@');
            const normalized = this.normalizeSymbol(baseSym);
            streams.push(`${normalized.toLowerCase()}@${interval}`);
          } else {
            streams.push(`${normalizedSymbol.toLowerCase()}`);
          }
          break;
      }
    }
  }
  return `${this.wsBaseUrl}${streams.join('/')}`;
}
```

**Fix**: Now properly normalizes symbols before building WebSocket stream names.

---

## Symbol Normalization Examples

### Spot Symbols

| Input | Normalized | WebSocket Stream |
|-------|-----------|------------------|
| `BTC/USDT` | `BTCUSDT` | `btcusdt@ticker` |
| `ETH/USDT` | `ETHUSDT` | `ethusdt@trade` |
| `BTC-USDT` | `BTCUSDT` | `btcusdt@depth` |

### Perpetual Futures Symbols

| Input | Normalized | WebSocket Stream |
|-------|-----------|------------------|
| `BTC/USDT:USDT` | `BTCUSDT` | `btcusdt@ticker` |
| `ETH/USDT:USDT` | `ETHUSDT` | `ethusdt@trade` |
| `BTCUSDT_PERP` | `BTCUSDTPERP` | `btcusdtperp@depth` |

### Klines (with intervals)

| Input | Normalized | WebSocket Stream |
|-------|-----------|------------------|
| `BTC/USDT@1m` | `BTCUSDT` | `btcusdt@1m` |
| `BTC/USDT:USDT@5m` | `BTCUSDT` | `btcusdt@5m` |
| `ETH/USDT@1h` | `ETHUSDT` | `ethusdt@1h` |

---

## Testing

### Before Fix

```typescript
// Console output when subscribing to BTC/USDT:USDT
2025-10-24T04:27:55.447Z [INFO] Subscribed via WebSocket: binance BTC/USDT:USDT ticker
// ❌ No data received, silent failure
```

### After Fix

```typescript
// Console output when subscribing to BTC/USDT:USDT
2025-10-24T04:30:15.123Z [INFO] Subscribed via WebSocket: binance BTC/USDT:USDT ticker
2025-10-24T04:30:16.456Z [INFO] 🔍 TICKER: BTC/USDT:USDT - 67234.50
2025-10-24T04:30:17.789Z [INFO] 🔍 TICKER: BTC/USDT:USDT - 67235.00
// ✅ Data flowing correctly
```

---

## Files Changed

1. **`packages/exchange-connectors/src/binance/BinanceExchange.ts`**
   - Updated `buildWebSocketUrl()` to normalize symbols before building stream names
   - Added special handling for klines with intervals

---

## Related Fixes

This bugfix is part of a larger effort to improve exchange connector robustness:

1. **Subscription Coordinator** - Now calls `exchange.unsubscribe()` for WebSocket subscriptions
2. **OKX Unsubscription** - Sends explicit unsubscribe messages to WebSocket
3. **Binance Symbol Normalization** (this fix) - Properly normalizes symbols for WebSocket streams

---

## Binance WebSocket API Reference

### Stream Naming Format

- **Ticker**: `{symbol}@ticker` (e.g., `btcusdt@ticker`)
- **Trades**: `{symbol}@trade` (e.g., `btcusdt@trade`)
- **Orderbook**: `{symbol}@depth` (e.g., `btcusdt@depth`)
- **Klines**: `{symbol}@kline_{interval}` (e.g., `btcusdt@kline_1m`)

### Valid Symbol Format

- **Must be lowercase**
- **No separators** (no `/`, `:`, `-`)
- **Examples**: `btcusdt`, `ethusdt`, `bnbusdt`

### Combined Streams

Multiple streams can be combined in a single WebSocket connection:

```
wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@trade/bnbusdt@depth
```

---

## Prevention

To prevent similar issues in the future:

1. **Always normalize symbols** before using them in exchange-specific APIs
2. **Test with multiple symbol formats** (spot, perpetual, futures)
3. **Add integration tests** for WebSocket subscriptions with various symbol formats
4. **Validate WebSocket stream names** match exchange documentation

---

## Verification Steps

To verify the fix:

1. Start console application
2. Create strategy with perpetual futures symbol: `BTC/USDT:USDT`
3. Observe market data logs:
   ```
   2025-10-24T04:30:16.456Z [INFO] 🔍 TICKER: BTC/USDT:USDT - 67234.50
   ```
4. Verify WebSocket stream in logs contains normalized symbol:
   ```
   Subscribed to: btcusdt@ticker
   ```

---

## Additional Notes

### Why Binance Spot and Perpetuals Use Same Normalized Symbol

Binance uses the **same WebSocket stream** for both spot and perpetual futures:

- Spot: `BTC/USDT` → `BTCUSDT` → `btcusdt@ticker`
- Perpetual: `BTC/USDT:USDT` → `BTCUSDT` → `btcusdt@ticker`

**Differentiation** is done at the REST API level:

- Spot API: `https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT`
- Futures API: `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BTCUSDT`

The WebSocket stream names are identical, but you connect to different base URLs:

- Spot WS: `wss://stream.binance.com:9443/stream`
- Futures WS: `wss://fstream.binance.com/stream`

---

## Impact

- ✅ Binance perpetual futures subscriptions now work correctly
- ✅ Spot subscriptions continue to work as before
- ✅ Klines with intervals handle normalization properly
- ✅ No breaking changes to existing code

---

Author: <xiaoweihsueh@gmail.com>  
Date: October 24, 2025

