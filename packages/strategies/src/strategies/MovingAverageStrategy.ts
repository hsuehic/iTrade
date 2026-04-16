import { Decimal } from 'decimal.js';
import {
  BaseStrategy,
  StrategyResult,
  StrategyOrderResult,
  StrategyCancelOrderResult,
  StrategyAnalyzeResult,
  StrategyConfig,
  DataUpdate,
  StrategyParameters,
  SignalType,
  SignalMetaData,
  InitialDataResult,
  KlineInterval,
  Kline,
  Order,
  OrderType,
  OrderStatus,
  OrderSide,
  TradeMode,
} from '@itrade/core';
import { StrategyRegistryConfig } from '../type';

// ─────────────────────────────────────────────────────────────────────────────
// Registry Config
// ─────────────────────────────────────────────────────────────────────────────

export const MovingAverageStrategyRegistryConfig: StrategyRegistryConfig<MovingAverageParameters> =
  {
    type: 'MovingAverageStrategy',
    name: 'Moving Average Crossover',
    description:
      'Trend-following strategy using two EMAs. Places limit entry orders at an optimal intra-bar price and automatically follows up with a take-profit order on each fill.',
    icon: '📈',
    implemented: true,
    category: 'trend',

    defaultParameters: {
      maType: 'sma',
      fastPeriod: 25,
      slowPeriod: 55,
      klineInterval: '15m',
      takeProfitPercent: 2,
      stopLossPercent: 0,
      orderAmount: 100,
      maxPositionSize: 500,
      minPositionSize: 0,
      leverage: 1,
    },

    parameterDefinitions: [
      {
        name: 'maType',
        type: 'enum',
        description: 'Moving average type. SMA or EMA.',
        defaultValue: 'sma',
        required: true,
        validation: { options: ['sma', 'ema'] },
        group: 'Moving Averages',
        order: 0,
      },
      {
        name: 'fastPeriod',
        type: 'number',
        description: 'Fast moving average period',
        defaultValue: 25,
        required: true,
        min: 1,
        max: 200,
        group: 'Moving Averages',
        order: 1,
      },
      {
        name: 'slowPeriod',
        type: 'number',
        description: 'Slow moving average period',
        defaultValue: 55,
        required: true,
        min: 2,
        max: 500,
        group: 'Moving Averages',
        order: 2,
      },
      {
        name: 'klineInterval',
        type: 'enum',
        description: 'Kline interval',
        defaultValue: '15m',
        required: true,
        validation: {
          options: [
            '1m',
            '3m',
            '5m',
            '15m',
            '30m',
            '1h',
            '2h',
            '4h',
            '6h',
            '8h',
            '12h',
            '1d',
          ],
        },
        group: 'Moving Averages',
        order: 3,
      },
      {
        name: 'takeProfitPercent',
        type: 'number',
        description: 'Take-profit percentage from the actual fill price.',
        defaultValue: 2,
        required: true,
        min: 0.01,
        max: 50,
        unit: '%',
        group: 'Take Profit',
        order: 4,
      },
      {
        name: 'stopLossPercent',
        type: 'number',
        description:
          'Stop-loss percentage. 0 to disable. Monitored manually by the strategy.',
        defaultValue: 0,
        required: false,
        min: 0,
        max: 50,
        unit: '%',
        group: 'Take Profit',
        order: 5,
      },
      {
        name: 'orderAmount',
        type: 'number',
        description: 'Quantity to trade per entry order',
        defaultValue: 100,
        required: true,
        min: 0.0001,
        max: 1_000_000,
        group: 'Risk Management',
        order: 6,
      },
      {
        name: 'maxPositionSize',
        type: 'number',
        description: 'Maximum net long position allowed',
        defaultValue: 500,
        required: true,
        min: 0,
        max: 10_000_000,
        group: 'Risk Management',
        order: 7,
      },
      {
        name: 'minPositionSize',
        type: 'number',
        description: 'Minimum net position allowed.',
        defaultValue: 0,
        required: true,
        min: -10_000_000,
        max: 10_000_000,
        group: 'Risk Management',
        order: 8,
      },
      {
        name: 'leverage',
        type: 'number',
        description:
          'Leverage multiplier for perpetual/futures trading (e.g. 10 = 10×). ' +
          'Set to 1 for spot-equivalent (no leverage).',
        defaultValue: 1,
        required: false,
        min: 1,
        max: 125,
        group: 'Risk Management',
        order: 9,
      },
    ],

    subscriptionRequirements: {
      klines: {
        required: true,
        allowMultipleIntervals: false,
        description: 'Real-time klines for trend detection.',
      },
      ticker: {
        required: false,
        description: 'Tickers for real-time manual SL triggers.',
      },
    },

    initialDataRequirements: {
      klines: {
        required: true,
        defaultConfig: { '15m': 200 },
        description: 'Pre-loads historical klines.',
      },
      fetchPositions: {
        required: true,
        editable: false,
        description: 'Sync current position.',
      },
      fetchOpenOrders: {
        required: true,
        editable: false,
        description: 'Sync existing orders.',
      },
    },

    documentation: {
      overview: 'Trend-following strategy using two EMAs.',
      parameters: 'Periods, Intervals, Profits, and Risk Limits.',
      signals: 'EMA Crossover, automated TP/SL logic.',
      riskFactors: ['Whipsaws', 'Slippage'],
    },
  };

