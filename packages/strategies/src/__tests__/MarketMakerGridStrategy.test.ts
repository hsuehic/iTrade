import { beforeEach, describe, expect, it } from 'vitest';
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
  Position,
  SignalType,
  StrategyCancelOrderResult,
  StrategyConfig,
  StrategyOrderResult,
  TimeInForce,
} from '@itrade/core';
import {
  MarketMakerGridParameters,
  MarketMakerGridStrategy,
} from '../strategies/MarketMakerGridStrategy';

const SYMBOL = 'ETH/USDC:USDC';

function createOrder(params: {
  clientOrderId: string;
  side: OrderSide;
  price: number;
  quantity: number | Decimal;
  status: OrderStatus;
  executedQuantity?: number | Decimal;
  strategyId?: number;
}): Order {
  const now = new Date();
  return {
    id: `order-${params.clientOrderId}`,
    clientOrderId: params.clientOrderId,
    symbol: SYMBOL,
    exchange: 'binance',
    strategyId: params.strategyId,
    side: params.side,
    type: OrderType.LIMIT,
    quantity: new Decimal(params.quantity),
    price: new Decimal(params.price),
    status: params.status,
    timeInForce: TimeInForce.GTC,
    timestamp: now,
    updateTime: now,
    executedQuantity: new Decimal(params.executedQuantity ?? 0),
    averagePrice: new Decimal(params.price),
  };
}

function createPosition(params: { quantity: number; avgPrice: number }): Position {
  return {
    symbol: SYMBOL,
    side: 'long',
    quantity: new Decimal(params.quantity),
    avgPrice: new Decimal(params.avgPrice),
    markPrice: new Decimal(params.avgPrice),
    unrealizedPnl: new Decimal(0),
    leverage: new Decimal(1),
    timestamp: new Date(),
    exchange: 'binance',
  };
}

function createOrderBook(params: { bid: number; ask: number }): OrderBook {
  return {
    symbol: SYMBOL,
    timestamp: new Date(),
    bids: [[new Decimal(params.bid), new Decimal(1)]],
    asks: [[new Decimal(params.ask), new Decimal(1)]],
  };
}

let klineCounter = 0;

function createKline(params: {
  high: number;
  low: number;
  open?: number;
  close?: number;
  interval?: string;
  isClosed?: boolean;
}): Kline {
  klineCounter += 1;
  const openTime = new Date(Date.now() - 15 * 60 * 1000 + klineCounter * 1000);
  return {
    symbol: SYMBOL,
    interval: (params.interval ?? '15m') as KlineInterval,
    openTime,
    closeTime: new Date(openTime.getTime() + 15 * 60 * 1000),
    open: new Decimal(params.open ?? params.low),
    high: new Decimal(params.high),
    low: new Decimal(params.low),
    close: new Decimal(params.close ?? params.high),
    volume: new Decimal(100),
    quoteVolume: new Decimal(10000),
    trades: 100,
    isClosed: params.isClosed ?? true,
  };
}

function buySignals(result: Awaited<ReturnType<MarketMakerGridStrategy['analyze']>>) {
  return normalizeAnalyzeResult(result).filter(
    (s): s is StrategyOrderResult => s.action === 'buy',
  );
}

function sellSignals(result: Awaited<ReturnType<MarketMakerGridStrategy['analyze']>>) {
  return normalizeAnalyzeResult(result).filter(
    (s): s is StrategyOrderResult => s.action === 'sell',
  );
}

function cancelSignals(result: Awaited<ReturnType<MarketMakerGridStrategy['analyze']>>) {
  return normalizeAnalyzeResult(result).filter(
    (s): s is StrategyCancelOrderResult => s.action === 'cancel',
  );
}

function createStrategy(
  overrides: Partial<MarketMakerGridParameters> = {},
): MarketMakerGridStrategy {
  const config: StrategyConfig<MarketMakerGridParameters> = {
    type: 'MarketMakerGridStrategy',
    strategyId: 1,
    strategyName: 'mm-grid-test',
    symbol: SYMBOL,
    exchange: 'binance',
    parameters: {
      klineInterval: '15m',
      minRangePercent: 0.8,
      levelGapsPercent: '1,5,25',
      levelAllocationsPercent: '50,30,20',
      levelTakeProfitGapsPercent: '',
      takeProfitGapPercent: 0,
      maxInvestment: 1000,
      maxInventory: 100,
      // leverage 1 keeps buying power == maxInvestment for simple size assertions
      leverage: 1,
      ...overrides,
    },
  };
  return new MarketMakerGridStrategy(config);
}

async function initWithOrderBook(
  strategy: MarketMakerGridStrategy,
  params: { bid: number; ask: number },
) {
  return strategy.processInitialData({
    symbol: SYMBOL,
    exchange: 'binance',
    timestamp: new Date(),
    orderBook: createOrderBook(params),
  });
}

