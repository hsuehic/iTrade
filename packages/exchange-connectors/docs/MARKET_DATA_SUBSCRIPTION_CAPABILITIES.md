# Exchange Market Data Subscription Capabilities

## Overview

This document details the market data subscription capabilities for each exchange connector in the iTrade platform. It covers WebSocket and REST API support, data types, configuration options, and exchange-specific limitations.

---

## 📊 Capability Matrix

### Data Type Support

| Data Type | Binance | OKX | Coinbase | Description |
|-----------|---------|-----|----------|-------------|
| **Ticker** | ✅ WS/REST | ✅ WS/REST | ✅ WS/REST | 24hr ticker data (price, volume, etc.) |
| **Order Book** | ✅ WS/REST | ✅ WS/REST | ✅ WS/REST | Bid/ask levels and depths |
| **Trades** | ✅ WS/REST | ✅ WS/REST | ✅ WS/REST | Recent trade executions |
| **Klines** | ✅ WS/REST | ✅ WS/REST | ✅ WS/REST | OHLCV candlestick data |

**Legend:**
- **WS** = WebSocket (real-time streaming)
- **REST** = REST API (polling-based)

---

## 🔧 Configuration Options

### 1. Ticker

**Supported by:** All exchanges (Binance, OKX, Coinbase)

**Configuration:**
```typescript
{
  ticker: true  // Boolean or object
}
```

**WebSocket:** Real-time price updates
**REST Polling:** Every 5 seconds (default)

**Data Provided:**
- Current price
- 24hr high/low
- 24hr volume
- Price change percentage

---

### 2. Order Book

**Supported by:** All exchanges (Binance, OKX, Coinbase)

**Configuration:**
```typescript
{
  orderbook: {
    enabled: true,
    depth: 20  // Number of bid/ask levels
  }
}
```

#### Depth Options by Exchange

| Exchange | WebSocket Depth Options | REST Depth Options | Default |
|----------|-------------------------|-------------------|---------|
| **Binance** | `5`, `10`, `20`, Full | Any (1-5000) | Full |
| **OKX** | `5` (books5), `400` (books) | Any (1-400) | `5` |
| **Coinbase** | ❌ Full only | Any (1-10000) | Full |

**Notes:**
- **Binance WebSocket:** Supports `@depth5`, `@depth10`, `@depth20` streams
- **OKX WebSocket:** Uses `books5` for depth ≤5, `books` for depth >5
- **Coinbase WebSocket:** `level2` channel provides full order book (depth not configurable)

**WebSocket Update Frequency:**
- Binance: 100ms or 1000ms depending on stream
- OKX: Real-time updates
- Coinbase: Real-time updates

**REST Polling:** Every 500ms (default)

---

### 3. Trades

**Supported by:** All exchanges (Binance, OKX, Coinbase)

**Configuration:**
```typescript
{
  trades: {
    enabled: true,
    limit: 10  // Number of recent trades (REST only)
  }
}
```

**WebSocket:** Real-time trade stream (each trade as it occurs)
**REST Polling:** Every 5 seconds, returns last N trades

**Data Provided:**
- Trade ID
- Price
- Quantity
- Timestamp
- Side (buy/sell)
- Trade type (maker/taker)

---

### 4. Klines (Candlesticks)

**Supported by:** All exchanges (Binance, OKX, Coinbase)

**Configuration:**
```typescript
{
  klines: {
    enabled: true,
    interval: '5m',  // Candlestick interval
    limit: 1         // Number of klines (REST only)
  }
}
```

#### Interval Options

**Standard Intervals (All Exchanges):**
- `1m`, `3m`, `5m`, `15m`, `30m` - Minutes
- `1h`, `2h`, `4h`, `6h`, `8h`, `12h` - Hours
- `1d`, `3d` - Days
- `1w` - Week
- `1M` - Month

**Exchange-Specific Intervals:**

| Interval | Binance | OKX | Coinbase |
|----------|---------|-----|----------|
| `1s` | ❌ | ❌ | ✅ |
| `1m` | ✅ | ✅ | ✅ |
| `3m` | ✅ | ✅ | ❌ |
| `5m` | ✅ | ✅ | ✅ |
| `15m` | ✅ | ✅ | ✅ |
| `30m` | ✅ | ✅ | ✅ |
| `1h` | ✅ | ✅ | ✅ |
| `2h` | ✅ | ✅ | ✅ |
| `4h` | ✅ | ✅ | ✅ |
| `6h` | ✅ | ✅ | ✅ |
| `12h` | ✅ | ✅ | ❌ |
| `1d` | ✅ | ✅ | ✅ |
| `1w` | ✅ | ✅ | ✅ |

**Data Provided:**
- Open price
- High price
- Low price
- Close price
- Volume
- Number of trades
- **`isClosed`** - Whether the candlestick is complete (true) or still forming (false)

