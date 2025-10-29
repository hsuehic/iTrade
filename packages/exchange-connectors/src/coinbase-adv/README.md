# Coinbase Advanced Trade Exchange Implementation

**Based on [`coinbase-api`](https://github.com/tiagosiebler/coinbase-api) library**

## 📦 Features

✅ **WebSocket Support** - Real-time data streaming using `coinbase-api` WebSocket client
✅ **REST API Support** - Complete REST API implementation using `CBAdvancedTradeClient` and `CBInternationalClient`
✅ **TypeScript** - Full type safety with `IExchange` interface
✅ **Event-Driven** - Extends `EventEmitter` for real-time updates
✅ **INTX Support** - Coinbase International Exchange (perpetual futures) integration
✅ **Auto-Reconnect** - Built-in reconnection handling

## 🚀 Usage

### Basic Example

```typescript
import { CoinbaseAdvancedExchange } from '@itrade/exchange-connectors';

const exchange = new CoinbaseAdvancedExchange();

// Connect
await exchange.connect({
  apiKey: 'your-api-key',
  secretKey: 'your-secret-key',
});

// Get balances
const balances = await exchange.getBalances();
console.log(balances);

// Subscribe to user data (balance, positions, orders)
await exchange.subscribeToUserData();

// Listen for updates
exchange.on('accountUpdate', (data) => {
  console.log('Balance update:', data.balances);
});

exchange.on('positionUpdate', (data) => {
  console.log('Position update:', data.positions);
});

exchange.on('orderUpdate', (data) => {
  console.log('Order update:', data.order);
});

// Disconnect
await exchange.disconnect();
```

### Market Data

```typescript
// Get ticker
const ticker = await exchange.getTicker('BTC/USD');

// Get order book
const orderBook = await exchange.getOrderBook('BTC/USD', 20);

// Get trades
const trades = await exchange.getTrades('BTC/USD', 100);

// Get klines
const klines = await exchange.getKlines('BTC/USD', '15m', startTime, endTime);
```

### WebSocket Subscriptions

```typescript
// Subscribe to user data
await exchange.subscribeToUserData();

// Subscribe to ticker
await exchange.subscribeToTicker('BTC/USD');

// Subscribe to order book
await exchange.subscribeToOrderBook('BTC/USD');

// Subscribe to trades
await exchange.subscribeToTrades('BTC/USD');

// Subscribe to klines
await exchange.subscribeToKlines('BTC/USD', '15m');

// Unsubscribe
await exchange.unsubscribe('BTC/USD', 'ticker');
```

## 🔧 Implementation Details

### Architecture

```
CoinbaseAdvancedExchange (EventEmitter + IExchange)
├── REST API Clients
│   ├── CBAdvancedTradeClient (spot, orders, account)
│   └── CBInternationalClient (INTX perpetual futures)
└── WebSocket Client
    └── WebsocketClient (real-time data streams)
```

### WebSocket Channels

| Channel | Description | Events Emitted |
|---------|-------------|----------------|
| `futures_balance_summary` | INTX balance updates | `accountUpdate` |
| `user` | Orders, positions | `orderUpdate`, `positionUpdate` |
| `ticker` | Price updates | `ticker` |
| `level2` | Order book updates | `orderBook` |
| `market_trades` | Trade updates | `trade` |
| `candles` | Kline/OHLCV updates | `kline` |

### REST API Methods

**Account & Trading:**
- `getAccountInfo()` - Get account information
- `getBalances()` - Get spot + INTX balances
- `getPositions()` - Get INTX perpetual positions
- `createOrder()` - Create order (stub - to be implemented)
- `cancelOrder()` - Cancel order (stub - to be implemented)
- `getOpenOrders()` - Get open orders (stub - to be implemented)

**Market Data:**
- `getTicker(symbol)` - Get best bid/ask
- `getOrderBook(symbol, limit)` - Get order book
- `getTrades(symbol, limit)` - Get recent trades
- `getKlines(symbol, interval, start, end)` - Get historical candles

### Symbol Formats

**iTrade → Coinbase:**
- Spot: `BTC/USDC` → `BTC-USDC`
- Perpetual: `BTC/USDC:USDC` → `BTC-PERP-INTX`

**Coinbase → iTrade:**
- Spot: `BTC-USDC` → `BTC/USDC`
- Perpetual: `BTC-PERP-INTX` → `BTC/USDC:USDC`

## 📊 Test Results

```bash
✅ Connected
✅ Got spot balances: USDC: 11762.294009
✅ WebSocket connected
✅ Received futures_balance_summary
✅ Received order update: OP/USDC:USDC BUY 3000 @ 0.4434
✅ No open positions
```

## ⚙️ Configuration

### Environment Variables

```bash
COINBASE_API_KEY=your-api-key
COINBASE_SECRET_KEY=your-secret-key
# COINBASE_PASSPHRASE=your-passphrase  # Required for INTX (International Exchange)
```

### Note on INTX (International Exchange)

Coinbase International Exchange (INTX) requires an API passphrase for authentication. If you don't have INTX configured:
- ✅ Spot trading and balances work normally
- ❌ INTX perpetual balances and positions will fail gracefully
- The implementation handles missing INTX access gracefully

## 🔍 Differences from Original `CoinbaseExchange`

| Feature | CoinbaseExchange | CoinbaseAdvancedExchange |
|---------|------------------|--------------------------|
| **WebSocket Library** | Custom `CoinbaseWebSocketManager` | `coinbase-api` `WebsocketClient` |
| **REST Client** | Custom axios implementation | `coinbase-api` `CBAdvancedTradeClient` + `CBInternationalClient` |
| **Auto-Reconnect** | Manual implementation | Built-in with `coinbase-api` |
| **Type Safety** | Partial | Full (library provides types) |
| **Maintenance** | Custom code to maintain | Library maintained by community |
| **Stability** | Good | Excellent (battle-tested library) |

## 📝 Future Improvements

- [ ] Implement order creation (`createOrder`)
- [ ] Implement order cancellation (`cancelOrder`)
- [ ] Implement order history (`getOpenOrders`, `getOrderHistory`)
- [ ] Add comprehensive error handling
- [ ] Add retry logic for failed requests
- [ ] Add rate limiting
- [ ] Add support for sandbox environment

## 🧪 Testing

Run the integration test:

```bash
cd packages/exchange-connectors
npx tsx src/coinbase-adv/test-integration.ts
```

Run the simple test:

```bash
npx tsx src/coinbase-adv/test-simple.ts
```

## 📚 References

- [coinbase-api library](https://github.com/tiagosiebler/coinbase-api)
- [Coinbase Advanced Trade API](https://docs.cloud.coinbase.com/advanced-trade-api/docs/welcome)
- [Coinbase International Exchange API](https://docs.cloud.coinbase.com/intx/docs)

---

Author: xiaoweihsueh@gmail.com  
Date: October 28, 2025

