import { run } from './strategy-runner';
import { IStrategy, MovingWindowGridsStrategy } from '@itrade/strategies';

async function main() {
  const strategies = new Map<string, IStrategy>();
  strategies.set(
    'MovingWindowGrids',
    new MovingWindowGridsStrategy({
      exchange: 'okx',
      symbol: 'WLD/USDT:USDT',
      windowSize: 10,
      gridSize: 10,
      gridCount: 10,
      subscription: {
        ticker: false,
        klines: {
          enabled: true,
          interval: '5m',
        },
        trades: false,
        orderbook: {
          enabled: false,
          depth: 5,
        },
        method: 'websocket',
        exchange: 'binance',
      },
    }),
  );
  await run(strategies);
}

main();
