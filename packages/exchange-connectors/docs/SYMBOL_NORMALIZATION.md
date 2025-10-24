# Symbol Normalization & Denormalization

## Overview

This document describes the symbol format convention used across iTrade and how exchange-specific formats are converted to/from the unified format.

## Unified Symbol Format (CCXT-style)

iTrade uses **CCXT-style** symbol notation as the unified format across all exchanges.

### Format Rules

| Market Type | Format | Example | Description |
|------------|--------|---------|-------------|
| **Spot** | `BASE/QUOTE` | `BTC/USDT` | Base asset quoted in quote asset |
| **Perpetual** | `BASE/QUOTE:SETTLEMENT` | `BTC/USDT:USDT` | Perpetual swap settled in settlement currency |
| **Dated Futures** | `BASE/QUOTE:EXPIRY` | `BTC/USDT:250328` | Futures contract with expiry date |

### Why CCXT-style?

1. **Industry Standard**: CCXT is the de facto standard for cryptocurrency trading libraries
2. **Descriptive**: Clear semantic meaning (`/` = quoted in, `:` = settled in)
3. **Exchange-Agnostic**: Doesn't favor any single exchange's format
4. **Interoperable**: Works with other crypto tools and libraries
5. **Self-Documenting**: Format itself explains the trading pair structure

---

## Exchange-Specific Formats

Each exchange uses its own native symbol format. The exchange connectors handle conversion between native and unified formats.

### Binance

| Market | Native Format | Unified Format | Notes |
|--------|--------------|----------------|-------|
| Spot | `BTCUSDT` | `BTC/USDT` | No separators |
| Futures Perpetual | `BTCUSDT` | `BTC/USDT:USDT` | Same as spot |
| Futures Dated | `BTCUSDT_250328` | `BTC/USDT:250328` | Underscore + date |

**Challenges:**
- Spot and perpetual use identical format
- Need market context to distinguish
- Must parse quote currency from symbol string

### OKX

| Market | Native Format | Unified Format | Notes |
|--------|--------------|----------------|-------|
| Spot | `BTC-USDT` | `BTC/USDT` | Dash separator |
| Perpetual Swap | `BTC-USDT-SWAP` | `BTC/USDT:USDT` | `-SWAP` suffix |
| Dated Futures | `BTC-USDT-250328` | `BTC/USDT:250328` | Date suffix |

**Advantages:**
- Clear format distinction
- Easy to parse
- Self-documenting market type

### Coinbase Advanced Trade

| Market | Native Format | Unified Format | Notes |
|--------|--------------|----------------|-------|
| Spot | `BTC-USDC` | `BTC/USDC` | Dash separator |
| Perpetual | `BTC-PERP-INTX` | `BTC/USDC:USDC` | `-PERP-INTX` suffix |

**Notes:**
- Coinbase perpetuals are USDC-settled
- Uses INTX (International Exchange) for derivatives

---

## Architecture: Where Normalization Happens

### Design Principle: Normalize at the Edge

```
┌─────────────────┐
│   TradingEngine │  ← Works ONLY with unified format
└────────┬────────┘
         │ Unified: BTC/USDT, BTC/USDT:USDT
         │
    ┌────┴────┬─────────┬──────────┐
    │         │         │          │
┌───▼──┐  ┌──▼───┐  ┌──▼────┐  ┌──▼──────┐
│Binance│  │ OKX  │  │Coinbase│  │ Kraken │
└───┬───┘  └──┬───┘  └───┬────┘  └────┬───┘
    │         │          │             │
    │ Native: │ Native:  │ Native:     │ Native:
    │ BTCUSDT │BTC-USDT  │ BTC-USDC    │ XBT/USD
    │         │-SWAP     │ -PERP-INTX  │
    └─────────┴──────────┴─────────────┘
         Exchange APIs (native formats)
```

### Why This Design?

1. **Single Responsibility**: Each component has one job
   - Exchange connectors: Convert formats
   - TradingEngine: Business logic only

2. **Encapsulation**: TradingEngine never sees native formats
   - Reduces coupling
   - Easier to test
   - Cleaner code

