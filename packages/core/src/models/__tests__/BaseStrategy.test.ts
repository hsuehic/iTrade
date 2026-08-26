import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { BaseStrategy } from '../BaseStrategy';
import { DataUpdate } from '../../interfaces';
import {
  StrategyConfig,
  StrategyParameters,
  StrategyAnalyzeResult,
  Trade,
  createEmptyPerformance,
  SignalType,
} from '../../types';

interface TestParameterType extends StrategyParameters {
  foo?: string;
}

class TestStrategy extends BaseStrategy<TestParameterType> {
  public cleaned = false;
  public initialized = false;

  // Track the init promise so tests can await without the engine.
  public initPromise(): Promise<void> {
    return this.initialize();
  }

  public async analyze(_data: DataUpdate): Promise<StrategyAnalyzeResult> {
    return { action: 'hold' };
  }

  protected async onInitialize(): Promise<void> {
    // Simulate async init
    await new Promise((r) => setTimeout(r, 10));
    this.initialized = true;
    super.onInitialize();
  }

  protected async onCleanup(): Promise<void> {
    this.cleaned = true;
  }

  public exposeGetCurrentPosition(): Decimal {
    return this.getCurrentPosition();
  }

  public exposeGetAveragePrice(): Decimal | undefined {
    return this.getAveragePrice();
  }

  public exposeGenerateClientOrderId(type: SignalType): string {
    return this.generateClientOrderId(type);
  }

  public exposeRestoreOrderSequence(n: number): void {
    this.restoreOrderSequence(n);
  }
}

function makeConfig(overrides: Partial<StrategyConfig<TestParameterType>> = {}) {
  return {
    type: 'TestStrategy',
    symbol: 'BTC/USDT',
    exchange: 'binance',
    parameters: { foo: 'bar' },
    performance: createEmptyPerformance('BTC/USDT', 'binance'),
    ...overrides,
  } as StrategyConfig<TestParameterType>;
}

function makeTrade(partial: Partial<Trade>): Trade {
  return {
    id: 't1',
    symbol: 'BTC/USDT',
    price: new Decimal(100),
    quantity: new Decimal(1),
    side: 'buy',
    timestamp: new Date(),
    exchange: 'binance',
    ...partial,
  };
}

describe('BaseStrategy lifecycle', () => {
  it('bridges cleanup() to the protected onCleanup() override', async () => {
    const s = new TestStrategy(makeConfig());
    expect(s.cleaned).toBe(false);
    await s.cleanup();
    expect(s.cleaned).toBe(true);
    // cleanup also marks the strategy not initialized
    expect(s.isInitialized()).toBe(false);
  });

  it('awaiting initialize() waits for async onInitialize()', async () => {
    const s = new TestStrategy(makeConfig());
    // Constructor fires onInitialize() asynchronously; isInitialized should be
    // false until onInitialize completes.
    expect(s.initialized).toBe(false);
    await s.initPromise();
    expect(s.initialized).toBe(true);
  });

  it('setStrategyId/setStrategyName update strategy and context/performance', async () => {
    const s = new TestStrategy(makeConfig());
    s.setStrategyId(7);
    s.setStrategyName('Ladder_1');
    expect(s.getStrategyId()).toBe(7);
    expect(s.getStrategyName()).toBe('Ladder_1');
    expect(s.context.strategyId).toBe(7);
    expect(s.context.strategyName).toBe('Ladder_1');
    expect(s.getPerformance().strategyId).toBe(7);
    expect(s.getPerformance().strategyName).toBe('Ladder_1');
  });
});

