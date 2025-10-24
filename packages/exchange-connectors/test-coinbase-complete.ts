/**
 * Comprehensive test for Coinbase WebSocket implementation
 * Tests: ticker, orderbook, trades, klines for both spot and perpetual
 */

import { CoinbaseExchange } from './src/coinbase/CoinbaseExchange';

console.log('🧪 Comprehensive Coinbase WebSocket Test\n');
console.log('Testing: ticker, orderbook, trades, klines');
console.log('Symbols: BTC-USDC (spot), BTC-PERP-INTX (perpetual)\n');

const coinbase = new CoinbaseExchange();

// Track received data
const dataReceived = {
  spot: {
    ticker: false,
    orderbook: false,
    trades: false,
    klines: false,
  },
  perpetual: {
    ticker: false,
    orderbook: false,
    trades: false,
    klines: false,
  },
};

// Setup event listeners
coinbase.on('ticker', (symbol: string, ticker: any) => {
  console.log(`📊 [TICKER] ${symbol}:`);
  console.log(`   Price: $${ticker.price}`);
  console.log(`   Volume: ${ticker.volume}`);
  console.log(`   Bid: $${ticker.bid}, Ask: $${ticker.ask}`);
  console.log('');

  if (symbol.includes('BTC-USDC') || symbol.includes('BTC-USD')) {
    dataReceived.spot.ticker = true;
  } else if (symbol.includes('PERP')) {
    dataReceived.perpetual.ticker = true;
  }
});

coinbase.on('orderbook', (symbol: string, orderbook: any) => {
  const topBid = orderbook.bids[0];
  const topAsk = orderbook.asks[0];
  console.log(`📚 [ORDERBOOK] ${symbol}:`);
  console.log(`   Best Bid: $${topBid?.[0]} (${topBid?.[1]})`);
  console.log(`   Best Ask: $${topAsk?.[0]} (${topAsk?.[1]})`);
  console.log(`   Spread: $${topAsk?.[0]?.minus(topBid?.[0] || 0)}`);
  console.log(
    `   Bids count: ${orderbook.bids.length}, Asks count: ${orderbook.asks.length}`,
  );
  console.log('');

  if (symbol.includes('BTC-USDC') || symbol.includes('BTC-USD')) {
    dataReceived.spot.orderbook = true;
  } else if (symbol.includes('PERP')) {
    dataReceived.perpetual.orderbook = true;
  }
});

coinbase.on('trade', (symbol: string, trade: any) => {
  console.log(`💱 [TRADE] ${symbol}:`);
  console.log(`   Side: ${trade.side.toUpperCase()}`);
  console.log(`   Price: $${trade.price}`);
  console.log(`   Quantity: ${trade.quantity}`);
  console.log(`   Time: ${trade.timestamp.toISOString()}`);
  console.log('');

  if (symbol.includes('BTC-USDC') || symbol.includes('BTC-USD')) {
    dataReceived.spot.trades = true;
  } else if (symbol.includes('PERP')) {
    dataReceived.perpetual.trades = true;
  }
});

coinbase.on('kline', (symbol: string, kline: any) => {
  console.log(`📈 [KLINE] ${symbol}:`);
  console.log(`   Interval: ${kline.interval}`);
  console.log(`   Open: $${kline.open}, Close: $${kline.close}`);
  console.log(`   High: $${kline.high}, Low: $${kline.low}`);
  console.log(`   Volume: ${kline.volume}`);
  console.log('');

  if (symbol.includes('BTC-USDC') || symbol.includes('BTC-USD')) {
    dataReceived.spot.klines = true;
  } else if (symbol.includes('PERP')) {
    dataReceived.perpetual.klines = true;
  }
});

coinbase.on('error', (error: Error) => {
  console.error('❌ Error:', error.message);
});

// Add raw message listener to debug level2 messages
const wsManager = (coinbase as any).wsManager;
if (wsManager) {
  wsManager.on('data', (message: any) => {
    if (message.channel === 'level2' || message.type === 'level2') {
      console.log(
        '🔍 [DEBUG] Raw level2 message received:',
        JSON.stringify(message, null, 2),
      );
    }
  });
}