describe('MarketMakerGridStrategy', () => {
  let strategy: MarketMakerGridStrategy;

  beforeEach(() => {
    strategy = createStrategy();
  });

  it('places one BUY entry per level when kline range exceeds threshold', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    // Range = (101 - 100) / 100 = 1% >= 0.8% threshold
    const result = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(result);

    expect(buys).toHaveLength(3);

    // Level 0: gap 1% -> price 99, allocation 50% -> 500 quote
    expect(buys[0].price!.toNumber()).toBeCloseTo(99, 8);
    expect(buys[0].quantity!.toNumber()).toBeCloseTo(500 / 99, 8);
    // Level 1: gap 5% -> price 95, allocation 30% -> 300 quote
    expect(buys[1].price!.toNumber()).toBeCloseTo(95, 8);
    expect(buys[1].quantity!.toNumber()).toBeCloseTo(300 / 95, 8);
    // Level 2: gap 25% -> price 75, allocation 20% -> 200 quote
    expect(buys[2].price!.toNumber()).toBeCloseTo(75, 8);
    expect(buys[2].quantity!.toNumber()).toBeCloseTo(200 / 75, 8);

    for (const buy of buys) {
      expect(buy.metadata?.signalType).toBe(SignalType.Entry);
    }
  });

  it('does nothing when kline range is below threshold and no orders are open', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    // Range = 0.5% < 0.8%
    const result = await strategy.analyze({
      klines: [createKline({ high: 100.5, low: 100 })],
    });

    expect(buySignals(result)).toHaveLength(0);
    expect(cancelSignals(result)).toHaveLength(0);
  });

  it('keeps open entries untouched when the signal turns inactive', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(triggerResult);
    expect(buys).toHaveLength(3);

    // Exchange confirms the three entry orders
    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // Quiet kline: range 0.2% < 0.8%. Previously this cancelled all three
    // entries; the new behaviour keeps them so wide grid levels (whose
    // prices are far from bid) actually have a chance to fill later.
    const quietResult = await strategy.analyze({
      klines: [createKline({ high: 100.2, low: 100 })],
    });

    expect(cancelSignals(quietResult)).toHaveLength(0);
    expect(buySignals(quietResult)).toHaveLength(0);

    // Entries must still be open - the strategy state retains them.
    const state = strategy.getStrategyState();
    for (const lvl of state.levels) {
      expect(lvl.entryClientOrderId).not.toBeNull();
    }
  });

  it('keeps every entry untouched when any entry partially filled and next kline is quiet', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    // Trigger the grid.
    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(triggerResult);
    expect(buys).toHaveLength(3);
    const level0Buy = buys[0];

    // Exchange confirms all three entries as NEW.
    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // Level 0 partially fills (half). The other two entries remain untouched.
    const halfQty = level0Buy.quantity!.div(2);
    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: level0Buy.price!.toNumber(),
          quantity: level0Buy.quantity!,
          executedQuantity: halfQty,
          status: OrderStatus.PARTIALLY_FILLED,
          strategyId: 1,
        }),
      ],
    });

    // Quiet kline arrives while L0 is still PARTIALLY_FILLED with inventory
    // held. The new rule: do not cancel ANY entry (not even L1/L2 which are
    // still NEW). Lifecycle of the partial fill continues via handleOrderUpdates.
    const quietResult = await strategy.analyze({
      klines: [createKline({ high: 100.2, low: 100 })],
    });

    expect(cancelSignals(quietResult)).toHaveLength(0);
    expect(buySignals(quietResult)).toHaveLength(0);
  });

  it('keeps every entry untouched when any entry partially filled and next kline is active', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(triggerResult);
    const level0Buy = buys[0];

    // Exchange confirms all three entries.
    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // Level 0 partially fills -> hasActiveCycle() must hold.
    const halfQty = level0Buy.quantity!.div(2);
    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: level0Buy.price!.toNumber(),
          quantity: level0Buy.quantity!,
          executedQuantity: halfQty,
          status: OrderStatus.PARTIALLY_FILLED,
          strategyId: 1,
        }),
      ],
    });

    // ACTIVE kline (range >= 0.8%) with a moved bid: reprice=false branch must
    // not touch L0 (still partially filled, in-flight inventory) nor L1/L2
    // (their fills could arrive any moment).
    const activeResult = await strategy.analyze({
      orderbook: createOrderBook({ bid: 99, ask: 99.1 }),
      klines: [createKline({ high: 100.5, low: 99.5 })],
    });

    expect(cancelSignals(activeResult)).toHaveLength(0);
    // No new buys either: L0 busy, L1/L2 already have entries open.
    expect(buySignals(activeResult)).toHaveLength(0);
  });

  it('places a take-profit above ask1 after an entry fill', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const level0Buy = buySignals(triggerResult)[0];

    const fillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tps = sellSignals(fillResult);

    expect(tps).toHaveLength(1);
    expect(tps[0].metadata?.signalType).toBe(SignalType.TakeProfit);
    expect(tps[0].quantity!.toNumber()).toBeCloseTo(level0Buy.quantity!.toNumber(), 8);
    // ask1 (100.1) > entry (99), so TP = 100.1 * (1 + 1%) = 101.101
    expect(tps[0].price!.toNumber()).toBeCloseTo(100.1 * 1.01, 8);
  });

  it('floors the take-profit at entry price when ask has dropped below entry', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const level0Buy = buySignals(triggerResult)[0];

    // Market dropped: ask now below the 99 entry price
    const fillResult = await strategy.analyze({
      orderbook: createOrderBook({ bid: 98, ask: 98.1 }),
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tps = sellSignals(fillResult);

    expect(tps).toHaveLength(1);
    // Floored at entryPrice * (1 + 1%) = 99.99, not 98.1 * 1.01
    expect(tps[0].price!.toNumber()).toBeCloseTo(99 * 1.01, 8);
  });

  it('re-enters the level after its take-profit fills while the signal is active', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const level0Buy = buySignals(triggerResult)[0];

    const fillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp = sellSignals(fillResult)[0];

    const tpFillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: tp.clientOrderId,
          side: OrderSide.SELL,
          price: tp.price!.toNumber(),
          quantity: tp.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: tp.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const reentries = buySignals(tpFillResult);

    // Only level 0 is idle again (levels 1/2 still have their original entries open)
    expect(reentries).toHaveLength(1);
    // Re-entry price = min(bid1=100, tpPrice=101.101) / (1 + 1%) = 100/1.01 = 99.0099...
    expect(reentries[0].price!.toNumber()).toBeCloseTo(100 / 1.01, 8);

    const state = strategy.getStrategyState();
    expect(new Decimal(state.inventoryQty).toNumber()).toBeCloseTo(0, 8);
  });

  it('leaves other levels untouched when a TP fills, even if bid moved', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(triggerResult);
    const level0Buy = buys[0];

    // Confirm all three entries, then fill level 0's entry
    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });
    const fillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp = sellSignals(fillResult)[0];

    // TP fills while the bid has moved down to 99: only level 0 re-enters at the
    // new bid; levels 1/2 keep their original entries (no cancels).
    const tpFillResult = await strategy.analyze({
      orderbook: createOrderBook({ bid: 99, ask: 99.1 }),
      orders: [
        createOrder({
          clientOrderId: tp.clientOrderId,
          side: OrderSide.SELL,
          price: tp.price!.toNumber(),
          quantity: tp.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: tp.quantity!,
          strategyId: 1,
        }),
      ],
    });

    const reentries = buySignals(tpFillResult);
    expect(reentries).toHaveLength(1);
    // Re-entry price = min(bid1=99, tpPrice=101.101) / (1 + 1%) = 99/1.01 = 98.0198...
    // The min() picks the lower of current bid and TP fill price so the re-entry
    // BUY never chases the market up past the TP price; it sits one gap below bid.
    // A deeper level (L1 or L2) still has an untraded entry on the book, so L0
    // re-enters while the deeper safety net is still in place.
    expect(reentries[0].price!.toNumber()).toBeCloseTo(99 / 1.01, 8);
    expect(cancelSignals(tpFillResult)).toHaveLength(0);
  });

  it('re-anchors all entries at kline close when the grid is clean', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const first = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const firstBuys = buySignals(first);
    await strategy.analyze({
      orders: firstBuys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // No fills, no TPs -> clean grid: next kline close re-prices everything.
    // bid drops from 100 to 90 (a significant move), so ALL levels including
    // L0 get re-anchored at the new bid. (When bid only drifts slightly, the
    // L0 proximity guard may skip L0 cancel/replace — tested separately.)
    const second = await strategy.analyze({
      orderbook: createOrderBook({ bid: 90, ask: 90.1 }),
      klines: [createKline({ high: 100, low: 90 })],
    });

    expect(cancelSignals(second)).toHaveLength(3);
    const newBuys = buySignals(second);
    expect(newBuys).toHaveLength(3);
    expect(newBuys[0].price!.toNumber()).toBeCloseTo(90 * 0.99, 8);
    expect(newBuys[1].price!.toNumber()).toBeCloseTo(90 * 0.95, 8);
    expect(newBuys[2].price!.toNumber()).toBeCloseTo(90 * 0.75, 8);
  });

  it('L0 proximity guard: skips L0 cancel when new price is further from bid', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const first = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const firstBuys = buySignals(first);
    // L0 was placed at 100 * 0.99 = 99
    await strategy.analyze({
      orders: firstBuys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // bid drops to 99 — now L0 at 99 is exactly AT bid.
    // New desired L0 = 99 * 0.99 = 98.01, which is FURTHER from bid (0.99 vs 0).
    // Proximity guard should keep L0, but L1 and L2 still get re-anchored.
    const second = await strategy.analyze({
      orderbook: createOrderBook({ bid: 99, ask: 99.1 }),
      klines: [createKline({ high: 100, low: 99 })],
    });

    const cancels = cancelSignals(second);
    const newBuys = buySignals(second);
    // L0 kept (proximity guard), L1+L2 cancelled and re-placed
    expect(cancels).toHaveLength(2);
    expect(newBuys).toHaveLength(2);
    // L1 and L2 re-anchored at bid=99
    expect(newBuys[0].price!.toNumber()).toBeCloseTo(99 * 0.95, 8);
    expect(newBuys[1].price!.toNumber()).toBeCloseTo(99 * 0.75, 8);
  });

  it('does not touch open entries at kline close while a TP is outstanding', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const first = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const firstBuys = buySignals(first);
    await strategy.analyze({
      orders: firstBuys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // Level 0 fills -> TP is now outstanding (active cycle)
    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: firstBuys[0].clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: firstBuys[0].quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: firstBuys[0].quantity!,
          strategyId: 1,
        }),
      ],
    });

    // Next kline closes above threshold with a moved bid: levels 1/2 entries
    // must remain untouched (no cancels, no replacements).
    const second = await strategy.analyze({
      orderbook: createOrderBook({ bid: 99, ask: 99.1 }),
      klines: [createKline({ high: 100, low: 99 })],
    });

    expect(cancelSignals(second)).toHaveLength(0);
    expect(buySignals(second)).toHaveLength(0);
  });

  it('still fills an empty level at kline close during an active cycle', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const first = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const firstBuys = buySignals(first);
    await strategy.analyze({
      orders: firstBuys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // Level 0 fills (TP outstanding), and level 1's entry is canceled externally
    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: firstBuys[0].clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: firstBuys[0].quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: firstBuys[0].quantity!,
          strategyId: 1,
        }),
        createOrder({
          clientOrderId: firstBuys[1].clientOrderId,
          side: OrderSide.BUY,
          price: 95,
          quantity: firstBuys[1].quantity!,
          status: OrderStatus.CANCELED,
          strategyId: 1,
        }),
      ],
    });

    // Next kline: level 1 (no entry) gets a fresh one at the current bid;
    // level 2's entry stays untouched.
    const second = await strategy.analyze({
      orderbook: createOrderBook({ bid: 99, ask: 99.1 }),
      klines: [createKline({ high: 100, low: 99 })],
    });

    expect(cancelSignals(second)).toHaveLength(0);
    const newBuys = buySignals(second);
    expect(newBuys).toHaveLength(1);
    expect(newBuys[0].price!.toNumber()).toBeCloseTo(99 * 0.95, 8);
  });

  it('ignores orderbook events from other symbols', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    // A foreign symbol's orderbook (engine fans out all events to all strategies)
    await strategy.analyze({
      symbol: 'BTC/USDC:USDC',
      orderbook: {
        symbol: 'BTC/USDC:USDC',
        timestamp: new Date(),
        bids: [[new Decimal(50000), new Decimal(1)]],
        asks: [[new Decimal(50001), new Decimal(1)]],
      },
    });

    const result = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(result);

    // Entries must still be anchored on OUR bid (100), not BTC's 50000
    expect(buys).toHaveLength(3);
    expect(buys[0].price!.toNumber()).toBeCloseTo(99, 8);
  });

  it('anchors entries on the kline close when no orderbook stream exists', async () => {
    // No orderbook at all (e.g. subscription misconfigured in production)
    await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
    });

    const result = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100, close: 100.4 })],
    });
    const buys = buySignals(result);

    expect(buys).toHaveLength(3);
    expect(buys[0].price!.toNumber()).toBeCloseTo(100.4 * 0.99, 8);
    expect(buys[1].price!.toNumber()).toBeCloseTo(100.4 * 0.95, 8);
    expect(buys[2].price!.toNumber()).toBeCloseTo(100.4 * 0.75, 8);
  });

  it('re-enters after a TP fill using the fill price when the orderbook is stale', async () => {
    await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
    });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100, close: 100.4 })],
    });
    const level0Buy = buySignals(triggerResult)[0];

    const fillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: level0Buy.price!.toNumber(),
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp = sellSignals(fillResult)[0];
    expect(tp).toBeDefined();

    const tpFillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: tp.clientOrderId,
          side: OrderSide.SELL,
          price: tp.price!.toNumber(),
          quantity: tp.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: tp.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const reentries = buySignals(tpFillResult);

    // Anchored on the LEVEL's last entry fill price (= 99.396 here), not on
    // the TP fill price. Deeper levels (L1/L2) still have entries on the book
    // (they were placed in the trigger step and never touched in the test), so
    // the strategy re-lists L0 at its original BUY price.
    expect(reentries).toHaveLength(1);
    expect(reentries[0].price!.toNumber()).toBeCloseTo(99.396, 6);
  });

  it('enforces maxInventory including open BUY orders', async () => {
    strategy = createStrategy({ maxInventory: 6 });
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const result = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(result);

    // L0 target = 500/99 ≈ 5.0505 fits; L1 target = 300/95 ≈ 3.158 gets clamped
    // to remaining capacity; L2 has no capacity left.
    expect(buys.length).toBeLessThanOrEqual(3);
    const totalQty = buys.reduce((acc, b) => acc.add(b.quantity!), new Decimal(0));
    expect(totalQty.toNumber()).toBeLessThanOrEqual(6 + 1e-9);
    expect(buys[0].quantity!.toNumber()).toBeCloseTo(500 / 99, 8);
    expect(buys[1].quantity!.toNumber()).toBeCloseTo(6 - 500 / 99, 8);
  });

  it('encodes the level index in generated clientOrderIds', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });
    const result = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(result);
    expect(buys.map((b) => b.clientOrderId.slice(-2))).toEqual(['L0', 'L1', 'L2']);
  });

  it('re-attaches suffixed TP orders and keeps suffixed entries across a restart', async () => {
    // L1's TP (level suffix L1) and L2's entry (suffix L2) survive the restart
    const openTp = createOrder({
      clientOrderId: 'T1D8D1710000000L1',
      side: OrderSide.SELL,
      price: 105,
      quantity: 3,
      status: OrderStatus.NEW,
      strategyId: 1,
    });
    const openEntry = createOrder({
      clientOrderId: 'E1D7D1710000000L2',
      side: OrderSide.BUY,
      price: 75,
      quantity: 2.6,
      status: OrderStatus.NEW,
      strategyId: 1,
    });

    const initResult = await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [openTp, openEntry],
      orderBook: createOrderBook({ bid: 100, ask: 100.1 }),
      strategyNetPosition: new Decimal(3),
    });

    // Nothing canceled, no recovery TP needed (TP covers the inventory)
    expect(cancelSignals(initResult)).toHaveLength(0);
    expect(
      normalizeAnalyzeResult(initResult).filter((s) => s.action === 'sell'),
    ).toHaveLength(0);

    const state = strategy.getStrategyState();
    expect(state.levels[1].tpClientOrderId).toBe(openTp.clientOrderId);
    expect(new Decimal(state.levels[1].inventoryQty).toNumber()).toBeCloseTo(3, 8);
    // Cost basis derived from TP price / (1 + 5% level gap) = 105 / 1.05 = 100
    expect(new Decimal(state.levels[1].avgEntryPrice!).toNumber()).toBeCloseTo(100, 8);
    expect(state.levels[2].entryClientOrderId).toBe(openEntry.clientOrderId);

    // Next trigger: only L0 gets a fresh entry. L1 is blocked by its attached TP,
    // L2's kept entry stays untouched (active cycle -> no repricing).
    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(triggerResult);
    expect(buys).toHaveLength(1);
    expect(buys[0].clientOrderId.endsWith('L0')).toBe(true);
    expect(buys[0].price!.toNumber()).toBeCloseTo(99, 8);
    expect(cancelSignals(triggerResult)).toHaveLength(0);
  });

  it('cancels stale entries and adopts take-profit orders on restart', async () => {
    const staleEntry = createOrder({
      clientOrderId: 'E1D7D1710000000',
      side: OrderSide.BUY,
      price: 95,
      quantity: 2,
      status: OrderStatus.NEW,
      strategyId: 1,
    });
    const openTp = createOrder({
      clientOrderId: 'T1D8D1710000000',
      side: OrderSide.SELL,
      price: 105,
      quantity: 1.5,
      status: OrderStatus.NEW,
      strategyId: 1,
    });

    const result = await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [staleEntry, openTp],
      orderBook: createOrderBook({ bid: 100, ask: 100.1 }),
      strategyNetPosition: new Decimal(1.5),
    });

    const cancels = cancelSignals(result);
    expect(cancels).toHaveLength(1);
    expect(cancels[0].clientOrderId).toBe(staleEntry.clientOrderId);

    const state = strategy.getStrategyState();
    expect(new Decimal(state.inventoryQty).toNumber()).toBeCloseTo(1.5, 8);
  });

  it('multiplies buying power by leverage when sizing entries', async () => {
    strategy = createStrategy({ leverage: 5, maxInventory: 1000 });
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const result = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(result);

    expect(buys).toHaveLength(3);
    // Buying power = 1000 * 5 = 5000; level 0 gets 50% = 2500 quote at price 99
    expect(buys[0].quantity!.toNumber()).toBeCloseTo(2500 / 99, 8);
    expect(buys[1].quantity!.toNumber()).toBeCloseTo(1500 / 95, 8);
    expect(buys[2].quantity!.toNumber()).toBeCloseTo(1000 / 75, 8);
  });

  it('uses per-level take-profit gaps when levelTakeProfitGapsPercent is set', async () => {
    strategy = createStrategy({ levelTakeProfitGapsPercent: '0.2,0.5,2' });
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const level0Buy = buySignals(triggerResult)[0];

    const fillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tps = sellSignals(fillResult);

    expect(tps).toHaveLength(1);
    // Level 0 TP gap is 0.2% (not the 1% entry gap): 100.1 * 1.002
    expect(tps[0].price!.toNumber()).toBeCloseTo(100.1 * 1.002, 8);

    const state = strategy.getStrategyState();
    expect(state.levels.map((l) => l.tpGapPercent)).toEqual(['0.2', '0.5', '2']);
  });

  it('applies a single levelTakeProfitGapsPercent value to all levels', async () => {
    strategy = createStrategy({ levelTakeProfitGapsPercent: '0.3' });
    const state = strategy.getStrategyState();
    expect(state.levels.map((l) => l.tpGapPercent)).toEqual(['0.3', '0.3', '0.3']);
  });

  it('rejects a levelTakeProfitGapsPercent count that does not match the levels', () => {
    expect(() => createStrategy({ levelTakeProfitGapsPercent: '0.2,0.5' })).toThrow(
      /levelTakeProfitGapsPercent/,
    );
  });

  it('prefers per-level TP gap over the global takeProfitGapPercent', async () => {
    strategy = createStrategy({
      levelTakeProfitGapsPercent: '0.2,0.5,2',
      takeProfitGapPercent: 9,
    });
    const state = strategy.getStrategyState();
    expect(state.levels.map((l) => l.tpGapPercent)).toEqual(['0.2', '0.5', '2']);
  });

  it('places a recovery TP for inventory not covered by adopted TP orders on restart', async () => {
    // Net position 2.0 but only 1.5 is covered by an open TP:
    // 0.5 filled while the strategy was down and must be re-listed.
    const openTp = createOrder({
      clientOrderId: 'T1D8D1710000000',
      side: OrderSide.SELL,
      price: 105,
      quantity: 1.5,
      status: OrderStatus.NEW,
      strategyId: 1,
    });

    const result = await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [openTp],
      orderBook: createOrderBook({ bid: 100, ask: 100.1 }),
      strategyNetPosition: new Decimal(2),
    });

    const tps = normalizeAnalyzeResult(result).filter(
      (s): s is StrategyOrderResult => s.action === 'sell',
    );
    expect(tps).toHaveLength(1);
    expect(tps[0].quantity!.toNumber()).toBeCloseTo(0.5, 8);
    // Entry price unknown -> priced off ask1 with level 0's TP gap (1%)
    expect(tps[0].price!.toNumber()).toBeCloseTo(100.1 * 1.01, 8);

    const state = strategy.getStrategyState();
    expect(new Decimal(state.levels[0].inventoryQty).toNumber()).toBeCloseTo(0.5, 8);
  });

  it('prices the recovery TP from the exchange position avgPrice when above ask', async () => {
    // Position basis 102 > ask 100.1: TP must be floored at 102 * (1 + 1%)
    const result = await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [],
      positions: [createPosition({ quantity: 2, avgPrice: 102 })],
      orderBook: createOrderBook({ bid: 100, ask: 100.1 }),
      strategyNetPosition: new Decimal(2),
    });

    const tps = normalizeAnalyzeResult(result).filter(
      (s): s is StrategyOrderResult => s.action === 'sell',
    );
    expect(tps).toHaveLength(1);
    expect(tps[0].quantity!.toNumber()).toBeCloseTo(2, 8);
    expect(tps[0].price!.toNumber()).toBeCloseTo(102 * 1.01, 8);
  });

  it('drops phantom inventory when the exchange reports no open position', async () => {
    // SQL says 2 units, but position data is present and shows no position:
    // the position was closed externally. Selling would open a short -> drop.
    const result = await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [],
      positions: [],
      orderBook: createOrderBook({ bid: 100, ask: 100.1 }),
      strategyNetPosition: new Decimal(2),
    });

    const tps = normalizeAnalyzeResult(result).filter(
      (s): s is StrategyOrderResult => s.action === 'sell',
    );
    expect(tps).toHaveLength(0);

    const state = strategy.getStrategyState();
    expect(new Decimal(state.inventoryQty).toNumber()).toBeCloseTo(0, 8);
    expect(new Decimal(state.levels[0].inventoryQty).toNumber()).toBeCloseTo(0, 8);
  });

  it('clamps the recovery TP to the sellable excess of the exchange position', async () => {
    // SQL says 2, exchange holds 1.8, and 1.5 is already covered by an adopted TP:
    // only 0.3 is sellable; the phantom 0.2 is dropped.
    const openTp = createOrder({
      clientOrderId: 'T1D8D1710000000',
      side: OrderSide.SELL,
      price: 105,
      quantity: 1.5,
      status: OrderStatus.NEW,
      strategyId: 1,
    });

    const result = await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [openTp],
      positions: [createPosition({ quantity: 1.8, avgPrice: 102 })],
      orderBook: createOrderBook({ bid: 100, ask: 100.1 }),
      strategyNetPosition: new Decimal(2),
    });

    const tps = normalizeAnalyzeResult(result).filter(
      (s): s is StrategyOrderResult => s.action === 'sell',
    );
    expect(tps).toHaveLength(1);
    expect(tps[0].quantity!.toNumber()).toBeCloseTo(0.3, 8);
    expect(tps[0].price!.toNumber()).toBeCloseTo(102 * 1.01, 8);

    const state = strategy.getStrategyState();
    expect(new Decimal(state.inventoryQty).toNumber()).toBeCloseTo(1.8, 8);
  });

  it('falls back to the latest entry order price for the recovery cost basis', async () => {
    // No position data; a stale entry order at 101 provides the basis.
    const staleEntry = createOrder({
      clientOrderId: 'E1D7D1710000000',
      side: OrderSide.BUY,
      price: 101,
      quantity: 2,
      status: OrderStatus.NEW,
      strategyId: 1,
    });

    const result = await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [staleEntry],
      orderBook: createOrderBook({ bid: 100, ask: 100.1 }),
      strategyNetPosition: new Decimal(1),
    });

    const tps = normalizeAnalyzeResult(result).filter(
      (s): s is StrategyOrderResult => s.action === 'sell',
    );
    expect(tps).toHaveLength(1);
    // basis 101 > ask 100.1 -> TP = 101 * (1 + 1%)
    expect(tps[0].price!.toNumber()).toBeCloseTo(101 * 1.01, 8);
    // The stale entry is still canceled
    expect(cancelSignals(result)).toHaveLength(1);
  });

  it('re-lists a canceled adopted TP no lower than its original price', async () => {
    const openTp = createOrder({
      clientOrderId: 'T1D8D1710000000',
      side: OrderSide.SELL,
      price: 105,
      quantity: 1.5,
      status: OrderStatus.NEW,
      strategyId: 1,
    });

    await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [openTp],
      orderBook: createOrderBook({ bid: 100, ask: 100.1 }),
      strategyNetPosition: new Decimal(1.5),
    });

    // The adopted TP is canceled externally (e.g. by the user on the exchange)
    const result = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: openTp.clientOrderId!,
          side: OrderSide.SELL,
          price: 105,
          quantity: 1.5,
          status: OrderStatus.CANCELED,
          strategyId: 1,
        }),
      ],
    });

    const tps = sellSignals(result);
    expect(tps).toHaveLength(1);
    expect(tps[0].quantity!.toNumber()).toBeCloseTo(1.5, 8);
    // Derived basis = 105 / 1.01, so the new TP is back at ~105, not ask*(1+1%)
    expect(tps[0].price!.toNumber()).toBeCloseTo(105, 6);
  });

  it('deducts adopted TP notional from buying power when placing new entries', async () => {
    // Adopted TP: 4 units @ 105 = 420 quote already deployed.
    const openTp = createOrder({
      clientOrderId: 'T1D8D1710000000',
      side: OrderSide.SELL,
      price: 105,
      quantity: 4,
      status: OrderStatus.NEW,
      strategyId: 1,
    });

    await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [openTp],
      orderBook: createOrderBook({ bid: 100, ask: 100.1 }),
      strategyNetPosition: new Decimal(4),
    });

    const result = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(result);

    // Budget = 1000 - 420 = 580: L0 gets its full 500, L1 is clamped to 80, L2 skipped
    expect(buys).toHaveLength(2);
    expect(buys[0].quantity!.mul(buys[0].price!).toNumber()).toBeCloseTo(500, 6);
    expect(buys[1].quantity!.mul(buys[1].price!).toNumber()).toBeCloseTo(80, 6);
  });

  it('captures fills carried on a cancel acknowledgment and places a TP for them', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const level0Buy = buySignals(triggerResult)[0];

    // No PARTIALLY_FILLED update was ever received; the cancel carries the fill.
    const cancelResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.CANCELED,
          executedQuantity: 1,
          strategyId: 1,
        }),
      ],
    });
    const tps = sellSignals(cancelResult);

    expect(tps).toHaveLength(1);
    expect(tps[0].quantity!.toNumber()).toBeCloseTo(1, 8);

    const state = strategy.getStrategyState();
    expect(new Decimal(state.inventoryQty).toNumber()).toBeCloseTo(1, 8);
  });

  it('ignores a stale PARTIALLY_FILLED replay after the entry already reached CANCELED', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const level0Buy = buySignals(triggerResult)[0];

    // 1) Exchange reports a partial fill of 0.5
    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.PARTIALLY_FILLED,
          executedQuantity: 0.5,
          strategyId: 1,
        }),
      ],
    });
    let state = strategy.getStrategyState();
    expect(new Decimal(state.inventoryQty).toNumber()).toBeCloseTo(0.5, 8);

    // 2) Entry is canceled; the cancel ack carries the same executedQuantity=0.5
    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.CANCELED,
          executedQuantity: 0.5,
          strategyId: 1,
        }),
      ],
    });
    state = strategy.getStrategyState();
    expect(new Decimal(state.inventoryQty).toNumber()).toBeCloseTo(0.5, 8);

    // 3) Stale replay of the earlier PARTIALLY_FILLED update must be ignored
    const replayResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.PARTIALLY_FILLED,
          executedQuantity: 0.5,
          strategyId: 1,
        }),
      ],
    });

    state = strategy.getStrategyState();
    expect(new Decimal(state.inventoryQty).toNumber()).toBeCloseTo(0.5, 8);
    // No additional TP should be generated for the replayed fill
    expect(sellSignals(replayResult)).toHaveLength(0);
  });

  it('supports single-level configuration matching the classic 0.2% market maker', async () => {
    strategy = createStrategy({
      levelGapsPercent: '0.2',
      levelAllocationsPercent: '',
      maxInvestment: 990,
    });
    await initWithOrderBook(strategy, { bid: 1000, ask: 1000.5 });

    const result = await strategy.analyze({
      klines: [createKline({ high: 1010, low: 1000 })],
    });
    const buys = buySignals(result);

    expect(buys).toHaveLength(1);
    // bid1 * (1 - 0.2%) = 998
    expect(buys[0].price!.toNumber()).toBeCloseTo(998, 8);
    expect(buys[0].quantity!.toNumber()).toBeCloseTo(990 / 998, 8);
  });

  it('does NOT re-list L0 after TP fill when every deeper entry already FILLED (deepest chain exhausted)', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    // Trigger: places L0/L1/L2 entry BUYs
    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(triggerResult);
    expect(buys).toHaveLength(3);
    const level0Buy = buys[0];
    const level1Buy = buys[1];
    const level2Buy = buys[2];

    // Exchange acknowledges all three as NEW.
    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // L0 fills -> TP placed
    const fill0 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: level0Buy.price!.toNumber(),
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp0 = sellSignals(fill0)[0];
    expect(tp0).toBeDefined();

    // Deeper levels fill: L1 -> TP
    const fill1 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level1Buy.clientOrderId,
          side: OrderSide.BUY,
          price: level1Buy.price!.toNumber(),
          quantity: level1Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level1Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    expect(sellSignals(fill1)[0]).toBeDefined();

    // L2 (deepest) also fills -> TP. Now NO level has an unfilled entry left;
    // every level has either an outstanding TP or nothing.
    const fill2 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level2Buy.clientOrderId,
          side: OrderSide.BUY,
          price: level2Buy.price!.toNumber(),
          quantity: level2Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level2Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    expect(sellSignals(fill2)[0]).toBeDefined();

    // Now L0's TP fills. With every deeper level's entry already filled (i.e.
    // nothing deeper still has an OPEN entry hanging), the new rule says: do
    // NOT re-list L0. The cycle is meant to exhaust itself when the deeper
    // chains unwind.
    const tp0FillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: tp0.clientOrderId,
          side: OrderSide.SELL,
          price: tp0.price!.toNumber(),
          quantity: tp0.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: tp0.quantity!,
          strategyId: 1,
        }),
      ],
    });

    expect(buySignals(tp0FillResult)).toHaveLength(0);
    expect(cancelSignals(tp0FillResult)).toHaveLength(0);
  });

  it('re-lists L0 at min(bid1, tpPrice)/(1+gap%) after TP fill while deeper entries are still NEW', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(triggerResult);
    const level0Buy = buys[0];
    const level0Price = level0Buy.price!.toNumber(); // 99

    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // L0 fills -> TP placed
    const fillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: level0Price,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp = sellSignals(fillResult)[0];

    // Market has moved on: bid now 97.5 (far below L0's original 99 fill).
    // L1 / L2 entries are still NEW (never touched).
    const tpFillResult = await strategy.analyze({
      orderbook: createOrderBook({ bid: 97.5, ask: 97.6 }),
      orders: [
        createOrder({
          clientOrderId: tp.clientOrderId,
          side: OrderSide.SELL,
          price: tp.price!.toNumber(),
          quantity: tp.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: tp.quantity!,
          strategyId: 1,
        }),
      ],
    });

    const reentries = buySignals(tpFillResult);
    expect(reentries).toHaveLength(1);
    // Re-entry price = min(bid1=97.5, tpPrice=101.101) / (1 + 1%) = 97.5/1.01.
    // The min() picks the lower of current bid and TP fill price so the re-entry
    // BUY sits one gap below the current (lower) bid, not chasing up to the TP
    // price or latching the stale original fill price.
    expect(reentries[0].price!.toNumber()).toBeCloseTo(97.5 / 1.01, 8);
    expect(cancelSignals(tpFillResult)).toHaveLength(0);
  });

  it('deepest level (L2) never re-enters via TP unwind, allowing the cycle to terminate', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(triggerResult);
    const level2Buy = buys[2];

    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // L2 fills -> TP
    const fillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level2Buy.clientOrderId,
          side: OrderSide.BUY,
          price: level2Buy.price!.toNumber(),
          quantity: level2Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level2Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp = sellSignals(fillResult)[0];

    // L2 TP fills. L0/L1 entries are still NEW on the book, but L2 itself has
    // nothing deeper, so hasDeeperOpenEntry(L2) must be false -> no re-list.
    const tpFillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: tp.clientOrderId,
          side: OrderSide.SELL,
          price: tp.price!.toNumber(),
          quantity: tp.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: tp.quantity!,
          strategyId: 1,
        }),
      ],
    });

    expect(buySignals(tpFillResult)).toHaveLength(0);
    // L0 / L1 entries must remain untouched (no cancels).
    expect(cancelSignals(tpFillResult)).toHaveLength(0);

    // Level 2 state has cleaned up (inventory zeroed after TP fill).
    const state = strategy.getStrategyState();
    expect(state.levels[2].entryClientOrderId).toBeNull();
    expect(state.levels[2].tpClientOrderId).toBeNull();
    expect(state.levels[2].inventoryQty).toBe('0');
  });

  it('re-anchors all entries when every level still has a NEW-only entry and the next kline is ACTIVE, even after one level previously FILLED+TPd', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    // Wave 1: trigger the grid at anchor=100.
    const trigger = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const wave1 = buySignals(trigger);
    expect(wave1).toHaveLength(3);

    // Exchange acks all three as NEW.
    await strategy.analyze({
      orders: wave1.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // L0 fills -> TP placed. L1/L2 entries remain NEW on the book.
    const fill0 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: wave1[0].clientOrderId,
          side: OrderSide.BUY,
          price: wave1[0].price!.toNumber(),
          quantity: wave1[0].quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: wave1[0].quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp0 = sellSignals(fill0)[0];

    // L0 TP FILLED. Per the new rule: deeper levels still have NEW entries,
    // so L0 re-enters at min(bid1=100, tpPrice=101.101)/(1+1%) = 100/1.01.
    const tp0Filled = await strategy.analyze({
      orderbook: createOrderBook({ bid: 100, ask: 100.1 }),
      orders: [
        createOrder({
          clientOrderId: tp0.clientOrderId,
          side: OrderSide.SELL,
          price: tp0.price!.toNumber(),
          quantity: tp0.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: tp0.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const reentries = buySignals(tp0Filled);
    expect(reentries).toHaveLength(1);
    expect(reentries[0].price!.toNumber()).toBeCloseTo(100 / 1.01, 8);

    // Exchange acks the re-listed L0 as NEW. Grid state now :
    //   L0 NEW (re-listed at 99), L1 NEW (95), L2 NEW (75) ; no TPs, no inventory.
    // L0 has lastEntryFillPrice = 99 latched from the previous cycle.
    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: reentries[0].clientOrderId,
          side: OrderSide.BUY,
          price: reentries[0].price!.toNumber(),
          quantity: reentries[0].quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ],
    });

    // Next ACTIVE kline arrives. Per the user rule: "如果每个level都有entry
    // 订单、且都是New的状态,如果新的cycle(K线)满足条件,需要refresh entry订单."
    // The scheduler must cancel the three existing NEW entries and re-issue
    // them at the fresh anchor (bid=98 here), not freeze the grid on the
    // stale lastEntryFillPrice.
    const refresh = await strategy.analyze({
      orderbook: createOrderBook({ bid: 98, ask: 98.1 }),
      klines: [createKline({ high: 98.5, low: 97.5 })],
    });

    const cancels = cancelSignals(refresh);
    const newBuys = buySignals(refresh);
    expect(cancels).toHaveLength(3);
    expect(newBuys).toHaveLength(3);
    // Re-anchored at bid=98 with gaps 1% / 5% / 25%.
    expect(newBuys[0].price!.toNumber()).toBeCloseTo(98 * 0.99, 8);
    expect(newBuys[1].price!.toNumber()).toBeCloseTo(98 * 0.95, 8);
    expect(newBuys[2].price!.toNumber()).toBeCloseTo(98 * 0.75, 8);

    // lastEntryFillPrice must have been wiped for the next reprice cycle.
    const state = strategy.getStrategyState();
    expect(state.levels[0].entryClientOrderId).not.toBeNull();
    expect(state.levels[1].entryClientOrderId).not.toBeNull();
    expect(state.levels[2].entryClientOrderId).not.toBeNull();
  });

  it('re-anchors when the DEEPEST level entry is missing (post TP unwind) and every other level holds NEW-only entries on an ACTIVE kline', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    // Wave 1: place L0 / L1 / L2 entry BUYs at anchor=100 (gaps 1% / 5% / 25%).
    const trigger = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const wave1 = buySignals(trigger);
    expect(wave1).toHaveLength(3);

    // Exchange acks all three as NEW.
    await strategy.analyze({
      orders: wave1.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // L2 (deepest) fills -> TP placed.
    const fill2 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: wave1[2].clientOrderId,
          side: OrderSide.BUY,
          price: wave1[2].price!.toNumber(),
          quantity: wave1[2].quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: wave1[2].quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp2 = sellSignals(fill2)[0];
    expect(tp2).toBeDefined();

    // L2 TP fills. Per the "no deeper entry open -> no re-entry" rule, L2 is
    // NOT re-listed. L0 / L1 entries remain NEW on the book. No TP
    // outstanding, no inventory held anywhere.
    const tp2Filled = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: tp2.clientOrderId,
          side: OrderSide.SELL,
          price: tp2.price!.toNumber(),
          quantity: tp2.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: tp2.quantity!,
          strategyId: 1,
        }),
      ],
    });
    expect(buySignals(tp2Filled)).toHaveLength(0);
    expect(cancelSignals(tp2Filled)).toHaveLength(0);

    // Next ACTIVE kline arrives with a different bid (98). The grid must:
    //   - cancel the two stale NEW entries on L0 / L1,
    //   - re-issue ALL THREE levels at the fresh anchor (L2 slot gets a new
    //     entry too because refreshEntries places on empty levels),
    //   - NOT freeze on L2's latched lastEntryFillPrice.
    const refresh = await strategy.analyze({
      orderbook: createOrderBook({ bid: 98, ask: 98.1 }),
      klines: [createKline({ high: 98.5, low: 97.5 })],
    });

    const cancels = cancelSignals(refresh);
    const newBuys = buySignals(refresh);
    expect(cancels).toHaveLength(2);
    expect(newBuys).toHaveLength(3);
    expect(newBuys[0].price!.toNumber()).toBeCloseTo(98 * 0.99, 8);
    expect(newBuys[1].price!.toNumber()).toBeCloseTo(98 * 0.95, 8);
    expect(newBuys[2].price!.toNumber()).toBeCloseTo(98 * 0.75, 8);
  });

  // ───────────────────────────────────────────────────────────────────────
  // Deeper-entry-fill re-prices shallower TPs at
  //   max(bid1, averagePositionPrice) * (1 + level's tpGap%)
  // where averagePositionPrice is the cycle-wide VWAP across all filled
  // inventory. Added 2026-08-10.
  // ───────────────────────────────────────────────────────────────────────

  it('re-prices shallower level TPs at max(bid1, avgPositionPrice)*(1+tpGap%) when a deeper entry fills', async () => {
    // Explicit per-level TP gaps keep the arithmetic clean: 1%, 5%, 25%.
    strategy = createStrategy({ levelTakeProfitGapsPercent: '1,5,25' });
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const trigger = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(trigger);
    expect(buys).toHaveLength(3);
    const level0Buy = buys[0]; // price 99, qty 500/99
    const level1Buy = buys[1]; // price 95, qty 300/95

    // Exchange acks all three entries as NEW.
    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // L0 fills -> TP placed at max(ask1=100.1, entry=99)*(1+1%) = 101.101
    const fill0 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp0 = sellSignals(fill0)[0];
    expect(tp0).toBeDefined();
    expect(tp0.price!.toNumber()).toBeCloseTo(100.1 * 1.01, 6); // 101.101

    // Exchange acks L0's TP as NEW so it is tracked with a known price.
    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: tp0.clientOrderId,
          side: OrderSide.SELL,
          price: tp0.price!.toNumber(),
          quantity: tp0.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ],
    });

    // L1 (deeper) fills. avgPositionPrice = VWAP(L0 fill, L1 fill):
    //   (500/99 * 99 + 300/95 * 95) / (500/99 + 300/95)
    //   = (500 + 300) / (500/99 + 300/95) = 800 / 8.20845... = 97.4519...
    // bid1 = 100 > 97.4519, so base = bid1 = 100.
    // L0 new TP price = 100 * (1 + 1%) = 101.0  (< old 101.101 => re-priced)
    // L1's own TP is placed the normal way at max(ask1=100.1, 95)*(1+5%) = 105.105
    const fill1 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level1Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 95,
          quantity: level1Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level1Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });

    const sells = sellSignals(fill1);
    // One new TP for L1 + cancel(old L0 TP) + re-placed L0 TP = 1 sell + 1 cancel + 1 sell
    const cancels = cancelSignals(fill1);
    expect(cancels).toHaveLength(1);
    expect(cancels[0].clientOrderId).toBe(tp0.clientOrderId);
    const newTps = sells.filter((s) => s.clientOrderId !== tp0.clientOrderId);
    // L1's own freshly-placed TP + L0's re-priced TP
    expect(newTps).toHaveLength(2);

    // Identify L0's re-priced TP vs L1's own new TP by level suffix
    const l0Repriced = newTps.find((s) => s.clientOrderId!.endsWith('L0'));
    const l1Own = newTps.find((s) => s.clientOrderId!.endsWith('L1'));
    expect(l0Repriced).toBeDefined();
    expect(l1Own).toBeDefined();
    // L0 re-priced at max(bid1=100, avgPosPrice≈97.4519) * (1+1%) = 101.0
    expect(l0Repriced!.price!.toNumber()).toBeCloseTo(100 * 1.01, 8);
    // L1's own TP at max(ask1=100.1, entry=95) * (1+5%) = 105.105
    expect(l1Own!.price!.toNumber()).toBeCloseTo(100.1 * 1.05, 6);
  });

  it('does NOT re-price the deepest level TP (no deeper fill can trigger it)', async () => {
    strategy = createStrategy({ levelTakeProfitGapsPercent: '1,5,25' });
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const trigger = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(trigger);
    const level0Buy = buys[0];
    const level2Buy = buys[2]; // deepest

    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // L0 fills -> TP placed
    const fill0 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp0 = sellSignals(fill0)[0];
    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: tp0.clientOrderId,
          side: OrderSide.SELL,
          price: tp0.price!.toNumber(),
          quantity: tp0.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ],
    });

    // L2 (deepest) fills. L0 is shallower and has an open TP, so L0 TP is
    // re-priced. L2's own TP is placed normally. Nothing re-prices L2.
    const fill2 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level2Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 75,
          quantity: level2Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level2Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });

    const cancels = cancelSignals(fill2);
    // Only L0's TP is canceled (L2 has no TP yet to cancel)
    expect(cancels).toHaveLength(1);
    expect(cancels[0].clientOrderId).toBe(tp0.clientOrderId);

    const sells = sellSignals(fill2);
    // L2's freshly placed own TP + L0's re-priced TP
    expect(sells.filter((s) => s.clientOrderId !== tp0.clientOrderId)).toHaveLength(2);
  });

  it('re-prices L0 TP lower (toward bid1) when a deeper fill pulls avgPositionPrice below bid1', async () => {
    strategy = createStrategy({ levelTakeProfitGapsPercent: '1,5,25' });
    await initWithOrderBook(strategy, { bid: 99, ask: 99.1 });

    const trigger = await strategy.analyze({
      klines: [createKline({ high: 101, low: 99 })],
    });
    const buys = buySignals(trigger);
    const level0Buy = buys[0]; // price 99*0.99 = 98.01
    const level1Buy = buys[1]; // price 99*0.95 = 94.05

    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // L0 fills -> TP at max(ask1=99.1, entry=98.01)*(1+1%) = 99.1*1.01 = 100.091
    const fill0 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 98.01,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp0 = sellSignals(fill0)[0];
    const tp0Price = tp0.price!.toNumber();
    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: tp0.clientOrderId,
          side: OrderSide.SELL,
          price: tp0Price,
          quantity: tp0.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ],
    });

    // L1 fills. avgPosPrice = (500/98.01*98.01 + 300/94.05*94.05)/(500/98.01+300/94.05)
    //   = 800 / (5.101... + 3.189...) = 800 / 8.2908 = 96.49...
    // bid1 = 99 > 96.49 => base = 99 => new L0 TP = 99 * 1.01 = 99.99
    // 99.99 != 100.091 => re-price fires here.
    const fill1 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level1Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 94.05,
          quantity: level1Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level1Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });

    // Sanity: L0 was re-priced to max(bid1=99, avgPosPrice)*1.01
    const newTps = sellSignals(fill1).filter(
      (s) => s.clientOrderId !== tp0.clientOrderId,
    );
    const l0Repriced = newTps.find((s) => s.clientOrderId!.endsWith('L0'));
    expect(l0Repriced).toBeDefined();
    expect(l0Repriced!.price!.toNumber()).toBeCloseTo(99 * 1.01, 8);
    // Cancel of the old TP must be present
    expect(cancelSignals(fill1).map((c) => c.clientOrderId)).toContain(tp0.clientOrderId);
  });

  it('re-prices shallower TPs using avgPositionPrice when it is higher than bid1', async () => {
    // Set up so averagePositionPrice > bid1 after a deeper fill.
    // bid drops between entry-fill and deeper-fill so avgPosPrice > bid1.
    strategy = createStrategy({ levelTakeProfitGapsPercent: '1,5,25' });
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const trigger = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(trigger);
    const level0Buy = buys[0]; // price 99
    const level1Buy = buys[1]; // price 95

    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // L0 fills at 99 -> TP at max(100.1, 99)*1.01 = 101.101
    const fill0 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp0 = sellSignals(fill0)[0];
    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: tp0.clientOrderId,
          side: OrderSide.SELL,
          price: tp0.price!.toNumber(),
          quantity: tp0.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ],
    });

    // Bid drops to 88 before L1 fills. avgPosPrice = 800/(500/99+300/95) = 97.4519...
    // avgPosPrice (97.45) > bid (88) => base = avgPosPrice.
    // L0 new TP = 97.4519... * 1.01
    const expectedAvgPos = (500 + 300) / (500 / 99 + 300 / 95); // = 97.4519...
    const fill1 = await strategy.analyze({
      orderbook: createOrderBook({ bid: 88, ask: 88.1 }),
      orders: [
        createOrder({
          clientOrderId: level1Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 95,
          quantity: level1Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level1Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });

    const newTps = sellSignals(fill1).filter(
      (s) => s.clientOrderId !== tp0.clientOrderId,
    );
    const l0Repriced = newTps.find((s) => s.clientOrderId!.endsWith('L0'));
    expect(l0Repriced).toBeDefined();
    // max(bid1=88, avgPosPrice≈97.4519) * (1+1%) = 97.4519 * 1.01
    expect(l0Repriced!.price!.toNumber()).toBeCloseTo(expectedAvgPos * 1.01, 4);
  });

  it('does not re-price shallower TP when the filled level is the deepest (single-level grid)', async () => {
    // Single-level grid: the only level IS the deepest, so updateShallowerTpOrders
    // is never even called. Ensure no spurious cancels/sells on a fill.
    strategy = createStrategy({
      levelGapsPercent: '1',
      levelAllocationsPercent: '',
      levelTakeProfitGapsPercent: '1',
      maxInvestment: 990,
    });
    await initWithOrderBook(strategy, { bid: 1000, ask: 1000.5 });

    const trigger = await strategy.analyze({
      klines: [createKline({ high: 1010, low: 1000 })],
    });
    const buy = buySignals(trigger)[0];

    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ],
    });

    // Fill -> a single TP is placed, no cancels, no extra sells.
    const fill = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: buy.quantity!,
          strategyId: 1,
        }),
      ],
    });

    expect(cancelSignals(fill)).toHaveLength(0);
    expect(sellSignals(fill)).toHaveLength(1);
  });

  // ───────────────────────────────────────────────────────────────────────
  // TP-fill re-entry price: min(bid1, tpPrice) / (1 + level gap%).
  // Added 2026-08-10.
  // ───────────────────────────────────────────────────────────────────────

  it('re-enters at min(bid1, tpPrice)/(1+gap%) after TP fill when bid < tpPrice', async () => {
    // bid drops below tpPrice => min picks bid => re-entry = bid/(1+gap%)
    strategy = createStrategy({ levelTakeProfitGapsPercent: '1,5,25' });
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const trigger = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(trigger);
    const level0Buy = buys[0]; // price 99

    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // L0 fills at 99 -> TP at max(100.1, 99)*1.01 = 101.101
    const fill0 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp0 = sellSignals(fill0)[0];
    expect(tp0.price!.toNumber()).toBeCloseTo(101.101, 6);

    // TP fills while bid dropped to 95 (< tpPrice=101.101).
    // min(bid1=95, tpPrice=101.101) = 95; re-entry = 95/(1+1%) = 94.0594...
    const tpFill = await strategy.analyze({
      orderbook: createOrderBook({ bid: 95, ask: 95.1 }),
      orders: [
        createOrder({
          clientOrderId: tp0.clientOrderId,
          side: OrderSide.SELL,
          price: tp0.price!.toNumber(),
          quantity: tp0.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: tp0.quantity!,
          strategyId: 1,
        }),
      ],
    });

    const reentries = buySignals(tpFill);
    expect(reentries).toHaveLength(1);
    expect(reentries[0].price!.toNumber()).toBeCloseTo(95 / 1.01, 8);
  });

  it('re-enters at min(bid1, tpPrice)/(1+gap%) after TP fill when bid > tpPrice', async () => {
    // bid rises above tpPrice => min picks tpPrice => re-entry = tpPrice/(1+gap%)
    // (never chases the market up past the TP price)
    strategy = createStrategy({ levelTakeProfitGapsPercent: '1,5,25' });
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const trigger = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(trigger);
    const level0Buy = buys[0]; // price 99

    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // L0 fills at 99 -> TP at 101.101
    const fill0 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp0 = sellSignals(fill0)[0];

    // TP fills while bid rose to 105 (> tpPrice=101.101).
    // min(bid1=105, tpPrice=101.101) = 101.101; re-entry = 101.101/(1+1%) = 100.099...
    const tpFill = await strategy.analyze({
      orderbook: createOrderBook({ bid: 105, ask: 105.1 }),
      orders: [
        createOrder({
          clientOrderId: tp0.clientOrderId,
          side: OrderSide.SELL,
          price: tp0.price!.toNumber(),
          quantity: tp0.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: tp0.quantity!,
          strategyId: 1,
        }),
      ],
    });

    const reentries = buySignals(tpFill);
    expect(reentries).toHaveLength(1);
    expect(reentries[0].price!.toNumber()).toBeCloseTo(101.101 / 1.01, 6);
  });

  it('re-enters at tpPrice/(1+gap%) after TP fill when orderbook is stale (no bid1)', async () => {
    // No live bid => anchor falls back to tpPrice alone.
    strategy = createStrategy({ levelTakeProfitGapsPercent: '1,5,25' });
    await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
    });

    const trigger = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100, close: 100.4 })],
    });
    const level0Buy = buySignals(trigger)[0]; // price = 100.4*0.99 = 99.396

    const fill0 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: level0Buy.price!.toNumber(),
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp0 = sellSignals(fill0)[0];
    // TP = max(ask=None, entry=99.396)*1.01 = 100.38996
    const tpPrice = tp0.price!.toNumber();

    // TP fills, no orderbook => bid is null => anchor = tpPrice.
    // re-entry = tpPrice/(1+1%) = entry*1.01/1.01 = entry = 99.396
    const tpFill = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: tp0.clientOrderId,
          side: OrderSide.SELL,
          price: tpPrice,
          quantity: tp0.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: tp0.quantity!,
          strategyId: 1,
        }),
      ],
    });

    const reentries = buySignals(tpFill);
    expect(reentries).toHaveLength(1);
    expect(reentries[0].price!.toNumber()).toBeCloseTo(tpPrice / 1.01, 6);
  });

  it('regression(462): never places two live take-profit SELLs on the same level when a deeper entry fills', async () => {
    // Reproduces the prod strategy-462 duplicate-SELL bug: when L0 already holds
    // an open TP and a DEEPER (L1) entry fills, the L0 TP is re-priced.
    // The strategy must cancel-then-replace so no level ever carries two open
    // sell signals in the same batch — one of those extras filled naked on 462,
    // leaving a stray sell outstanding. The single-TP invariant must hold.
    strategy = createStrategy({ levelTakeProfitGapsPercent: '1,5,25' });
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const trigger = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(trigger);
    expect(buys).toHaveLength(3);
    const [level0Buy, level1Buy] = buys;

    // Exchange acks all entries as NEW.
    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // L0 entry fills -> place L0 TP.
    const fill0 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp0 = sellSignals(fill0)[0];
    // No pre-existing TP on L0 yet, so exactly ONE L0 sell signal and NO cancel.
    expect(sellSignals(fill0)).toHaveLength(1);
    expect(cancelSignals(fill0)).toHaveLength(0);

    // Exchange confirms L0's TP as a tracked NEW order on the book.
    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: tp0.clientOrderId,
          side: OrderSide.SELL,
          price: tp0.price!.toNumber(),
          quantity: tp0.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ],
    });
    expect(strategy.getStrategyState().levels[0].tpClientOrderId).toBe(tp0.clientOrderId);

    // L1 (deeper) fills. This was the exact trigger: L0's TP gets re-priced,
    // and in the pre-fix code a second L0 sell could slip in via the
    // placeTakeProfitForLevel/updateShallowerTpOrders path, leaving two live L0 sells.
    const fill1 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level1Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 95,
          quantity: level1Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level1Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });

    const sells = sellSignals(fill1);
    const cancels = cancelSignals(fill1);

    // L0 re-price MUST cancel the old L0 TP...
    expect(cancels.some((c) => c.clientOrderId === tp0.clientOrderId)).toBe(true);

    // ...and the re-priced L0 TP must not coexist with the old one.
    const l0Sells = sells.filter((s) => s.clientOrderId!.endsWith('L0'));
    expect(l0Sells).toHaveLength(1); // exactly ONE L0 sell signal (never two)
    const l1Sells = sells.filter((s) => s.clientOrderId!.endsWith('L1'));
    expect(l1Sells).toHaveLength(1); // L1's own TP still placed normally

    // Final invariant: exactly one L0 TP signal and one L1 TP signal, each
    // distinct from the cancelled original — no level ever has two live sells.
    expect(l0Sells[0].clientOrderId).not.toBe(tp0.clientOrderId);
  });
});
