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
  Order,
  OrderStatus,
  OrderSide,
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
      fastPeriod: 25,
      slowPeriod: 55,
      klineInterval: '15m',
      takeProfitPercent: 2,
      stopLossPercent: 0,
      orderAmount: 100,
      maxPositionSize: 500,
      minPositionSize: 0,
    },

    parameterDefinitions: [
      // ── MA Periods ────────────────────────────────────────────────────────
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
        description: 'Slow moving average period (must be > fastPeriod)',
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
        description: 'Kline interval for MA calculation and WebSocket subscription',
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
      // ── Take Profit ───────────────────────────────────────────────────────
      {
        name: 'takeProfitPercent',
        type: 'number',
        description:
          'Take-profit percentage from the actual fill price (e.g. 2 = 2%). A limit TP order is placed automatically after each entry fill.',
        defaultValue: 2,
        required: true,
        min: 0.01,
        max: 50,
        unit: '%',
        group: 'Take Profit',
        order: 4,
      },
      // ── Stop Loss ─────────────────────────────────────────────────────────
      {
        name: 'stopLossPercent',
        type: 'number',
        description:
          'Stop-loss percentage from the actual fill price (e.g. 1 = 1%). ' +
          'Set to 0 (default) to disable. When enabled, a stop-loss limit order is placed ' +
          'alongside the TP after each entry fill. If the SL fills, the paired TP is cancelled.',
        defaultValue: 0,
        required: false,
        min: 0,
        max: 50,
        unit: '%',
        group: 'Take Profit',
        order: 5,
      },
      // ── Risk Management ───────────────────────────────────────────────────
      {
        name: 'orderAmount',
        type: 'number',
        description: 'Quantity (base asset) to trade per entry order',
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
        description:
          'Maximum net long position allowed. New long entries are blocked once this ceiling is reached.',
        defaultValue: 500,
        required: true,
        min: 0,
        max: 1_000_000,
        group: 'Risk Management',
        order: 7,
      },
      {
        name: 'minPositionSize',
        type: 'number',
        description:
          'Minimum net position allowed (0 = long-only / spot; negative = allows shorts for futures).',
        defaultValue: 0,
        required: true,
        min: -1_000_000,
        max: 1_000_000,
        group: 'Risk Management',
        order: 8,
      },
    ],

    // ── Subscription requirements (UI metadata) ───────────────────────────
    subscriptionRequirements: {
      klines: {
        required: true,
        allowMultipleIntervals: false,
        defaultIntervals: ['15m'],
        intervalsEditable: true,
        description:
          'A single kline interval drives the MA calculation. The strategy auto-subscribes via WebSocket and pre-loads enough historical bars.',
      },
      ticker: {
        required: false,
        editable: true,
        description: 'Optional ticker stream for price monitoring between kline closes.',
      },
    },

    // ── Initial data requirements (UI metadata) ───────────────────────────
    initialDataRequirements: {
      klines: {
        required: true,
        defaultConfig: { '15m': 65 }, // slowPeriod(55) + 10 buffer
        allowMultipleIntervals: false,
        description:
          'Pre-loads enough historical klines to prime both MAs before trading begins.',
      },
      fetchPositions: {
        required: true,
        description: 'Sync existing position so risk limits are enforced from the start.',
      },
      fetchOpenOrders: {
        required: true,
        description:
          'Recover any pending entry / TP orders placed in a previous session.',
      },
    },

    documentation: {
      overview:
        'Generates a long (buy) signal when the fast SMA crosses above the slow SMA and a short (sell) signal on the opposite crossover. Entry limit orders are placed at an optimal intra-bar price derived from the most recent kline. A take-profit limit order is created automatically once each entry fills.',
      parameters:
        'fastPeriod must be smaller than slowPeriod. klineInterval controls which timeframe is used for both the MA and the WebSocket subscription.',
      signals:
        'Long entry: fast SMA > slow SMA (crossover). Short entry: fast SMA < slow SMA (crossover). Take-profit: placed at entryFillPrice ± takeProfitPercent after fill.',
      riskFactors: [
        'SMA is a lagging indicator — late entries in fast-moving markets',
        'Choppy / ranging markets generate false crossover signals',
        'Limit entry orders may not fill if price moves away quickly',
        'No stop-loss by default — enable via stopLossPercent > 0',
      ],
    },
  };

// ─────────────────────────────────────────────────────────────────────────────
// Parameter Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration parameters for MovingAverageStrategy.
 */