describe('BaseStrategy position / average price', () => {
  it('computes a volume-weighted average price across multiple buys', async () => {
    const s = new TestStrategy(makeConfig());
    // Buy 1 @ 100 qty 1
    await s.onTradeExecuted(
      makeTrade({ side: 'buy', price: new Decimal(100), quantity: new Decimal(1) }),
    );
    expect(s.exposeGetCurrentPosition().toString()).toBe('1');
    expect(s.exposeGetAveragePrice()!.toString()).toBe('100');

    // Buy 2 @ 200 qty 1 → weighted avg = (100*1 + 200*1) / 2 = 150
    await s.onTradeExecuted(
      makeTrade({ side: 'buy', price: new Decimal(200), quantity: new Decimal(1) }),
    );
    expect(s.exposeGetCurrentPosition().toString()).toBe('2');
    expect(s.exposeGetAveragePrice()!.toString()).toBe('150');

    // Prev bug: _averagePrice would be the last fill price (200), not 150.
  });

  it('does not change the average when reducing a long position', async () => {
    const s = new TestStrategy(makeConfig());
    await s.onTradeExecuted(
      makeTrade({ side: 'buy', price: new Decimal(100), quantity: new Decimal(1) }),
    );
    await s.onTradeExecuted(
      makeTrade({ side: 'buy', price: new Decimal(200), quantity: new Decimal(1) }),
    );
    // Sell 0.5 @ 50 → avg stays 150
    await s.onTradeExecuted(
      makeTrade({ side: 'sell', price: new Decimal(50), quantity: new Decimal(0.5) }),
    );
    expect(s.exposeGetCurrentPosition().toString()).toBe('1.5');
    expect(s.exposeGetAveragePrice()!.toString()).toBe('150');
  });

  it('resets average to undefined when position goes flat', async () => {
    const s = new TestStrategy(makeConfig());
    await s.onTradeExecuted(
      makeTrade({ side: 'buy', price: new Decimal(100), quantity: new Decimal(1) }),
    );
    await s.onTradeExecuted(
      makeTrade({ side: 'sell', price: new Decimal(120), quantity: new Decimal(1) }),
    );
    expect(s.exposeGetCurrentPosition().toString()).toBe('0');
    expect(s.exposeGetAveragePrice()).toBeUndefined();
  });

  it('resets average to the fill price when a trade flips the position side', async () => {
    const s = new TestStrategy(makeConfig());
    // Buy 2 @ 100 → avg 100, pos +2
    await s.onTradeExecuted(
      makeTrade({ side: 'buy', price: new Decimal(100), quantity: new Decimal(2) }),
    );
    expect(s.exposeGetAveragePrice()!.toString()).toBe('100');
    // Sell 3 @ 90 → pos goes from +2 to -1 (flip to short)
    await s.onTradeExecuted(
      makeTrade({ side: 'sell', price: new Decimal(90), quantity: new Decimal(3) }),
    );
    expect(s.exposeGetCurrentPosition().toString()).toBe('-1');
    // The leftover -1 short was opened at 90 → avg resets to 90, NOT a blended value.
    expect(s.exposeGetAveragePrice()!.toString()).toBe('90');
  });

  it('keeps single-direction short add weighted average correct', async () => {
    const s = new TestStrategy(makeConfig());
    // Sell 1 @ 100 → pos -1 (short), avg 100
    await s.onTradeExecuted(
      makeTrade({ side: 'sell', price: new Decimal(100), quantity: new Decimal(1) }),
    );
    expect(s.exposeGetCurrentPosition().toString()).toBe('-1');
    expect(s.exposeGetAveragePrice()!.toString()).toBe('100');
    // Sell 1 @ 200 → pos -2, avg (100*1+200*1)/2 = 150
    await s.onTradeExecuted(
      makeTrade({ side: 'sell', price: new Decimal(200), quantity: new Decimal(1) }),
    );
    expect(s.exposeGetCurrentPosition().toString()).toBe('-2');
    expect(s.exposeGetAveragePrice()!.toString()).toBe('150');
  });

  it('ignores tradeExecuted for a different strategy id', async () => {
    const s = new TestStrategy(makeConfig({ strategyId: 1 }));
    await s.onTradeExecuted({
      ...makeTrade({ side: 'buy', price: new Decimal(100), quantity: new Decimal(1) }),
      strategyId: 2,
    });
    expect(s.exposeGetCurrentPosition().toString()).toBe('0');
  });
});

describe('BaseStrategy clientOrderId', () => {
  it('generates unique, bounded-length, engine-parseable ids', async () => {
    const s = new TestStrategy(makeConfig({ strategyId: 42 }));
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = s.exposeGenerateClientOrderId(SignalType.Entry);
      expect(id).toMatch(/^E42D\d+D\d+$/); // engine enrichment regex friendly
      expect(id.length).toBeLessThanOrEqual(32);
      ids.add(id);
    }
    expect(ids.size).toBe(100); // no collions even within the same ms
  });

  it('restores order sequence across restart to avoid collisions', async () => {
    const a = new TestStrategy(makeConfig({ strategyId: 5 }));
    // Simulate a running strategy that has consumed 50 sequences
    for (let i = 0; i < 50; i++) a.exposeGenerateClientOrderId(SignalType.Entry);
    const lastOfA = a.exposeGenerateClientOrderId(SignalType.Entry);

    // New instance after restart, restoring the last sequence so the next
    // generated id is strictly past the previous instance's high-water mark.
    const b = new TestStrategy(makeConfig({ strategyId: 5 }));
    b.exposeRestoreOrderSequence(51);
    const firstOfB = b.exposeGenerateClientOrderId(SignalType.Entry);
    expect(firstOfB).not.toBe(lastOfA);
  });
});

describe('BaseStrategy config/parameters/context defensive copy', () => {
  it('returns copies so external mutation does not leak into the strategy', async () => {
    const s = new TestStrategy(makeConfig());
    const params = s.parameters;
    params.foo = 'mutated';
    expect(s.parameters.foo).toBe('bar');

    const config = s.config;
    config.parameters.foo = 'mutated2';
    expect(s.parameters.foo).toBe('bar');
  });
});