export interface MovingAverageParameters extends StrategyParameters {
  maType: 'sma' | 'ema';
  fastPeriod: number;
  slowPeriod: number;
  klineInterval: string;
  takeProfitPercent: number;
  stopLossPercent: number;
  orderAmount: number;
  maxPositionSize: number;
  minPositionSize: number;
  leverage: number;
}

type MovingAverageConfig = StrategyConfig<MovingAverageParameters>;

interface KlineSnapshot {
  open: Decimal;
  close: Decimal;
}

interface PendingEntryInfo {
  side: 'buy' | 'sell';
  limitPrice: Decimal;
  quantity: Decimal;
}

export class MovingAverageStrategy extends BaseStrategy<MovingAverageParameters> {
  private closeHistory: Decimal[] = [];
  private lastKline: KlineSnapshot | null = null;
  private fastMA: Decimal = new Decimal(0);
  private slowMA: Decimal = new Decimal(0);
  private fastEMAValue: Decimal | null = null;
  private slowEMAValue: Decimal | null = null;
  private maSignal: 'bullish' | 'bearish' | 'none' = 'none';

  private pendingEntryOrders: Map<string, PendingEntryInfo> = new Map();
  private cancellingEntryOrders: Map<string, PendingEntryInfo> = new Map();
  private activeTpOrders: Map<string, SignalMetaData> = new Map();
  private activePositions: Map<
    string,
    {
      tpCid: string;
      slPrice: Decimal | null;
      quantity: Decimal;
      side: 'buy' | 'sell';
    }
  > = new Map();
  private processedFillIds: Set<string> = new Set();
  private activeSlOrders: Map<string, string> = new Map();

  constructor(config: MovingAverageConfig) {
    super({ ...config });
    this._validateParameters();
  }

  private _validateParameters(): void {
    const {
      fastPeriod,
      slowPeriod,
      maxPositionSize,
      minPositionSize,
      orderAmount,
      takeProfitPercent,
      stopLossPercent,
      leverage,
    } = this._parameters;

    if (fastPeriod >= slowPeriod) throw new Error(`fastPeriod must be < slowPeriod.`);
    if (minPositionSize > maxPositionSize)
      throw new Error(`minPositionSize must be ≤ maxPositionSize.`);
    if (fastPeriod <= 0) throw new Error(`fastPeriod must be > 0.`);
    if (orderAmount <= 0) throw new Error(`orderAmount must be > 0.`);
    if (takeProfitPercent <= 0) throw new Error(`takeProfitPercent must be > 0.`);
    if (stopLossPercent < 0) throw new Error(`stopLossPercent must be ≥ 0.`);
    if (leverage < 1) throw new Error(`leverage must be ≥ 1.`);
    if (leverage > 125) throw new Error(`leverage must be ≤ 125.`);
  }

  public override getSubscriptionConfig() {
    const interval = this._parameters.klineInterval || '15m';
    return {
      klines: { enabled: true, intervals: [interval] },
      method: 'websocket' as const,
      ticker: true,
    };
  }

  public override getInitialDataConfig() {
    const interval = this._parameters.klineInterval || '15m';
    const barsNeeded = Math.max(this._parameters.slowPeriod + 10, 20);
    return {
      klines: { [interval]: barsNeeded },
      fetchPositions: true,
      fetchOpenOrders: true,
    };
  }