export interface MovingAverageParameters extends StrategyParameters {
  /** Fast SMA period. Default: 25 */
  fastPeriod: number;
  /** Slow SMA period. Default: 55 */
  slowPeriod: number;
  /**
   * Kline interval used for the MA calculation AND the WebSocket subscription.
   * Accepts any valid KlineInterval string (e.g. '1m', '15m', '1h').
   * Default: '15m'
   */
  klineInterval: string;
  /**
   * Take-profit percentage from the actual entry fill price.
   * e.g. 2 → TP placed at fillPrice × 1.02 (long) or fillPrice × 0.98 (short).
   * Default: 2
   */
  takeProfitPercent: number;
  /**
   * Stop-loss percentage from the actual entry fill price.
   * e.g. 1 → SL placed at fillPrice × 0.99 (long) or fillPrice × 1.01 (short).
   * Set to 0 (default) to disable stop-loss entirely.
   * When > 0, a stop-loss limit order is placed alongside the TP after each entry fill.
   * If the SL fills, its paired TP is automatically cancelled, and vice versa.
   * Default: 0
   */
  stopLossPercent: number;
  /** Quantity (base asset) traded per entry order. Default: 100 */
  orderAmount: number;
  /**
   * Hard ceiling on net long position (in base asset units).
   * No new long entries are placed if currentPosition + orderAmount > maxPositionSize.
   * Default: 500
   */
  maxPositionSize: number;
  /**
   * Hard floor on net position (in base asset units).
   * 0 = long-only (spot). Negative = allow short exposure (futures).
   * No new short entries are placed if currentPosition - orderAmount < minPositionSize.
   * Default: 0
   */
  minPositionSize: number;
}

type MovingAverageConfig = StrategyConfig<MovingAverageParameters>;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal kline snapshot needed for the entry-price formula. */
interface KlineSnapshot {
  open: Decimal;
  close: Decimal;
}

/** Metadata stored for every pending entry order so the TP can be constructed on fill. */
interface PendingEntryInfo {
  side: 'buy' | 'sell';
  /** Limit price we sent to the exchange (used as fallback if averagePrice is unavailable). */
  limitPrice: Decimal;
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy Class
// ─────────────────────────────────────────────────────────────────────────────

export class MovingAverageStrategy extends BaseStrategy<MovingAverageParameters> {
  // ── MA state ──────────────────────────────────────────────────────────────
  /** Rolling window of close prices (capped at slowPeriod length). */
  private closeHistory: Decimal[] = [];
  /** Most-recent completed kline (open + close) – used for the entry price formula. */
  private lastKline: KlineSnapshot | null = null;
  /** Current fast SMA value. */
  private fastMA: Decimal = new Decimal(0);
  /** Current slow SMA value. */
  private slowMA: Decimal = new Decimal(0);
  /**
   * Tracks the current MA regime so we only fire on *new* crossovers.
   * 'bullish'  → fast > slow (we are in, or just entered, an uptrend)
   * 'bearish'  → fast < slow (we are in, or just entered, a downtrend)
   * 'none'     → initial / insufficient data
   */
  private maSignal: 'bullish' | 'bearish' | 'none' = 'none';

  // ── Order lifecycle tracking ──────────────────────────────────────────────
  /**
   * Entry orders that have been sent to the exchange but not yet confirmed filled.
   * Key: clientOrderId  Value: info needed to build the TP once the entry fills.
   */
  private pendingEntryOrders: Map<string, PendingEntryInfo> = new Map();
  /**
   * Active take-profit orders placed after an entry fill.
   * Key: TP clientOrderId  Value: SignalMetaData (contains parentOrderId → entry cid).
   */
  private activeTpOrders: Map<string, SignalMetaData> = new Map();
  /**
   * Active stop-loss orders placed after an entry fill (only when stopLossPercent > 0).
   * Key: SL clientOrderId  Value: parent entry clientOrderId.
   */
  private activeSlOrders: Map<string, string> = new Map();
  /**
   * Maps entry clientOrderId → { tpCid, slCid } so each exit order can cancel its pair.
   */
  private activePositions: Map<string, { tpCid: string; slCid: string | null }> =
    new Map();
  /**
   * Set of clientOrderIds whose fills have already been processed (idempotency guard).
   */
  private processedFillIds: Set<string> = new Set();

  constructor(config: MovingAverageConfig) {
    super({ ...config });
    this._validateParameters();
  }

  // ── Parameter validation ──────────────────────────────────────────────────

