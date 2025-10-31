import { run } from './helpers/strategy-runner';
import { IStrategy, TradeMode } from '@itrade/core';
import { MovingWindowGridsStrategy } from '@itrade/strategies';

async function main() {
  const strategies = new Map<string, IStrategy>();
  strategies.set(
    'MovingWindowGrids - OKX',
    new MovingWindowGridsStrategy({
      exchange: 'okx',
      type: 'MovingWindowGridsStrategy',
      strategyName: 'MovingWindowGrids - OKX',
      strategyId: 2,
      symbol: 'WLD/USDT:USDT',
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
        exchange: 'okx',
      },
      parameters: {
        windowSize: 10,
        gridSize: 10,
        gridCount: 10,
        minVolatility: 0.5,
        takeProfitRatio: 1.5,
        baseSize: 3000,
        maxSize: 30000,
        leverage: 10,
        tradeMode: TradeMode.ISOLATED,
      },
    }),
  );
  strategies.set(
    'MovingWindowGrids - Coinbase',
    new MovingWindowGridsStrategy({
      exchange: 'coinbase',
      type: 'MovingWindowGridsStrategy',
      strategyName: 'MovingWindowGrids - Coinbase',
      strategyId: 3,
      symbol: 'WLD/USDT:USDT',
      subscription: {
        ticker: false,
        klines: {
          enabled: true,
          interval: '15m',
        },
        trades: false,
        orderbook: {
          enabled: false,
          depth: 5,
        },
        method: 'websocket',
        exchange: 'coinbase',
      },
      parameters: {
        windowSize: 10,
        gridSize: 10,
        gridCount: 10,
        minVolatility: 0.5,
        takeProfitRatio: 1.5,
        baseSize: 3000,
        maxSize: 30000,
        leverage: 10,
        tradeMode: TradeMode.ISOLATED,
      },
    }),
  );
  await run(strategies);
}

main();