  public override async processInitialData(
    initialData: InitialDataResult,
  ): Promise<StrategyAnalyzeResult> {
    const interval = (this._parameters.klineInterval || '15m') as KlineInterval;
    if (initialData.klines) {
      const klines = (initialData.klines[interval] ?? []).filter(
        (k) => k.isClosed !== false,
      );
      if (klines.length > 0) {
        this.closeHistory = klines.map((k) => k.close);
        const latest = klines[klines.length - 1];
        this.lastKline = { open: latest.open, close: latest.close };
        this._recalculateMAs();
        this._updateMASignal();
      }
    }

    if (initialData.openOrders) {
      for (const order of initialData.openOrders) {
        if (!order.clientOrderId) continue;
        if (order.clientOrderId.startsWith('E') && this._isMyOrder(order.clientOrderId)) {
          this.pendingEntryOrders.set(order.clientOrderId, {
            side: order.side === OrderSide.BUY ? 'buy' : 'sell',
            limitPrice: order.price ?? new Decimal(0),
            quantity: order.quantity,
          });
        } else if (
          order.clientOrderId.startsWith('T') &&
          this._isMyOrder(order.clientOrderId)
        ) {
          this.activeTpOrders.set(order.clientOrderId, {
            signalType: SignalType.TakeProfit,
            clientOrderId: order.clientOrderId,
            timestamp: Date.now(),
          });

          if (!this._currentPosition.isZero()) {
            const side = this._currentPosition.gt(0) ? 'buy' : 'sell';
            const tpPct = new Decimal(this._parameters.takeProfitPercent).div(100);
            if (order.price) {
              const baseEstimatedFromTp =
                side === 'buy'
                  ? order.price.div(new Decimal(1).plus(tpPct))
                  : order.price.div(new Decimal(1).minus(tpPct));
              const slPrice = this._calculateStopLossPrice(side, baseEstimatedFromTp);

              this.activePositions.set('recovered', {
                tpCid: order.clientOrderId,
                slPrice: this._parameters.stopLossPercent > 0 ? slPrice : null,
                quantity: this._currentPosition.abs(),
                side,
              });
            }
          }
        }
      }
    }
    return { action: 'hold' };
  }

  public async analyze(dataUpdate: DataUpdate): Promise<StrategyAnalyzeResult> {
    const { klines, ticker, orders } = dataUpdate;
    const signals: StrategyResult[] = [];

    const price =
      ticker?.price ||
      (klines && klines.length > 0 ? klines[klines.length - 1].close : null);
    if (price) {
      signals.push(...this._checkManualStopLoss(price));
    }

    if (klines && klines.length > 0) {
      for (const kline of klines) {
        signals.push(...this._processKlineUpdate(kline));
      }
    }

    if (orders && orders.length > 0) {
      signals.push(...this._processOrderUpdates(orders));
    }

    return signals.length > 0 ? signals : { action: 'hold' };
  }

  private _checkManualStopLoss(price: Decimal): StrategyResult[] {
    const signals: StrategyResult[] = [];

    for (const [entryCid, pos] of Array.from(this.activePositions.entries())) {
      if (!pos.slPrice) continue;

      const hit = pos.side === 'buy' ? price.lte(pos.slPrice) : price.gte(pos.slPrice);

      if (hit) {
        signals.push({
          action: 'cancel',
          clientOrderId: pos.tpCid,
          reason: `Manual SL hit`,
        } as StrategyCancelOrderResult);

        const exitCid = this.generateClientOrderId(SignalType.StopLoss);
        signals.push({
          action: pos.side === 'buy' ? 'sell' : 'buy',
          clientOrderId: exitCid,
          quantity: pos.quantity,
          type: OrderType.MARKET,
          leverage: this._parameters.leverage,
          tradeMode: TradeMode.ISOLATED,
          reason: `Manual SL exit`,
          metadata: {
            signalType: SignalType.StopLoss,
            parentOrderId: entryCid.startsWith('recovered') ? undefined : entryCid,
            timestamp: Date.now(),
          },
        });

        this.activePositions.delete(entryCid);
        this.activeTpOrders.delete(pos.tpCid);
        this.maSignal = 'none';
      }
    }

    return signals;
  }