  private _validateParameters(): void {
    const {
      fastPeriod,
      slowPeriod,
      maxPositionSize,
      minPositionSize,
      orderAmount,
      takeProfitPercent,
      stopLossPercent,
    } = this._parameters;

    if (fastPeriod >= slowPeriod) {
      throw new Error(
        `[MovingAverageStrategy] fastPeriod (${fastPeriod}) must be less than slowPeriod (${slowPeriod}).`,
      );
    }
    if (minPositionSize > maxPositionSize) {
      throw new Error(
        `[MovingAverageStrategy] minPositionSize (${minPositionSize}) must be ≤ maxPositionSize (${maxPositionSize}).`,
      );
    }
    if (fastPeriod <= 0) {
      throw new Error(
        `[MovingAverageStrategy] fastPeriod must be > 0 (got ${fastPeriod}).`,
      );
    }
    if (takeProfitPercent <= 0) {
      throw new Error(
        `[MovingAverageStrategy] takeProfitPercent must be > 0 (got ${takeProfitPercent}).`,
      );
    }
    if (stopLossPercent < 0) {
      throw new Error(
        `[MovingAverageStrategy] stopLossPercent must be ≥ 0 (got ${stopLossPercent}). Use 0 to disable.`,
      );
    }
    if (orderAmount <= 0) {
      throw new Error(
        `[MovingAverageStrategy] orderAmount must be > 0 (got ${orderAmount}).`,
      );
    }
  }

  // ── Dynamic subscription & initial-data config ────────────────────────────

  /**
   * Overrides BaseStrategy to derive the WebSocket subscription directly from
   * the `klineInterval` parameter, so changing the parameter automatically
   * subscribes to the correct interval without UI reconfiguration.
   */
  public override getSubscriptionConfig() {
    const interval = this._parameters.klineInterval || '15m';
    return {
      klines: {
        enabled: true,
        intervals: [interval],
      },
      method: 'websocket' as const,
      exchange: this._context.exchange,
    };
  }

  /**
   * Overrides BaseStrategy to request just enough historical bars to warm up
   * both MAs (slowPeriod + 10 bars as buffer).
   */
  public override getInitialDataConfig() {
    const interval = this._parameters.klineInterval || '15m';
    const barsNeeded = this._parameters.slowPeriod + 10;
    return {
      klines: { [interval]: barsNeeded },
      fetchPositions: true,
      fetchOpenOrders: true,
    };
  }

  // ── Lifecycle: initial data ───────────────────────────────────────────────

  /**
   * Called once by the engine before live data starts flowing.
   * Populates the close history and primes the last-kline snapshot.
   */
  public override async processInitialData(
    initialData: InitialDataResult,
  ): Promise<StrategyAnalyzeResult> {
    const interval = (this._parameters.klineInterval || '15m') as KlineInterval;

    if (initialData.klines) {
      const klines = initialData.klines[interval] ?? [];
      if (klines.length > 0) {
        this.closeHistory = klines.map((k) => k.close);
        const latest = klines[klines.length - 1];
        this.lastKline = { open: latest.open, close: latest.close };

        // Prime the MA state so the first live bar computes a real crossover.
        this._recalculateMAs();
        this._updateMASignal(); // warm-up: set regime without firing a trade signal

        this._logger.debug(
          `[MovingAverageStrategy] Primed with ${this.closeHistory.length} ${interval} bars. ` +
            `FastMA=${this.fastMA.toFixed(4)}, SlowMA=${this.slowMA.toFixed(4)}, regime=${this.maSignal}`,
        );
      }
    }

    // Recover open orders from a previous session
    if (initialData.openOrders) {
      for (const order of initialData.openOrders) {
        if (!order.clientOrderId) continue;
        if (order.clientOrderId.startsWith('E') && this._isMyOrder(order.clientOrderId)) {
          this.pendingEntryOrders.set(order.clientOrderId, {
            side: order.side === OrderSide.BUY ? 'buy' : 'sell',
            limitPrice: order.price ?? new Decimal(0),
          });
          this._logger.debug(
            `[MovingAverageStrategy] Recovered pending entry: ${order.clientOrderId}`,
          );
        } else if (
          order.clientOrderId.startsWith('T') &&
          this._isMyOrder(order.clientOrderId)
        ) {
          const metadata: SignalMetaData = {
            signalType: SignalType.TakeProfit,
            clientOrderId: order.clientOrderId,
            timestamp: Date.now(),
          };
          this.activeTpOrders.set(order.clientOrderId, metadata);
          this._logger.debug(
            `[MovingAverageStrategy] Recovered active TP: ${order.clientOrderId}`,
          );
        }
      }
    }

    return { action: 'hold' };
  }

