import {
  BaseStrategy,
  StrategyResult,
  StrategyOrderResult,
  StrategyAnalyzeResult,
  StrategyConfig,
  Order,
  OrderStatus,
  DataUpdate,
  StrategyParameters,
  TradeMode,
  SignalType,
  SignalMetaData,
  InitialDataResult,
  OrderSide,
  OrderBook,
  Kline,
  KlineInterval,
  StrategyCancelOrderResult,
} from '@itrade/core';
import Decimal from 'decimal.js';
import { StrategyRegistryConfig } from '../type';
import { silentLogger } from '../utils/silent-logger';

/**
 * 🎯 MarketMakerGridStrategy parameters
 *
 * Volatility-gated, multi-level market-making grid (long side):
 * - Signal: previous closed kline range% >= minRangePercent
 * - Entry:  BUY limit at bid1 * (1 - levelGap%)
 * - Exit:   after entry fill, TP SELL limit at ask1 * (1 + tpGap%)
 *           (floored at entryPrice * (1 + tpGap%) to never lock in a loss)
 * - Risk:   maxInventory caps filled inventory + open/in-flight BUY orders
 * - Levels: capital (maxInvestment) is distributed across gap levels
 */
export interface MarketMakerGridParameters extends StrategyParameters {
  /** Kline interval used for the volatility signal (e.g. '15m') */
  klineInterval: string;
  /** Minimum range percent of the previous closed kline to trigger entries (e.g. 0.8 = 0.8%) */
  minRangePercent: number;
  /** Comma-separated entry gap percents below bid1, one per level (e.g. '1,5,25') */
  levelGapsPercent: string;
  /** Comma-separated investment allocation weights, one per level (e.g. '50,30,20'). Empty = equal split */
  levelAllocationsPercent: string;
  /**
   * Comma-separated take-profit gap percents, one per level (e.g. '0.2,0.5,2').
   * A single value applies to all levels. Empty = fall back to takeProfitGapPercent
   * or each level's own entry gap.
   */
  levelTakeProfitGapsPercent: string;
  /** Global take-profit gap percent above ask1. 0 = use each level's own gap symmetrically */
  takeProfitGapPercent: number;
  /**
   * Total capital (quote currency margin budget). Effective buying power is
   * maxInvestment * leverage, distributed across levels by allocation.
   */
  maxInvestment: number;
  /** Maximum inventory in base units, including open long (BUY) orders */
  maxInventory: number;
  /** Leverage for futures trading. Multiplies maxInvestment into buying power */
  leverage?: number;
}

export const MarketMakerGridStrategyRegistryConfig: StrategyRegistryConfig<MarketMakerGridParameters> =
  {
    type: 'MarketMakerGridStrategy',
    name: 'Market Maker Grid',
    description:
      'Volatility-gated market-making grid. Triggers on previous kline range, places multi-level ' +
      'BUY limit orders below bid1 with per-level capital allocation, and pairs each fill with a ' +
      'limit take-profit above ask1. Inventory (including open BUY orders) is capped.',
    icon: '🎯',
    implemented: true,
    category: 'volatility',
    defaultParameters: {
      klineInterval: '15m',
      minRangePercent: 0.8,
      levelGapsPercent: '1,5,25',
      levelAllocationsPercent: '50,30,20',
      levelTakeProfitGapsPercent: '',
      takeProfitGapPercent: 0,
      maxInvestment: 1000,
      maxInventory: 10,
      leverage: 10,
    },
    parameterDefinitions: [
      {
        name: 'klineInterval',
        type: 'string',
        description: 'Kline interval used for the volatility trigger (e.g. 15m)',
        defaultValue: '15m',
        required: true,
        group: 'Signal',
        order: 1,
      },
      {
        name: 'minRangePercent',
        type: 'number',
        description:
          'Minimum range percent ((high-low)/low*100) of the previous closed kline to trigger entries',
        defaultValue: 0.8,
        required: true,
        min: 0,
        max: 100,
        group: 'Signal',
        order: 2,
        unit: '%',
      },
      {
        name: 'levelGapsPercent',
        type: 'string',
        description:
          'Comma-separated entry gap percents below bid1, one per level (e.g. "1,5,25"). ' +
          'A single value (e.g. "0.2") behaves like a classic tight market maker.',
        defaultValue: '1,5,25',
        required: true,
        group: 'Levels',
        order: 3,
      },
      {
        name: 'levelAllocationsPercent',
        type: 'string',
        description:
          'Comma-separated allocation weights of maxInvestment per level (e.g. "50,30,20"). ' +
          'Weights are normalized automatically; empty = equal split.',
        defaultValue: '50,30,20',
        required: false,
        group: 'Levels',
        order: 4,
      },
      {
        name: 'levelTakeProfitGapsPercent',
        type: 'string',
        description:
          'Comma-separated take-profit gap percents per level (e.g. "0.2,0.5,2"). ' +
          'A single value applies to all levels. Empty = use takeProfitGapPercent or each level own gap.',
        defaultValue: '',
        required: false,
        group: 'Levels',
        order: 5,
      },
      {
        name: 'takeProfitGapPercent',
        type: 'number',
        description:
          'Global take-profit gap percent above ask1 at fill time, used when levelTakeProfitGapsPercent ' +
          'is empty. 0 = use each level own gap symmetrically.',
        defaultValue: 0,
        required: false,
        min: 0,
        max: 100,
        group: 'Levels',
        order: 6,
        unit: '%',
      },
      {
        name: 'maxInvestment',
        type: 'number',
        description:
          'Total capital (quote currency margin budget). Buying power = maxInvestment * leverage, ' +
          'distributed across levels by allocation',
        defaultValue: 1000,
        required: true,
        min: 0.01,
        max: 100000000,
        group: 'Risk Management',
        order: 7,
      },
      {
        name: 'maxInventory',
        type: 'number',
        description:
          'Maximum inventory in base units, including remaining quantity of open BUY orders',
        defaultValue: 10,
        required: true,
        min: 0.000001,
        max: 100000000,
        group: 'Risk Management',
        order: 8,
      },
      {
        name: 'leverage',
        type: 'number',
        description:
          'Leverage for futures trading. Multiplies maxInvestment into effective buying power',
        defaultValue: 10,
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
        defaultIntervals: ['15m'],
        description:
          'Kline data drives the volatility trigger. The selected interval is used for the range check.',
      },
      orderbook: {
        required: true,
        editable: false,
        defaultDepth: 5,
        depthEditable: true,
        description:
          'Orderbook data provides bid1/ask1 for entry and take-profit pricing.',
      },
    },
    initialDataRequirements: {
      klines: {
        required: true,
        defaultConfig: { '15m': 3 },
        allowMultipleIntervals: false,
        description: 'Recent klines to evaluate the signal immediately on start.',
      },
      fetchPositions: { required: true, editable: false, description: 'Fetch positions' },
      fetchOpenOrders: {
        required: true,
        editable: false,
        description: 'Fetch open orders',
      },
      fetchBalance: { required: true, editable: false, description: 'Fetch balance' },
      fetchOrderBook: {
        required: true,
        editable: false,
        defaultDepth: 5,
        depthEditable: true,
        description: 'Fetch orderbook snapshot',
      },
    },
    documentation: {
      overview:
        'Advanced SpreadGrid variant: entries are gated by the previous kline range (volatility), ' +
        'capital is distributed over multiple gap levels, and every fill is paired with a limit ' +
        'take-profit order. Long-only with a hard inventory cap.',
      parameters:
        'klineInterval + minRangePercent control the trigger; levelGapsPercent/levelAllocationsPercent ' +
        'define the grid; levelTakeProfitGapsPercent sets per-level TP gaps (takeProfitGapPercent is ' +
        'the global fallback); maxInvestment * leverage = buying power; maxInventory caps risk.',
      signals:
        'On each closed kline: range% >= threshold places/refreshes per-level BUY limits at ' +
        'bid1*(1-gap%); below threshold cancels unfilled entries. Entry fill => TP SELL at ' +
        'max(ask1, entryPrice)*(1+tpGap%). TP fill frees the level for the next cycle.',
      riskFactors: [
        'Downtrend accumulation up to maxInventory',
        'Take-profit orders may stay unfilled in prolonged drawdowns',
        'Limit entries may not fill (missed moves)',
        'Wide levels (e.g. 25%) can stay dormant for long periods',
      ],
    },
  };