  private _processKlineUpdate(kline: Kline): StrategyResult[] {
    if (kline.isClosed === false) return [];

    this.closeHistory.push(kline.close);
    if (this.closeHistory.length > this._parameters.slowPeriod + 100) {
      this.closeHistory.shift();
    }

    this._recalculateMAs();
    const crossover = this._detectCrossover();
    this.lastKline = { open: kline.open, close: kline.close };

    if (crossover === 'none') return [];

    const signals: StrategyResult[] = [];

    signals.push(...this._cancelOppositeEntry());

    const side: 'buy' | 'sell' = crossover === 'bullish' ? 'buy' : 'sell';
    const alreadyPending = Array.from(this.pendingEntryOrders.values()).some(
      (e) => e.side === side,
    );

    const hasOpenPosition =
      this.activePositions.size > 0 || !this._currentPosition.isZero();

    if (!alreadyPending && !hasOpenPosition && this._positionAllows(side)) {
      const entry = this._generateEntrySignal(crossover);
      if (entry) signals.push(entry);
    }

    if (crossover === 'bullish' && this._currentPosition.lt(0)) {
      signals.push(this._generateCloseSignal('buy', this._currentPosition.abs()));
    } else if (crossover === 'bearish' && this._currentPosition.gt(0)) {
      signals.push(this._generateCloseSignal('sell', this._currentPosition));
    }

    return signals;
  }

  private _generateCloseSignal(
    action: 'buy' | 'sell',
    qty: Decimal,
  ): StrategyOrderResult {
    return {
      action,
      clientOrderId: this.generateClientOrderId(SignalType.StopLoss),
      quantity: qty,
      type: OrderType.MARKET,
      leverage: this._parameters.leverage,
      tradeMode: TradeMode.ISOLATED,
      reason: `Crossover exit`,
      metadata: {
        signalType: SignalType.StopLoss,
        timestamp: Date.now(),
      },
    };
  }

  private _processOrderUpdates(orders: Order[]): StrategyResult[] {
    const signals: StrategyResult[] = [];

    for (const order of orders) {
      const cid = order.clientOrderId;
      if (!cid || !this._isMyOrder(cid)) continue;

      const isTerminated = [
        OrderStatus.FILLED,
        OrderStatus.CANCELED,
        OrderStatus.REJECTED,
        OrderStatus.EXPIRED,
      ].includes(order.status);

      if (this.pendingEntryOrders.has(cid) || this.cancellingEntryOrders.has(cid)) {
        if (order.status === OrderStatus.FILLED && !this.processedFillIds.has(cid)) {
          this.processedFillIds.add(cid);
          const info =
            this.pendingEntryOrders.get(cid) ?? this.cancellingEntryOrders.get(cid)!;

          signals.push(
            ...this._handleEntryFill(
              cid,
              info.side,
              order.averagePrice ?? order.price ?? info.limitPrice,
              order.executedQuantity ?? info.quantity,
            ),
          );
        }

        if (isTerminated) {
          this.pendingEntryOrders.delete(cid);
          this.cancellingEntryOrders.delete(cid);
        }
      } else if (this.activeTpOrders.has(cid)) {
        if (order.status === OrderStatus.FILLED && !this.processedFillIds.has(cid)) {
          this.processedFillIds.add(cid);
          const parent = this.activeTpOrders.get(cid)?.parentOrderId;
          if (parent) {
            this.activePositions.delete(parent);
          }
          this.maSignal = 'none';
        }
        if (isTerminated) {
          this.activeTpOrders.delete(cid);
        }
      }
    }

    return signals;
  }

  private _handleEntryFill(
    entryCid: string,
    side: 'buy' | 'sell',
    fillPrice: Decimal,
    fillQty: Decimal,
  ): StrategyResult[] {
    const tpSignal = this._generateTakeProfitSignal(entryCid, side, fillPrice, fillQty);

    const slPrice =
      this._parameters.stopLossPercent > 0
        ? this._calculateStopLossPrice(side, fillPrice)
        : null;

    this.activePositions.set(entryCid, {
      tpCid: tpSignal.clientOrderId,
      slPrice,
      quantity: fillQty,
      side,
    });

    return [tpSignal];
  }

  private _recalculateMAs(): void {
    if (this._parameters.maType === 'ema') {
      this._recalculateEMAs();
    } else {
      this.fastMA = this._calculateSMA(this._parameters.fastPeriod);
      this.slowMA = this._calculateSMA(this._parameters.slowPeriod);
    }
  }