**WebSocket Update Frequency:**
- Updates on every trade within the interval
- Final update when kline closes

**REST Polling:** Every 60 seconds (default)

---

## 🔄 Subscription Methods

### WebSocket (Recommended)

**Pros:**
- ✅ Real-time updates
- ✅ Lower latency
- ✅ More efficient (no polling)
- ✅ Push-based updates

**Cons:**
- ❌ Requires persistent connection
- ❌ More complex error handling

**Usage:**
```typescript
{
  subscription: {
    method: 'websocket',
    ticker: true,
    orderbook: { enabled: true, depth: 20 },
    trades: true,
    klines: { enabled: true, interval: '5m' }
  }
}
```

### REST Polling

**Pros:**
- ✅ Simpler implementation
- ✅ No connection management
- ✅ Works behind restrictive firewalls

**Cons:**
- ❌ Higher latency
- ❌ More API calls
- ❌ Poll-based (not real-time)

**Usage:**
```typescript
{
  subscription: {
    method: 'rest',
    ticker: true,
    orderbook: { enabled: true, depth: 20 },
    trades: { enabled: true, limit: 10 },
    klines: { enabled: true, interval: '5m', limit: 1 }
  }
}
```

**Default Polling Intervals:**
- Ticker: 5000ms (5 seconds)
- Order Book: 500ms (0.5 seconds)
- Trades: 5000ms (5 seconds)
- Klines: 60000ms (1 minute)

---

## 📡 Exchange-Specific Details

### Binance

#### WebSocket Streams

**Base URL:**
- Spot: `wss://stream.binance.com:9443/ws`
- Futures: `wss://fstream.binance.com/ws`

**Stream Formats:**
- Ticker: `<symbol>@ticker`
- Order Book: `<symbol>@depth` (full), `<symbol>@depth5`, `<symbol>@depth10`, `<symbol>@depth20`
- Trades: `<symbol>@trade`
- Klines: `<symbol>@kline_<interval>`

**Example:**
```
btcusdt@ticker         # Ticker
btcusdt@depth20        # Top 20 levels
btcusdt@trade          # Trades
btcusdt@kline_5m       # 5-minute klines
```

#### REST API

**Endpoints:**
- Ticker: `GET /api/v3/ticker/24hr`
- Order Book: `GET /api/v3/depth`
- Trades: `GET /api/v3/trades`
- Klines: `GET /api/v3/klines`

**Rate Limits:**
- Weight-based system
- 1200 weight per minute
- 6000 weight per 5 minutes

---

### OKX

#### WebSocket Channels

**Base URLs:**
- Public: `wss://ws.okx.com/ws/v5/public`
- Business: `wss://ws.okx.com/ws/v5/business`

**Channels:**
- Ticker: `tickers`
- Order Book: `books5` (5 levels), `books` (400 levels)
- Trades: `trades`
- Klines: `candle1m`, `candle5m`, `candle1h`, etc.

**Subscription Format:**
```json
{
  "op": "subscribe",
  "args": [{
    "channel": "books5",
    "instId": "BTC-USDT"
  }]
}
```

**Channel Selection Logic:**
- `depth ≤ 5` → `books5` (most efficient)
- `depth > 5` → `books` (up to 400 levels)

#### REST API

**Endpoints:**
- Ticker: `GET /api/v5/market/ticker`
- Order Book: `GET /api/v5/market/books`
- Trades: `GET /api/v5/market/trades`
- Klines: `GET /api/v5/market/candles`

**Rate Limits:**
- 20 requests per 2 seconds per IP
- Public endpoints have higher limits

---

### Coinbase

#### WebSocket Channels

**Base URL:** `wss://advanced-trade-ws.coinbase.com`

**Channels:**
- Ticker: `ticker`
- Order Book: `level2`
- Trades: `market_trades`
- Klines: `candles`

**Subscription Format:**
```json
{
  "type": "subscribe",
  "product_ids": ["BTC-USDC"],
  "channel": "ticker"
}
```

**Limitations:**
- **Order Book depth is NOT configurable** - always returns full book
- Level2 channel provides complete order book snapshots and incremental updates

#### REST API

**Endpoints:**
- Ticker: `GET /api/v3/brokerage/products/{product_id}/ticker`
- Order Book: `GET /api/v3/brokerage/products/{product_id}/book`
- Trades: `GET /api/v3/brokerage/products/{product_id}/trades`
- Klines: `GET /api/v3/brokerage/products/{product_id}/candles`

**Rate Limits:**
- 10 requests per second per endpoint
- Requires authentication for ALL endpoints (including public data)

---

## 🚀 Usage Examples

### Complete Subscription Configuration

