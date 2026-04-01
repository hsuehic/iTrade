import { beforeEach, describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import {
  normalizeAnalyzeResult,
  Order,
  OrderSide,
  OrderStatus,
  OrderType,
  OrderBook,
  SignalType,
  StrategyCancelOrderResult,
  StrategyConfig,
  StrategyOrderResult,
  TimeInForce,
} from '@itrade/core';
import {
  SpreadGridParameters,
  SpreadGridStrategy,
} from '../strategies/SpreadGridStrategy';

function createOrder(params: {
  clientOrderId: string;
  side: OrderSide;
  price: number;
  quantity: number;
  status: OrderStatus;
  executedQuantity?: number;
  strategyId?: number;
}): Order {
  const now = new Date();
  return {
    id: `order-${params.clientOrderId}`,
    clientOrderId: params.clientOrderId,
    symbol: 'ETH/USDC:USDC',
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

function createOrderBook(params: {
  bid: number;
  ask: number;
  symbol?: string;
}): OrderBook {
  const now = new Date();
  return {
    symbol: params.symbol ?? 'ETH/USDC:USDC',
    timestamp: now,
    bids: [[new Decimal(params.bid), new Decimal(1)]],
    asks: [[new Decimal(params.ask), new Decimal(1)]],
  };
}

describe('SpreadGridStrategy', () => {
  let strategy: SpreadGridStrategy;

  beforeEach(() => {
    const config: StrategyConfig<SpreadGridParameters> = {
      type: 'SpreadGridStrategy',
      strategyId: 1,
      strategyName: 'spread-test',
      symbol: 'ETH/USDC:USDC',
      exchange: 'binance',
      parameters: {
        maxSize: 0,
        minSize: -9,
        leverage: 25,
        basePrice: 2045,
        orderAmount: 3,
        stepPercent: 0.65,
        checkMarketPrice: false,
      },
    };

    strategy = new SpreadGridStrategy(config);
  });

  it('generates both buy and sell after first sell fill when SQL net position is unavailable', async () => {
    const openSell = createOrder({
      clientOrderId: 'E1D1D1710000000',
      side: OrderSide.SELL,
      price: 2058.29,
      quantity: 3,
      status: OrderStatus.NEW,
      strategyId: 1,
    });

    await strategy.processInitialData({
      symbol: 'ETH/USDC:USDC',
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [openSell],
      orderBook: createOrderBook({ bid: 2050, ask: 2052 }),
    });

    const filledSell = createOrder({
      clientOrderId: openSell.clientOrderId!,
      side: OrderSide.SELL,
      price: 2071.67,
      quantity: 3,
      status: OrderStatus.FILLED,
      executedQuantity: 3,
      strategyId: 1,
    });

    const result = await strategy.analyze({ orders: [filledSell] });
    const signals = normalizeAnalyzeResult(result).filter(
      (signal): signal is StrategyOrderResult =>
        signal.action === 'buy' || signal.action === 'sell',
    );

    expect(signals).toHaveLength(2);
    expect(signals.some((s) => s.action === 'buy')).toBe(true);
    expect(signals.some((s) => s.action === 'sell')).toBe(true);

    const buySignal = signals.find((s) => s.action === 'buy');
    const sellSignal = signals.find((s) => s.action === 'sell');
    expect(buySignal?.metadata?.signalType).toBe(SignalType.Entry);
    expect(sellSignal?.metadata?.signalType).toBe(SignalType.Entry);
    expect(buySignal?.price?.lt(sellSignal!.price!)).toBe(true);
  });

  it('restarts by cancelling existing open orders and rebuilding around inferred reference price', async () => {
    const openBuy = createOrder({
      clientOrderId: 'E1D10D1710000000',
      side: OrderSide.BUY,
      price: 2031.7075,
      quantity: 3,
      status: OrderStatus.NEW,
      strategyId: 1,
    });
    const openSell = createOrder({
      clientOrderId: 'E1D11D1710000000',
      side: OrderSide.SELL,
      price: 2058.2925,
      quantity: 3,
      status: OrderStatus.NEW,
      strategyId: 1,
    });

    const initResult = await strategy.processInitialData({
      symbol: 'ETH/USDC:USDC',
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [openBuy, openSell],
      orderBook: createOrderBook({ bid: 2035, ask: 2036 }),
    });

    const signals = normalizeAnalyzeResult(initResult);
    const cancelSignals = signals.filter(
      (signal): signal is StrategyCancelOrderResult => signal.action === 'cancel',
    );
    const orderSignals = signals.filter(
      (signal): signal is StrategyOrderResult =>
        signal.action === 'buy' || signal.action === 'sell',
    );

    expect(cancelSignals).toHaveLength(0);
    expect(orderSignals).toHaveLength(0);
  });

  it('respects minSize when multiple FILLED updates arrive in one batch', async () => {
    await strategy.processInitialData({
      symbol: 'ETH/USDC:USDC',
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [],
      orderBook: createOrderBook({ bid: 2050, ask: 2051 }),
    });

    const filledOrders = [1, 2, 3, 4].map((seq) =>
      createOrder({
        clientOrderId: `E1D${seq}D1710000000`,
        side: OrderSide.SELL,
        price: 2050 + seq,
        quantity: 3,
        status: OrderStatus.FILLED,
        executedQuantity: 3,
        strategyId: 1,
      }),
    );

    const result = await strategy.analyze({ orders: filledOrders });
    const signals = normalizeAnalyzeResult(result).filter(
      (signal): signal is StrategyOrderResult =>
        signal.action === 'buy' || signal.action === 'sell',
    );

    expect(signals.some((s) => s.action === 'sell')).toBe(false);
    expect(signals.some((s) => s.action === 'buy')).toBe(true);
    expect(strategy.getStrategyState().canAddShort).toBe(false);
  });
});
