// Quick test to see if Binance WebSocket is working at all
const WebSocket = require('ws');

const ws = new WebSocket('wss://stream.binance.com/ws');

ws.on('open', () => {
  console.log('✅ Connected');
  ws.send(
    JSON.stringify({
      method: 'SUBSCRIBE',
      params: ['btcusdt@ticker'],
      id: 1,
    }),
  );
  console.log('📡 Sent subscription');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('📨 Message:', JSON.stringify(msg).substring(0, 200));
  if (msg.e === '24hrTicker') {
    console.log(`✅ GOT TICKER for ${msg.s}: $${msg.c}`);
    process.exit(0);
  }
});

setTimeout(() => {
  console.error('❌ TIMEOUT - No ticker received');
  process.exit(1);
}, 10000);