  // ── Core analyze loop ─────────────────────────────────────────────────────

  /**
   * Main analysis loop. Called by the engine on every DataUpdate event.
   *
   * Handles two independent data paths:
   *  1. `klines`  → update MA history, detect crossovers, optionally emit entry signal.
   *  2. `orders`  → detect entry fills and emit the corresponding TP signal;
   *                 detect TP fills and reset state for re-entry.
   *
   * Returns an array so that an entry signal and/or TP signal can be returned
   * simultaneously in a single engine tick.
   */
  public async analyze({ klines, orders }: DataUpdate): Promise<StrategyAnalyzeResult> {
    const signals: StrategyResult[] = [];

    // ── Path 1: kline update ──────────────────────────────────────────────
    if (klines && klines.length > 0) {
      const klineSignals = this._processKlineUpdate(klines[klines.length - 1]);
      signals.push(...klineSignals);
    }

    // ── Path 2: order update ──────────────────────────────────────────────
    if (orders && orders.length > 0) {
      const orderSignals = this._processOrderUpdates(orders);
      signals.push(...orderSignals);
    }

    return signals.length > 0 ? signals : { action: 'hold' };
  }

  // ── Path 1: kline processing ──────────────────────────────────────────────

  /**
   * Ingests one kline, recomputes the MAs, and returns an entry signal if a
   * fresh MA crossover is detected and risk limits permit.
   */
  private _processKlineUpdate(kline: {
    open: Decimal;
    close: Decimal;
  }): StrategyResult[] {
    // 1. Update rolling close history
    this.closeHistory.push(kline.close);
    if (this.closeHistory.length > this._parameters.slowPeriod + 1) {
      this.closeHistory.shift();
    }
    this.lastKline = { open: kline.open, close: kline.close };

    // 2. Compute MAs (need at least slowPeriod bars)
    if (this.closeHistory.length < this._parameters.slowPeriod) {
      return [];
    }
    this._recalculateMAs();

    // 3. Detect crossover
    const crossover = this._detectCrossover();
    if (crossover === 'none') return [];

    // 4. Cancel any pending entry in the opposite direction
    const cancelSignals = this._cancelOppositeEntry(crossover);

    // 5. Check whether we already have a pending entry in this direction
    const hasPendingEntry = [...this.pendingEntryOrders.values()].some(
      (e) => e.side === (crossover === 'bullish' ? 'buy' : 'sell'),
    );
    if (hasPendingEntry) {
      this._logger.debug(
        `[MovingAverageStrategy] Crossover ${crossover} – skipped, entry already pending.`,
      );
      return cancelSignals;
    }

    // 6. Risk management: position-size gate
    const action: 'buy' | 'sell' = crossover === 'bullish' ? 'buy' : 'sell';
    if (!this._positionAllows(action)) {
      this._logger.debug(
        `[MovingAverageStrategy] Crossover ${crossover} – blocked by position limits ` +
          `(pos=${this._currentPosition.toFixed(4)}, max=${this._parameters.maxPositionSize}, min=${this._parameters.minPositionSize}).`,
      );
      return cancelSignals;
    }

    // 7. Build the entry limit signal
    const entrySignal = this._generateEntrySignal(crossover);
    if (entrySignal) {
      cancelSignals.push(entrySignal);
      this._logger.debug(
        `[MovingAverageStrategy] ${crossover} crossover → entry ${action} @ ${entrySignal.price?.toFixed(4)}, ` +
          `cid=${entrySignal.clientOrderId}`,
      );
    }

    // 8. Close any opposite positions immediately on crossover (market-like exit)
    // This prevents simultaneous long/short positions and enables cleaner trend-following.
    if (crossover === 'bullish' && this._currentPosition.lt(0)) {
      // We are short, price crossed bullish -> Close all shorts
      const closeShortSignal: StrategyOrderResult = {
        action: 'buy',
        clientOrderId: this.generateClientOrderId(SignalType.StopLoss),
        quantity: this._currentPosition.abs(),
        price: this.lastKline?.close ?? kline.close,
        reason: 'Bullish crossover: closing existing short positions',
        metadata: {
          signalType: SignalType.StopLoss, // using StopLoss as a category for "forced" exit
        },
      };
      cancelSignals.push(closeShortSignal);
    } else if (crossover === 'bearish' && this._currentPosition.gt(0)) {
      // We are long, price crossed bearish -> Close all longs
      const closeLongSignal: StrategyOrderResult = {
        action: 'sell',
        clientOrderId: this.generateClientOrderId(SignalType.StopLoss),
        quantity: this._currentPosition,
        price: this.lastKline?.close ?? kline.close,
        reason: 'Bearish crossover: closing existing long positions',
        metadata: {
          signalType: SignalType.StopLoss,
        },
      };
      cancelSignals.push(closeLongSignal);
    }
    return cancelSignals;
  }

