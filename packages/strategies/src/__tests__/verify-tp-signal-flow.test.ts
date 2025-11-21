import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import {
  MovingWindowGridsStrategy,
  type MovingWindowGridsParameters,
} from '../strategies/MovingWindowGridsStrategy';
import {
  Kline,
  StrategyConfig,
  StrategyOrderResult,
  Order,
  SignalType,
  OrderSide,
  OrderType,
  OrderStatus,
  TradeMode,
  TimeInForce,
} from '@itrade/core';

/**
 * This test verifies the EXACT flow that happens in production:
 * 1. Strategy generates entry signal
 * 2. TradingEngine creates order (NEW status)
 * 3. Exchange fills order
 * 4. TradingEngine receives orderUpdate event
 * 5. TradingEngine calls strategy.analyze({ orders: [filledOrder] })
 * 6. Strategy should return take profit signal
 */
describe('MovingWindowGridsStrategy - Production Flow Verification', () => {
  let strategy: MovingWindowGridsStrategy;
  let config: StrategyConfig<MovingWindowGridsParameters>;

  beforeEach(async () => {
    config = {
      type: 'MovingWindowGridsStrategy',
      parameters: {
        windowSize: 20,
        gridSize: 0.005,
        gridCount: 5,
        minVolatility: 0.5,
        takeProfitRatio: 1,
        baseSize: 1000,
        maxSize: 10000,
        leverage: 10,
        tradeMode: TradeMode.ISOLATED,
      },
      symbol: 'BTC/USDT:USDT',
      exchange: 'binance',
      strategyId: 22,
      strategyName: 'MovingWindowGridsStrategy',
    };

    strategy = new MovingWindowGridsStrategy(config);
  });

  function createHighVolatilityKline(basePrice: number): Kline {
    const open = basePrice;
    const volatilityPercent = 0.015; // 1.5% volatility
    const range = open * volatilityPercent;
    const low = open - range / 2;
    const high = open + range / 2;
    const close = open + range / 4; // Close higher (bullish)

    return {
      symbol: 'BTC/USDT:USDT',
      exchange: 'binance',
      interval: '1h',
      openTime: new Date(),
      closeTime: new Date(Date.now() + 3600000),
      open: new Decimal(open),
      high: new Decimal(high),
      low: new Decimal(low),
      close: new Decimal(close),
      volume: new Decimal(1000),
      quoteVolume: new Decimal(1000 * close),
      trades: 100,
      isClosed: true,
    };
  }

  it('CRITICAL: Should generate TP signal when order status changes from NEW to FILLED', async () => {
    console.log('\n=== PRODUCTION FLOW VERIFICATION ===\n');

    // Step 1: Strategy generates entry signal
    console.log('Step 1: Generating entry signal...');
    const kline = createHighVolatilityKline(50000);
    const entrySignal = (await strategy.analyze({
      exchangeName: 'binance',
      symbol: 'BTC/USDT:USDT',
      klines: [kline],
    })) as StrategyOrderResult;

    console.log(`✅ Entry signal generated: ${entrySignal.clientOrderId}`);
    console.log(`   Action: ${entrySignal.action}`);
    console.log(`   Price: ${entrySignal.price?.toString()}`);
    console.log(`   Quantity: ${entrySignal.quantity?.toString()}`);
    console.log(`   Metadata: ${JSON.stringify(entrySignal.metadata)}\n`);

    expect(entrySignal.action).toBe('buy');
    expect(entrySignal.metadata?.signalType).toBe(SignalType.Entry);

    // Step 2: TradingEngine creates order on exchange (NEW status)
    console.log('Step 2: Order created on exchange (NEW status)...');
    const newOrder: Order = {
      id: `exchange-order-${Date.now()}`,
      clientOrderId: entrySignal.clientOrderId!,
      symbol: 'BTC/USDT:USDT',
      exchange: 'binance',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      price: entrySignal.price!,
      quantity: entrySignal.quantity!,
      status: OrderStatus.NEW,
      timeInForce: TimeInForce.GTC,
      timestamp: new Date(),
      updateTime: new Date(),
      executedQuantity: new Decimal(0),
      averagePrice: entrySignal.price!,
    };

    console.log(`   Order ID: ${newOrder.id}`);
    console.log(`   Client Order ID: ${newOrder.clientOrderId}`);
    console.log(`   Status: ${newOrder.status}\n`);

    // Step 3: TradingEngine calls strategy.analyze({ orders: [newOrder] })
    console.log('Step 3: TradingEngine notifies strategy of NEW order...');
    const resultAfterNew = await strategy.analyze({
      exchangeName: 'binance',
      orders: [newOrder],
    });

    console.log(`   Strategy returned: ${resultAfterNew.action}\n`);
    expect(resultAfterNew.action).toBe('hold');

    // Verify size is committed
    let state = strategy.getStrategyState();
    console.log(`   Current size: ${state.currentSize}`);
    expect(state.currentSize).toBe(1000);

    // Step 4: Exchange fills the order (status changes to FILLED)
    console.log('\nStep 4: Exchange fills the order...');
    const filledOrder: Order = {
      ...newOrder,
      status: OrderStatus.FILLED,
      executedQuantity: newOrder.quantity,
      averagePrice: newOrder.price!,
      updateTime: new Date(Date.now() + 1000), // CRITICAL: Must be newer!
    };

    console.log(`   Status changed: ${newOrder.status} → ${filledOrder.status}`);
    console.log(`   Update time: ${filledOrder.updateTime.toISOString()}`);
    console.log(`   Executed qty: ${filledOrder.executedQuantity.toString()}\n`);

    // Step 5: TradingEngine calls strategy.analyze({ orders: [filledOrder] })
    console.log('Step 5: TradingEngine notifies strategy of FILLED order...');
    const resultAfterFilled = (await strategy.analyze({
      exchangeName: 'binance',
      orders: [filledOrder],
    })) as StrategyOrderResult;

    console.log(`   Strategy returned: ${resultAfterFilled.action}`);
    console.log(`   Reason: ${resultAfterFilled.reason}`);
    console.log(`   Signal type: ${resultAfterFilled.metadata?.signalType}`);
    console.log(`   TP price: ${resultAfterFilled.price?.toString()}`);
    console.log(`   Parent order: ${resultAfterFilled.metadata?.parentOrderId}\n`);

    // CRITICAL VERIFICATION: Strategy MUST return take profit signal
    expect(resultAfterFilled.action).toBe('sell');
    expect(resultAfterFilled.reason).toBe('take_profit');
    expect(resultAfterFilled.metadata?.signalType).toBe(SignalType.TakeProfit);
    expect(resultAfterFilled.metadata?.parentOrderId).toBe(entrySignal.clientOrderId);
    expect(resultAfterFilled.price).toBeDefined();
    expect(resultAfterFilled.quantity?.toNumber()).toBe(1000);

    // Verify TP price is correct (1% above entry)
    const entryPrice = filledOrder.averagePrice!.toNumber();
    const expectedTpPrice = entryPrice * 1.01;
    const actualTpPrice = resultAfterFilled.price!.toNumber();
    console.log(`   Entry price: ${entryPrice}`);
    console.log(`   Expected TP: ${expectedTpPrice}`);
    console.log(`   Actual TP: ${actualTpPrice}`);
    expect(actualTpPrice).toBeCloseTo(expectedTpPrice, 2);

    state = strategy.getStrategyState();
    console.log(`   Final size: ${state.currentSize}`);
    expect(state.currentSize).toBe(1000); // Size unchanged (will reduce when TP fills)

    console.log('\n✅ PRODUCTION FLOW VERIFIED: TP signal generated correctly!\n');
  });

  it('DIAGNOSTIC: Should fail if updateTime is not properly set', async () => {
    console.log('\n=== DIAGNOSTIC TEST: Missing updateTime ===\n');

    const kline = createHighVolatilityKline(50000);
    const entrySignal = (await strategy.analyze({
      exchangeName: 'binance',
      symbol: 'BTC/USDT:USDT',
      klines: [kline],
    })) as StrategyOrderResult;

    const originalUpdateTime = new Date();
    const newOrder: Order = {
      id: `order-${Date.now()}`,
      clientOrderId: entrySignal.clientOrderId!,
      symbol: 'BTC/USDT:USDT',
      exchange: 'binance',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      price: new Decimal(50000),
      quantity: new Decimal(1000),
      status: OrderStatus.NEW,
      timeInForce: TimeInForce.GTC,
      timestamp: new Date(),
      updateTime: originalUpdateTime,
      executedQuantity: new Decimal(0),
      averagePrice: new Decimal(50000),
    };

    await strategy.analyze({ exchangeName: 'binance', orders: [newOrder] });

    // Simulate exchange filling the order but with SAME updateTime
    // This is a BUG in exchange connector implementation!
    const filledOrderBadTime: Order = {
      ...newOrder,
      status: OrderStatus.FILLED,
      executedQuantity: new Decimal(1000),
      averagePrice: new Decimal(50000),
      updateTime: originalUpdateTime, // ❌ SAME TIME - will be ignored!
    };

    console.log('Testing with SAME updateTime...');
    console.log(`   Original: ${originalUpdateTime.toISOString()}`);
    console.log(`   Filled: ${filledOrderBadTime.updateTime.toISOString()}\n`);

    const result = await strategy.analyze({
      exchangeName: 'binance',
      orders: [filledOrderBadTime],
    });

    console.log(`Result: ${result.action}`);
    console.log('❌ NO TP SIGNAL because updateTime was not newer!\n');

    // This will be 'hold' because the order status change is ignored
    expect(result.action).toBe('hold');

    console.log('DIAGNOSIS: If you see this in production, your exchange connector');
    console.log('is not properly updating the updateTime field when order status changes!\n');
  });

  it('DIAGNOSTIC: Should handle rapid order updates correctly', async () => {
    console.log('\n=== DIAGNOSTIC TEST: Rapid Order Updates ===\n');

    const kline = createHighVolatilityKline(50000);
    const entrySignal = (await strategy.analyze({
      exchangeName: 'binance',
      symbol: 'BTC/USDT:USDT',
      klines: [kline],
    })) as StrategyOrderResult;

    const baseTime = Date.now();
    const newOrder: Order = {
      id: `order-${baseTime}`,
      clientOrderId: entrySignal.clientOrderId!,
      symbol: 'BTC/USDT:USDT',
      exchange: 'binance',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      price: new Decimal(50000),
      quantity: new Decimal(1000),
      status: OrderStatus.NEW,
      timeInForce: TimeInForce.GTC,
      timestamp: new Date(baseTime),
      updateTime: new Date(baseTime),
      executedQuantity: new Decimal(0),
      averagePrice: new Decimal(50000),
    };

    console.log('1. NEW order received...');
    await strategy.analyze({ exchangeName: 'binance', orders: [newOrder] });

    // Simulate multiple rapid updates
    console.log('2. PARTIALLY_FILLED (300/1000)...');
    const partialOrder: Order = {
      ...newOrder,
      status: OrderStatus.PARTIALLY_FILLED,
      executedQuantity: new Decimal(300),
      updateTime: new Date(baseTime + 100),
    };
    await strategy.analyze({ exchangeName: 'binance', orders: [partialOrder] });

    console.log('3. PARTIALLY_FILLED (700/1000)...');
    const morePartialOrder: Order = {
      ...partialOrder,
      executedQuantity: new Decimal(700),
      updateTime: new Date(baseTime + 200),
    };
    await strategy.analyze({ exchangeName: 'binance', orders: [morePartialOrder] });

    console.log('4. FILLED (1000/1000)...');
    const filledOrder: Order = {
      ...morePartialOrder,
      status: OrderStatus.FILLED,
      executedQuantity: new Decimal(1000),
      updateTime: new Date(baseTime + 300),
    };

    const result = (await strategy.analyze({
      exchangeName: 'binance',
      orders: [filledOrder],
    })) as StrategyOrderResult;

    console.log(`\nResult: ${result.action}`);
    expect(result.action).toBe('sell');
    expect(result.reason).toBe('take_profit');

    console.log('✅ Rapid updates handled correctly - TP generated on FILLED status\n');
  });
});