interface GridLevelState {
  index: number;
  /** Entry gap percent below bid1 */
  gapPercent: Decimal;
  /** Per-level take-profit gap percent (null = fall back to global/entry gap) */
  tpGapPercent: Decimal | null;
  /** Fraction (0..1) of maxInvestment allocated to this level */
  allocationRatio: Decimal;
  /** clientOrderId of the open entry BUY order (null = none) */
  entryClientOrderId: string | null;
  /** clientOrderId of the open take-profit SELL order (null = none) */
  tpClientOrderId: string | null;
  /** Filled base quantity bought at this level, not yet sold by TP */
  inventoryQty: Decimal;
  /** Volume-weighted average entry price of current inventoryQty */
  avgEntryPrice: Decimal | null;
}

interface MMGridSignalMetaData extends SignalMetaData {
  side?: OrderSide;
  levelIndex?: number;
  /** Requested order quantity, used for in-flight inventory reservation */
  quantity?: string;
  /** Requested limit price, used to detect if an in-flight entry needs refreshing */
  price?: string;
}

export class MarketMakerGridStrategy extends BaseStrategy<MarketMakerGridParameters> {
  private klineInterval: string;
  private minRangePercent: Decimal;
  private takeProfitGapPercent: Decimal;
  private maxInvestment: Decimal;
  private maxInventory: Decimal;
  private leverage: number;
  private tradeMode: TradeMode = TradeMode.ISOLATED;

  private levels: GridLevelState[] = [];

  private lastBid: Decimal | null = null;
  private lastAsk: Decimal | null = null;
  private lastOrderBookReceivedAt: number = 0;
  private readonly orderBookStaleMs = 30000;

  /** Filled base inventory (bought, not yet sold). Bootstrapped from SQL net position. */
  private inventoryQty: Decimal = new Decimal(0);

  private signalActive = false;
  private lastRangePercent: Decimal | null = null;
  private lastProcessedKlineOpenTime: number = 0;

  private orders: Map<string, Order> = new Map();
  private orderMetadataMap: Map<string, MMGridSignalMetaData> = new Map();
  private pendingClientOrderIds: Set<string> = new Set();
  private processedFillIds: Set<string> = new Set();
  private processedQuantityMap: Map<string, Decimal> = new Map();
  /** Terminal orders (canceled/rejected/expired) already processed; ignores any stale replays. */
  private processedTerminalIds: Set<string> = new Set();

  constructor(config: StrategyConfig<MarketMakerGridParameters>) {
    super({ ...config, logger: silentLogger });
    const { parameters } = config;

    this.klineInterval = parameters.klineInterval || '15m';
    this.minRangePercent = new Decimal(parameters.minRangePercent ?? 0.8);
    this.takeProfitGapPercent = new Decimal(parameters.takeProfitGapPercent ?? 0);
    this.maxInvestment = new Decimal(parameters.maxInvestment);
    this.maxInventory = new Decimal(parameters.maxInventory);
    this.leverage = parameters.leverage ?? 10;

    if (this.maxInvestment.lte(0)) {
      throw new Error(`Invalid maxInvestment: ${parameters.maxInvestment} (must be > 0)`);
    }
    if (this.maxInventory.lte(0)) {
      throw new Error(`Invalid maxInventory: ${parameters.maxInventory} (must be > 0)`);
    }

    this.levels = MarketMakerGridStrategy.parseLevels(
      parameters.levelGapsPercent,
      parameters.levelAllocationsPercent,
      parameters.levelTakeProfitGapsPercent,
    );
    if (this.levels.length === 0) {
      throw new Error(
        `Invalid levelGapsPercent: '${parameters.levelGapsPercent}' (no valid levels parsed)`,
      );
    }
  }

  private static parseCsvDecimals(csv?: string): Decimal[] {
    return (csv || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => new Decimal(Number(s)))
      .filter((d) => d.isFinite() && d.gt(0));
  }