  // ── Path 2: order lifecycle processing ───────────────────────────────────

  /**
   * Scans incoming order updates for fills that belong to this strategy.
   *
   *  - Entry FILLED → generate a corresponding TP limit order.
   *  - TP FILLED    → clean up state so re-entry is possible.
   *  - CANCELED / REJECTED / EXPIRED → remove from pending maps.
   */
  private _processOrderUpdates(orders: Order[]): StrategyResult[] {
    const signals: StrategyResult[] = [];

    for (const order of orders) {
      const cid = order.clientOrderId;
      if (!cid || !this._isMyOrder(cid)) continue;

      const isTerminal = [
        OrderStatus.FILLED,
        OrderStatus.CANCELED,
        OrderStatus.REJECTED,
        OrderStatus.EXPIRED,
      ].includes(order.status);

      // ── Entry order update ───────────────────────────────────────────────
      if (this.pendingEntryOrders.has(cid)) {
        if (order.status === OrderStatus.FILLED && !this.processedFillIds.has(cid)) {
          this.processedFillIds.add(cid);
          const info = this.pendingEntryOrders.get(cid)!;

          // Use actual average fill price when available; fall back to limit price.
          const fillPrice = order.averagePrice ?? order.price ?? info.limitPrice;

          const exitSignals = this._generateExitOrders(cid, info.side, fillPrice);
          signals.push(...exitSignals);
        }
        if (isTerminal) {
          this.pendingEntryOrders.delete(cid);
        }
      }

      // ── TP order update ──────────────────────────────────────────────────
      else if (this.activeTpOrders.has(cid)) {
        if (order.status === OrderStatus.FILLED && !this.processedFillIds.has(cid)) {
          this.processedFillIds.add(cid);
          this._logger.debug(
            `[MovingAverageStrategy] TP filled ${cid} — position closed, ready to re-enter.`,
          );

          // Cancel the paired SL (if any)
          const tpMeta = this.activeTpOrders.get(cid)!;
          const entryCid = tpMeta.parentOrderId;
          if (entryCid) {
            const pos = this.activePositions.get(entryCid);
            if (pos?.slCid) {
              signals.push({
                action: 'cancel',
                clientOrderId: pos.slCid,
                reason: 'TP filled — cancelling paired SL',
              } as StrategyCancelOrderResult);
              this.activeSlOrders.delete(pos.slCid);
            }
            this.activePositions.delete(entryCid);
          }

          // Reset the MA signal so the next crossover triggers a new entry.
          this.maSignal = 'none';
        }
        if (isTerminal) {
          this.activeTpOrders.delete(cid);
        }
      }

      // ── SL order update ──────────────────────────────────────────────────
      else if (this.activeSlOrders.has(cid)) {
        if (order.status === OrderStatus.FILLED && !this.processedFillIds.has(cid)) {
          this.processedFillIds.add(cid);
          this._logger.debug(
            `[MovingAverageStrategy] SL filled ${cid} — position stopped out.`,
          );

          // Cancel the paired TP
          const entryCid = this.activeSlOrders.get(cid)!;
          const pos = this.activePositions.get(entryCid);
          if (pos?.tpCid) {
            signals.push({
              action: 'cancel',
              clientOrderId: pos.tpCid,
              reason: 'SL filled — cancelling paired TP',
            } as StrategyCancelOrderResult);
            this.activeTpOrders.delete(pos.tpCid);
          }
          this.activePositions.delete(entryCid);

          // Reset MA signal so a new crossover can trigger re-entry
          this.maSignal = 'none';
        }
        if (isTerminal) {
          this.activeSlOrders.delete(cid);
        }
      }
    }

    return signals;
  }

  // ── MA helpers ────────────────────────────────────────────────────────────

  /** Recompute both SMAs from the current close history. */
  private _recalculateMAs(): void {
    this.fastMA = this._calculateSMA(this._parameters.fastPeriod);
    this.slowMA = this._calculateSMA(this._parameters.slowPeriod);
  }

