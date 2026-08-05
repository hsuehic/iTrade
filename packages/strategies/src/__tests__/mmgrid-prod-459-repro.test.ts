import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import {
  Kline,
  KlineInterval,
  normalizeAnalyzeResult,
  Order,
  OrderBook,
  OrderSide,
  OrderStatus,
  OrderType,
  StrategyConfig,
  StrategyOrderResult,
  TimeInForce,
} from '@itrade/core';
import {
  MarketMakerGridParameters,
  MarketMakerGridStrategy,
} from '../strategies/MarketMakerGridStrategy';

const SYMBOL = 'WLD/USDC:USDC';

function order(params: {
  clientOrderId: string;
  side: OrderSide;
  price: number;
  quantity: number;
  status: OrderStatus;
}): Order {
  const now = new Date();
  return {
    id: `order-${params.clientOrderId}`,
    clientOrderId: params.clientOrderId,
    symbol: SYMBOL,
    exchange: 'binance',
    strategyId: 459,
    side: params.side,
    type: OrderType.LIMIT,
    quantity: new Decimal(params.quantity),
    price: new Decimal(params.price),
    status: params.status,
    timeInForce: TimeInForce.GTC,
    timestamp: now,
    updateTime: now,
    executedQuantity: new Decimal(0),
    averagePrice: new Decimal(params.price),
  };
}

describe('MarketMakerGridStrategy - production 459 restart reproduction', () => {
  it('places the L0 entry after restart with legacy orphan TPs', async () => {
    const config: StrategyConfig<MarketMakerGridParameters> = {
      type: 'MarketMakerGridStrategy',
      strategyId: 459,
      strategyName: '2027-08-WLD-M-1',
      symbol: SYMBOL,
      exchange: 'binance',
      parameters: {
        klineInterval: '15m',
        minRangePercent: 0.35,
        levelGapsPercent: '0.2,1.2,3.2',
        levelAllocationsPercent: '30,50,20',
        levelTakeProfitGapsPercent: '0.38,1.52,3.3',
        takeProfitGapPercent: 0,
        maxInvestment: 1000,
        maxInventory: 30000,
        leverage: 10,
      },
    };
    const strategy = new MarketMakerGridStrategy(config);

    const orderBook: OrderBook = {
      symbol: SYMBOL,
      timestamp: new Date(),
      bids: [[new Decimal(0.3095), new Decimal(1000)]],
      asks: [[new Decimal(0.3096), new Decimal(1000)]],
    };

    // 21:15-21:30 bar: range 0.51% >= 0.35% threshold
    const kline: Kline = {
      symbol: SYMBOL,
      interval: '15m' as KlineInterval,
      openTime: new Date('2026-08-05T21:15:00Z'),
      closeTime: new Date('2026-08-05T21:30:00Z'),
      open: new Decimal(0.311),
      high: new Decimal(0.3111),
      low: new Decimal(0.3095),
      close: new Decimal(0.3095),
      volume: new Decimal(100000),
      quoteVolume: new Decimal(31000),
      trades: 500,
      isClosed: true,
    };

    const result = await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [
        // Legacy (unsuffixed) TP orders from before the L-suffix deploy
        order({
          clientOrderId: 'T459D3D1785963644',
          side: OrderSide.SELL,
          price: 0.3183,
          quantity: 9485.6,
          status: OrderStatus.NEW,
        }),
        order({
          clientOrderId: 'T459D5D1785936509',
          side: OrderSide.SELL,
          price: 0.326,
          quantity: 15770.4,
          status: OrderStatus.NEW,
        }),
        // Legacy duplicate L1 entry
        order({
          clientOrderId: 'E459D2D1785963275',
          side: OrderSide.BUY,
          price: 0.3131,
          quantity: 4743.9,
          status: OrderStatus.NEW,
        }),
      ],
      positions: [
        {
          symbol: SYMBOL,
          side: 'long',
          quantity: new Decimal(25256),
          avgPrice: new Decimal(0.3184),
          markPrice: new Decimal(0.3095),
          unrealizedPnl: new Decimal(-224),
          leverage: new Decimal(10),
          timestamp: new Date(),
          exchange: 'binance',
        },
      ],
      orderBook,
      strategyNetPosition: new Decimal(9367.4 + 15770.4 - 9367.4 + 9485.6), // 25256.0
      klines: { '15m': [kline] },
    });

    const signals = normalizeAnalyzeResult(result);
    const buys = signals.filter((s): s is StrategyOrderResult => s.action === 'buy');
    const cancels = signals.filter((s) => s.action === 'cancel');

    // Legacy entry canceled (unattributable)
    expect(cancels).toHaveLength(1);

    // Expected: budget = 10000 - orphan TP notional (9485.6*0.3183 + 15770.4*0.326
    // = 8160.4) = 1839.6 -> L0 target qty = 1839.6 / (0.3095*0.998) ~ 5956,
    // clamped by capacity 30000 - 25256 = 4744.
    expect(buys.length).toBeGreaterThanOrEqual(1);
    expect(buys[0].quantity!.toNumber()).toBeCloseTo(4744, 0);
    expect(buys[0].price!.toNumber()).toBeCloseTo(0.3095 * 0.998, 6);

    // Orphan TP notional is deployed capital and must be reflected in state
    const state = strategy.getStrategyState();
    expect(new Decimal(state.orphanTpNotional).toNumber()).toBeCloseTo(8160.4, 0);
    expect(new Decimal(state.remainingCapacity).toNumber()).toBeCloseTo(0, 0);
  });
});
