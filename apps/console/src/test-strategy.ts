import { run } from './strategy-runner';
import { IStrategy, MovingWindowGridsStrategy } from '@itrade/strategies';

async function main() {
  const strategies = new Map<string, IStrategy>();
  strategies.set(
    'MovingWindowGrids',
    new MovingWindowGridsStrategy({
      exchange: 'binance',
      symbol: 'BTC/USDT',
      windowSize: 10,
      gridSize: 10,
      gridCount: 10,
      subscription: {
        ticker: false,
        klines: {
          enabled: true,
          interval: '15m',
        },
        trades: false,
        orderbook: false,
        method: 'websocket',
        exchange: 'binance',
      },
    }),
  );
  await run(strategies);
}

main();