  private _recalculateEMAs(): void {
    const { fastPeriod, slowPeriod } = this._parameters;
    const closes = this.closeHistory;

    if (closes.length < slowPeriod) return;

    if (this.fastEMAValue === null || this.slowEMAValue === null) {
      this._seedEMAsFromHistory();
    } else {
      const latestClose = closes[closes.length - 1];
      const fastK = new Decimal(2).div(fastPeriod + 1);
      const slowK = new Decimal(2).div(slowPeriod + 1);

      this.fastEMAValue = latestClose
        .mul(fastK)
        .plus(this.fastEMAValue.mul(new Decimal(1).minus(fastK)));
      this.slowEMAValue = latestClose
        .mul(slowK)
        .plus(this.slowEMAValue.mul(new Decimal(1).minus(slowK)));
    }

    this.fastMA = this.fastEMAValue || new Decimal(0);
    this.slowMA = this.slowEMAValue || new Decimal(0);
  }

  private _seedEMAsFromHistory(): void {
    const { fastPeriod, slowPeriod } = this._parameters;
    const closes = this.closeHistory;

    const fastK = new Decimal(2).div(fastPeriod + 1);
    let fEma = closes
      .slice(0, fastPeriod)
      .reduce((a, b) => a.plus(b), new Decimal(0))
      .div(fastPeriod);
    for (let i = fastPeriod; i < closes.length; i++) {
      fEma = closes[i].mul(fastK).plus(fEma.mul(new Decimal(1).minus(fastK)));
    }
    this.fastEMAValue = fEma;

    const slowK = new Decimal(2).div(slowPeriod + 1);
    let sEma = closes
      .slice(0, slowPeriod)
      .reduce((a, b) => a.plus(b), new Decimal(0))
      .div(slowPeriod);
    for (let i = slowPeriod; i < closes.length; i++) {
      sEma = closes[i].mul(slowK).plus(sEma.mul(new Decimal(1).minus(slowK)));
    }
    this.slowEMAValue = sEma;
  }

  private _detectCrossover(): 'bullish' | 'bearish' | 'none' {
    const prev = this.maSignal;
    const curr = this._updateMASignal();

    if (prev === 'none') {
      if (this.closeHistory.length >= this._parameters.slowPeriod) {
        return curr;
      }
      return 'none';
    }

    if (curr !== prev && curr !== 'none') {
      return curr;
    }

    return 'none';
  }

  private _updateMASignal(): 'bullish' | 'bearish' | 'none' {
    if (this.fastMA.isZero() || this.slowMA.isZero()) return 'none';

    if (this.fastMA.gt(this.slowMA)) {
      this.maSignal = 'bullish';
    } else if (this.fastMA.lt(this.slowMA)) {
      this.maSignal = 'bearish';
    }
    return this.maSignal;
  }

  private _calculateSMA(period: number): Decimal {
    const slice = this.closeHistory.slice(-period);
    if (slice.length < period) return new Decimal(0);
    const sum = slice.reduce((a, b) => a.plus(b), new Decimal(0));
    return sum.div(period);
  }

  private _generateEntrySignal(
    crossover: 'bullish' | 'bearish',
  ): StrategyOrderResult | null {
    if (!this.lastKline) return null;

    const side = crossover === 'bullish' ? 'buy' : 'sell';

    const price =
      side === 'buy'
        ? this.lastKline.close.minus(
            this.lastKline.close.minus(this.lastKline.open).div(3),
          )
        : this.lastKline.close.plus(
            this.lastKline.open.minus(this.lastKline.close).div(3),
          );

    const cid = this.generateClientOrderId(SignalType.Entry);

    this.pendingEntryOrders.set(cid, {
      side,
      limitPrice: price,
      quantity: new Decimal(this._parameters.orderAmount),
    });

    return {
      action: side,
      clientOrderId: cid,
      price,
      quantity: new Decimal(this._parameters.orderAmount),
      type: OrderType.LIMIT,
      leverage: this._parameters.leverage,
      tradeMode: TradeMode.ISOLATED,
      confidence: 1,
      reason: `Entry on ${crossover}`,
      metadata: {
        signalType: SignalType.Entry,
        clientOrderId: cid,
        timestamp: Date.now(),
      },
    };
  }

  private _generateTakeProfitSignal(
    parentOrderId: string,
    side: 'buy' | 'sell',
    price: Decimal,
    qty: Decimal,
  ): StrategyOrderResult {
    const tpPct = new Decimal(this._parameters.takeProfitPercent).div(100);
    const tpPrice =
      side === 'buy'
        ? price.mul(new Decimal(1).plus(tpPct))
        : price.mul(new Decimal(1).minus(tpPct));

    const tpCid = this.generateClientOrderId(SignalType.TakeProfit);

    const metadata: SignalMetaData = {
      signalType: SignalType.TakeProfit,
      clientOrderId: tpCid,
      parentOrderId,
      timestamp: Date.now(),
    };

    this.activeTpOrders.set(tpCid, metadata);

    return {
      action: side === 'buy' ? 'sell' : 'buy',
      clientOrderId: tpCid,
      type: OrderType.LIMIT,
      price: tpPrice,
      quantity: qty,
      leverage: this._parameters.leverage,
      tradeMode: TradeMode.ISOLATED,
      reason: `TP exit`,
      metadata,
    };
  }

