# @itrade/exchange-connectors

Exchange API connectors with unified interface supporting both REST and WebSocket protocols.

## Overview

This package provides standardized connectors for cryptocurrency exchanges, offering:

- **Unified API** - Consistent interface across all exchanges
- **REST Support** - HTTP endpoints for trading and account management  
- **WebSocket Streams** - Real-time market data and order updates
- **Error Handling** - Robust reconnection and rate limit management
- **Type Safety** - Full TypeScript support with comprehensive types

## Supported Exchanges

### ✅ Currently Implemented

- **Binance** - Spot trading with testnet support

### 🚧 Planned

- Coinbase Pro
- Kraken  
- Bybit
- OKX

## Installation

```bash
pnpm add @itrade/exchange-connectors @itrade/core
```

## Usage

### Basic Setup

```typescript
import { BinanceExchange } from '@itrade/exchange-connectors';

// Create exchange instance
const binance = new BinanceExchange(false); // false = mainnet, true = testnet

// Connect with credentials
await binance.connect({
  apiKey: 'your_api_key',
  secretKey: 'your_secret_key',
  sandbox: false // Use testnet
});

console.log('Connected:', binance.isConnected);
```

### Market Data (REST)

```typescript
// Get current price
const ticker = await binance.getTicker('BTCUSDT');
console.log(`BTC Price: $${ticker.price}`);

// Get order book
const orderBook = await binance.getOrderBook('BTCUSDT', 10);
console.log('Best bid:', orderBook.bids[0]);
console.log('Best ask:', orderBook.asks[0]);

// Get recent trades
const trades = await binance.getTrades('BTCUSDT', 50);
console.log(`Latest trade: ${trades[0].price} at ${trades[0].timestamp}`);

// Get historical candles
const klines = await binance.getKlines(
  'BTCUSDT',
  '1h',
  new Date('2024-01-01'),
  new Date('2024-01-02'),
  24
);
```

### Real-Time Data (WebSocket)

```typescript
// Subscribe to ticker updates
await binance.subscribeToTicker('BTCUSDT');
binance.on('ticker', (symbol, ticker) => {
  console.log(`${symbol}: $${ticker.price}`);
});

// Subscribe to order book updates  
await binance.subscribeToOrderBook('BTCUSDT');
binance.on('orderbook', (symbol, orderbook) => {
  console.log(`${symbol} - Best bid: ${orderbook.bids[0][0]}`);
});

// Subscribe to trade stream
await binance.subscribeToTrades('BTCUSDT');
binance.on('trade', (symbol, trade) => {
  console.log(`${symbol}: ${trade.price} (${trade.side})`);
});

// Subscribe to kline/candlestick data
await binance.subscribeToKlines('BTCUSDT', '1m');
binance.on('kline', (symbol, kline) => {
  if (kline.interval === '1m') {
    console.log(`${symbol} 1m close: ${kline.close}`);
  }
});
```

### Trading Operations

```typescript
import { OrderSide, OrderType } from '@itrade/exchange-connectors';

// Place market order
const marketOrder = await binance.createOrder(
  'BTCUSDT',
  OrderSide.BUY,
  OrderType.MARKET,
  new Decimal(0.001) // quantity
);

// Place limit order
const limitOrder = await binance.createOrder(
  'BTCUSDT', 
  OrderSide.SELL,
  OrderType.LIMIT,
  new Decimal(0.001),    // quantity
  new Decimal(50000),    // price
  undefined,             // stopPrice
  'GTC',                 // timeInForce
  'my-client-order-123'  // clientOrderId
);

// Cancel order
const cancelled = await binance.cancelOrder('BTCUSDT', marketOrder.id);

// Get order status
const orderStatus = await binance.getOrder('BTCUSDT', limitOrder.id);
console.log('Order status:', orderStatus.status);
```

### Account Management

```typescript
// Get account information
const account = await binance.getAccountInfo();
console.log('Can trade:', account.canTrade);

// Get balances
const balances = await binance.getBalances();
const btcBalance = balances.find(b => b.asset === 'BTC');
console.log(`BTC Balance: ${btcBalance?.free} (available)`);

// Get open orders
const openOrders = await binance.getOpenOrders('BTCUSDT');
console.log(`${openOrders.length} open orders`);

// Get order history
const orderHistory = await binance.getOrderHistory('BTCUSDT', 50);
```

## Custom Exchange Implementation

### Creating New Exchange Connector