  /**
   * Updates `this.maSignal` based on current MA values and returns the
   * crossover type **only if there is a genuine state change**.
   *
   * Returns 'bullish' | 'bearish' | 'none'.
   */
  private _detectCrossover(): 'bullish' | 'bearish' | 'none' {
    const prevSignal = this.maSignal;
    const newSignal = this._updateMASignal();
    if (newSignal !== prevSignal && newSignal !== 'none') {
      return newSignal === 'bullish' ? 'bullish' : 'bearish';
    }
    return 'none';
  }

  /**
   * Computes the new MA regime from current fast/slow values and updates
   * `this.maSignal`.  Returns the new signal value.
   */
  private _updateMASignal(): 'bullish' | 'bearish' | 'none' {
    if (this.fastMA.isZero() || this.slowMA.isZero()) return 'none';
    if (this.fastMA.gt(this.slowMA)) {
      this.maSignal = 'bullish';
    } else if (this.fastMA.lt(this.slowMA)) {
      this.maSignal = 'bearish';
    }
    return this.maSignal;
  }

  /**
   * Simple SMA over the last `period` bars in `closeHistory`.
   */
  private _calculateSMA(period: number): Decimal {
    const slice = this.closeHistory.slice(-period);
    if (slice.length < period) return new Decimal(0);
    const sum = slice.reduce((acc, p) => acc.plus(p), new Decimal(0));
    return sum.div(period);
  }

  // ── Entry price formula ───────────────────────────────────────────────────

  /**
   * Calculates the optimal limit entry price from the last completed kline.
   *
   * Formula (non-configurable by design):
   *   Long  entry price = close − (close − open) / 3   i.e. (2·close + open) / 3
   *   Short entry price = close + (open − close) / 3   i.e. (2·close + open) / 3
   *
   * Both reduce to the same expression: the price is 1/3 of the candle body
   * "inside" from the close toward the open.  For a bullish bar this is
   * slightly below the close (buyer gets a small pullback entry); for a
   * bearish bar it is slightly above the close (seller gets a small bounce entry).
   */
  private _calcLongEntryPrice(kline: KlineSnapshot): Decimal {
    return kline.close.minus(kline.close.minus(kline.open).div(3));
  }

  private _calcShortEntryPrice(kline: KlineSnapshot): Decimal {
    return kline.close.plus(kline.open.minus(kline.close).div(3));
  }

  // ── Risk gate ─────────────────────────────────────────────────────────────

  /**
   * Returns true if the proposed action is within configured position limits.
   *
   *  buy  → currentPosition + orderAmount must not exceed maxPositionSize
   *  sell → currentPosition − orderAmount must not fall below minPositionSize
   */
  private _positionAllows(action: 'buy' | 'sell'): boolean {
    const qty = new Decimal(this._parameters.orderAmount);
    const pos = this._currentPosition;
    const max = this._parameters.maxPositionSize;
    const min = this._parameters.minPositionSize;
    if (action === 'buy') {
      const allowed = pos.plus(qty).lte(max);
      this._logger.info(
        `[_positionAllows:buy] pos=${pos.toString()} + qty=${qty.toString()} <= max=${max} -> ${allowed}`,
      );
      return allowed;
    }
    const allowed = pos.minus(qty).gte(min);
    this._logger.info(
      `[_positionAllows:sell] pos=${pos.toString()} - qty=${qty.toString()} >= min=${min} -> ${allowed}`,
    );
    return allowed;
  }

  // ── Signal builders ───────────────────────────────────────────────────────

  /** Builds a limit entry order result for the given crossover direction. */
  private _generateEntrySignal(
    crossover: 'bullish' | 'bearish',
  ): StrategyOrderResult | null {
    if (!this.lastKline) return null;

    const action: 'buy' | 'sell' = crossover === 'bullish' ? 'buy' : 'sell';
    const entryPrice =
      action === 'buy'
        ? this._calcLongEntryPrice(this.lastKline)
        : this._calcShortEntryPrice(this.lastKline);

    const clientOrderId = this.generateClientOrderId(SignalType.Entry);
    const qty = new Decimal(this._parameters.orderAmount);

    const metadata: SignalMetaData = {
      signalType: SignalType.Entry,
      clientOrderId,
      timestamp: Date.now(),
    };

    // Track so we can pair with TP on fill
    this.pendingEntryOrders.set(clientOrderId, {
      side: action,
      limitPrice: entryPrice,
    });

    return {
      action,
      clientOrderId,
      price: entryPrice,
      quantity: qty,
      confidence: this._crossoverConfidence(),
      reason:
        `MA crossover (${crossover}): fastSMA=${this.fastMA.toFixed(4)}, ` +
        `slowSMA=${this.slowMA.toFixed(4)}`,
      metadata,
    };
  }