3. **Maintainability**: Adding new exchanges is straightforward
   - Implement connector
   - Override `normalizeSymbol()` and `denormalizeSymbol()`
   - TradingEngine code unchanged

4. **Type Safety**: Unified format is guaranteed
   - No runtime format checks needed
   - TypeScript can enforce types

---

## Implementation Guide

### For Exchange Connectors

Each exchange connector must implement:

#### 1. `normalizeSymbol(symbol: string): string`

Converts unified format → native format (for API requests)

```typescript
protected normalizeSymbol(symbol: string): string {
  // Example: OKX
  const upper = symbol.toUpperCase();
  
  // Perpetual: BTC/USDT:USDT → BTC-USDT-SWAP
  if (upper.includes(':')) {
    const [pair] = upper.split(':');
    return pair.replace('/', '-') + '-SWAP';
  }
  
  // Spot: BTC/USDT → BTC-USDT
  return upper.replace('/', '-');
}
```

**When to use:**
- Before making API requests to exchange
- When subscribing to WebSocket channels
- When building order requests

#### 2. `denormalizeSymbol(symbol: string, market?: string): string`

Converts native format → unified format (for emitting events)

```typescript
protected denormalizeSymbol(instId: string): string {
  // Example: OKX
  const upper = instId.toUpperCase();
  
  // Perpetual: BTC-USDT-SWAP → BTC/USDT:USDT
  if (upper.endsWith('-SWAP')) {
    const withoutSwap = upper.replace('-SWAP', '');
    const [base, quote] = withoutSwap.split('-');
    return `${base}/${quote}:${quote}`;
  }
  
  // Spot: BTC-USDT → BTC/USDT
  return upper.replace('-', '/');
}
```

**When to use:**
- When emitting events (orders, positions, balances)
- When transforming WebSocket data
- When processing REST API responses

### Critical Rule: Denormalize Before Emitting

**✅ ALWAYS do this:**
```typescript
// Transform order data
private transformOKXPrivateOrder(data: any): Order {
  // Denormalize FIRST
  const symbol = this.denormalizeSymbol(data.instId);
  
  return {
    symbol, // Unified format
    // ... other fields
  };
}

// Emit with unified symbol
this.emit('orderUpdate', order.symbol, order);
```

**❌ NEVER do this:**
```typescript
// DON'T emit native format
this.emit('orderUpdate', data.instId, order); // ❌ APT-USDT-SWAP
```

---

## What Gets Normalized

### Market Data (Input to TradingEngine)

- ✅ Ticker symbols
- ✅ Order book symbols
- ✅ Trade symbols
- ✅ Kline symbols

### Account Data (Output from Exchange)

- ✅ **Position symbols** (e.g., `APT-USDT-SWAP` → `APT/USDT:USDT`)
- ✅ **Order symbols** (e.g., `BTC-USDT-SWAP` → `BTC/USDT:USDT`)
- ⚠️ **Balance assets** (No conversion needed, already normalized: `BTC`, `USDT`)

---

## Testing Normalization

### Test Cases for Each Exchange

```typescript
describe('Symbol Normalization', () => {
  describe('OKX', () => {
    it('should normalize spot', () => {
      expect(okx.normalizeSymbol('BTC/USDT')).toBe('BTC-USDT');
    });
    
    it('should normalize perpetual', () => {
      expect(okx.normalizeSymbol('BTC/USDT:USDT')).toBe('BTC-USDT-SWAP');
    });
    
    it('should denormalize spot', () => {
      expect(okx.denormalizeSymbol('BTC-USDT')).toBe('BTC/USDT');
    });
    
    it('should denormalize perpetual', () => {
      expect(okx.denormalizeSymbol('BTC-USDT-SWAP')).toBe('BTC/USDT:USDT');
    });
  });
});
```

### Round-Trip Test

```typescript
it('should round-trip correctly', () => {
  const unified = 'BTC/USDT:USDT';
  const native = exchange.normalizeSymbol(unified);
  const backToUnified = exchange.denormalizeSymbol(native);
  expect(backToUnified).toBe(unified);
});
```

---

## Common Pitfalls

### 1. Forgetting to Denormalize Before Emitting