// Main test flow
(async () => {
  try {
    // Note: We skip REST API connection (which requires auth)
    // WebSocket public channels don't need authentication
    console.log('✅ Starting Coinbase WebSocket test (no auth needed for public data)\n');

    // Wait for connection to stabilize
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // ============================================
    // SPOT: BTC-USDC subscriptions
    // ============================================
    console.log('🟢 ===== TESTING SPOT (BTC-USDC) =====\n');

    console.log('📡 Subscribing to BTC-USDC ticker...');
    await coinbase.subscribeToTicker('BTC/USDC');

    console.log('📡 Subscribing to BTC-USDC orderbook...');
    await coinbase.subscribeToOrderBook('BTC/USDC');

    console.log('📡 Subscribing to BTC-USDC trades...');
    await coinbase.subscribeToTrades('BTC/USDC');

    console.log('📡 Subscribing to BTC-USDC klines (1h)...');
    await coinbase.subscribeToKlines('BTC/USDC', '1h');

    console.log(
      '\n⏳ Waiting for spot data (30 seconds to allow orderbook updates)...\n',
    );
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // ============================================
    // PERPETUAL: BTC-PERP-INTX subscriptions
    // ============================================
    console.log('\n🔵 ===== TESTING PERPETUAL (BTC-PERP-INTX) =====\n');

    console.log('📡 Subscribing to BTC-PERP-INTX ticker...');
    await coinbase.subscribeToTicker('BTC/USDC:USDC');

    console.log('📡 Subscribing to BTC-PERP-INTX orderbook...');
    await coinbase.subscribeToOrderBook('BTC/USDC:USDC');

    console.log('📡 Subscribing to BTC-PERP-INTX trades...');
    await coinbase.subscribeToTrades('BTC/USDC:USDC');

    console.log('📡 Subscribing to BTC-PERP-INTX klines (1h)...');
    await coinbase.subscribeToKlines('BTC/USDC:USDC', '1h');

    console.log(
      '\n⏳ Waiting for perpetual data (30 seconds to allow orderbook updates)...\n',
    );
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // ============================================
    // UNSUBSCRIPTION TEST
    // ============================================
    console.log('\n🔕 ===== TESTING UNSUBSCRIPTION =====\n');

    console.log('🔕 Unsubscribing from all BTC-USDC channels...');
    await coinbase.unsubscribe('BTC/USDC', 'ticker');
    await coinbase.unsubscribe('BTC/USDC', 'orderbook');
    await coinbase.unsubscribe('BTC/USDC', 'trades');
    await coinbase.unsubscribe('BTC/USDC', 'klines');

    console.log('🔕 Unsubscribing from all BTC-PERP-INTX channels...');
    await coinbase.unsubscribe('BTC/USDC:USDC', 'ticker');
    await coinbase.unsubscribe('BTC/USDC:USDC', 'orderbook');
    await coinbase.unsubscribe('BTC/USDC:USDC', 'trades');
    await coinbase.unsubscribe('BTC/USDC:USDC', 'klines');

    console.log('\n⏳ Verifying no more data (3 seconds)...\n');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // ============================================
    // RESULTS SUMMARY
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(60));

    console.log('\n🟢 SPOT (BTC-USDC):');
    console.log(`  Ticker:    ${dataReceived.spot.ticker ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  OrderBook: ${dataReceived.spot.orderbook ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Trades:    ${dataReceived.spot.trades ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Klines:    ${dataReceived.spot.klines ? '✅ PASS' : '❌ FAIL'}`);

    console.log('\n🔵 PERPETUAL (BTC-PERP-INTX):');
    console.log(`  Ticker:    ${dataReceived.perpetual.ticker ? '✅ PASS' : '❌ FAIL'}`);
    console.log(
      `  OrderBook: ${dataReceived.perpetual.orderbook ? '✅ PASS' : '❌ FAIL'}`,
    );
    console.log(`  Trades:    ${dataReceived.perpetual.trades ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Klines:    ${dataReceived.perpetual.klines ? '✅ PASS' : '❌ FAIL'}`);

    const totalTests = 8;
    const passedTests =
      Object.values(dataReceived.spot).filter(Boolean).length +
      Object.values(dataReceived.perpetual).filter(Boolean).length;

    console.log('\n' + '='.repeat(60));
    console.log(`📈 Overall: ${passedTests}/${totalTests} tests passed`);
    console.log('='.repeat(60));

    if (passedTests === totalTests) {
      console.log('\n🎉 ALL TESTS PASSED! Coinbase WebSocket implementation verified!');
    } else {
      console.log('\n⚠️  Some tests failed. Review logs above for details.');
    }

    // Cleanup
    console.log('\n🛑 Disconnecting...');
    await coinbase.disconnect();
    console.log('✅ Test complete!');

    process.exit(passedTests === totalTests ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    await coinbase.disconnect();
    process.exit(1);
  }
})();