  private static parseLevels(
    gapsCsv: string,
    allocationsCsv?: string,
    tpGapsCsv?: string,
  ): GridLevelState[] {
    const gaps = MarketMakerGridStrategy.parseCsvDecimals(gapsCsv);
    if (gaps.length === 0) return [];

    let weights = MarketMakerGridStrategy.parseCsvDecimals(allocationsCsv);
    // Fall back to equal weights when allocations are missing or don't match level count
    if (weights.length !== gaps.length) {
      weights = gaps.map(() => new Decimal(1));
    }
    const totalWeight = weights.reduce((acc, w) => acc.add(w), new Decimal(0));

    // Per-level TP gaps: one value per level, or a single value applied to all levels.
    const tpGaps = MarketMakerGridStrategy.parseCsvDecimals(tpGapsCsv);
    if (tpGaps.length > 0 && tpGaps.length !== 1 && tpGaps.length !== gaps.length) {
      throw new Error(
        `Invalid levelTakeProfitGapsPercent: '${tpGapsCsv}' ` +
          `(expected 1 or ${gaps.length} values, got ${tpGaps.length})`,
      );
    }

    return gaps.map((gap, index) => ({
      index,
      gapPercent: gap,
      tpGapPercent:
        tpGaps.length === 0 ? null : tpGaps.length === 1 ? tpGaps[0] : tpGaps[index],
      allocationRatio: weights[index].div(totalWeight),
      entryClientOrderId: null,
      tpClientOrderId: null,
      inventoryQty: new Decimal(0),
      avgEntryPrice: null,
    }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Market data helpers
  // ──────────────────────────────────────────────────────────────────────────

  private updateOrderBook(orderbook?: OrderBook): void {
    if (!orderbook) return;
    const bestBid = orderbook.bids?.[0]?.[0];
    const bestAsk = orderbook.asks?.[0]?.[0];
    if (bestBid && bestBid.gt(0)) this.lastBid = bestBid;
    if (bestAsk && bestAsk.gt(0)) this.lastAsk = bestAsk;
    if ((bestBid && bestBid.gt(0)) || (bestAsk && bestAsk.gt(0))) {
      this.lastOrderBookReceivedAt = Date.now();
    }
  }

  private isOrderBookStale(): boolean {
    if (!this.lastBid) return true;
    return Date.now() - this.lastOrderBookReceivedAt > this.orderBookStaleMs;
  }

  private computeRangePercent(kline: Kline): Decimal | null {
    if (!kline.low || kline.low.lte(0)) return null;
    return kline.high.sub(kline.low).div(kline.low).mul(100);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Inventory accounting
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Remaining (unfilled) quantity of all open + in-flight BUY orders.
   * Together with filled inventory this forms the worst-case inventory used
   * to enforce maxInventory ("including open long orders").
   */
  private getPendingBuyRemaining(): Decimal {
    let total = new Decimal(0);
    for (const order of this.orders.values()) {
      if (order.side !== OrderSide.BUY) continue;
      if (
        order.status !== OrderStatus.NEW &&
        order.status !== OrderStatus.PARTIALLY_FILLED
      ) {
        continue;
      }
      const executed = order.executedQuantity || new Decimal(0);
      const remaining = order.quantity.sub(executed);
      if (remaining.gt(0)) total = total.add(remaining);
    }

    // In-flight orders generated by the strategy but not yet confirmed by the exchange
    for (const clientId of this.pendingClientOrderIds) {
      if (this.orders.has(clientId)) continue;
      const metadata = this.orderMetadataMap.get(clientId);
      if (
        metadata &&
        metadata.signalType === SignalType.Entry &&
        metadata.side === OrderSide.BUY &&
        metadata.quantity
      ) {
        total = total.add(new Decimal(metadata.quantity));
      }
    }
    return total;
  }

  /** Worst-case remaining inventory capacity in base units. */
  private getRemainingCapacity(): Decimal {
    return this.maxInventory.sub(this.inventoryQty).sub(this.getPendingBuyRemaining());
  }

  /** Effective buying power in quote currency: capital (maxInvestment) * leverage. */
  private getBuyingPower(): Decimal {
    return this.maxInvestment.mul(this.leverage);
  }

  /**
   * Remaining notional of adopted (orphan) TP orders that are not attached to any
   * level (recovered after a restart). Their capital is deployed and must be
   * deducted from the buying power available to new entries.
   */
  private getOrphanTpNotional(): Decimal {
    let total = new Decimal(0);
    for (const [clientOrderId, metadata] of this.orderMetadataMap) {
      if (metadata.signalType !== SignalType.TakeProfit) continue;
      if (metadata.levelIndex !== undefined) continue;
      const order = this.orders.get(clientOrderId);
      if (!order || !order.price) continue;
      if (
        order.status !== OrderStatus.NEW &&
        order.status !== OrderStatus.PARTIALLY_FILLED
      ) {
        continue;
      }
      const remaining = order.quantity.sub(order.executedQuantity || new Decimal(0));
      if (remaining.gt(0)) total = total.add(remaining.mul(order.price));
    }
    return total;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Signal generation
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Encode the level index into the clientOrderId (suffix "L{index}") so that
   * level attribution survives console restarts. Format stays alphanumeric and
   * well under the 32-char exchange limit: E{stratId}D{seq}D{ts}L{level}.
   */
  private generateLevelClientOrderId(type: SignalType, level: GridLevelState): string {
    return `${this.generateClientOrderId(type)}L${level.index}`;
  }

  /** Extract the level index encoded in a clientOrderId, if present. */
  private parseLevelIndexFromClientOrderId(clientOrderId: string): number | undefined {
    const match = /L(\d+)$/.exec(clientOrderId);
    if (!match) return undefined;
    const index = Number(match[1]);
    return index >= 0 && index < this.levels.length ? index : undefined;
  }

  private generateEntrySignal(
    level: GridLevelState,
    price: Decimal,
    quantity: Decimal,
  ): StrategyOrderResult {
    const clientOrderId = this.generateLevelClientOrderId(SignalType.Entry, level);
    const metadata: MMGridSignalMetaData = {
      signalType: SignalType.Entry,
      timestamp: Date.now(),
      clientOrderId,
      side: OrderSide.BUY,
      levelIndex: level.index,
      quantity: quantity.toString(),
      price: price.toString(),
    };
    this.orderMetadataMap.set(clientOrderId, metadata);
    this.pendingClientOrderIds.add(clientOrderId);
    level.entryClientOrderId = clientOrderId;

    return {
      action: 'buy',
      price,
      quantity,
      symbol: this._symbol,
      clientOrderId,
      leverage: this.leverage,
      tradeMode: this.tradeMode,
      reason: `mm_grid_entry_L${level.index}`,
      metadata,
    };
  }

  private generateTakeProfitSignal(
    level: GridLevelState,
    price: Decimal,
    quantity: Decimal,
  ): StrategyOrderResult {
    const clientOrderId = this.generateLevelClientOrderId(SignalType.TakeProfit, level);
    const metadata: MMGridSignalMetaData = {
      signalType: SignalType.TakeProfit,
      timestamp: Date.now(),
      clientOrderId,
      side: OrderSide.SELL,
      levelIndex: level.index,
      quantity: quantity.toString(),
    };
    this.orderMetadataMap.set(clientOrderId, metadata);
    this.pendingClientOrderIds.add(clientOrderId);
    level.tpClientOrderId = clientOrderId;

    return {
      action: 'sell',
      price,
      quantity,
      symbol: this._symbol,
      clientOrderId,
      leverage: this.leverage,
      tradeMode: this.tradeMode,
      reason: `mm_grid_take_profit_L${level.index}`,
      metadata,
    };
  }

  private generateCancelOrderSignal(order: Order): StrategyCancelOrderResult {
    return {
      action: 'cancel',
      orderId: order.id,
      clientOrderId: order.clientOrderId,
      symbol: this._symbol,
      reason: 'cancel',
    };
  }

  /** Cancel by clientOrderId only, for in-flight orders not yet confirmed by the exchange. */
  private generateCancelByClientIdSignal(
    clientOrderId: string,
  ): StrategyCancelOrderResult {
    return {
      action: 'cancel',
      clientOrderId,
      symbol: this._symbol,
      reason: 'cancel',
    };
  }

  /**
   * TP gap resolution precedence:
   * 1. Per-level gap from levelTakeProfitGapsPercent
   * 2. Global takeProfitGapPercent (when > 0)
   * 3. The level's own entry gap (symmetric)
   */
  private getTpGapPercent(level: GridLevelState): Decimal {
    if (level.tpGapPercent) return level.tpGapPercent;
    return this.takeProfitGapPercent.gt(0) ? this.takeProfitGapPercent : level.gapPercent;
  }

  /**
   * Compute the take-profit price for a level: ask1 * (1 + tpGap%), floored at
   * avgEntryPrice * (1 + tpGap%) so a TP fill can never lock in a loss.
   * For recovered inventory with unknown entry price, ask1 alone is used.
   */
  private computeTpPrice(level: GridLevelState): Decimal | null {
    const gapFactor = new Decimal(100).add(this.getTpGapPercent(level)).div(100);
    const entry =
      level.avgEntryPrice && level.avgEntryPrice.gt(0) ? level.avgEntryPrice : null;
    const base =
      this.lastAsk && (!entry || this.lastAsk.gt(entry)) ? this.lastAsk : entry;
    if (!base || base.lte(0)) return null;
    return base.mul(gapFactor);
  }

  /**
   * Place a take-profit order for the level's current inventory (if any).
   */
  private placeTakeProfitForLevel(level: GridLevelState): StrategyResult[] {
    if (level.inventoryQty.lte(0)) return [];
    if (level.tpClientOrderId) return [];
    const tpPrice = this.computeTpPrice(level);
    if (!tpPrice) {
      this._logger.warn(
        `[MMGrid] L${level.index}: cannot compute TP price yet (no entry price or ask); ` +
          'will retry on next orderbook update',
      );
      return [];
    }
    this._logger.debug(
      `[MMGrid] L${level.index}: placing TP ${level.inventoryQty} @ ${tpPrice}`,
    );
    return [this.generateTakeProfitSignal(level, tpPrice, level.inventoryQty)];
  }

  /**
   * Place or refresh entry orders on all idle levels.
   * Called when the volatility signal is (still) active.
   */
  /**
   * True when any entry has filled (inventory held) or any take-profit order
   * (level-attached, in-flight, or adopted) is outstanding. While a cycle is
   * active, existing entry orders must not be re-priced.
   */
  private hasActiveCycle(): boolean {
    if (this.inventoryQty.gt(0)) return true;
    for (const level of this.levels) {
      if (level.tpClientOrderId || level.inventoryQty.gt(0)) return true;
    }
    for (const metadata of this.orderMetadataMap.values()) {
      if (metadata.signalType === SignalType.TakeProfit) return true;
    }
    return false;
  }

  /**
   * Freshest price anchor for entry pricing: live bid1 when the orderbook is
   * fresh, otherwise the provided fallback (kline close at kline close time,
   * TP fill price on re-entry). Null when no usable price exists.
   */
  private resolveEntryAnchor(fallbackAnchor?: Decimal): Decimal | null {
    if (!this.isOrderBookStale() && this.lastBid) return this.lastBid;
    if (fallbackAnchor && fallbackAnchor.gt(0)) {
      this._logger.warn(
        `[MMGrid] Orderbook stale/missing; anchoring entries at fallback price ${fallbackAnchor.toString()}`,
      );
      return fallbackAnchor;
    }
    return null;
  }

  /**
   * Place entries on idle levels. When reprice=true (clean grid: no fills, no
   * open TPs), mispriced existing entries are cancel/replaced at the new bid.
   * When reprice=false, existing entries are never touched - only levels with
   * no entry at all get one.
   */
  private refreshEntries(reprice: boolean, fallbackAnchor?: Decimal): StrategyResult[] {
    const signals: StrategyResult[] = [];
    const anchor = this.resolveEntryAnchor(fallbackAnchor);
    if (!anchor) {
      this._logger.warn('[MMGrid] Skipping entries: no usable price anchor');
      return signals;
    }

    const buyingPower = this.getBuyingPower();
    const markPrice = !this.isOrderBookStale() && this.lastAsk ? this.lastAsk : anchor;

    // Capital already deployed: adopted (orphan) TP orders plus inventory held by levels.
    // New entries may only use the remaining budget, so total exposure never exceeds
    // buying power even right after a restart with recovered inventory.
    let deployed = this.getOrphanTpNotional();
    for (const level of this.levels) {
      if (level.inventoryQty.gt(0)) {
        deployed = deployed.add(level.inventoryQty.mul(level.avgEntryPrice ?? markPrice));
      }
    }

    for (const level of this.levels) {
      // A level with inventory awaiting TP does not re-enter (its capital is deployed)
      if (level.tpClientOrderId || level.inventoryQty.gt(0)) continue;

      const desiredPrice = anchor.mul(new Decimal(100).sub(level.gapPercent)).div(100);
      if (desiredPrice.lte(0)) continue;

      // Existing entries are left untouched until they fill, unless a full
      // re-anchor is allowed (reprice=true: clean grid at kline close) and the
      // price no longer matches. In-flight orders compare against the requested
      // price stored in metadata to avoid needless cancel/replace churn.
      if (level.entryClientOrderId) {
        const existing = this.orders.get(level.entryClientOrderId);
        const metadata = this.orderMetadataMap.get(level.entryClientOrderId);
        const currentPrice =
          existing?.price ?? (metadata?.price ? new Decimal(metadata.price) : null);
        if (!reprice || (currentPrice && currentPrice.eq(desiredPrice))) {
          // Keep the order: its notional stays deployed
          deployed = deployed.add(this.getOpenEntryNotional(level));
          continue;
        }
        signals.push(
          existing
            ? this.generateCancelOrderSignal(existing)
            : this.generateCancelByClientIdSignal(level.entryClientOrderId),
        );
        this.clearOrderTracking(level.entryClientOrderId);
        level.entryClientOrderId = null;
      }

      // Sizing: buying power = capital (maxInvestment) * leverage, split by allocation,
      // capped by the budget not yet deployed elsewhere.
      const budget = buyingPower.sub(deployed);
      const targetNotional = Decimal.min(buyingPower.mul(level.allocationRatio), budget);
      if (targetNotional.lte(0)) {
        this._logger.debug(
          `[MMGrid] L${level.index}: skipped (buying power exhausted, deployed=${deployed})`,
        );
        continue;
      }
      const targetQty = targetNotional.div(desiredPrice);
      // getRemainingCapacity already accounts for signals generated in this loop,
      // because each generated entry is registered as an in-flight pending order.
      const capacity = this.getRemainingCapacity();
      const quantity = Decimal.min(targetQty, capacity);
      if (quantity.lte(0)) {
        this._logger.debug(
          `[MMGrid] L${level.index}: skipped (inventory capacity exhausted: ${capacity})`,
        );
        continue;
      }

      signals.push(this.generateEntrySignal(level, desiredPrice, quantity));
      deployed = deployed.add(quantity.mul(desiredPrice));
      this._logger.debug(
        `[MMGrid] L${level.index}: entry BUY ${quantity} @ ${desiredPrice} (gap ${level.gapPercent}%)`,
      );
    }
    return signals;
  }

  /** Remaining notional of a level's open (or in-flight) entry order. */
  private getOpenEntryNotional(level: GridLevelState): Decimal {
    if (!level.entryClientOrderId) return new Decimal(0);
    const existing = this.orders.get(level.entryClientOrderId);
    if (existing?.price) {
      const remaining = existing.quantity.sub(
        existing.executedQuantity || new Decimal(0),
      );
      return remaining.gt(0) ? remaining.mul(existing.price) : new Decimal(0);
    }
    const metadata = this.orderMetadataMap.get(level.entryClientOrderId);
    if (metadata?.price && metadata?.quantity) {
      return new Decimal(metadata.quantity).mul(new Decimal(metadata.price));
    }
    return new Decimal(0);
  }

  /**
   * Re-enter a single freed level (after its TP filled) WITHOUT touching the
   * other levels' open entries. Those are re-anchored only at kline close,
   * keeping order churn low. Budget and inventory caps still account for all
   * other levels' deployed capital and open orders.
   */
  private placeEntryForSingleLevel(
    level: GridLevelState,
    fallbackAnchor?: Decimal,
  ): StrategyResult[] {
    const anchor = this.resolveEntryAnchor(fallbackAnchor);
    if (!anchor) return [];
    if (level.tpClientOrderId || level.inventoryQty.gt(0) || level.entryClientOrderId) {
      return [];
    }

    const desiredPrice = anchor.mul(new Decimal(100).sub(level.gapPercent)).div(100);
    if (desiredPrice.lte(0)) return [];

    const buyingPower = this.getBuyingPower();
    const markPrice = !this.isOrderBookStale() && this.lastAsk ? this.lastAsk : anchor;
    let deployed = this.getOrphanTpNotional();
    for (const other of this.levels) {
      if (other.inventoryQty.gt(0)) {
        deployed = deployed.add(other.inventoryQty.mul(other.avgEntryPrice ?? markPrice));
      }
      if (other !== level) {
        deployed = deployed.add(this.getOpenEntryNotional(other));
      }
    }

    const budget = buyingPower.sub(deployed);
    const targetNotional = Decimal.min(buyingPower.mul(level.allocationRatio), budget);
    if (targetNotional.lte(0)) {
      this._logger.debug(
        `[MMGrid] L${level.index}: re-entry skipped (buying power exhausted, deployed=${deployed})`,
      );
      return [];
    }
    const quantity = Decimal.min(
      targetNotional.div(desiredPrice),
      this.getRemainingCapacity(),
    );
    if (quantity.lte(0)) return [];

    this._logger.debug(
      `[MMGrid] L${level.index}: re-entry BUY ${quantity} @ ${desiredPrice} after TP fill`,
    );
    return [this.generateEntrySignal(level, desiredPrice, quantity)];
  }

  /** Cancel all open, unfilled entry orders (take-profits are left untouched). */
  private cancelOpenEntries(): StrategyResult[] {
    const signals: StrategyResult[] = [];
    for (const level of this.levels) {
      if (!level.entryClientOrderId) continue;
      const existing = this.orders.get(level.entryClientOrderId);
      signals.push(
        existing
          ? this.generateCancelOrderSignal(existing)
          : this.generateCancelByClientIdSignal(level.entryClientOrderId),
      );
      this.clearOrderTracking(level.entryClientOrderId);
      level.entryClientOrderId = null;
    }
    return signals;
  }

  private clearOrderTracking(clientOrderId: string): void {
    this.orders.delete(clientOrderId);
    this.orderMetadataMap.delete(clientOrderId);
    this.pendingClientOrderIds.delete(clientOrderId);
    this.processedQuantityMap.delete(clientOrderId);
  }

  private evaluateKline(kline: Kline): StrategyResult[] {
    const rangePercent = this.computeRangePercent(kline);
    if (!rangePercent) return [];
    this.lastRangePercent = rangePercent;
    this.signalActive = rangePercent.gte(this.minRangePercent);

    this._logger.debug(
      `[MMGrid] Kline closed (${kline.openTime.toISOString()}): range=${rangePercent.toFixed(4)}% ` +
        `threshold=${this.minRangePercent}% -> signal ${this.signalActive ? 'ACTIVE' : 'inactive'}`,
    );

    if (!this.signalActive) {
      // Quiet kline: keep every entry order untouched. The previous behaviour
      // cancelled all open entries here, which on low-volatility symbols (e.g.
      // WLD with 0.65%/4.35%/12.5% gaps on a 15m interval) meant entries were
      // churned every cycle and rarely filled. With wide gaps like ours, price
      // rarely revisits the levels within a single kline interval, so the
      // orders must be left in place to have any chance of filling.
      // Re-pricing only resumes on the next ACTIVE kline, and only when the
      // grid is clean (no fills, no outstanding TPs) - see hasActiveCycle().
      return [];
    }
    // Full re-anchoring of existing entries only when the grid is clean:
    // no entry has filled and no take-profit order is outstanding.
    // The just-closed kline's close price is the fallback anchor when the
    // orderbook stream is unavailable.
    return this.refreshEntries(!this.hasActiveCycle(), kline.close);
  }

  /**
   * Fallback cost basis for recovered inventory when no position data is
   * available: the latest recovered entry order's average/limit price.
   * Returns null when nothing usable exists (caller prices off ask1).
   */
  private resolveEntryOrderCostBasis(ownedOrders: Order[]): Decimal | null {
    let latestEntry: Order | null = null;
    for (const order of ownedOrders) {
      if (!order.clientOrderId || !order.clientOrderId.startsWith('E')) continue;
      const orderTime = (order.updateTime || order.timestamp)?.getTime() ?? 0;
      const latestTime =
        (latestEntry?.updateTime || latestEntry?.timestamp)?.getTime() ?? -1;
      if (orderTime > latestTime) latestEntry = order;
    }
    if (latestEntry) {
      const executed = latestEntry.executedQuantity || new Decimal(0);
      const price = executed.gt(0)
        ? latestEntry.averagePrice || latestEntry.price
        : latestEntry.price;
      if (price && price.gt(0)) return price;
    }
    return null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  public override async processInitialData(
    initialData: InitialDataResult,
  ): Promise<StrategyAnalyzeResult> {
    const signals: StrategyResult[] = [];
    this.updateOrderBook(initialData.orderBook);

    // Bootstrap filled inventory from SQL net position (long-only: clamp at 0)
    if (initialData.strategyNetPosition !== undefined) {
      this.inventoryQty = Decimal.max(initialData.strategyNetPosition, new Decimal(0));
      this._logger.info(
        `✅ [MMGrid] Initialized inventory from SQL net position: ${this.inventoryQty.toString()}`,
      );
    }

    // Adopt owned open orders: keep take-profits, cancel stale entries (they will be
    // re-placed on the next valid signal at fresh prices).
    let adoptedTpRemaining = new Decimal(0);
    let ownedOrders: Order[] = [];
    if (initialData.openOrders) {
      ownedOrders = initialData.openOrders.filter((order) => {
        if (order.symbol !== this._context.symbol) return false;
        const isIdMatch =
          order.strategyId && String(order.strategyId) === String(this.getStrategyId());
        const isClientOrderMatch =
          order.clientOrderId && this.isStrategyOrderId(order.clientOrderId);
        return Boolean(isIdMatch || isClientOrderMatch);
      });

      // Pass 1: adopt take-profit orders. When the level index is encoded in the
      // clientOrderId, re-attach the TP (and its inventory) to that level so the
      // level is correctly blocked from re-entering and its capital is accounted
      // per-level. Legacy TPs without a level suffix stay as orphans.
      for (const order of ownedOrders) {
        if (!order.clientOrderId || !order.clientOrderId.startsWith('T')) continue;
        const metadata = this.ensureRecoveredMetadata(order);
        if (!metadata) continue;

        this.orders.set(order.clientOrderId, order);
        this.pendingClientOrderIds.add(order.clientOrderId);
        const executed = order.executedQuantity || new Decimal(0);
        if (executed.gt(0)) {
          this.processedQuantityMap.set(order.clientOrderId, executed);
        }
        const remaining = order.quantity.sub(executed);
        if (remaining.gt(0)) {
          adoptedTpRemaining = adoptedTpRemaining.add(remaining);
        }

        const level = this.findLevel(metadata);
        if (level && !level.tpClientOrderId && remaining.gt(0)) {
          level.tpClientOrderId = order.clientOrderId;
          level.inventoryQty = level.inventoryQty.add(remaining);
          // Derive the cost basis from the TP's own price so a re-placed TP
          // (after external cancel) is never listed below break-even.
          if (order.price && order.price.gt(0)) {
            const gapFactor = new Decimal(100).add(this.getTpGapPercent(level)).div(100);
            level.avgEntryPrice = order.price.div(gapFactor);
          }
          this._logger.info(
            `[MMGrid] Re-attached open TP ${order.clientOrderId} to L${level.index} ` +
              `(${remaining} @ ${order.price})`,
          );
        } else {
          // Orphan accounting requires levelIndex to be unset
          metadata.levelIndex = undefined;
          this._logger.info(
            `[MMGrid] Adopted open TP order ${order.clientOrderId} as orphan ` +
              `(${order.quantity} @ ${order.price})`,
          );
        }
      }

      // Pass 2: adopt entry orders. Entries with a recoverable level whose level
      // is free are KEPT (not canceled) - they simply resume their cycle. Only
      // unattributable/conflicting entries are canceled and re-placed on the
      // next valid signal.
      for (const order of ownedOrders) {
        if (!order.clientOrderId || order.clientOrderId.startsWith('T')) continue;
        const metadata = this.ensureRecoveredMetadata(order);
        const level = metadata ? this.findLevel(metadata) : undefined;

        if (
          metadata &&
          level &&
          !level.tpClientOrderId &&
          level.inventoryQty.lte(0) &&
          !level.entryClientOrderId
        ) {
          this.orders.set(order.clientOrderId, order);
          this.pendingClientOrderIds.add(order.clientOrderId);
          const executed = order.executedQuantity || new Decimal(0);
          if (executed.gt(0)) {
            this.processedQuantityMap.set(order.clientOrderId, executed);
          }
          level.entryClientOrderId = order.clientOrderId;
          this._logger.info(
            `[MMGrid] Kept open entry ${order.clientOrderId} on L${level.index} ` +
              `(${order.quantity} @ ${order.price})`,
          );
        } else {
          signals.push(this.generateCancelOrderSignal(order));
          this._logger.info(
            `[MMGrid] Cancelling unattributable entry order ${order.clientOrderId} on restart`,
          );
        }
      }
    }

    // Recovery TP: inventory not covered by any adopted TP order (e.g. an entry
    // filled while the strategy was down). The exchange position is authoritative:
    // - long position exists  -> list the sellable excess with basis = avgPrice
    // - position data says none -> the SQL-derived inventory is phantom (position
    //   was closed externally); DROP it so we never sell into a short.
    // - no position data at all -> fall back to entry-order/ask pricing.
    const uncovered = this.inventoryQty.sub(adoptedTpRemaining);
    if (uncovered.gt(0) && this.levels.length > 0) {
      const hasPositionData = initialData.positions !== undefined;
      const longPosition = initialData.positions?.find(
        (p) => p.symbol === this._symbol && p.side === 'long' && p.quantity.gt(0),
      );

      let recoveryQty = uncovered;
      let basis: Decimal | null = null;

      if (longPosition) {
        basis = longPosition.avgPrice.gt(0) ? longPosition.avgPrice : null;
        // Never list more than the exchange actually holds beyond adopted TPs
        const sellableExcess = Decimal.max(
          longPosition.quantity.sub(adoptedTpRemaining),
          new Decimal(0),
        );
        recoveryQty = Decimal.min(uncovered, sellableExcess);
      } else if (hasPositionData) {
        recoveryQty = new Decimal(0);
      } else {
        basis = this.resolveEntryOrderCostBasis(ownedOrders);
      }

      // Drop phantom inventory the exchange does not hold, so it neither opens a
      // short via TP nor blocks capacity/budget for new entries.
      const dropped = uncovered.sub(recoveryQty);
      if (dropped.gt(0)) {
        this.inventoryQty = Decimal.max(this.inventoryQty.sub(dropped), new Decimal(0));
        this._logger.warn(
          `[MMGrid] Dropping ${dropped.toString()} phantom inventory not backed by ` +
            `an exchange position (position: ${longPosition ? longPosition.quantity.toString() : 'none'})`,
        );
      }

      if (recoveryQty.gt(0)) {
        // Prefer the tightest level that is not already managing an attached TP
        const recoveryLevel =
          this.levels.find((l) => !l.tpClientOrderId) ?? this.levels[0];
        recoveryLevel.inventoryQty = recoveryLevel.inventoryQty.add(recoveryQty);
        if (basis) {
          recoveryLevel.avgEntryPrice = recoveryLevel.avgEntryPrice
            ? Decimal.max(recoveryLevel.avgEntryPrice, basis)
            : basis;
        }
        this._logger.warn(
          `[MMGrid] Recovered ${recoveryQty.toString()} uncovered inventory; ` +
            `attaching to L${recoveryLevel.index} for take-profit ` +
            `(cost basis: ${basis ? basis.toString() : 'unknown, using ask1'})`,
        );
        signals.push(...this.placeTakeProfitForLevel(recoveryLevel));
      }
    }

    // Evaluate the most recent closed kline of our interval so the strategy can act
    // immediately instead of waiting up to a full interval.
    const initialKlines = initialData.klines?.[this.klineInterval as KlineInterval];
    if (initialKlines && initialKlines.length > 0) {
      const closed = initialKlines.filter((k) => k.isClosed !== false);
      const lastClosed = closed[closed.length - 1];
      if (lastClosed) {
        this.lastProcessedKlineOpenTime = lastClosed.openTime.getTime();
        signals.push(...this.evaluateKline(lastClosed));
      }
    }

    return signals.length > 0 ? signals : { action: 'hold' };
  }

  public override async analyze(dataUpdate: DataUpdate): Promise<StrategyAnalyzeResult> {
    const signals: StrategyResult[] = [];

    if (dataUpdate.orderbook) {
      // The engine fans out every orderbook event to every strategy; only ingest
      // books for our own symbol (and exchange, when provided) so another
      // strategy's market data can never contaminate our bid/ask.
      const obSymbol = dataUpdate.orderbook.symbol || dataUpdate.symbol;
      const sameSymbol = !obSymbol || obSymbol === this._symbol;
      const sameExchange =
        !dataUpdate.exchangeName || dataUpdate.exchangeName === this._exchangeName;
      if (sameSymbol && sameExchange) {
        this.updateOrderBook(dataUpdate.orderbook);
      }
    }

    if (dataUpdate.orders && dataUpdate.orders.length > 0) {
      signals.push(...this.handleOrderUpdates(dataUpdate.orders));
    }

    if (dataUpdate.klines && dataUpdate.klines.length > 0) {
      for (const kline of dataUpdate.klines) {
        if (kline.symbol !== this._symbol) continue;
        if (String(kline.interval) !== this.klineInterval) continue;
        if (kline.isClosed === false) continue;
        const openTime = kline.openTime.getTime();
        if (openTime <= this.lastProcessedKlineOpenTime) continue;
        this.lastProcessedKlineOpenTime = openTime;
        signals.push(...this.evaluateKline(kline));
      }
    }

    // Self-heal: any level holding inventory without a working TP (and no entry in
    // progress) gets its TP re-placed. Covers recovery inventory attached before the
    // orderbook was available and TP placements that previously failed.
    if (!this.isOrderBookStale()) {
      for (const level of this.levels) {
        if (
          level.inventoryQty.gt(0) &&
          !level.tpClientOrderId &&
          !level.entryClientOrderId
        ) {
          signals.push(...this.placeTakeProfitForLevel(level));
        }
      }
    }

    return signals.length > 0 ? signals : { action: 'hold' };
  }

  public override async onOrderCreated(order: Order): Promise<void> {
    if (!order.clientOrderId) return;
    if (this.orders.has(order.clientOrderId)) return;
    const metadata =
      this.orderMetadataMap.get(order.clientOrderId) ??
      this.ensureRecoveredMetadata(order);
    if (!metadata) return;
    this.orders.set(order.clientOrderId, order);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Order update handling
  // ──────────────────────────────────────────────────────────────────────────

  private isTerminalStatus(status: OrderStatus): boolean {
    return (
      status === OrderStatus.CANCELED ||
      status === OrderStatus.REJECTED ||
      status === OrderStatus.EXPIRED
    );
  }

  private getOrderStatusRank(status?: OrderStatus): number {
    switch (status) {
      case OrderStatus.NEW:
        return 1;
      case OrderStatus.PARTIALLY_FILLED:
        return 2;
      case OrderStatus.FILLED:
        return 3;
      case OrderStatus.CANCELED:
      case OrderStatus.REJECTED:
      case OrderStatus.EXPIRED:
        return 4;
      default:
        return 0;
    }
  }

  private findLevel(metadata: MMGridSignalMetaData): GridLevelState | undefined {
    if (metadata.levelIndex === undefined) return undefined;
    return this.levels[metadata.levelIndex];
  }

  /**
   * Apply the incremental (not yet processed) fill quantity of an order.
   * Returns the incremental quantity applied.
   */
  private applyIncrementalFill(order: Order, metadata: MMGridSignalMetaData): Decimal {
    const clientOrderId = order.clientOrderId!;
    const executed = order.executedQuantity || new Decimal(0);
    const previous = this.processedQuantityMap.get(clientOrderId) || new Decimal(0);
    const increment = executed.sub(previous);
    if (increment.lte(0)) return new Decimal(0);
    this.processedQuantityMap.set(clientOrderId, executed);

    const fillPrice = order.averagePrice || order.price;
    // Recovered entry orders carry no level attribution; attach their fills to the
    // tightest level so the inventory is managed (TP'd) rather than orphaned.
    const level =
      this.findLevel(metadata) ??
      (metadata.signalType === SignalType.Entry ? this.levels[0] : undefined);

    if (metadata.signalType === SignalType.Entry) {
      this.inventoryQty = this.inventoryQty.add(increment);
      if (level) {
        // Volume-weighted average entry price for the level's inventory
        if (level.avgEntryPrice && level.inventoryQty.gt(0) && fillPrice) {
          const totalCost = level.avgEntryPrice
            .mul(level.inventoryQty)
            .add(fillPrice.mul(increment));
          level.inventoryQty = level.inventoryQty.add(increment);
          level.avgEntryPrice = totalCost.div(level.inventoryQty);
        } else {
          level.inventoryQty = level.inventoryQty.add(increment);
          level.avgEntryPrice = fillPrice || level.avgEntryPrice;
        }
      }
    } else {
      // TakeProfit SELL fill reduces inventory
      this.inventoryQty = Decimal.max(this.inventoryQty.sub(increment), new Decimal(0));
      if (level) {
        level.inventoryQty = Decimal.max(
          level.inventoryQty.sub(increment),
          new Decimal(0),
        );
      }
    }
    return increment;
  }

  private handleOrderUpdates(orders: Order[]): StrategyResult[] {
    const signals: StrategyResult[] = [];

    for (const order of orders) {
      if (!order.clientOrderId) continue;
      if (this.processedFillIds.has(order.clientOrderId)) continue;
      // Ignore any replayed update for an order whose terminal status was already processed
      if (this.processedTerminalIds.has(order.clientOrderId)) continue;

      const metadata =
        this.orderMetadataMap.get(order.clientOrderId) ??
        this.ensureRecoveredMetadata(order);
      if (!metadata) continue;

      // Ignore stale updates (older timestamp and no progress)
      const existingOrder = this.orders.get(order.clientOrderId);
      if (existingOrder && existingOrder.updateTime && order.updateTime) {
        const existingExecuted = existingOrder.executedQuantity || new Decimal(0);
        const incomingExecuted = order.executedQuantity || new Decimal(0);
        const isProgressUpdate =
          this.getOrderStatusRank(order.status) >
            this.getOrderStatusRank(existingOrder.status) ||
          incomingExecuted.gt(existingExecuted);
        if (
          existingOrder.updateTime.getTime() > order.updateTime.getTime() &&
          !isProgressUpdate
        ) {
          continue;
        }
      }

      this.orders.set(order.clientOrderId, order);
      const level = this.findLevel(metadata);

      if (metadata.signalType === SignalType.Entry) {
        // Terminal statuses can also carry a final executedQuantity (e.g. a cancel
        // acknowledgment that includes fills we never saw as PARTIALLY_FILLED).
        if (
          order.status === OrderStatus.PARTIALLY_FILLED ||
          order.status === OrderStatus.FILLED ||
          this.isTerminalStatus(order.status)
        ) {
          this.applyIncrementalFill(order, metadata);
        }

        // Recovered entries without level attribution fall back to the tightest
        // level (their fills were attached there by applyIncrementalFill).
        const entryLevel = level ?? this.levels[0];

        if (order.status === OrderStatus.FILLED) {
          this.processedFillIds.add(order.clientOrderId);
          if (level && level.entryClientOrderId === order.clientOrderId) {
            level.entryClientOrderId = null;
          }
          signals.push(...this.placeTakeProfitForLevel(entryLevel));
          this.clearFilledOrderTracking(order.clientOrderId);
        } else if (this.isTerminalStatus(order.status)) {
          // Canceled/rejected/expired entry: if it partially filled, still take profit
          // on the acquired inventory.
          this.processedTerminalIds.add(order.clientOrderId);
          if (level && level.entryClientOrderId === order.clientOrderId) {
            level.entryClientOrderId = null;
          }
          signals.push(...this.placeTakeProfitForLevel(entryLevel));
          this.clearOrderTracking(order.clientOrderId);
        }
      } else if (metadata.signalType === SignalType.TakeProfit) {
        if (
          order.status === OrderStatus.PARTIALLY_FILLED ||
          order.status === OrderStatus.FILLED ||
          this.isTerminalStatus(order.status)
        ) {
          this.applyIncrementalFill(order, metadata);
        }

        if (order.status === OrderStatus.FILLED) {
          this.processedFillIds.add(order.clientOrderId);
          if (level) {
            level.tpClientOrderId = null;
            level.avgEntryPrice = null;
            // Level cycle complete: re-enter ONLY this level if the signal is still
            // active. Other levels' open entries stay untouched until kline close.
            // The TP fill price is the fallback anchor if the orderbook is stale.
            if (this.signalActive) {
              const fillPrice = order.averagePrice || order.price || undefined;
              signals.push(...this.placeEntryForSingleLevel(level, fillPrice));
            }
          }
          this.clearFilledOrderTracking(order.clientOrderId);
        } else if (this.isTerminalStatus(order.status)) {
          this.processedTerminalIds.add(order.clientOrderId);
          this.clearOrderTracking(order.clientOrderId);
          if (level) {
            level.tpClientOrderId = null;
            // TP was canceled externally but inventory remains: re-place it
            signals.push(...this.placeTakeProfitForLevel(level));
          } else {
            // Adopted (orphan) TP canceled: re-attach its unfilled remainder to the
            // tightest level so the inventory is re-listed for take-profit.
            const remaining = order.quantity.sub(
              order.executedQuantity || new Decimal(0),
            );
            if (remaining.gt(0) && this.levels.length > 0) {
              const recoveryLevel = this.levels[0];
              recoveryLevel.inventoryQty = recoveryLevel.inventoryQty.add(remaining);
              // Derive a cost basis from the canceled TP's own price so the new TP
              // is never listed below the old one (avoids selling at a loss).
              if (order.price && order.price.gt(0)) {
                const gapFactor = new Decimal(100)
                  .add(this.getTpGapPercent(recoveryLevel))
                  .div(100);
                const derivedBasis = order.price.div(gapFactor);
                recoveryLevel.avgEntryPrice = recoveryLevel.avgEntryPrice
                  ? Decimal.max(recoveryLevel.avgEntryPrice, derivedBasis)
                  : derivedBasis;
              }
              this._logger.warn(
                `[MMGrid] Adopted TP ${order.clientOrderId} was ${order.status}; ` +
                  `re-listing ${remaining.toString()} via L${recoveryLevel.index}`,
              );
              signals.push(...this.placeTakeProfitForLevel(recoveryLevel));
            }
          }
        }
      }
    }

    return signals;
  }

  private clearFilledOrderTracking(clientOrderId: string): void {
    this.orders.delete(clientOrderId);
    this.orderMetadataMap.delete(clientOrderId);
    this.pendingClientOrderIds.delete(clientOrderId);
    this.processedQuantityMap.delete(clientOrderId);
  }

  private ensureRecoveredMetadata(order: Order): MMGridSignalMetaData | undefined {
    if (!order.clientOrderId || !this.isStrategyOrderId(order.clientOrderId)) {
      return undefined;
    }
    const signalType = order.clientOrderId.startsWith('T')
      ? SignalType.TakeProfit
      : SignalType.Entry;
    const metadata: MMGridSignalMetaData = {
      signalType,
      timestamp: Date.now(),
      clientOrderId: order.clientOrderId,
      side: order.side,
      // Level attribution encoded in the clientOrderId suffix (L{index});
      // undefined for legacy orders placed before suffixing was introduced.
      levelIndex: this.parseLevelIndexFromClientOrderId(order.clientOrderId),
      quantity: order.quantity.toString(),
      price: order.price?.toString(),
    };
    this.orderMetadataMap.set(order.clientOrderId, metadata);
    return metadata;
  }

  private isStrategyOrderId(clientOrderId: string): boolean {
    const strategyId = this.getStrategyId();
    if (!strategyId) return false;
    const match = /^(E|T)(\d+)D/.exec(clientOrderId);
    return !!match && String(match[2]) === String(strategyId);
  }

  protected async onCleanup(): Promise<void> {
    this.orders.clear();
    this.orderMetadataMap.clear();
    this.pendingClientOrderIds.clear();
    this.processedFillIds.clear();
    this.processedQuantityMap.clear();
    this.processedTerminalIds.clear();
    this.inventoryQty = new Decimal(0);
    this.signalActive = false;
    this.lastRangePercent = null;
    this.lastProcessedKlineOpenTime = 0;
    for (const level of this.levels) {
      level.entryClientOrderId = null;
      level.tpClientOrderId = null;
      level.inventoryQty = new Decimal(0);
      level.avgEntryPrice = null;
    }
    this._logger.debug('🧹 [MMGrid] Strategy cleaned up');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Monitoring / configuration
  // ──────────────────────────────────────────────────────────────────────────

  public getStrategyState() {
    return {
      strategyId: this.getStrategyId(),
      signalActive: this.signalActive,
      lastRangePercent: this.lastRangePercent?.toString() ?? null,
      minRangePercent: this.minRangePercent.toString(),
      klineInterval: this.klineInterval,
      inventoryQty: this.inventoryQty.toString(),
      pendingBuyRemaining: this.getPendingBuyRemaining().toString(),
      maxInventory: this.maxInventory.toString(),
      remainingCapacity: this.getRemainingCapacity().toString(),
      maxInvestment: this.maxInvestment.toString(),
      leverage: this.leverage,
      buyingPower: this.getBuyingPower().toString(),
      orphanTpNotional: this.getOrphanTpNotional().toString(),
      lastBid: this.lastBid?.toString() ?? null,
      lastAsk: this.lastAsk?.toString() ?? null,
      levels: this.levels.map((level) => ({
        index: level.index,
        gapPercent: level.gapPercent.toString(),
        tpGapPercent: this.getTpGapPercent(level).toString(),
        allocationRatio: level.allocationRatio.toString(),
        entryClientOrderId: level.entryClientOrderId,
        tpClientOrderId: level.tpClientOrderId,
        inventoryQty: level.inventoryQty.toString(),
        avgEntryPrice: level.avgEntryPrice?.toString() ?? null,
      })),
    };
  }

  public override getSubscriptionConfig() {
    return {
      klines: {
        enabled: true,
        intervals: [this.klineInterval],
      },
      orderbook: { enabled: true, depth: 5 },
      method: 'websocket' as const,
      exchange: this._context.exchange,
    };
  }

  public override getInitialDataConfig() {
    return {
      klines: { [this.klineInterval]: 3 },
      fetchPositions: true,
      fetchOpenOrders: true,
      fetchBalance: true,
      fetchOrderBook: { enabled: true, depth: 5 },
      fetchStrategyNetPosition: true,
    };
  }
}
