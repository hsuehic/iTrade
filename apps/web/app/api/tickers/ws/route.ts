/**
 * Server-side WebSocket proxy for Binance and OKX ticker data
 * This allows us to stream real-time data to the client while handling
 * connection issues and reconnection logic on the server side
 */

export const dynamic = 'force-dynamic';

const BINANCE_COINS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT'];
const OKX_COINS = [
  'BTC-USDT',
  'ETH-USDT',
  'SOL-USDT',
  'XRP-USDT',
  'ADA-USDT',
  'DOGE-USDT',
];

interface BinanceTickerData {
  e: string; // Event type
  E: number; // Event time
  s: string; // Symbol
  c: string; // Current price
  p: string; // Price change
  P: string; // Price change percent
  v: string; // Total traded base asset volume
  q: string; // Total traded quote asset volume
  h: string; // High price
  l: string; // Low price
}

interface OKXTickerData {
  arg: {
    channel: string;
    instId: string;
  };
  data: Array<{
    instId: string;
    last: string;
    lastSz: string;
    askPx: string;
    askSz: string;
    bidPx: string;
    bidSz: string;
    open24h: string;
    high24h: string;
    low24h: string;
    volCcy24h: string;
    vol24h: string;
    ts: string;
    sodUtc0: string;
    sodUtc8: string;
  }>;
}

export async function GET() {
  // Create a ReadableStream for Server-Sent Events (SSE)
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let binanceWs: any = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let okxWs: any = null;
      let reconnectTimeout: NodeJS.Timeout | null = null;
      let isAlive = true;

      const sendToClient = (data: object) => {
        if (isAlive) {
          try {
            const chunk = encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
            if (controller.desiredSize !== null) {
              controller.enqueue(chunk);
            } else {
              isAlive = false;
            }
          } catch {
            // Client disconnected, mark as not alive
            isAlive = false;
          }
        }
      };

      // Connect to Binance WebSocket
      const connectBinance = () => {
        try {
          const WebSocketClient = require('ws');
          const streams = BINANCE_COINS.map(
            (coin) => `${coin.toLowerCase()}@ticker`,
          ).join('/');
          const wsUrl = `wss://stream.binance.com/stream?streams=${streams}`;

          binanceWs = new WebSocketClient(wsUrl);

          binanceWs.on('open', () => {
            console.log('✅ Binance WebSocket connected');
            sendToClient({ type: 'connected', exchange: 'Binance' });
          });

          binanceWs.on('message', (rawData: Buffer) => {
            try {
              const message = JSON.parse(rawData.toString());
              if (message.data) {
                const tickerData: BinanceTickerData = message.data;
                const formattedData = {
                  symbol: tickerData.s,
                  price: parseFloat(tickerData.c),
                  change24h: parseFloat(tickerData.P),
                  volume24h: parseFloat(tickerData.q),
                  high24h: parseFloat(tickerData.h),
                  low24h: parseFloat(tickerData.l),
                  exchange: 'Binance',
                };
                sendToClient({ type: 'ticker', data: formattedData });
              }
            } catch (error) {
              console.error('Error parsing Binance message:', error);
            }
          });

          binanceWs.on('error', (error: Error) => {
            console.error('Binance WebSocket error:', error);
          });

          binanceWs.on('close', () => {
            console.log('Binance WebSocket disconnected');
            if (isAlive) {
              setTimeout(() => {
                if (isAlive) connectBinance();
              }, 3000);
            }
          });
        } catch (error) {
          console.error('Failed to connect Binance WebSocket:', error);
        }
      };

      // Connect to OKX WebSocket
      const connectOKX = () => {
        try {
          const WebSocketClient = require('ws');
          // Use standard HTTPS port 443 for WebSocket
          const wsUrl = 'wss://wspap.okx.com/ws/v5/public?brokerId=9999';

          okxWs = new WebSocketClient(wsUrl);

          okxWs.on('open', () => {
            console.log('✅ OKX WebSocket connected');

            // Subscribe to ticker channels
            const subscribeMsg = {
              op: 'subscribe',
              args: OKX_COINS.map((coin) => ({
                channel: 'tickers',
                instId: coin,
              })),
            };

            okxWs.send(JSON.stringify(subscribeMsg));
            sendToClient({ type: 'connected', exchange: 'OKX' });
          });

          okxWs.on('message', (rawData: Buffer) => {
            try {
              const message: OKXTickerData = JSON.parse(rawData.toString());
              if (message.data && message.data.length > 0) {
                const tickerData = message.data[0];
                const open24h = parseFloat(tickerData.open24h);
                const last = parseFloat(tickerData.last);
                const changePercent =
                  open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;

                const formattedData = {
                  symbol: tickerData.instId,
                  price: last,
                  change24h: changePercent,
                  volume24h: parseFloat(tickerData.volCcy24h),
                  high24h: parseFloat(tickerData.high24h),
                  low24h: parseFloat(tickerData.low24h),
                  exchange: 'OKX',
                };
                sendToClient({ type: 'ticker', data: formattedData });
              }
            } catch (error) {
              console.error('Error parsing OKX message:', error);
            }
          });

          okxWs.on('error', (error: Error) => {
            console.error('OKX WebSocket error:', error);
          });

          okxWs.on('close', () => {
            console.log('OKX WebSocket disconnected');
            if (isAlive) {
              setTimeout(() => {
                if (isAlive) connectOKX();
              }, 3000);
            }
          });
        } catch (error) {
          console.error('Failed to connect OKX WebSocket:', error);
        }
      };

      // Start connections
      connectBinance();
      connectOKX();

      // Cleanup on client disconnect
      return () => {
        isAlive = false;
        if (binanceWs) binanceWs.close();
        if (okxWs) okxWs.close();
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
      };
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