  /**
   * Generates the exit orders (TP + optional SL) for a newly filled entry.
   * Registers both orders in `activePositions` for mutual cancellation.
   *
   * @param entryCid  clientOrderId of the filled entry order
   * @param entrySide 'buy' | 'sell' of the entry
   * @param fillPrice actual fill price of the entry
   * @returns array of StrategyOrderResult (always TP; SL added when stopLossPercent > 0)
   */
  private _generateExitOrders(
    entryCid: string,
    entrySide: 'buy' | 'sell',
    fillPrice: Decimal,
  ): StrategyOrderResult[] {
    const results: StrategyOrderResult[] = [];

    // ── Take Profit (always) ──────────────────────────────────────────────
    const tpSignal = this._generateTakeProfitSignal(entryCid, entrySide, fillPrice);
    if (!tpSignal) return results;
    results.push(tpSignal);

    // ── Stop Loss (only when enabled) ─────────────────────────────────────
    let slCid: string | null = null;
    if (this._parameters.stopLossPercent > 0) {
      const slSignal = this._generateStopLossSignal(entryCid, entrySide, fillPrice);
      if (slSignal) {
        results.push(slSignal);
        slCid = slSignal.clientOrderId;
      }
    }

    // ── Register position for mutual cancellation ─────────────────────────
    this.activePositions.set(entryCid, {
      tpCid: tpSignal.clientOrderId,
      slCid,
    });

    return results;
  }

  /**
   * Builds a take-profit limit order to be placed immediately after the
   * corresponding entry order fills.
   *
   *  Long  TP = fillPrice × (1 + takeProfitPercent / 100)
   *  Short TP = fillPrice × (1 − takeProfitPercent / 100)
   */
  private _generateTakeProfitSignal(
    parentOrderId: string,
    entrySide: 'buy' | 'sell',
    fillPrice: Decimal,
  ): StrategyOrderResult | null {
    const tpPct = new Decimal(this._parameters.takeProfitPercent).div(100);
    const tpPrice =
      entrySide === 'buy'
        ? fillPrice.mul(new Decimal(1).plus(tpPct))
        : fillPrice.mul(new Decimal(1).minus(tpPct));

    // TP action is opposite to entry
    const tpAction: 'buy' | 'sell' = entrySide === 'buy' ? 'sell' : 'buy';
    const qty = new Decimal(this._parameters.orderAmount);
    const clientOrderId = this.generateClientOrderId(SignalType.TakeProfit);

    const metadata: SignalMetaData = {
      signalType: SignalType.TakeProfit,
      clientOrderId,
      parentOrderId,
      entryPrice: fillPrice.toFixed(8),
      takeProfitPrice: tpPrice.toFixed(8),
      profitRatio: this._parameters.takeProfitPercent,
      timestamp: Date.now(),
    };

    this.activeTpOrders.set(clientOrderId, metadata);

    return {
      action: tpAction,
      clientOrderId,
      price: tpPrice,
      quantity: qty,
      reason: `TP for entry ${parentOrderId}: ${this._parameters.takeProfitPercent}% from ${fillPrice.toFixed(4)}`,
      metadata,
    };
  }

  /**
   * Builds a stop-loss limit order to be placed alongside the TP after an entry fills.
   *
   *  Long  SL = fillPrice × (1 − stopLossPercent / 100)
   *  Short SL = fillPrice × (1 + stopLossPercent / 100)
   */
  private _generateStopLossSignal(
    parentOrderId: string,
    entrySide: 'buy' | 'sell',
    fillPrice: Decimal,
  ): StrategyOrderResult | null {
    const slPct = new Decimal(this._parameters.stopLossPercent).div(100);
    const slPrice =
      entrySide === 'buy'
        ? fillPrice.mul(new Decimal(1).minus(slPct))
        : fillPrice.mul(new Decimal(1).plus(slPct));

    // SL action is opposite to entry (same as TP direction)
    const slAction: 'buy' | 'sell' = entrySide === 'buy' ? 'sell' : 'buy';
    const qty = new Decimal(this._parameters.orderAmount);
    const clientOrderId = this.generateClientOrderId(SignalType.StopLoss);

    const metadata: SignalMetaData = {
      signalType: SignalType.StopLoss,
      clientOrderId,
      parentOrderId,
      entryPrice: fillPrice.toFixed(8),
      stopPrice: slPrice.toFixed(8),
      timestamp: Date.now(),
    };

    this.activeSlOrders.set(clientOrderId, parentOrderId);

    return {
      action: slAction,
      clientOrderId,
      price: slPrice,
      quantity: qty,
      reason: `SL for entry ${parentOrderId}: ${this._parameters.stopLossPercent}% from ${fillPrice.toFixed(4)}`,
      metadata,
    };
  }

