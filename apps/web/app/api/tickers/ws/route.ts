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

      const createWsConnection = ({
        endpoints,
        onOpen,
        onMessage,
        onError,
        onClose,
        label,
      }: {
        endpoints: string[];
        onOpen: (endpointIndex: number) => void;
        onMessage: (rawData: Buffer) => void;
        onError: (error: Error) => void;
        onClose: (endpointIndex: number) => void;
        label: string;
      }) => {
        const WebSocketClient = require('ws');
        const maxRetriesPerEndpoint = 2;
        let endpointIndex = 0;
        let retryCount = 0;
        let reconnectTimeout: NodeJS.Timeout | null = null;
        let opened = false;

        const connect = () => {
          if (!isAlive) return;
          opened = false;
          const wsUrl = endpoints[endpointIndex];
          const wsClient = new WebSocketClient(wsUrl);

          wsClient.on('open', () => {
            opened = true;
            retryCount = 0;
            onOpen(endpointIndex);
          });

          wsClient.on('message', onMessage);

          wsClient.on('error', (error: Error) => {
            onError(error);
          });

          wsClient.on('close', () => {
            onClose(endpointIndex);
            if (!isAlive) return;
            if (!opened && retryCount < maxRetriesPerEndpoint - 1) {
              retryCount += 1;
              reconnectTimeout = setTimeout(connect, 3000);
              return;
            }
            if (endpointIndex < endpoints.length - 1) {
              endpointIndex += 1;
              retryCount = 0;
              reconnectTimeout = setTimeout(connect, 3000);
              return;
            }
            endpointIndex = 0;
            retryCount = 0;
            reconnectTimeout = setTimeout(connect, 3000);
          });

          if (label === 'binance') {
            binanceWs = wsClient;
          } else {
            okxWs = wsClient;
          }
        };

        connect();

        return () => {
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          if (label === 'binance' && binanceWs) binanceWs.close();
          if (label === 'okx' && okxWs) okxWs.close();
        };
      };

      const streams = BINANCE_COINS.map((coin) => `${coin.toLowerCase()}@ticker`).join(
        '/',
      );
      const binanceEndpoints = [
        `wss://stream.binance.com:9443/stream?streams=${streams}`,
        `wss://itrade.ihsueh.com/ws/binance/spot/stream?streams=${streams}`,
      ];
      const binanceCleanup = createWsConnection({
        endpoints: binanceEndpoints,
        label: 'binance',
        onOpen: (endpointIndex) => {
          console.log(
            `✅ Binance WebSocket connected (${endpointIndex === 0 ? 'official' : 'fallback'})`,
          );
          sendToClient({ type: 'connected', exchange: 'Binance' });
        },
        onMessage: (rawData: Buffer) => {
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
        },
        onError: (error: Error) => {
          console.error('Binance WebSocket error:', error);
        },
        onClose: () => {
          console.log('Binance WebSocket disconnected');
        },
      });

      const okxEndpoints = [
        'wss://ws.okx.com:8443/ws/v5/public',
        'wss://itrade.ihsueh.com/ws/okx/ws/v5/public',
      ];
      const okxCleanup = createWsConnection({
        endpoints: okxEndpoints,
        label: 'okx',
        onOpen: (endpointIndex) => {
          console.log(
            `✅ OKX WebSocket connected (${endpointIndex === 0 ? 'official' : 'fallback'})`,
          );

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
        },
        onMessage: (rawData: Buffer) => {
          try {
            const message: OKXTickerData = JSON.parse(rawData.toString());
            if (message.data && message.data.length > 0) {
              const tickerData = message.data[0];
              const open24h = parseFloat(tickerData.open24h);
              const last = parseFloat(tickerData.last);
              const changePercent = open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;

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
        },
        onError: (error: Error) => {
          console.error('OKX WebSocket error:', error);
        },
        onClose: () => {
          console.log('OKX WebSocket disconnected');
        },
      });

      // Cleanup on client disconnect
      return () => {
        isAlive = false;
        if (binanceCleanup) binanceCleanup();
        if (okxCleanup) okxCleanup();
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