```typescript
// ❌ BAD
this.emit('orderUpdate', data.instId, order); // Native format leaked!

// ✅ GOOD
const symbol = this.denormalizeSymbol(data.instId);
this.emit('orderUpdate', symbol, order);
```

### 2. Mixing Market Types

```typescript
// ❌ BAD: Binance spot and futures use same symbol
denormalizeSymbol(symbol: string): string {
  // BTCUSDT could be spot OR futures!
  return this.parseSymbol(symbol); // Which one?
}

// ✅ GOOD: Pass market type
denormalizeSymbol(symbol: string, market: 'spot' | 'futures'): string {
  if (market === 'futures') return `${base}/${quote}:${quote}`;
  return `${base}/${quote}`;
}
```

### 3. Not Handling Edge Cases

```typescript
// ❌ BAD: Assumes simple format
denormalizeSymbol(symbol: string): string {
  return symbol.replace('-', '/'); // Fails for BTC-USDT-SWAP!
}

// ✅ GOOD: Check all cases
denormalizeSymbol(symbol: string): string {
  if (symbol.endsWith('-SWAP')) {
    // Handle perpetual
  }
  if (symbol.match(/-\d{6}$/)) {
    // Handle dated futures
  }
  // Handle spot
}
```

---

## Symbol Convention Reference

### Quick Lookup Table

| You Have | You Need | Method | Example |
|----------|----------|--------|---------|
| Unified | Native | `normalizeSymbol()` | `BTC/USDT` → `BTCUSDT` (Binance) |
| Native | Unified | `denormalizeSymbol()` | `BTC-USDT-SWAP` → `BTC/USDT:USDT` (OKX) |
| Unified | Parse | `parseUnifiedSymbol()` | `BTC/USDT:USDT` → `{base, quote, settlement}` |

### Parsing Unified Symbols

```typescript
protected parseUnifiedSymbol(symbol: string): {
  base: string;
  quote: string;
  settlement?: string;
  isPerpetual: boolean;
} {
  const [pair, settlement] = symbol.split(':');
  const [base, quote] = pair.split('/');
  
  return {
    base,
    quote,
    settlement,
    isPerpetual: !!settlement,
  };
}

// Usage
const parsed = this.parseUnifiedSymbol('BTC/USDT:USDT');
// { base: 'BTC', quote: 'USDT', settlement: 'USDT', isPerpetual: true }
```

---

## Migration Guide

If you need to add a new exchange:

### 1. Extend BaseExchange

```typescript
import { BaseExchange } from '../base/BaseExchange';

export class NewExchange extends BaseExchange {
  // Required: Implement normalization
}
```

### 2. Implement normalizeSymbol()

```typescript
protected normalizeSymbol(symbol: string): string {
  // Convert: BTC/USDT → exchange's format
  // Handle: spot, perpetual, futures
}
```

### 3. Implement denormalizeSymbol()

```typescript
protected denormalizeSymbol(symbol: string): string {
  // Convert: exchange's format → BTC/USDT
  // Handle: all exchange-specific formats
}
```

### 4. Apply Denormalization

Find all places where exchange emits data:
- `emit('orderUpdate', ...)`
- `emit('positionUpdate', ...)`
- `transformTicker()`, `transformOrderBook()`, etc.

Apply denormalization before emitting.

### 5. Test

Write tests for:
- Normalize spot symbols
- Normalize perpetual symbols
- Denormalize spot symbols
- Denormalize perpetual symbols
- Round-trip conversion

---

## Related Documentation

- [Market Data Subscription Capabilities](./MARKET_DATA_SUBSCRIPTION_CAPABILITIES.md)
- [Multi-Exchange Guide](../../docs/guides/MULTI-EXCHANGE-GUIDE.md)
- [Exchange Connectors README](../README.md)

---

## Summary

- **Use CCXT-style** unified format: `BTC/USDT`, `BTC/USDT:USDT`
- **Normalize at the edge**: Exchange connectors handle conversion
- **Denormalize before emitting**: TradingEngine only sees unified format
- **Test thoroughly**: Ensure round-trip conversion works
- **Document edge cases**: Each exchange has quirks

This architecture keeps your codebase clean, maintainable, and interoperable with industry-standard tools.

---

Author: xiaoweihsueh@gmail.com  
Date: October 24, 2025