```typescript
import { BaseExchange } from '@itrade/exchange-connectors';

class MyExchange extends BaseExchange {
  constructor() {
    super('myexchange', 'https://api.myexchange.com', 'wss://ws.myexchange.com');
  }

  protected async testConnection(): Promise<void> {
    await this.httpClient.get('/ping');
  }

  public async getTicker(symbol: string): Promise<Ticker> {
    const response = await this.httpClient.get(`/ticker/${symbol}`);
    return {
      symbol,
      price: new Decimal(response.data.price),
      volume: new Decimal(response.data.volume),
      timestamp: new Date(),
      // ... other fields
    };
  }

  // Implement other required methods...
}
```

### Authentication Implementation

```typescript
protected addAuthentication(config: any): any {
  if (this.credentials) {
    // Add API key to headers
    config.headers = {
      ...config.headers,
      'X-API-KEY': this.credentials.apiKey,
    };
    
    // Sign request if needed
    if (config.method !== 'GET') {
      const signature = this.signRequest(config.data || {});
      config.data.signature = signature;
    }
  }
  return config;
}

protected signRequest(params: Record<string, any>): Record<string, any> {
  const queryString = new URLSearchParams(params).toString();
  const signature = crypto
    .createHmac('sha256', this.credentials!.secretKey)
    .update(queryString)
    .digest('hex');
    
  return { ...params, signature };
}
```

## Error Handling

### Connection Management

```typescript
binance.on('connected', (exchangeName) => {
  console.log(`${exchangeName} connected successfully`);
});

binance.on('disconnected', (exchangeName) => {
  console.log(`${exchangeName} disconnected`);
});

binance.on('error', (error) => {
  console.error('Exchange error:', error);
  // Handle reconnection logic
});
```

### HTTP Error Handling

```typescript
binance.on('http_error', (error) => {
  console.log(`HTTP ${error.status}: ${error.data.msg}`);
  
  // Handle rate limits
  if (error.status === 429) {
    console.log('Rate limited - backing off...');
  }
});

binance.on('network_error', (message) => {
  console.log('Network error:', message);
  // Implement retry logic
});
```

### WebSocket Error Handling  

```typescript
binance.on('ws_connected', (exchangeName) => {
  console.log(`${exchangeName} WebSocket connected`);
});

binance.on('ws_disconnected', (exchangeName, code, reason) => {
  console.log(`${exchangeName} WebSocket disconnected: ${code} ${reason}`);
  // Automatic reconnection is handled internally
});

binance.on('ws_error', (error) => {
  console.error('WebSocket error:', error);
});
```

## Configuration

### Exchange-Specific Settings

```typescript
// Binance configuration
const binance = new BinanceExchange(false); // mainnet

// Testnet for development
const binanceTest = new BinanceExchange(true); // testnet

// Custom timeout
binance.httpClient.defaults.timeout = 10000; // 10s
```

### Rate Limiting

```typescript
// Built-in rate limiting respects exchange limits
// Binance: 1200 requests per minute for REST
// WebSocket connections are managed automatically

// Monitor rate limit status
binance.on('http_error', (error) => {
  if (error.status === 429) {
    const resetTime = error.headers['x-mbx-retry-after'];
    console.log(`Rate limited. Reset in ${resetTime}ms`);
  }
});
```

## Advanced Features

### Symbol Normalization

```typescript
// Automatic symbol formatting
const ticker1 = await binance.getTicker('BTC-USDT');  // Normalized to BTCUSDT
const ticker2 = await binance.getTicker('btcusdt');   // Normalized to BTCUSDT  
const ticker3 = await binance.getTicker('BTCUSDT');   // Already correct
```

### Subscription Management

```typescript
// Subscribe to multiple streams
await Promise.all([
  binance.subscribeToTicker('BTCUSDT'),
  binance.subscribeToTicker('ETHUSDT'), 
  binance.subscribeToOrderBook('BTCUSDT'),
  binance.subscribeToTrades('ETHUSDT')
]);

// Unsubscribe from specific streams
await binance.unsubscribe('BTCUSDT', 'ticker');
await binance.unsubscribe('ETHUSDT', 'orderbook');

// Automatic cleanup on disconnect
await binance.disconnect(); // Closes all subscriptions
```

### Data Validation

```typescript
// Built-in data validation
const orderBook = await binance.getOrderBook('BTCUSDT');

// Validate order book integrity
const isValid = orderBook.bids.length > 0 && 
                orderBook.asks.length > 0 &&
                orderBook.bids[0][0].lt(orderBook.asks[0][0]);
                
if (!isValid) {
  console.warn('Invalid order book data received');
}
```

## Testing

```bash
# Run connector tests
pnpm test

# Test with testnet
EXCHANGE_TESTNET=true pnpm test

# Integration tests
pnpm test:integration
```

## Contributing

When adding new exchange connectors:

1. Extend `BaseExchange` class
2. Implement all required methods
3. Add comprehensive tests
4. Update this README

## License

MIT - See LICENSE file for details.