```typescript
// Subscribe to multiple data types across multiple exchanges
const strategyConfig = {
  name: "Multi-Exchange Strategy",
  type: "custom",
  exchange: "binance",  // Primary execution exchange
  symbol: "BTC/USDT",
  parameters: {
    subscription: {
      // Subscription method
      method: "websocket",  // or "rest"
      
      // Ticker data
      ticker: true,
      
      // Order book with depth
      orderbook: {
        enabled: true,
        depth: 20  // Top 20 levels
      },
      
      // Recent trades
      trades: true,
      
      // Kline data
      klines: {
        enabled: true,
        interval: "5m"  // 5-minute candles
      },
      
      // Subscribe to multiple exchanges
      exchange: ["binance", "okx", "coinbase"]
    }
  }
};
```

### WebSocket-Only Configuration

```typescript
{
  subscription: {
    method: "websocket",
    ticker: true,
    orderbook: { enabled: true, depth: 5 },  // Efficient for all exchanges
    klines: { enabled: true, interval: "1m" },
    exchange: ["binance", "okx"]
  }
}
```

### REST Polling Configuration

```typescript
{
  subscription: {
    method: "rest",
    ticker: true,
    orderbook: { enabled: true, depth: 50 },
    trades: { enabled: true, limit: 20 },
    klines: { enabled: true, interval: "15m", limit: 1 },
    exchange: "coinbase"  // Works well with Coinbase's auth requirements
  }
}
```

### Minimal Configuration (Defaults)

```typescript
{
  subscription: {
    ticker: true,  // Uses WebSocket by default
    exchange: "binance"
  }
}
```

---

## ⚠️ Important Notes

### General

1. **Multiple Exchange Subscriptions:** You can subscribe to the same symbol across multiple exchanges simultaneously
2. **Method Selection:** Choose `websocket` for real-time data, `rest` for simplicity
3. **Exchange Field:** 
   - Primary `exchange` in strategy config: execution exchange
   - `exchange` in subscription config: data source exchanges (can be multiple)

### Exchange-Specific Limitations

**Binance:**
- ✅ Full WebSocket depth support (5, 10, 20 levels)
- ✅ All intervals supported
- ⚠️ Weight-based rate limiting

**OKX:**
- ✅ Efficient `books5` for small depths
- ✅ All standard intervals
- ⚠️ Klines use business endpoint (separate connection)

**Coinbase:**
- ❌ **WebSocket order book depth NOT configurable** (always full)
- ✅ REST API supports depth parameter
- ⚠️ **Authentication required for ALL REST endpoints** (including public data)
- ✅ Supports 1-second kline interval

### Performance Considerations

**WebSocket:**
- Most efficient for high-frequency strategies
- Single persistent connection per exchange
- Automatic reconnection on disconnect

**REST Polling:**
- Suitable for lower-frequency strategies
- Higher API usage (watch rate limits)
- More predictable behavior

---

## 🔍 Debugging & Monitoring

### Check Active Subscriptions

```typescript
// Get subscription statistics
const stats = tradingEngine.getSubscriptionStats();

console.log(stats);
// Output:
// {
//   total: 12,
//   byExchange: {
//     binance: 4,
//     okx: 4,
//     coinbase: 4
//   },
//   byType: {
//     ticker: 3,
//     orderbook: 3,
//     trades: 3,
//     klines: 3
//   },
//   byMethod: {
//     websocket: 9,
//     rest: 3
//   }
// }
```

### Common Issues

**Issue: No data received**
- ✅ Check exchange connection status
- ✅ Verify symbol format (use normalized format)
- ✅ Check WebSocket connection state
- ✅ Verify API credentials (for Coinbase)

**Issue: High latency**
- ✅ Switch from REST to WebSocket
- ✅ Reduce order book depth
- ✅ Increase polling intervals

**Issue: Rate limit errors**
- ✅ Switch to WebSocket (recommended)
- ✅ Increase polling intervals
- ✅ Reduce number of subscriptions

---

## 📚 Related Documentation

- [Exchange Connector API Reference](./README.md)
- [Binance WebSocket Documentation](./BINANCE_WEBSOCKET.md)
- [OKX WebSocket Endpoints](./OKX_WEBSOCKET_ENDPOINTS.md)
- [Coinbase WebSocket Implementation](../src/coinbase/WEBSOCKET_IMPLEMENTATION.md)
- [Subscription System Architecture](../../core/docs/SUBSCRIPTION_SYSTEM.md)

---

## 🆕 Recent Updates

### October 24, 2025

- ✅ Added WebSocket order book depth support for Binance (`@depth5`, `@depth10`, `@depth20`)
- ✅ Added WebSocket order book depth support for OKX (`books5`, `books`)
- ✅ Documented Coinbase order book depth limitation (full book only)
- ✅ Added `isClosed` field to Kline data for all exchanges
- ✅ Enhanced multi-exchange subscription support

---

Author: xiaoweihsueh@gmail.com  
Date: October 24, 2025