  /**
   * If a crossover fires in the opposite direction to a pending entry, cancel
   * the stale entry to avoid filling into the wrong side.
   */
  private _cancelOppositeEntry(crossover: 'bullish' | 'bearish'): StrategyResult[] {
    const oppositeSide: 'buy' | 'sell' = crossover === 'bullish' ? 'sell' : 'buy';
    const signals: StrategyResult[] = [];

    for (const [cid, info] of this.pendingEntryOrders.entries()) {
      if (info.side === oppositeSide) {
        this._logger.debug(
          `[MovingAverageStrategy] Cancelling stale ${oppositeSide} entry ${cid} due to ${crossover} crossover.`,
        );
        const cancel: StrategyCancelOrderResult = {
          action: 'cancel',
          clientOrderId: cid,
          reason: `Direction reversed to ${crossover}; stale ${oppositeSide} entry cancelled.`,
        };
        signals.push(cancel);
        this.pendingEntryOrders.delete(cid);
      }
    }
    return signals;
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  /**
   * Simple confidence proxy: how far apart (%) are the two MAs?
   * Capped at 1.0 (100%).
   */
  private _crossoverConfidence(): number {
    if (this.slowMA.isZero()) return 0;
    const gap = this.fastMA.minus(this.slowMA).abs().div(this.slowMA);
    return Math.min(gap.toNumber() * 10, 1.0);
  }

  /**
   * Checks whether a clientOrderId belongs to this strategy instance.
   * Format: E{strategyId}D{seq}D{ts}  or  T{strategyId}D{seq}D{ts}
   */
  private _isMyOrder(clientOrderId: string): boolean {
    const strategyId = this.getStrategyId();
    const match = /^(E|T)(\d+)D/.exec(clientOrderId);
    return !!match && match[2] === String(strategyId);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  protected async onCleanup(): Promise<void> {
    this.closeHistory = [];
    this.lastKline = null;
    this.fastMA = new Decimal(0);
    this.slowMA = new Decimal(0);
    this.maSignal = 'none';
    this.pendingEntryOrders.clear();
    this.activeTpOrders.clear();
    this.activeSlOrders.clear();
    this.activePositions.clear();
    this.processedFillIds.clear();
  }

  // ── Public accessors (for testing & monitoring) ───────────────────────────

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

  /** Comprehensive snapshot for monitoring dashboards and unit tests. */
  public getStrategyState() {
    return {
      strategyId: this.getStrategyId(),
      strategyName: this.getStrategyName(),
      fastMA: this.fastMA.toFixed(8),
      slowMA: this.slowMA.toFixed(8),
      maSignal: this.maSignal,
      priceHistoryLength: this.closeHistory.length,
      lastKline: this.lastKline
        ? { open: this.lastKline.open.toFixed(8), close: this.lastKline.close.toFixed(8) }
        : null,
      pendingEntries: [...this.pendingEntryOrders.entries()].map(([cid, info]) => ({
        clientOrderId: cid,
        side: info.side,
        limitPrice: info.limitPrice.toFixed(8),
      })),
      activeTpOrders: [...this.activeTpOrders.keys()],
      activeSlOrders: [...this.activeSlOrders.keys()],
      activePositions: [...this.activePositions.entries()].map(([entryCid, pos]) => ({
        entryCid,
        tpCid: pos.tpCid,
        slCid: pos.slCid,
      })),
      currentPosition: this._currentPosition.toFixed(8),
      averagePrice: this._averagePrice?.toFixed(8) ?? null,
      isInitialized: this._isInitialized,
      parameters: {
        fastPeriod: this._parameters.fastPeriod,
        slowPeriod: this._parameters.slowPeriod,
        klineInterval: this._parameters.klineInterval,
        takeProfitPercent: this._parameters.takeProfitPercent,
        stopLossPercent: this._parameters.stopLossPercent,
        orderAmount: this._parameters.orderAmount,
        maxPositionSize: this._parameters.maxPositionSize,
        minPositionSize: this._parameters.minPositionSize,
      },
    };
  }
}