  private _calculateStopLossPrice(side: 'buy' | 'sell', price: Decimal): Decimal {
    const slPct = new Decimal(this._parameters.stopLossPercent).div(100);
    return side === 'buy'
      ? price.mul(new Decimal(1).minus(slPct))
      : price.mul(new Decimal(1).plus(slPct));
  }

  private _cancelOppositeEntry(): StrategyResult[] {
    const crossover = this.maSignal;
    if (crossover === 'none') return [];

    const oppositeSide = crossover === 'bullish' ? 'sell' : 'buy';
    const signals: StrategyResult[] = [];

    for (const [cid, info] of Array.from(this.pendingEntryOrders.entries())) {
      if (info.side === oppositeSide) {
        signals.push({
          action: 'cancel',
          clientOrderId: cid,
          reason: `Reversal cancel`,
        });
        this.cancellingEntryOrders.set(cid, info);
        this.pendingEntryOrders.delete(cid);
      }
    }
    return signals;
  }

  private _positionAllows(action: 'buy' | 'sell'): boolean {
    const amount = new Decimal(this._parameters.orderAmount);
    const pendingLong = Array.from(this.pendingEntryOrders.values())
      .filter((o) => o.side === 'buy')
      .reduce((acc, o) => acc.plus(o.quantity), new Decimal(0));
    const pendingShort = Array.from(this.pendingEntryOrders.values())
      .filter((o) => o.side === 'sell')
      .reduce((acc, o) => acc.plus(o.quantity), new Decimal(0));
    const netCommitted = this._currentPosition.plus(pendingLong).minus(pendingShort);
    if (action === 'buy') {
      return netCommitted.plus(amount).lte(this._parameters.maxPositionSize);
    } else {
      return netCommitted.minus(amount).gte(this._parameters.minPositionSize);
    }
  }

  private _isMyOrder(cid: string): boolean {
    const strategyId = this.getStrategyId();
    const regex = /^(E|T|S)(\d+)D/;
    const match = regex.exec(cid);
    return !!match && match[2] === String(strategyId);
  }

  protected async onCleanup(): Promise<void> {
    this.closeHistory = [];
    this.activePositions.clear();
    this.activeTpOrders.clear();
    this.activeSlOrders.clear();
    this.pendingEntryOrders.clear();
    this.processedFillIds.clear();
    this.fastMA = new Decimal(0);
    this.slowMA = new Decimal(0);
    this.fastEMAValue = null;
    this.slowEMAValue = null;
    this.maSignal = 'none';
    this.lastKline = null;
  }

  public getFastMA(): Decimal {
    return this.fastMA;
  }
  public getSlowMA(): Decimal {
    return this.slowMA;
  }
  public getMASignal(): 'bullish' | 'bearish' | 'none' {
    return this.maSignal;
  }
  public getPendingEntryCount(): number {
    return this.pendingEntryOrders.size;
  }
  public getActiveTpCount(): number {
    return this.activeTpOrders.size;
  }

  public getStrategyState() {
    return {
      priceHistoryLength: this.closeHistory.length,
      lastKline: this.lastKline
        ? {
            open: this.lastKline.open.toFixed(8),
            close: this.lastKline.close.toFixed(8),
          }
        : null,
      maSignal: this.maSignal,
      currentPosition: this._currentPosition.toFixed(8),
      activePositions: Array.from(this.activePositions.entries()).map(([k, v]) => ({
        entryCid: k,
        tpCid: v.tpCid,
        slPrice: v.slPrice?.toFixed(8),
      })),
      pendingEntries: Array.from(this.pendingEntryOrders.entries()).map(([k, v]) => ({
        clientOrderId: k,
        ...v,
      })),
      activeTpOrders: Array.from(this.activeTpOrders.values()),
      activeSlOrders: Array.from(this.activeSlOrders.entries()).map(([k, v]) => ({
        clientOrderId: k,
        parentOrderId: v,
      })),
      parameters: this._parameters,
    };
  }
}
