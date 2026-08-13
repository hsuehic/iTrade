import {
  BaseStrategy,
  StrategyResult,
  StrategyOrderResult,
  StrategyUpdateOrderResult,
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
} from '@itrade/core';
import Decimal from 'decimal.js';
import { StrategyRegistryConfig } from '../type';
import { silentLogger } from '../utils/silent-logger';

/**
 * 📗 LadderEntrySingleTPStrategy parameters
 *
 * Ladder entry with single take-profit strategy:
 * - Entry: Uses bid0 (or fixed basePrice) as reference, places BUY limit orders one at a time in sequential ladder steps (arithmetic: base - stepValue * (i+1), or geometric: base * (1 - stepValue/100)^(i+1)).
 * - Take profit: The strategy always has at most ONE TP SELL limit order
 *         TP condition can be a fixed profit amount (in quote currency) or a percentage
 *         TP order is updated immediately whenever a new entry fills (including partial fills)
 * - Risk control: Max investment (quote) and max position (base) — only counts orders from this strategy
 * - Cycle: On TP fully filled → cancel all remaining entries → rebuild ladder with latest bid0 → start new cycle
 *
 * Edge/Corner case handling:
 * - Stop/restart/service restart: processInitialData recovers all strategy orders via REST fetchOpenOrders,
 *   recalculateVWAP rebuilds inventory/VWAP, re-places TP and unfilled entry ladder steps
 * - Delayed/out-of-order order pushes: processedQuantityMap + processedTerminalIds for dedup,
 *   updateTime comparison skips stale updates, recalculateVWAP recomputes from all orders (idempotent)
 * - Entry partial fill: Recalculate VWAP → debounce TP refresh (2s window, full FILLED bypasses debounce)
 * - TP partial fill: No action taken (TP order state managed by exchange, strategy does not intervene)
 * - Entry cancelled unfilled: Allows re-placement
 * - Entry cancelled with partial fill: Preserve partial-fill inventory, refresh TP, advance to next step
 * - TP fully filled: Cancel all pending entries → cancel all pending TP → reset → rebuild ladder
 */
export interface LadderEntrySingleTPParameters extends StrategyParameters {
  /**
   * Reference price. 0 = use orderbook bid0 as reference (fetched via REST on strategy start / each cycle restart).
   * >0 = use fixed price, no orderbook needed.
   */
  basePrice: number;

  /** Number of ladder steps (levels) */
  ladderSteps: number;

  /** Step type: 'arithmetic' or 'geometric' */
  stepType: 'arithmetic' | 'geometric';

  /** Step value for ladder. For arithmetic: absolute price drop per step (e.g. 300 = 300 USDT below base per step). For geometric: percentage ratio per step (e.g. 0.62 = 0.62% ratio per step) */
  stepValue: number;

  /** Quantity type: 'arithmetic' or 'geometric' */
  qtyType: 'arithmetic' | 'geometric';

  /** Base quantity per step (in base currency, e.g. 0.01 BTC) */
  qtyPerStep: number;

  /** Arithmetic qty addition per step: qty[i] = qtyPerStep + qtyStepAdd * i */
  qtyStepAdd: number;

  /** Geometric qty ratio per step: qty[i] = qtyPerStep * qtyStepRatio^i */
  qtyStepRatio: number;

  /** Take profit condition type: 'absolute' (fixed quote profit) or 'percent' (percentage of VWAP) */
  tpType: 'absolute' | 'percent';

  /** For tpType='absolute': target profit in quote currency (e.g. 100 USDT) */
  tpAbsoluteProfit: number;

  /** For tpType='percent': target profit percentage (e.g. 1 = 1%) */
  tpPercent: number;

  /** Maximum total investment in quote currency (margin budget). Buying power = maxInvestment * leverage */
  maxInvestment: number;

  /** Maximum position size in base currency (including open BUY orders from this strategy) */
  maxPosition: number;

  /** Leverage for futures trading */
  leverage?: number;

  /**
   * Reset interval in minutes.
   * When the strategy has only entry 0 (status=NEW, unfilled) and the specified
   * time has elapsed since entry 0 was placed, the strategy cancels entry 0,
   * re-fetches the orderbook, rebuilds the ladder with the fresh bid0, and
   * places a new entry 0.
   * 0 = never reset (keep entry 0 until it fills or market triggers other actions).
   */
  resetInterval: number;
}

export const LadderEntrySingleTPStrategyRegistryConfig: StrategyRegistryConfig<LadderEntrySingleTPParameters> =
  {
    type: 'LadderEntrySingleTPStrategy',
    name: 'Ladder Entry Single TP',
    description:
      'Ladder entry with single take-profit strategy. Supports arithmetic/geometric ladder prices and quantities, ' +
      'TP condition supports fixed profit amount or percentage. TP order is updated immediately on each entry fill. ' +
      'Cancels remaining entries and starts a new cycle when TP is fully filled.',
    icon: '📗',
    implemented: true,
    category: 'volatility',
    defaultParameters: {
      basePrice: 0,
      ladderSteps: 5,
      stepType: 'arithmetic',
      stepValue: 1,
      qtyType: 'arithmetic',
      qtyPerStep: 0.1,
      qtyStepAdd: 0,
      qtyStepRatio: 1,
      tpType: 'percent',
      tpAbsoluteProfit: 100,
      tpPercent: 1,
      maxInvestment: 1000,
      maxPosition: 10,
      leverage: 10,
      resetInterval: 0,
    },
    parameterDefinitions: [
      {
        name: 'basePrice',
        type: 'number',
        description:
          'Reference price. 0 = fetch orderbook bid0 via REST API on strategy start. >0 = fixed price, no orderbook fetch.',
        defaultValue: 0,
        required: true,
        min: 0,
        max: 1000000,
        group: 'Reference',
        order: 1,
      },
      {
        name: 'ladderSteps',
        type: 'number',
        description: 'Number of ladder steps (levels). E.g. 5 = 5 entries below base.',
        defaultValue: 5,
        required: true,
        min: 1,
        max: 100,
        group: 'Ladder Entry',
        order: 2,
      },
      {
        name: 'stepType',
        type: 'enum',
        description:
          'Ladder price step type: "arithmetic" (absolute price difference: price_i = base - stepValue * (i + 1)) ' +
          'or "geometric" (percentage ratio: price_i = base * (1 - stepValue/100)^(i + 1)).',
        defaultValue: 'arithmetic',
        required: true,
        validation: { options: ['arithmetic', 'geometric'] },
        group: 'Ladder Entry',
        order: 3,
      },
      {
        name: 'stepValue',
        type: 'number',
        description:
          'Step value for ladder price. Arithmetic: absolute price drop per step (e.g. 300 = each step 300 USDT below base, entry 0 is at base - 300). ' +
          'Geometric: percentage drop per step (e.g. 1 = each step 1% below previous, entry 0 is at base * 0.99).',
        defaultValue: 1,
        required: true,
        min: 0.000001,
        max: 1000000,
        group: 'Ladder Entry',
        order: 4,
      },
      {
        name: 'qtyType',
        type: 'enum',
        description:
          'Quantity progression: "arithmetic" (qty[i]=base+add*i) or "geometric" (qty[i]=base*ratio^i).',
        defaultValue: 'arithmetic',
        required: true,
        validation: { options: ['arithmetic', 'geometric'] },
        group: 'Ladder Quantity',
        order: 5,
      },
      {
        name: 'qtyPerStep',
        type: 'number',
        description: 'Base quantity per ladder step in base currency (e.g. 0.1 BTC).',
        defaultValue: 0.1,
        required: true,
        min: 0.000001,
        max: 100000,
        step: 0.000001,
        group: 'Ladder Quantity',
        order: 6,
      },
      {
        name: 'qtyStepAdd',
        type: 'number',
        description:
          'Arithmetic qty addition per step: qty[i] = qtyPerStep + qtyStepAdd * i.',
        defaultValue: 0,
        required: false,
        min: 0,
        max: 100000,
        step: 0.000001,
        group: 'Ladder Quantity',
        order: 7,
        showIf: { field: 'qtyType', equals: 'arithmetic' },
      },
      {
        name: 'qtyStepRatio',
        type: 'number',
        description:
          'Geometric qty ratio per step: qty[i] = qtyPerStep * qtyStepRatio^i.',
        defaultValue: 1,
        required: false,
        min: 0.001,
        max: 100,
        step: 0.001,
        group: 'Ladder Quantity',
        order: 8,
        showIf: { field: 'qtyType', equals: 'geometric' },
      },
      {
        name: 'tpType',
        type: 'enum',
        description:
          'Take profit condition: "absolute" (fixed quote profit, e.g. 100 USDT) or "percent" (percentage of VWAP).',
        defaultValue: 'percent',
        required: true,
        validation: { options: ['absolute', 'percent'] },
        group: 'Take Profit',
        order: 9,
      },
      {
        name: 'tpAbsoluteProfit',
        type: 'number',
        description:
          'For tpType=absolute: target profit in quote currency (e.g. 100 = 100 USDT).',
        defaultValue: 100,
        required: false,
        min: 0,
        max: 10000000,
        group: 'Take Profit',
        order: 10,
        showIf: { field: 'tpType', equals: 'absolute' },
      },
      {
        name: 'tpPercent',
        type: 'number',
        description:
          'For tpType=percent: target profit percentage above VWAP (e.g. 1 = 1%).',
        defaultValue: 1,
        required: false,
        min: 0.001,
        max: 100,
        group: 'Take Profit',
        order: 11,
        unit: '%',
        showIf: { field: 'tpType', equals: 'percent' },
      },
      {
        name: 'maxInvestment',
        type: 'number',
        description:
          'Maximum total investment in quote currency (margin budget). Buying power = maxInvestment * leverage. ' +
          'Only counts orders from this strategy.',
        defaultValue: 1000,
        required: true,
        min: 0.01,
        max: 100000000,
        group: 'Risk Management',
        order: 12,
      },
      {
        name: 'maxPosition',
        type: 'number',
        description:
          'Maximum position size in base currency (including open BUY orders from this strategy).',
        defaultValue: 10,
        required: true,
        min: 0.000001,
        max: 100000000,
        group: 'Risk Management',
        order: 13,
      },
      {
        name: 'leverage',
        type: 'number',
        description: 'Leverage for futures trading.',
        defaultValue: 10,
        required: false,
        min: 1,
        max: 125,
        group: 'Risk Management',
        order: 14,
      },
      {
        name: 'resetInterval',
        type: 'enum',
        description:
          'Reset interval in minutes. When only entry 0 (status=NEW, unfilled) exists and the specified time has elapsed, ' +
          'the strategy cancels entry 0, re-fetches orderbook, rebuilds ladder with fresh bid0, and places a new entry 0. ' +
          '0 = never reset.',
        defaultValue: 0,
        required: false,
        validation: { options: ['0', '5', '15', '30', '60', '1440'] },
        group: 'Reset',
        order: 15,
      },
    ],
    subscriptionRequirements: {},
    initialDataRequirements: {
      fetchPositions: { required: true, editable: false, description: 'Fetch positions' },
      fetchOpenOrders: {
        required: true,
        editable: false,
        description: 'Fetch open orders for recovery',
      },
      fetchOrderHistory: {
        required: true,
        editable: false,
        description: 'Fetch recent order history (FILLED orders) for restart recovery',
      },
      fetchBalance: { required: true, editable: false, description: 'Fetch balance' },
      fetchOrderBook: {
        required: false,
        editable: true,
        defaultDepth: 5,
        depthEditable: true,
        description: 'Fetch orderbook snapshot via REST (needed when basePrice=0)',
      },
    },
    documentation: {
      overview:
        'Ladder entry with single take-profit strategy. Uses bid0 (or fixed basePrice) as reference, places BUY limit orders in arithmetic/geometric ladder steps. ' +
        'TP SELL limit order is updated immediately on each entry fill (including partial fills). ' +
        'On TP fully filled, cancels all remaining entries and rebuilds the ladder with latest bid0 to start new cycle. ' +
        'resetInterval: if entry 0 stays unfilled for the specified time, cancels entry 0, re-fetches bid0, rebuilds ladder (0=never reset). ' +
        'Subscribes to orderbook WebSocket for real-time ask0; TP price floored at max(ask0, expectedTpPrice) to never sell below market ask.',
      parameters:
        'basePrice(0=bid0 via REST) + ladderSteps + stepType/stepValue define ladder prices (arithmetic=base-stepValue*(i+1), geometric=base*(1-stepValue/100)^(i+1)); ' +
        'qtyType + qtyPerStep + qtyStepAdd/qtyStepRatio define ladder quantities; ' +
        'tpType + tpAbsoluteProfit/tpPercent define take-profit condition; ' +
        'maxInvestment * leverage = total buying power; maxPosition = max position size; ' +
        'resetInterval: minutes before auto-resetting stale entry 0 (0=never, 5/15/30/60/1440).',
      signals:
        'On start: Fetch orderbook bid0 via REST → build ladder → place first BUY limit entry order (sequential: next entry placed only after current one fills).\n' +
        'Entry fill (incl. partial): Recalculate VWAP → update TP (cancel old TP → place new TP, qty=current inventory, price=VWAP±profit target).\n' +
        'TP partial fill: No action taken (TP state managed by exchange).\n' +
        'TP fully filled: cancel all remaining entries → rebuild ladder with latest bid0 → start new cycle.\n' +
        'resetInterval elapsed (entry 0 still NEW): cancel entry 0 → re-fetch bid0 → rebuild ladder → place new entry 0.\n' +
        'Stop/restart: processInitialData recovers all strategy orders via REST fetchOpenOrders → recalculate VWAP/inventory → restore TP + re-place unfilled entries.',
      riskFactors: [
        'Ladder buying in a downtrend accumulates position and may hit maxPosition limit',
        'TP limit order may not fill (if price keeps falling)',
        'Entry limit orders may not fill (missed market movement)',
        'Deep ladder steps may remain untriggered for extended periods',
        'On restart recovery, if orderbook unavailable (basePrice=0), must wait for REST bid0 fetch',
      ],
    },
  };

// ──────────────────────────────────────────────────────────────────────────
// Internal types
// ──────────────────────────────────────────────────────────────────────────

interface LadderStep {
  index: number;
  price: Decimal;
  quantity: Decimal;
  /** clientOrderId of the open entry BUY order for this step (null = none/filled/cancelled) */
  entryClientOrderId: string | null;
  /** Whether this step's entry has been fully FILLED */
  filled: boolean;
}

interface LadderSignalMetaData extends SignalMetaData {
  side?: OrderSide;
  stepIndex?: number;
  quantity?: string;
  price?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Strategy
// ──────────────────────────────────────────────────────────────────────────

export class LadderEntrySingleTPStrategy extends BaseStrategy<LadderEntrySingleTPParameters> {
  private basePrice: Decimal;
  private ladderSteps: number;
  private stepType: 'arithmetic' | 'geometric';
  private stepValue: Decimal;
  private qtyType: 'arithmetic' | 'geometric';
  private qtyPerStep: Decimal;
  private qtyStepAdd: Decimal;
  private qtyStepRatio: Decimal;
  private tpType: 'absolute' | 'percent';
  private tpAbsoluteProfit: Decimal;
  private tpPercent: Decimal;
  private maxInvestment: Decimal;
  private maxPosition: Decimal;
  private leverage: number;
  private resetInterval: number; // minutes; 0 = never reset
  private tradeMode: TradeMode = TradeMode.ISOLATED;

  /** Ladder configuration (precomputed prices + quantities) */
  private steps: LadderStep[] = [];

  /** Current filled inventory (base quantity bought, not yet sold by TP) */
  private inventoryQty: Decimal = new Decimal(0);

  /**
   * Total quantity sold by partial TP fills in the current cycle.
   * Used to compute the remaining TP sell quantity:
   *   tpQty = inventoryQty - tpFilledQty
   * This is tracked separately from inventoryQty because recalculateVWAP()
   * rebuilds inventoryQty from scratch (sum of FILLED entry qty) on every
   * entry fill, which would erase any reduction from TP partial fills.
   */
  private tpFilledQty: Decimal = new Decimal(0);

  /** VWAP (volume-weighted average price) of current inventory */
  private vwap: Decimal = new Decimal(0);

  /** clientOrderId of the current open TP SELL order (null = none) */
  private tpClientOrderId: string | null = null;

  /** Reference price (basePrice or last bid0 from REST) */
  private referencePrice: Decimal;

  // Order tracking — only this strategy's own orders
  private orders: Map<string, Order> = new Map();
  private orderMetadataMap: Map<string, LadderSignalMetaData> = new Map();
  private pendingClientOrderIds: Set<string> = new Set();
  private processedQuantityMap: Map<string, Decimal> = new Map();
  private processedTerminalIds: Set<string> = new Set();
  /**
   * Client order IDs from previous cycles that have been fully processed.
   * When resetLadder clears all tracking maps, these IDs are recorded here
   * so that delayed WS pushes for old-cycle orders are ignored instead of
   * being re-processed as new fills (which would contaminate VWAP/inventory
   * and trigger TP storms).
   */
  private previousCycleOrderIds: Set<string> = new Set();

  /**
   * Debounce timer for TP refresh on partial fills (milliseconds).
   * Prevents rapid cancel+re-place TP cycles from exchange rate limits.
   * Full FILLED updates bypass this debounce and refresh TP immediately.
   */
  private static readonly TP_DEBOUNCE_MS = 2000;

  /** Timestamp (ms) of the last partial-fill TP refresh trigger. */
  private lastPartialFillTpTriggerTime = 0;

  /** Whether a deferred TP refresh is pending (set by partial fill, cleared when executed). */
  private tpRefreshPending = false;

  /**
   * Flag set by handleTpFilled when basePrice=0 — strategy needs the engine
   * to re-fetch orderbook via REST and call processInitialData again so the
   * new cycle uses a fresh bid0 as the reference price.
   * Reset to false in processInitialData after consuming the fresh orderbook.
   */
  private _needsReinit = false;
  private referencePriceWasReversedFromTp = false;

  /**
   * Timestamp (ms) when the current entry 0 order was placed.
   * Used by the resetInterval feature: if only entry 0 (status=NEW) is pending
   * and resetInterval minutes have elapsed, the strategy cancels entry 0,
   * re-fetches orderbook, and rebuilds the ladder with a fresh bid0.
   * Reset to 0 on resetLadder, onCleanup, and after a successful reset.
   */
  private entry0PlacedTime = 0;

  /**
   * Flag set by checkAndPerformReset to indicate that the current
   * previousCycleOrderIds entries are from a reset-cancel (not a TP-filled
   * cycle switch). This allows handleOrderUpdates to process FILLED pushes
   * for reset-cancelled orders — if entry 0 filled on the exchange just
   * before our cancel arrived, we MUST process the fill to avoid an
   * orphaned position with no TP (unlimited market risk).
   * Cleared when a new entry 0 is placed (placeLadderEntries) or on cleanup.
   */
  private resetCancelPending = false;

  /**
   * Timestamp of the last resetInterval-triggered reset. Used to limit the
   * orphan-fill recovery window in handleOrderUpdates: only recover blacklisted
   * fills within 30s after a reset (after that, late pushes are TP-filled cycle
   * switches, not reset-cancel race-fills). Cleared in onCleanup.
   */
  private _lastResetTime = 0;

  /**
   * strategyNetPosition recovered from DB during processInitialData.
   * Used by handleOrderUpdates to detect console-restart orphaned fills:
   * when inventoryQty=0 but _recoveredNetPos>0, a blacklisted FILLED order
   * arriving via WS is a delayed fill from before the restart that was not
   * recovered by processInitialData (exchange REST API hadn't reflected the
   * fill yet). Without this, the fill is lost → orphaned position with no TP.
   * Set in processInitialData, cleared in onCleanup and handleTpFilled.
   * Invalidated after _recoveredNetPosTtl ms to prevent stale recovery.
   */
  private _recoveredNetPos: Decimal = new Decimal(0);

  /**
   * Timestamp (ms) when _recoveredNetPos was set. Used to invalidate stale
   * recovery budget: after 5 minutes, delayed WS pushes are almost certainly
   * from a new cycle, not the restart that set _recoveredNetPos.
   */
  private _recoveredNetPosTime = 0;

  private static readonly RECOVERED_NET_POS_TTL_MS = 5 * 60 * 1000; // 5 min

  /**
   * Best ask (ask0) from the most recent orderbook update (REST init or
   * real-time WebSocket subscription).
   * Used to floor TP sell price at max(ask0, expectedTpPrice) to ensure
   * TP orders are never priced below the current market ask — preserving
   * profit margin while guaranteeing immediate fill when ask already
   * exceeds the profit target.
   * Updated in processInitialData (REST) and analyze() (WS push).
   * 0 = unknown (initial state or no orderbook available).
   */
  private _currentAsk0: Decimal = new Decimal(0);

  constructor(config: StrategyConfig<LadderEntrySingleTPParameters>) {
    super({ ...config, logger: silentLogger });
    const { parameters } = config;

    this.basePrice = new Decimal(parameters.basePrice ?? 0);
    this.ladderSteps = parameters.ladderSteps ?? 5;
    this.stepType = parameters.stepType ?? 'arithmetic';
    this.stepValue = new Decimal(parameters.stepValue ?? 1);
    this.qtyType = parameters.qtyType ?? 'arithmetic';
    this.qtyPerStep = new Decimal(parameters.qtyPerStep ?? 0.1);
    this.qtyStepAdd = new Decimal(parameters.qtyStepAdd ?? 0);
    this.qtyStepRatio = new Decimal(parameters.qtyStepRatio ?? 1);
    this.tpType = parameters.tpType ?? 'percent';
    this.tpAbsoluteProfit = new Decimal(parameters.tpAbsoluteProfit ?? 0);
    this.tpPercent = new Decimal(parameters.tpPercent ?? 1);
    this.maxInvestment = new Decimal(parameters.maxInvestment);
    this.maxPosition = new Decimal(parameters.maxPosition);
    this.leverage = parameters.leverage ?? 10;
    this.resetInterval = parameters.resetInterval ?? 0;

    // Validate
    if (this.maxInvestment.lte(0)) {
      throw new Error(`Invalid maxInvestment: ${parameters.maxInvestment} (must be > 0)`);
    }
    if (this.maxPosition.lte(0)) {
      throw new Error(`Invalid maxPosition: ${parameters.maxPosition} (must be > 0)`);
    }
    if (this.ladderSteps < 1) {
      throw new Error(`Invalid ladderSteps: ${parameters.ladderSteps} (must be >= 1)`);
    }
    if (this.stepValue.lte(0)) {
      throw new Error(`Invalid stepValue: ${parameters.stepValue} (must be > 0)`);
    }
    if (this.qtyPerStep.lte(0)) {
      throw new Error(`Invalid qtyPerStep: ${parameters.qtyPerStep} (must be > 0)`);
    }
    if (this.qtyType === 'geometric' && this.qtyStepRatio.lte(0)) {
      throw new Error(
        `Invalid qtyStepRatio: ${parameters.qtyStepRatio} (must be > 0 for geometric)`,
      );
    }

    // If basePrice > 0, use it as fixed reference; otherwise wait for REST orderbook fetch
    this.referencePrice = this.basePrice.gt(0) ? this.basePrice : new Decimal(0);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Ladder configuration
  // ──────────────────────────────────────────────────────────────────────────

  private buildLadder(): LadderStep[] {
    if (this.referencePrice.lte(0)) return [];

    const steps: LadderStep[] = [];
    const stepPercent = this.stepValue.div(100);

    for (let i = 0; i < this.ladderSteps; i++) {
      let price: Decimal;
      if (this.stepType === 'arithmetic') {
        // Absolute price difference: price_i = referencePrice - stepValue * (i + 1)
        // Each step drops by a fixed absolute price amount.
        // e.g. stepValue=300 → entry 0 = base - 300, entry 1 = base - 600, etc.
        price = this.referencePrice.minus(this.stepValue.mul(i + 1));
      } else {
        // Geometric percentage ratio: price_i = referencePrice * (1 - stepValue/100)^(i + 1)
        // Entry 0 = referencePrice * (1 - stepValue/100), entry 1 = referencePrice * (1 - stepValue/100)^2, etc.
        price = this.referencePrice.mul(new Decimal(1).minus(stepPercent).pow(i + 1));
      }
      if (price.lte(0)) {
        this._logger.warn(`[buildLadder] Step ${i} price <= 0, skipping`);
        continue;
      }

      let qty: Decimal;
      if (this.qtyType === 'arithmetic') {
        qty = this.qtyPerStep.plus(this.qtyStepAdd.mul(i));
      } else {
        qty = this.qtyPerStep.mul(this.qtyStepRatio.pow(i));
      }
      if (qty.lte(0)) {
        this._logger.warn(`[buildLadder] Step ${i} qty <= 0, skipping`);
        continue;
      }

      steps.push({
        index: i,
        price,
        quantity: qty,
        entryClientOrderId: null,
        filled: false,
      });
    }
    return steps;
  }

  private resetLadder(): void {
    // Record all current cycle's order IDs before clearing, so that delayed
    // WS pushes for these orders are ignored in the new cycle.
    for (const coid of this.orders.keys()) {
      this.previousCycleOrderIds.add(coid);
    }
    for (const coid of this.orderMetadataMap.keys()) {
      this.previousCycleOrderIds.add(coid);
    }
    for (const coid of this.pendingClientOrderIds) {
      this.previousCycleOrderIds.add(coid);
    }

    this.steps = [];
    this.inventoryQty = new Decimal(0);
    this.tpFilledQty = new Decimal(0);
    this.vwap = new Decimal(0);
    this.tpClientOrderId = null;
    // CRITICAL: Clear all order tracking maps to prevent stale orders from
    // the previous cycle contaminating recalculateVWAP in the new cycle.
    // Without this, old FILLED entries remain in this.orders and their
    // metadata in orderMetadataMap — recalculateVWAP would include them,
    // rebuilding stale inventory/VWAP → TP at wrong price → immediate fill
    // → TP storm → financial loss.
    this.orders.clear();
    this.orderMetadataMap.clear();
    this.pendingClientOrderIds.clear();
    this.processedQuantityMap.clear();
    this.processedTerminalIds.clear();
    this.entry0PlacedTime = 0;
    this._currentAsk0 = new Decimal(0);

    // Cap previousCycleOrderIds to prevent unbounded growth over long-running
    // strategies. Keep the most recent 200 entries (sufficient to cover all
    // delayed WS pushes). Older entries are unlikely to receive late pushes.
    if (this.previousCycleOrderIds.size > 200) {
      const excess = this.previousCycleOrderIds.size - 200;
      let removed = 0;
      for (const id of this.previousCycleOrderIds) {
        this.previousCycleOrderIds.delete(id);
        if (++removed >= excess) break;
      }
    }
  }

  /**
   * Reverse-engineer the referencePrice (bid0) from an active TP order.
   *
   * On restart, the original bid0 used to build the ladder is unknown.
   * Fetching a fresh bid0 may produce different step prices that don't match
   * the entry orders still open in openOrders. Instead, we can back-calculate:
   *
   * 1. VWAP from TP price:
   *    absolute: VWAP = TP_price - tpAbsoluteProfit / TP_qty
   *    percent:  VWAP = TP_price / (1 + tpPercent/100)
   *
   * 2. referencePrice from VWAP + filledStepCount (inferred from TP qty):
   *    arithmetic:
   *      VWAP = ref - stepValue * sum((i+1)*qty[i]) / totalQty
   *      ref  = VWAP + stepValue * sum((i+1)*qty[i]) / totalQty
   *    geometric:
   *      r = (1 - stepValue/100)
   *      VWAP = ref * sum(r^(i+1)*qty[i]) / totalQty
   *      ref  = VWAP * totalQty / sum(r^(i+1)*qty[i])
   *
   * This ensures the rebuilt ladder prices exactly match the entry orders
   * already on the exchange, preventing duplicates and price mismatches.
   *
   * @param tpOrder - The active TP order from openOrders
   * @param filledStepCount - Number of filled steps (inferred from TP qty)
   * @returns The back-calculated referencePrice, or null if calculation fails
   */
  private reverseEngineerReferencePrice(
    tpOrder: Order,
    filledStepCount: number,
  ): Decimal | null {
    if (!tpOrder.price || !tpOrder.quantity || tpOrder.quantity.lte(0)) return null;
    if (filledStepCount <= 0) return null;

    // Step 1: Back-calculate VWAP from TP price
    let vwapFromTp: Decimal;
    if (this.tpType === 'absolute') {
      if (this.tpAbsoluteProfit.lte(0)) return null;
      vwapFromTp = tpOrder.price.minus(this.tpAbsoluteProfit.div(tpOrder.quantity));
    } else {
      if (this.tpPercent.lte(0)) return null;
      vwapFromTp = tpOrder.price.div(new Decimal(1).plus(this.tpPercent.div(100)));
    }

    if (vwapFromTp.lte(0)) return null;

    // Step 2: Build temporary ladder quantities for filled steps
    // (we need qty[i] for i=0..filledStepCount-1, but steps aren't built yet)
    const stepPercent = this.stepValue.div(100);
    let totalQty = new Decimal(0);
    let weightedSum = new Decimal(0); // for arithmetic: sum((i+1)*qty[i])
    let geometricWeightedSum = new Decimal(0); // for geometric: sum(r^(i+1)*qty[i])

    for (let i = 0; i < filledStepCount; i++) {
      let qty: Decimal;
      if (this.qtyType === 'arithmetic') {
        qty = this.qtyPerStep.plus(this.qtyStepAdd.mul(i));
      } else {
        qty = this.qtyPerStep.mul(this.qtyStepRatio.pow(i));
      }
      totalQty = totalQty.plus(qty);
      weightedSum = weightedSum.plus(new Decimal(i + 1).mul(qty));
      const r = new Decimal(1).minus(stepPercent);
      geometricWeightedSum = geometricWeightedSum.plus(r.pow(i + 1).mul(qty));
    }

    if (totalQty.lte(0)) return null;

    // Step 3: Back-calculate referencePrice
    let refPrice: Decimal;
    if (this.stepType === 'arithmetic') {
      // VWAP = ref - stepValue * weightedSum / totalQty
      // ref = VWAP + stepValue * weightedSum / totalQty
      refPrice = vwapFromTp.plus(this.stepValue.mul(weightedSum).div(totalQty));
    } else {
      // VWAP = ref * geometricWeightedSum / totalQty
      // ref = VWAP * totalQty / geometricWeightedSum
      if (geometricWeightedSum.lte(0)) return null;
      refPrice = vwapFromTp.mul(totalQty).div(geometricWeightedSum);
    }

    return refPrice;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VWAP / TP calculation
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Recalculate VWAP from all filled entry orders tracked by this strategy.
   * Idempotent — safe to call on every order update, including out-of-order pushes.
   * Only counts THIS strategy's entry (BUY) orders — not external positions.
   */
  private recalculateVWAP(): void {
    let totalCost = new Decimal(0);
    let totalQty = new Decimal(0);

    for (const order of this.orders.values()) {
      const metadata = order.clientOrderId
        ? this.orderMetadataMap.get(order.clientOrderId)
        : undefined;
      if (!metadata || metadata.signalType !== SignalType.Entry) continue;
      if (order.side !== OrderSide.BUY) continue;

      const filledQty = order.executedQuantity || new Decimal(0);
      if (filledQty.lte(0)) continue;

      const fillPrice = order.averagePrice || order.price || new Decimal(0);
      if (fillPrice.lte(0)) continue;

      totalCost = totalCost.plus(fillPrice.mul(filledQty));
      totalQty = totalQty.plus(filledQty);
    }

    for (const [clientOrderId, processedQty] of this.processedQuantityMap) {
      if (this.orders.has(clientOrderId)) continue;
      const metadata = this.orderMetadataMap.get(clientOrderId);
      if (!metadata || metadata.signalType !== SignalType.Entry) continue;
      if (metadata.side !== OrderSide.BUY) continue;
      if (processedQty.lte(0)) continue;
      const entryPriceStr = metadata.entryPrice;
      if (!entryPriceStr) continue;
      const fillPrice = new Decimal(entryPriceStr);
      if (fillPrice.lte(0)) continue;
      totalCost = totalCost.plus(fillPrice.mul(processedQty));
      totalQty = totalQty.plus(processedQty);
    }

    if (totalQty.gt(0)) {
      this.vwap = totalCost.div(totalQty);
      this.inventoryQty = totalQty;
    } else {
      this.vwap = new Decimal(0);
      this.inventoryQty = new Decimal(0);
    }
  }

  /**
   * Compute the TP sell price based on tpType and current VWAP.
   * - 'absolute': TP price = VWAP + tpAbsoluteProfit / inventoryQty
   * - 'percent':  TP price = VWAP * (1 + tpPercent/100)
   *
   * If _currentAsk0 > 0, the TP price is floored at max(ask0, tpPrice) to
   * ensure the TP order is never priced below the current market ask.
   * This preserves the profit margin (never sells below VWAP+target) while
   * guaranteeing immediate fill when ask0 already exceeds tpPrice (auto-take
   * profit at market). When tpPrice > ask0, the TP sits as a maker order at
   * the profit price and fills when market rises to meet it.
   */
  private computeTpPrice(): Decimal | null {
    if (this.inventoryQty.lte(0) || this.vwap.lte(0)) return null;

    let tpPrice: Decimal;
    if (this.tpType === 'absolute') {
      if (this.tpAbsoluteProfit.lte(0)) return null;
      tpPrice = this.vwap.plus(this.tpAbsoluteProfit.div(this.inventoryQty));
    } else {
      if (this.tpPercent.lte(0)) return null;
      tpPrice = this.vwap.mul(new Decimal(1).plus(this.tpPercent.div(100)));
    }

    // Floor TP price at max(ask0, tpPrice) to never sell below market ask.
    // If ask0 is known and tpPrice < ask0, use ask0 instead — this captures
    // a better-than-target price as an immediate taker fill (auto-take-profit).
    if (this._currentAsk0.gt(0) && tpPrice.lt(this._currentAsk0)) {
      this._logger.debug(
        `[computeTpPrice] Flooring TP at max(ask0=${this._currentAsk0.toString()}, tpPrice=${tpPrice.toString()}) → ${this._currentAsk0.toString()}`,
      );
      return this._currentAsk0;
    }

    return tpPrice;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Risk checks — only count THIS strategy's orders
  // ──────────────────────────────────────────────────────────────────────────

  private getBuyingPower(): Decimal {
    return this.maxInvestment.mul(this.leverage);
  }

  private getCommittedNotional(): Decimal {
    let total = new Decimal(0);
    if (this.inventoryQty.gt(0) && this.vwap.gt(0)) {
      total = total.plus(this.inventoryQty.mul(this.vwap));
    }
    for (const order of this.orders.values()) {
      if (order.side !== OrderSide.BUY) continue;
      if (
        order.status !== OrderStatus.NEW &&
        order.status !== OrderStatus.PARTIALLY_FILLED
      )
        continue;
      const remaining = order.quantity.sub(order.executedQuantity || new Decimal(0));
      if (remaining.gt(0) && order.price) {
        total = total.plus(remaining.mul(order.price));
      }
    }
    for (const clientId of this.pendingClientOrderIds) {
      if (this.orders.has(clientId)) continue;
      const metadata = this.orderMetadataMap.get(clientId);
      if (!metadata || metadata.signalType !== SignalType.Entry) continue;
      if (metadata.side !== OrderSide.BUY) continue;
      if (metadata.quantity && metadata.price) {
        total = total.plus(
          new Decimal(metadata.quantity).mul(new Decimal(metadata.price)),
        );
      }
    }
    return total;
  }

  private getRemainingInvestmentCapacity(): Decimal {
    return this.getBuyingPower().sub(this.getCommittedNotional());
  }

  private getPendingBuyQty(): Decimal {
    let total = new Decimal(0);
    for (const order of this.orders.values()) {
      if (order.side !== OrderSide.BUY) continue;
      if (
        order.status !== OrderStatus.NEW &&
        order.status !== OrderStatus.PARTIALLY_FILLED
      )
        continue;
      const remaining = order.quantity.sub(order.executedQuantity || new Decimal(0));
      if (remaining.gt(0)) total = total.add(remaining);
    }
    for (const clientId of this.pendingClientOrderIds) {
      if (this.orders.has(clientId)) continue;
      const metadata = this.orderMetadataMap.get(clientId);
      if (!metadata || metadata.signalType !== SignalType.Entry) continue;
      if (metadata.side !== OrderSide.BUY) continue;
      if (metadata.quantity) total = total.add(new Decimal(metadata.quantity));
    }
    return total;
  }

  private getRemainingPositionCapacity(): Decimal {
    return this.maxPosition.sub(this.inventoryQty).sub(this.getPendingBuyQty());
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Signal generation
  // ──────────────────────────────────────────────────────────────────────────

  private generateEntrySignal(step: LadderStep): StrategyOrderResult {
    const clientOrderId = this.generateClientOrderId(SignalType.Entry);
    const metadata: LadderSignalMetaData = {
      signalType: SignalType.Entry,
      timestamp: Date.now(),
      clientOrderId,
      side: OrderSide.BUY,
      stepIndex: step.index,
      quantity: step.quantity.toString(),
      price: step.price.toString(),
      entryPrice: step.price.toString(),
    };
    this.orderMetadataMap.set(clientOrderId, metadata);
    this.pendingClientOrderIds.add(clientOrderId);
    return {
      action: 'buy',
      price: step.price,
      quantity: step.quantity,
      symbol: this._symbol,
      clientOrderId,
      leverage: this.leverage,
      tradeMode: this.tradeMode,
      reason: `ladder_entry_step_${step.index}`,
      metadata,
    };
  }

  private generateTpSignal(tpPrice: Decimal, qty: Decimal): StrategyOrderResult {
    const clientOrderId = this.generateClientOrderId(SignalType.TakeProfit);
    const metadata: LadderSignalMetaData = {
      signalType: SignalType.TakeProfit,
      timestamp: Date.now(),
      clientOrderId,
      side: OrderSide.SELL,
      entryPrice: this.vwap.toString(),
      takeProfitPrice: tpPrice.toString(),
      quantity: qty.toString(),
    };
    this.orderMetadataMap.set(clientOrderId, metadata);
    this.pendingClientOrderIds.add(clientOrderId);
    this.tpClientOrderId = clientOrderId;
    return {
      action: 'sell',
      price: tpPrice,
      quantity: qty,
      symbol: this._symbol,
      clientOrderId,
      leverage: this.leverage,
      tradeMode: this.tradeMode,
      reason:
        this.tpType === 'absolute'
          ? `ladder_tp_absolute_${this.tpAbsoluteProfit.toString()}`
          : `ladder_tp_percent_${this.tpPercent.toString()}`,
      metadata,
    };
  }

  private generateTpUpdateSignal(
    oldClientOrderId: string,
    tpPrice: Decimal,
    qty: Decimal,
  ): StrategyUpdateOrderResult {
    const newClientOrderId = this.generateClientOrderId(SignalType.TakeProfit);
    const metadata: LadderSignalMetaData = {
      signalType: SignalType.TakeProfit,
      timestamp: Date.now(),
      clientOrderId: newClientOrderId,
      side: OrderSide.SELL,
      entryPrice: this.vwap.toString(),
      takeProfitPrice: tpPrice.toString(),
      quantity: qty.toString(),
    };
    this.orderMetadataMap.set(newClientOrderId, metadata);
    this.pendingClientOrderIds.add(newClientOrderId);
    // Track the new TP clientOrderId immediately so that a subsequent
    // refreshTakeProfit() call (before exchange confirms the order) can
    // detect the pending TP and skip duplicate placement.
    this.tpClientOrderId = newClientOrderId;
    // Remove old TP from pending to avoid stale cancel storms
    this.pendingClientOrderIds.delete(oldClientOrderId);
    this.orderMetadataMap.delete(oldClientOrderId);
    return {
      action: 'update',
      clientOrderId: oldClientOrderId,
      newClientOrderId,
      symbol: this._symbol,
      quantity: qty,
      price: tpPrice,
      reason: 'ladder_tp_update',
      metadata,
    };
  }

  private generateCancelSignal(clientOrderId: string, reason: string): StrategyResult {
    return { action: 'cancel', clientOrderId, symbol: this._symbol, reason };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Ladder entry placement
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Place the next pending entry order in the ladder.
   *
   * Sequential mode: only one entry order is active at a time. The next step
   * is placed only after the current step's order is fully filled.
   *
   * Rules:
   *   1. Find the first unfilled step that has no active order.
   *   2. If the immediately preceding step exists and is not yet fully filled,
   *      do NOT place this step — wait for it to fill first.
   *   3. Only one entry order is live at any time.
   */
  private placeLadderEntries(): StrategyResult[] {
    const signals: StrategyResult[] = [];

    if (this.steps.length === 0) {
      this.steps = this.buildLadder();
      if (this.steps.length === 0) return signals;
    }

    for (const step of this.steps) {
      if (step.filled) continue;

      // If this step already has an active order, do nothing — wait for it
      // to fill. Only one entry order is live at a time.
      if (step.entryClientOrderId) {
        const order = this.orders.get(step.entryClientOrderId);
        if (
          order &&
          (order.status === OrderStatus.NEW ||
            order.status === OrderStatus.PARTIALLY_FILLED)
        ) {
          // Current step's order is still active; do not place next step.
          return signals;
        }
        // Order no longer active (cancelled / filled / expired) — clear it.
        // If it was filled, step.filled would already be true (set in
        // handleEntryFill), so reaching here means it was cancelled/expired.
        step.entryClientOrderId = null;
      }

      // Ensure all previous steps are fully filled before placing this one.
      const prevStep = this.steps[step.index - 1];
      if (prevStep && !prevStep.filled) {
        // Previous step hasn't filled yet; wait.
        this._logger.debug(
          `[placeLadderEntries] Step ${step.index}: waiting for step ${prevStep.index} to fill`,
        );
        return signals;
      }

      // Check risk limits
      if (this.getRemainingPositionCapacity().lt(step.quantity)) {
        this._logger.debug(
          `[placeLadderEntries] Step ${step.index}: insufficient position capacity, skipping`,
        );
        return signals;
      }

      const orderNotional = step.price.mul(step.quantity);
      if (this.getRemainingInvestmentCapacity().lt(orderNotional)) {
        this._logger.debug(
          `[placeLadderEntries] Step ${step.index}: insufficient investment capacity, skipping`,
        );
        return signals;
      }

      // Place this step's entry order and stop — only one at a time.
      const signal = this.generateEntrySignal(step);
      step.entryClientOrderId = signal.clientOrderId;

      // Track when entry 0 is placed for the resetInterval feature.
      // Also clear resetCancelPending — if we got here, a new entry 0 has been
      // placed (either via processInitialData reinit or normal cycle start).
      // The reset-cancel window is over.
      if (step.index === 0) {
        this.entry0PlacedTime = Date.now();
        this.resetCancelPending = false;
      }

      signals.push(signal);
      this._logger.debug(
        `[placeLadderEntries] Placed step ${step.index}: ${step.quantity.toString()} @ ${step.price.toString()}`,
      );
      return signals;
    }

    return signals;
  }

  /**
   * Refresh the TP order: cancel old TP (if any) and place a new one
   * matching current VWAP + inventoryQty.
   * Called on every entry fill (full or partial).
   */
  private refreshTakeProfit(): StrategyResult[] {
    const signals: StrategyResult[] = [];

    if (this.inventoryQty.lte(0) || this.vwap.lte(0)) {
      return this.cancelAllTpOrders('ladder_tp_cancel_no_inventory');
    }

    const tpPrice = this.computeTpPrice();
    if (!tpPrice || tpPrice.lte(0)) return signals;
    // TP sell quantity = total bought - already sold by partial TP fills.
    // Without subtracting tpFilledQty, a partial TP fill followed by a new
    // entry fill would cause the TP to sell more than the actual position.
    const tpQty = this.inventoryQty.minus(this.tpFilledQty);
    if (tpQty.lte(0)) {
      // All inventory already sold by partial TP fills — cancel any remaining TP
      return this.cancelAllTpOrders('ladder_tp_cancel_already_sold');
    }

    if (this.tpClientOrderId) {
      const existingTp = this.orders.get(this.tpClientOrderId);
      if (
        existingTp &&
        (existingTp.status === OrderStatus.NEW ||
          existingTp.status === OrderStatus.PARTIALLY_FILLED)
      ) {
        const currentPrice = existingTp.price || new Decimal(0);
        const currentQty = existingTp.quantity || new Decimal(0);
        if (currentPrice.eq(tpPrice) && currentQty.eq(tpQty)) return signals;
        // Price or qty changed → update existing TP order
        signals.push(this.generateTpUpdateSignal(this.tpClientOrderId, tpPrice, tpQty));
        return signals;
      }

      // tpClientOrderId is set but the order is not in this.orders or not
      // NEW/PARTIALLY_FILLED. This can happen when the TP was just signalled
      // (pending exchange confirmation) — the order is in pendingClientOrderIds
      // but not yet in this.orders (no exchange order update received yet).
      if (this.pendingClientOrderIds.has(this.tpClientOrderId)) {
        // TP order is pending exchange confirmation. Check if the metadata
        // matches current target — if so, skip to avoid duplicate placement.
        const pendingMeta = this.orderMetadataMap.get(this.tpClientOrderId);
        if (pendingMeta) {
          const pendingPrice = pendingMeta.takeProfitPrice
            ? new Decimal(pendingMeta.takeProfitPrice)
            : new Decimal(0);
          const pendingQty = pendingMeta.quantity
            ? new Decimal(pendingMeta.quantity)
            : new Decimal(0);
          if (pendingPrice.eq(tpPrice) && pendingQty.eq(tpQty)) {
            // Pending TP matches current target — skip to avoid storm
            return signals;
          }
          // Pending TP doesn't match → cancel it + place new one
          signals.push(
            this.generateCancelSignal(
              this.tpClientOrderId,
              'ladder_tp_cancel_stale_pending',
            ),
          );
          this.pendingClientOrderIds.delete(this.tpClientOrderId);
          this.orderMetadataMap.delete(this.tpClientOrderId);
        }
      }

      // Clean up stale tpClientOrderId reference
      this.orders.delete(this.tpClientOrderId);
      this.tpClientOrderId = null;
    }

    // Cancel any remaining stale pending TP signals
    for (const clientId of Array.from(this.pendingClientOrderIds)) {
      const meta = this.orderMetadataMap.get(clientId);
      if (meta?.signalType === SignalType.TakeProfit) {
        signals.push(this.generateCancelSignal(clientId, 'ladder_tp_cancel_stale'));
        this.pendingClientOrderIds.delete(clientId);
        this.orderMetadataMap.delete(clientId);
      }
    }

    signals.push(this.generateTpSignal(tpPrice, tpQty));
    return signals;
  }

  private cancelAllTpOrders(reason: string): StrategyResult[] {
    const signals: StrategyResult[] = [];
    if (this.tpClientOrderId) {
      const tpOrder = this.orders.get(this.tpClientOrderId);
      if (
        tpOrder &&
        (tpOrder.status === OrderStatus.NEW ||
          tpOrder.status === OrderStatus.PARTIALLY_FILLED)
      ) {
        signals.push(this.generateCancelSignal(this.tpClientOrderId, reason));
      }
      this.tpClientOrderId = null;
    }
    for (const clientId of Array.from(this.pendingClientOrderIds)) {
      const meta = this.orderMetadataMap.get(clientId);
      if (meta?.signalType === SignalType.TakeProfit) {
        signals.push(this.generateCancelSignal(clientId, reason));
        this.pendingClientOrderIds.delete(clientId);
        this.orderMetadataMap.delete(clientId);
      }
    }
    return signals;
  }

  private cancelAllEntryOrders(reason: string): StrategyResult[] {
    const signals: StrategyResult[] = [];
    for (const [clientOrderId, order] of this.orders) {
      if (order.side !== OrderSide.BUY) continue;
      if (
        order.status === OrderStatus.NEW ||
        order.status === OrderStatus.PARTIALLY_FILLED
      ) {
        signals.push(this.generateCancelSignal(clientOrderId, reason));
      }
    }
    for (const clientId of Array.from(this.pendingClientOrderIds)) {
      const meta = this.orderMetadataMap.get(clientId);
      if (meta?.signalType === SignalType.Entry) {
        signals.push(this.generateCancelSignal(clientId, reason));
        this.pendingClientOrderIds.delete(clientId);
        this.orderMetadataMap.delete(clientId);
      }
    }
    return signals;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Order fill handling
  // ──────────────────────────────────────────────────────────────────────────

  private handleEntryFilled(
    order: Order,
    metadata: LadderSignalMetaData,
  ): StrategyResult[] {
    const signals: StrategyResult[] = [];

    if (metadata.stepIndex !== undefined && this.steps[metadata.stepIndex]) {
      this.steps[metadata.stepIndex].filled = true;
    }
    this.pendingClientOrderIds.delete(order.clientOrderId!);

    // Clear any pending debounced TP refresh — FILLED takes priority
    this.tpRefreshPending = false;

    this.recalculateVWAP();
    this._logger.debug(
      `[handleEntryFilled] Entry FILLED: ${order.executedQuantity?.toString()} @ ${order.averagePrice?.toString()}. ` +
        `Inventory: ${this.inventoryQty.toString()}, VWAP: ${this.vwap.toString()}`,
    );

    // Full FILLED bypasses debounce — refresh TP immediately
    signals.push(...this.refreshTakeProfit());
    signals.push(...this.placeLadderEntries());
    return signals;
  }

  private handleEntryPartialFill(
    order: Order,
    metadata: LadderSignalMetaData,
  ): StrategyResult[] {
    const signals: StrategyResult[] = [];
    this.processedQuantityMap.set(
      order.clientOrderId!,
      order.executedQuantity || new Decimal(0),
    );
    if (metadata.signalType === SignalType.Entry) {
      metadata.entryPrice = (order.averagePrice || order.price)?.toString();
    }
    this.recalculateVWAP();
    this._logger.debug(
      `[handleEntryPartialFill] Entry PARTIAL: ${order.executedQuantity?.toString()}/${order.quantity?.toString()}. ` +
        `Inventory: ${this.inventoryQty.toString()}, VWAP: ${this.vwap.toString()}`,
    );

    // Debounce TP refresh on partial fills to avoid rapid cancel+re-place
    // cycles that can trigger exchange rate limits. The actual TP refresh
    // is deferred and executed on the next analyze() call after the
    // debounce window elapses. Full FILLED updates bypass this debounce.
    this.tpRefreshPending = true;
    this.lastPartialFillTpTriggerTime = Date.now();

    return signals;
  }

  /**
   * Handle TP order FILL (full):
   * 1. Clear inventory + VWAP
   * 2. Cancel ALL remaining entry orders
   * 3. Reset ladder state
   * 4. Update referencePrice from REST orderbook (or keep basePrice)
   * 5. Rebuild ladder → place new entries → start new cycle
   */
  private handleTpFilled(order: Order): StrategyResult[] {
    const signals: StrategyResult[] = [];

    // CRITICAL: Collect ALL current-cycle order IDs from EVERY tracking map
    // and add them to previousCycleOrderIds BEFORE generating cancel signals.
    // Previously (Strategy 467 bug), cancelAllEntryOrders/cancelAllTpOrders
    // deleted pending orders from pendingClientOrderIds and orderMetadataMap
    // before resetLadder ran → those IDs were NOT blacklisted → delayed WS
    // CANCELED push re-processed via ensureRecoveredMetadata → placeLadderEntries
    // → DUPLICATE ENTRY ORDER.
    // Additionally, terminal orders (CANCELED/REJECTED/EXPIRED) may exist ONLY
    // in processedTerminalIds or processedQuantityMap (already deleted from
    // this.orders, orderMetadataMap, pendingClientOrderIds by the terminal
    // handler). These must also be blacklisted to prevent ensureRecoveredMetadata
    // from resurrecting them on delayed WS pushes.
    for (const coid of this.orders.keys()) {
      this.previousCycleOrderIds.add(coid);
    }
    for (const coid of this.orderMetadataMap.keys()) {
      this.previousCycleOrderIds.add(coid);
    }
    for (const coid of this.pendingClientOrderIds) {
      this.previousCycleOrderIds.add(coid);
    }
    for (const coid of this.processedTerminalIds) {
      this.previousCycleOrderIds.add(coid);
    }
    for (const coid of this.processedQuantityMap.keys()) {
      this.previousCycleOrderIds.add(coid);
    }

    this.pendingClientOrderIds.delete(order.clientOrderId!);
    this.orderMetadataMap.delete(order.clientOrderId!);
    this.tpClientOrderId = null;
    // Clear any pending debounced TP refresh
    this.tpRefreshPending = false;
    // Clear recovered net position budget — TP filled means the cycle is
    // complete and all positions are sold. Any remaining _recoveredNetPos
    // would allow false recovery of delayed WS pushes from the next cycle.
    this._recoveredNetPos = new Decimal(0);
    this._recoveredNetPosTime = 0;

    // Cancel ALL remaining entry orders
    signals.push(...this.cancelAllEntryOrders('ladder_entry_cancel_on_tp_filled'));

    // Also cancel any remaining pending TP orders (shouldn't exist, but defensive)
    signals.push(...this.cancelAllTpOrders('ladder_tp_cleanup_on_cycle_reset'));

    // Reset state
    this.resetLadder();
    this.processedQuantityMap.clear();
    this.processedTerminalIds.clear();

    // Update reference price for the new cycle.
    // When basePrice=0, the reference price was fetched from REST orderbook
    // bid0 at strategy init. After TP fills, that bid0 is stale — the market
    // has moved to the TP price. Rather than approximating with the TP fill
    // price, request the engine to re-fetch a fresh orderbook via REST and
    // re-run processInitialData so the new cycle uses an accurate bid0.
    // When basePrice>0 (fixed), the reference price never changes.
    if (this.basePrice.lte(0)) {
      this._needsReinit = true;
      this._logger.debug(
        `[handleTpFilled] basePrice=0 — set _needsReinit=true. ` +
          `Engine will re-fetch orderbook and call processInitialData for new cycle.`,
      );
    }

    this._logger.debug(
      `[handleTpFilled] TP FILLED: ${order.executedQuantity?.toString()} @ ${order.averagePrice?.toString()}. ` +
        `Cycle reset. Reference price: ${this.referencePrice.toString()}`,
    );

    // Rebuild ladder and place entries for new cycle.
    // When basePrice>0: rebuild immediately with the fixed reference price.
    // When basePrice=0: rebuild with the current (stale) reference price as a
    //   best-effort placeholder — the engine will re-fetch orderbook and call
    //   processInitialData, which rebuilds the ladder with the fresh bid0.
    if (this.referencePrice.gt(0) && !this._needsReinit) {
      signals.push(...this.placeLadderEntries());
    }
    return signals;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Order update dispatcher (handles out-of-order / delayed pushes)
  // ──────────────────────────────────────────────────────────────────────────

  private handleOrderUpdates(orders: Order[]): StrategyResult[] {
    const signals: StrategyResult[] = [];
    let shouldRefreshLadder = false;

    for (const order of orders) {
      if (!order.clientOrderId) continue;

      // CRITICAL: Skip orders from previous cycles. After TP fills and
      // resetLadder clears all tracking maps, delayed WS pushes for old-cycle
      // orders would be re-processed as new fills — contaminating VWAP/inventory
      // and triggering TP storms. previousCycleOrderIds is populated in
      // resetLadder with all clientOrderIds from the completed cycle.
      //
      // EXCEPTION (reset-cancel race condition): If resetCancelPending is true
      // (set by checkAndPerformReset) and a blacklisted order arrives as FILLED
      // or PARTIALLY_FILLED with executedQuantity > 0, it means entry 0 filled
      // on the exchange just before (or despite) our cancel request. We MUST
      // process this fill — otherwise we get an orphaned position with no TP
      // order, exposing us to unlimited market risk.
      // This exception does NOT apply to TP-filled cycle switches (where
      // resetCancelPending is false) — in that case ALL blacklisted orders are
      // skipped unconditionally to prevent TP storms.
      if (this.previousCycleOrderIds.has(order.clientOrderId)) {
        if (this.resetCancelPending) {
          const hasExecQty = order.executedQuantity && order.executedQuantity.gt(0);
          // Accept FILLED, PARTIALLY_FILLED, and terminal CANCELED/EXPIRED with
          // execQty>0. A CANCELED order with executedQuantity>0 means entry 0
          // was partially filled before the cancel arrived — we MUST process
          // that fill to avoid orphaned inventory with no TP.
          const isFilledOrPartial =
            order.status === OrderStatus.FILLED ||
            order.status === OrderStatus.PARTIALLY_FILLED ||
            ((order.status === OrderStatus.CANCELED ||
              order.status === OrderStatus.EXPIRED) &&
              hasExecQty);
          if (isFilledOrPartial && hasExecQty) {
            // Race condition: entry 0 filled despite reset-cancel.
            // Remove from blacklist and process normally to recover the fill.
            // Clear _needsReinit — entry 0 filled, price was valid, no need
            // to re-fetch orderbook. handleEntryFilled will place TP + entry 1.
            // Clear resetCancelPending — race is resolved, no longer pending.
            this.previousCycleOrderIds.delete(order.clientOrderId);
            this._needsReinit = false;
            this.resetCancelPending = false;
            this._logger.warn(
              `[handleOrderUpdates] Blacklisted order ${order.clientOrderId} ` +
                `arrived as ${order.status} (execQty=${order.executedQuantity?.toString() ?? '0'}) — ` +
                `processing fill (reset-cancel race condition). Cleared _needsReinit and resetCancelPending.`,
            );
          } else {
            continue;
          }
        } else {
          // TP-filled cycle switch OR post-reinit late push.
          // Skip blacklisted orders unconditionally to prevent TP storms...
          // EXCEPT: if the order has executedQuantity>0, inventory is empty,
          // AND we're within 30s of a resetInterval-triggered reset — this is
          // an orphaned fill from a reset-cancel race-fill that arrived AFTER
          // reinit completed. Without this recovery, the fill is lost →
          // orphaned position with no TP.
          // (When inventoryQty>0, it's a normal TP-filled cycle switch — old
          // cycle's entries already have fills that are accounted for. When
          // >30s since last reset, it's a delayed TP-cycle push, not a reset
          // race-fill.)
          //
          // CONSOLE-RESTART ORPHANED FILL: Also recover when inventoryQty=0 but
          // _recoveredNetPos>0 (strategyNetPosition from DB). This happens when
          // the console restarts after an entry fills on the exchange but before
          // the WS FILLED push arrives. At restart, processInitialData fetches
          // orderHistory via REST — but the exchange REST API may not yet reflect
          // the fill, so the entry is not recovered → inventoryQty=0. When the
          // delayed WS FILLED push later arrives, the order is blacklisted (added
          // by hasFilledTpInHistory path in processInitialData) and would be
          // silently skipped → orphaned position with no TP → unlimited market
          // risk. The _recoveredNetPos>0 check confirms the DB has a real unsold
          // position, so this fill is genuine and must be recovered.
          const hasExecQty = order.executedQuantity && order.executedQuantity.gt(0);
          const withinResetWindow =
            this._lastResetTime > 0 && Date.now() - this._lastResetTime < 30_000;
          const isConsoleRestartOrphan =
            this.inventoryQty.isZero() &&
            this._recoveredNetPos.gt(0) &&
            this._recoveredNetPos.gte(order.executedQuantity || new Decimal(0)) &&
            // TTL: only recover within 5 min of processInitialData. After that,
            // delayed pushes are almost certainly from a new cycle, not the
            // restart that set _recoveredNetPos.
            this._recoveredNetPosTime > 0 &&
            Date.now() - this._recoveredNetPosTime <
              LadderEntrySingleTPStrategy.RECOVERED_NET_POS_TTL_MS;
          const isOrphanedFill =
            (order.status === OrderStatus.FILLED ||
              order.status === OrderStatus.PARTIALLY_FILLED ||
              ((order.status === OrderStatus.CANCELED ||
                order.status === OrderStatus.EXPIRED) &&
                hasExecQty)) &&
            hasExecQty &&
            this.inventoryQty.isZero() &&
            (withinResetWindow || isConsoleRestartOrphan);
          if (isOrphanedFill) {
            this.previousCycleOrderIds.delete(order.clientOrderId);
            // Decrement _recoveredNetPos by the recovered fill quantity so
            // subsequent delayed pushes from the same cycle don't re-trigger
            // the console-restart orphan recovery → TP storm.
            if (isConsoleRestartOrphan && hasExecQty) {
              this._recoveredNetPos = this._recoveredNetPos.minus(
                order.executedQuantity!,
              );
            }
            this._logger.warn(
              `[handleOrderUpdates] Blacklisted order ${order.clientOrderId} ` +
                `arrived as ${order.status} (execQty=${order.executedQuantity?.toString() ?? '0'}) ` +
                `post-reinit with inventoryQty=0 — recovering orphaned fill ` +
                `(withinResetWindow=${withinResetWindow}, isConsoleRestartOrphan=${isConsoleRestartOrphan}, ` +
                `_recoveredNetPos=${this._recoveredNetPos.toString()}).`,
            );
            // Continue to normal processing below
          } else {
            continue;
          }
        }
      }

      let metadata = this.orderMetadataMap.get(order.clientOrderId);
      if (!metadata) {
        metadata = this.ensureRecoveredMetadata(order);
        if (!metadata) continue;
      }

      // Skip stale updates — prevents out-of-order push issues.
      // Uses a composite check: (1) updateTime strictly older, OR (2) same or
      // lower status rank AND same or lower executedQuantity.
      // This avoids relying solely on exchange timestamps (which can share
      // identical milliseconds for PARTIAL_FILL → FILLED transitions on Binance).
      const existingOrder = this.orders.get(order.clientOrderId);
      if (existingOrder) {
        const existingExecQty = existingOrder.executedQuantity || new Decimal(0);
        const newExecQty = order.executedQuantity || new Decimal(0);

        // Strict time-based skip: update is definitively older
        if (
          existingOrder.updateTime &&
          order.updateTime &&
          existingOrder.updateTime.getTime() > order.updateTime.getTime()
        )
          continue;

        // Status + executedQuantity based skip: if the existing order already
        // has the same or higher status rank AND same or greater executed qty,
        // this update is stale/duplicate.
        const statusRank: Record<OrderStatus, number> = {
          [OrderStatus.NEW]: 0,
          [OrderStatus.PARTIALLY_FILLED]: 1,
          [OrderStatus.FILLED]: 2,
          [OrderStatus.CANCELED]: 2,
          [OrderStatus.REJECTED]: 2,
          [OrderStatus.EXPIRED]: 2,
        };
        const existingRank = statusRank[existingOrder.status] ?? 0;
        const newRank = statusRank[order.status] ?? 0;

        if (existingRank >= newRank && existingExecQty.gte(newExecQty)) continue;
      }

      this.orders.set(order.clientOrderId, order);

      // Track step entry order status
      if (metadata.signalType === SignalType.Entry && metadata.stepIndex !== undefined) {
        const step = this.steps[metadata.stepIndex];
        if (step && !step.entryClientOrderId) {
          step.entryClientOrderId = order.clientOrderId;
        }
      }

      const totalFilled = order.executedQuantity || new Decimal(0);
      const lastProcessed =
        this.processedQuantityMap.get(order.clientOrderId) || new Decimal(0);
      const hasNewFill = totalFilled.gt(lastProcessed);

      // ── Entry order: PARTIAL fill ──
      if (
        hasNewFill &&
        metadata.signalType === SignalType.Entry &&
        order.status === OrderStatus.PARTIALLY_FILLED
      ) {
        signals.push(...this.handleEntryPartialFill(order, metadata));
        continue;
      }

      // ── TP order: PARTIAL fill → track sold qty, no TP refresh yet ──
      // TP partial fills reduce the remaining position. We track the sold
      // amount in tpFilledQty so that the next refreshTakeProfit() computes
      // the correct TP sell quantity: inventoryQty - tpFilledQty.
      // We do NOT refresh the TP order here (per design: "TP partial → no
      // action"). The TP will be refreshed on the next entry fill via
      // recalculateVWAP + refreshTakeProfit, or when TP fully fills (cycle
      // reset). This avoids exchange rate-limiting from frequent cancel+replace.
      if (
        hasNewFill &&
        metadata.signalType === SignalType.TakeProfit &&
        order.status === OrderStatus.PARTIALLY_FILLED
      ) {
        const increment = totalFilled.minus(
          this.processedQuantityMap.get(order.clientOrderId) || new Decimal(0),
        );
        this.processedQuantityMap.set(order.clientOrderId, totalFilled);
        this.tpFilledQty = this.tpFilledQty.plus(increment);
        this._logger.debug(
          `[handleOrderUpdates] TP PARTIAL fill: ${totalFilled.toString()}/${order.quantity?.toString()}. ` +
            `tpFilledQty=${this.tpFilledQty.toString()}, remaining=${this.inventoryQty.minus(this.tpFilledQty).toString()}. No TP refresh.`,
        );
        continue;
      }

      // ── Full FILL ──
      if (hasNewFill && order.status === OrderStatus.FILLED) {
        if (metadata.signalType === SignalType.Entry) {
          metadata.entryPrice = (order.averagePrice || order.price)?.toString();
        }
        this.processedQuantityMap.set(order.clientOrderId, totalFilled);

        if (metadata.signalType === SignalType.Entry) {
          signals.push(...this.handleEntryFilled(order, metadata));
        } else if (metadata.signalType === SignalType.TakeProfit) {
          signals.push(...this.handleTpFilled(order));
        }
        continue;
      }

      // ── Terminal (cancelled / rejected / expired) ──
      if (this.isTerminalStatus(order.status)) {
        if (this.processedTerminalIds.has(order.clientOrderId)) continue;
        this.processedTerminalIds.add(order.clientOrderId);
        this.pendingClientOrderIds.delete(order.clientOrderId);

        if (
          metadata.signalType === SignalType.Entry &&
          metadata.stepIndex !== undefined
        ) {
          const step = this.steps[metadata.stepIndex];
          if (step) {
            const filledQty = order.executedQuantity || new Decimal(0);
            if (filledQty.lte(0)) {
              // No fill at all — reset step for re-placement
              step.entryClientOrderId = null;
              step.filled = false;
              shouldRefreshLadder = true;
            } else {
              // Partial fill → cancel: the filled portion is real inventory.
              // Mark step as filled so sequential mode advances to next step,
              // recalculate VWAP/inventory to include the partial fill, and
              // refresh TP to cover the updated inventory.
              step.filled = true;
              this.recalculateVWAP();
              this._logger.debug(
                `[handleOrderUpdates] Entry PARTIAL→CANCEL: step ${step.index} ` +
                  `filled ${filledQty.toString()}/${step.quantity.toString()}. ` +
                  `Inventory: ${this.inventoryQty.toString()}, VWAP: ${this.vwap.toString()}`,
              );
              // Refresh TP to match updated inventory
              if (this.inventoryQty.gt(0)) {
                // Clear any pending debounced TP refresh — terminal takes priority
                this.tpRefreshPending = false;
                signals.push(...this.refreshTakeProfit());
              }
              // Place next ladder entry (sequential mode advances)
              shouldRefreshLadder = true;
            }
          }
        }

        if (metadata.signalType === SignalType.TakeProfit) {
          // Capture any additional fill between last PARTIAL_FILL push and
          // this CANCELED push. Without this, the incremental fill is lost
          // → tpFilledQty understated → next TP oversells by the difference.
          const lastProcessed =
            this.processedQuantityMap.get(order.clientOrderId) || new Decimal(0);
          const totalFilled = order.executedQuantity || new Decimal(0);
          if (totalFilled.gt(lastProcessed)) {
            const increment = totalFilled.minus(lastProcessed);
            this.tpFilledQty = this.tpFilledQty.plus(increment);
            this._logger.debug(
              `[handleOrderUpdates] TP terminal: captured extra fill ${increment.toString()} ` +
                `(total ${totalFilled.toString()} > last ${lastProcessed.toString()}). ` +
                `tpFilledQty=${this.tpFilledQty.toString()}`,
            );
          }
          if (this.tpClientOrderId === order.clientOrderId) {
            this.tpClientOrderId = null;
          }
          if (
            this.inventoryQty.gt(0) &&
            this.inventoryQty.minus(this.tpFilledQty).gt(0)
          ) {
            signals.push(...this.refreshTakeProfit());
          }
        }

        // For Entry orders with partial fills that are now terminal, preserve
        // the partial fill data in processedQuantityMap and orderMetadataMap
        // so recalculateVWAP()'s second loop (which scans processedQuantityMap
        // for orders no longer in this.orders) continues to include the partial
        // fill. Without this, future recalculateVWAP calls would undercount
        // inventory → TP undersells → inventory orphaned.
        // For orders with no fills or TP orders, safe to delete all maps.
        const entryFilledQty = order.executedQuantity || new Decimal(0);
        if (entryFilledQty.gt(0) && metadata.signalType === SignalType.Entry) {
          // Keep processedQuantityMap and orderMetadataMap for recalculateVWAP
          this.orders.delete(order.clientOrderId);
        } else {
          this.orders.delete(order.clientOrderId);
          this.processedQuantityMap.delete(order.clientOrderId);
          this.orderMetadataMap.delete(order.clientOrderId);
        }
      }
    }

    if (shouldRefreshLadder) {
      signals.push(...this.placeLadderEntries());
    }
    return signals;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Recovery helpers (stop/restart/service restart)
  // ──────────────────────────────────────────────────────────────────────────

  private ensureRecoveredMetadata(order: Order): LadderSignalMetaData | undefined {
    if (!order.clientOrderId || !this.isStrategyOrderId(order.clientOrderId))
      return undefined;
    const signalType = order.clientOrderId.startsWith('T')
      ? SignalType.TakeProfit
      : SignalType.Entry;
    const metadata: LadderSignalMetaData = {
      signalType,
      timestamp: Date.now(),
      clientOrderId: order.clientOrderId,
      side: order.side,
    };
    this.orderMetadataMap.set(order.clientOrderId, metadata);
    return metadata;
  }

  private isStrategyOrderId(clientOrderId: string): boolean {
    const strategyId = this.getStrategyId();
    const match = /^(E|T)(\d+)D/.exec(clientOrderId);
    return !!match && match[2] === String(strategyId);
  }

  private isTerminalStatus(status: OrderStatus): boolean {
    return (
      status === OrderStatus.CANCELED ||
      status === OrderStatus.REJECTED ||
      status === OrderStatus.EXPIRED
    );
  }

  /**
   * Recover step index from entry order clientOrderId by matching price.
   * Used during restart recovery when metadata.stepIndex is not available.
   */
  private recoverStepIndex(order: Order): number | undefined {
    if (order.side !== OrderSide.BUY) return undefined;
    if (!order.price) return undefined;

    // Try exact match by price against existing ladder steps
    for (const step of this.steps) {
      if (step.price.eq(order.price)) return step.index;
    }

    // Try approximate match (within 0.1% tolerance) — handles cases where
    // floating-point rounding differences cause exact match to fail, or
    // where the old code used a different formula version (e.g., i vs i+1)
    // and the prices differ slightly from the new ladder.
    const tolerance = order.price.mul(0.001); // 0.1%
    for (const step of this.steps) {
      if (step.price.minus(order.price).abs().lte(tolerance)) {
        return step.index;
      }
    }

    // If steps not built yet, try to infer from price relative to referencePrice
    // This is a best-effort recovery; if it fails, the order is tracked but
    // not tied to a specific step
    return undefined;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public strategy interface
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Process initial data on strategy start / restart / service restart.
   *
   * Recovery flow:
   * 1. If basePrice=0 → fetch orderbook via REST to get bid0 → set referencePrice
   * 2. Build ladder from referencePrice
   * 3. Recover existing open orders (filter by this strategy's clientOrderId prefix)
   * 4. Recalculate VWAP from all recovered entry orders (including partial fills)
   * 5. If inventory > 0 but no active TP → create TP
   * 6. Place remaining ladder entries (steps not yet filled or placed)
   *
   * This makes the strategy fully idempotent on restart.
   */
  public override async processInitialData(
    initialData: InitialDataResult,
  ): Promise<StrategyAnalyzeResult> {
    const signals: StrategyResult[] = [];
    this.referencePriceWasReversedFromTp = false;
    const isReinit = this._needsReinit;

    // Step 1: Set reference price from REST orderbook if basePrice=0.
    // When _needsReinit=true (TP filled in previous cycle with basePrice=0),
    // the engine has re-fetched a fresh orderbook — consume the new bid0
    // and rebuild the ladder with the updated reference price.
    if (this._needsReinit) {
      this._needsReinit = false;
      // Clear resetCancelPending: reinit is a synchronous block — between
      // resetLadder() and placeLadderEntries(), no WS push can arrive.
      // Also clear _lastResetTime: the orphan-fill recovery (Path B) in
      // handleOrderUpdates should NOT fire after reinit, because reinit
      // places a new entry 0 — if the old entry 0's late FILLED is then
      // processed via Path B, it would create duplicate inventory alongside
      // the new entry 0. Path A (resetCancelPending=true) covers the
      // pre-reinit race window; post-reinit late FILLED is correctly
      // skipped (blacklisted + resetCancelPending=false + no _lastResetTime).
      this.resetCancelPending = false;
      this._lastResetTime = 0;
      // Full state reset: clear all tracking maps so stale data from the
      // previous cycle (old ladder, legs, pending cancels) doesn't contaminate
      // the new cycle. resetLadder also adds all current order IDs to
      // previousCycleOrderIds to handle delayed WS pushes.
      this.resetLadder();
      if (initialData.orderBook) {
        const freshBid0 = initialData.orderBook.bids?.[0]?.[0];
        if (freshBid0 && freshBid0.gt(0)) {
          this.referencePrice = freshBid0;
          this._logger.info(
            `[processInitialData] Reinit: updated reference price from fresh REST orderbook bid0: ${this.referencePrice.toString()}`,
          );
        } else {
          this._logger.warn(
            `[processInitialData] Reinit: orderbook fetched but bid0 is empty/invalid. Keeping stale reference: ${this.referencePrice.toString()}`,
          );
        }
        // Capture ask0 for TP price capping
        const freshAsk0 = initialData.orderBook.asks?.[0]?.[0];
        if (freshAsk0 && freshAsk0.gt(0)) {
          this._currentAsk0 = freshAsk0;
        }
      } else {
        this._logger.warn(
          `[processInitialData] Reinit: no orderBook in initialData. Keeping stale reference: ${this.referencePrice.toString()}`,
        );
      }
      // Force rebuild ladder with the fresh reference price
      this.steps = [];
    }

    // Capture ask0 from REST orderbook for TP price flooring (max(ask0, tpPrice)).
    // This runs regardless of basePrice — even basePrice>0 strategies need ask0.
    if (initialData.orderBook) {
      const ask0 = initialData.orderBook.asks?.[0]?.[0];
      if (ask0 && ask0.gt(0)) {
        this._currentAsk0 = ask0;
      }
      // Also use bid0 as reference price for basePrice=0 strategies
      if (this.referencePrice.lte(0)) {
        const bestBid = initialData.orderBook.bids?.[0]?.[0];
        if (bestBid && bestBid.gt(0)) {
          this.referencePrice = bestBid;
          this._logger.debug(
            `[processInitialData] Reference price from REST orderbook bid0: ${this.referencePrice.toString()}`,
          );
        }
      }
    }

    // If basePrice=0 and no orderbook was fetched, we cannot proceed
    if (this.referencePrice.lte(0)) {
      this._logger.warn(
        `[processInitialData] basePrice=0 but no orderBook available in initialData. ` +
          `Cannot determine reference price. Make sure getInitialDataConfig() returns fetchOrderBook.enabled=true. ` +
          `No entry orders will be placed.`,
      );
      return [];
    }

    // Step 1b: If there is an active TP order in openOrders, reverse-engineer
    // the referencePrice from it instead of using the fresh bid0. This ensures
    // the rebuilt ladder prices match the entry orders still on the exchange.
    // (Only when not _needsReinit — reinit starts a fresh cycle with fresh bid0.)
    if (!isReinit && initialData.openOrders) {
      const tpOrder = initialData.openOrders.find(
        (o) =>
          o.symbol === this._symbol &&
          o.side === OrderSide.SELL &&
          (o.status === OrderStatus.NEW || o.status === OrderStatus.PARTIALLY_FILLED) &&
          o.clientOrderId &&
          this.isStrategyOrderId(o.clientOrderId) &&
          /^(T)\d+D/.test(o.clientOrderId),
      );
      if (tpOrder && tpOrder.quantity && tpOrder.quantity.gt(0)) {
        // Infer filledStepCount from TP qty vs step quantities.
        // Step quantities don't depend on referencePrice, so we can compute
        // them directly without building the full ladder.
        let cumulative = new Decimal(0);
        let filledStepCount = 0;
        for (let i = 0; i < this.ladderSteps; i++) {
          let qty: Decimal;
          if (this.qtyType === 'arithmetic') {
            qty = this.qtyPerStep.plus(this.qtyStepAdd.mul(i));
          } else {
            qty = this.qtyPerStep.mul(this.qtyStepRatio.pow(i));
          }
          cumulative = cumulative.plus(qty);
          if (tpOrder.quantity.gte(cumulative)) {
            filledStepCount++;
          } else {
            break;
          }
        }
        if (filledStepCount > 0) {
          const recoveredRef = this.reverseEngineerReferencePrice(
            tpOrder,
            filledStepCount,
          );
          if (recoveredRef && recoveredRef.gt(0)) {
            this.referencePrice = recoveredRef;
            this.referencePriceWasReversedFromTp = true;
            this._logger.info(
              `[processInitialData] Reverse-engineered referencePrice from TP: ${recoveredRef.toString()} ` +
                `(TP price=${tpOrder.price?.toString()}, qty=${tpOrder.quantity.toString()}, filledSteps=${filledStepCount})`,
            );
          }
        }
      }
    }

    // Step 1c: If there is an active entry order (but no TP) in openOrders,
    // reverse-engineer referencePrice from it instead of using the fresh bid0.
    // This handles the case where the service restarts between entry 0 placement
    // and its fill — bid0 may have moved, causing buildLadder to produce different
    // prices that don't match the existing entry order, leading to duplicate entries.
    // (Only when not _needsReinit — reinit starts a fresh cycle with fresh bid0.)
    if (!isReinit && initialData.openOrders) {
      const entryOrder = initialData.openOrders.find(
        (o) =>
          o.symbol === this._symbol &&
          o.side === OrderSide.BUY &&
          (o.status === OrderStatus.NEW || o.status === OrderStatus.PARTIALLY_FILLED) &&
          o.clientOrderId &&
          this.isStrategyOrderId(o.clientOrderId) &&
          /^(E)\d+D/.test(o.clientOrderId),
      );
      if (
        entryOrder &&
        entryOrder.price &&
        entryOrder.price.gt(0) &&
        // Only reverse-engineer if we haven't already done so from TP
        // (TP is more reliable as it encodes VWAP across all filled steps)
        !this.referencePriceWasReversedFromTp
      ) {
        // Determine stepIndex by matching entry price against the ladder we
        // just built (Step 1/2 already set referencePrice from bid0 or TP).
        // CRITICAL: Do NOT extract stepIndex from clientOrderId — the seq in
        // E{strategyId}D{seq}D{timestamp} is a GLOBAL order sequence counter
        // (BaseStrategy.orderSequence++), NOT a ladder step index. Using seq
        // as stepIndex produces wildly wrong referencePrice when seq exceeds
        // the number of ladder steps (e.g. seq=11 with 5-step ladder →
        // stepIndex=10 → ref = price / (1-stepValue%)^11 → price far above
        // market → entries placed above ask → immediate loss on fill).
        //
        // Strategy: try price matching first (0.5% tolerance to absorb bid0
        // drift between restart). If no match, assume step 0 — in sequential
        // mode, an active entry with no TP means step 0 hasn't filled yet.
        // If there were filled steps, a TP would exist.
        let matchedStepIndex = -1;
        const matchTolerance = entryOrder.price.mul(0.005); // 0.5%
        for (const step of this.steps) {
          if (step.price.minus(entryOrder.price).abs().lte(matchTolerance)) {
            matchedStepIndex = step.index;
            break;
          }
        }
        // Fallback: if no price match, assume step 0 (sequential mode:
        // active entry + no TP = step 0 still pending)
        if (matchedStepIndex < 0) {
          matchedStepIndex = 0;
          this._logger.warn(
            `[processInitialData] Entry order ${entryOrder.clientOrderId} price=${entryOrder.price.toString()} ` +
              `does not match any ladder step (referencePrice=${this.referencePrice.toString()}, tolerance=0.5%). ` +
              `Assuming step 0 (sequential mode: active entry + no TP = step 0 pending).`,
          );
        }

        const stepPercent = this.stepValue.div(100);
        let factor: Decimal;
        if (this.stepType === 'arithmetic') {
          // price[i] = ref - stepValue * (i+1) → ref = price + stepValue * (i+1)
          factor = this.stepValue.mul(matchedStepIndex + 1);
          const recoveredRef = entryOrder.price.plus(factor);
          if (recoveredRef.gt(0)) {
            this.referencePrice = recoveredRef;
            this._logger.info(
              `[processInitialData] Reverse-engineered referencePrice from entry order: ${recoveredRef.toString()} ` +
                `(entry price=${entryOrder.price.toString()}, stepIndex=${matchedStepIndex}, stepValue=${this.stepValue.toString()})`,
            );
          }
        } else {
          // price[i] = ref * (1-stepValue/100)^(i+1) → ref = price / (1-stepValue/100)^(i+1)
          factor = new Decimal(1).minus(stepPercent).pow(matchedStepIndex + 1);
          if (factor.gt(0)) {
            const recoveredRef = entryOrder.price.div(factor);
            if (recoveredRef.gt(0)) {
              this.referencePrice = recoveredRef;
              this._logger.info(
                `[processInitialData] Reverse-engineered referencePrice from entry order: ${recoveredRef.toString()} ` +
                  `(entry price=${entryOrder.price.toString()}, stepIndex=${matchedStepIndex}, stepPercent=${stepPercent.toString()})`,
              );
            }
          }
        }
      }
    }

    if (this.steps.length === 0 && this.referencePrice.gt(0)) {
      this.steps = this.buildLadder();
    }

    // Step 3: Recover existing open orders
    // Skip during reinit — old cycle's orders are being cancelled by handleTpFilled.
    // Recovering them into the new cycle would create stale inventory.
    if (initialData.openOrders && !isReinit) {
      const ownedOrders = initialData.openOrders.filter((order) => {
        if (order.symbol !== this._symbol) return false;
        return (
          (order.strategyId && order.strategyId === this.getStrategyId()) ||
          (order.clientOrderId && this.isStrategyOrderId(order.clientOrderId))
        );
      });

      for (const order of ownedOrders) {
        if (!order.clientOrderId) continue;
        let metadata = this.orderMetadataMap.get(order.clientOrderId);
        if (!metadata) metadata = this.ensureRecoveredMetadata(order);
        if (!metadata) continue;

        this.orders.set(order.clientOrderId, order);

        // Recover stepIndex for entry orders
        if (
          metadata.signalType === SignalType.Entry &&
          metadata.stepIndex === undefined
        ) {
          const recoveredStepIndex = this.recoverStepIndex(order);
          if (recoveredStepIndex !== undefined) {
            metadata.stepIndex = recoveredStepIndex;
            const step = this.steps[recoveredStepIndex];
            if (step) {
              step.entryClientOrderId = order.clientOrderId;
              if (
                order.status === OrderStatus.FILLED ||
                (order.executedQuantity && order.executedQuantity.eq(order.quantity))
              ) {
                step.filled = true;
              }
            }
          }
        } else if (
          metadata.signalType === SignalType.Entry &&
          metadata.stepIndex !== undefined
        ) {
          const step = this.steps[metadata.stepIndex];
          if (step) {
            step.entryClientOrderId = order.clientOrderId;
            if (
              order.status === OrderStatus.FILLED ||
              (order.executedQuantity && order.executedQuantity.eq(order.quantity))
            ) {
              step.filled = true;
            }
          }
        }

        if (metadata.signalType === SignalType.TakeProfit) {
          this.tpClientOrderId = order.clientOrderId;
        }

        // Track executed quantities for VWAP recalculation
        if (order.executedQuantity && order.executedQuantity.gt(0)) {
          this.processedQuantityMap.set(order.clientOrderId, order.executedQuantity);
          if (metadata.signalType === SignalType.Entry) {
            metadata.entryPrice = (order.averagePrice || order.price)?.toString();
          }
        }
      }

      // Restore entry0PlacedTime for resetInterval feature.
      // On restart, entry0PlacedTime is 0 (constructor default), which disables
      // the reset check. If entry 0 is active (NEW/PARTIALLY_FILLED) and is the
      // only active entry, restore the timestamp so resetInterval continues to
      // work after restart. Use order.updateTime if available (exchange-side),
      // otherwise fall back to Date.now() (conservative — may delay first reset).
      if (
        this.resetInterval > 0 &&
        this.entry0PlacedTime === 0 &&
        this.steps.length > 0
      ) {
        const step0 = this.steps[0];
        if (step0.entryClientOrderId) {
          const entry0Order = this.orders.get(step0.entryClientOrderId);
          if (
            entry0Order &&
            (entry0Order.status === OrderStatus.NEW ||
              entry0Order.status === OrderStatus.PARTIALLY_FILLED)
          ) {
            // Use updateTime from exchange if available, otherwise Date.now()
            this.entry0PlacedTime = entry0Order.updateTime?.getTime() ?? Date.now();
            this._logger.debug(
              `[processInitialData] Restored entry0PlacedTime=${new Date(this.entry0PlacedTime).toISOString()} ` +
                `from recovered entry 0 (status=${entry0Order.status})`,
            );
          }
        }
      }

      // Step 4: Recalculate VWAP from all recovered entry orders
      this.recalculateVWAP();

      // Step 4a: Recover FILLED entry orders from orderHistory.
      // openOrders only contains NEW / PARTIALLY_FILLED — FILLED orders are
      // NOT included. Without orderHistory, the strategy cannot know which
      // ladder steps have already filled, leading to duplicate entry orders
      // on restart. orderHistory is fetched via REST getOrderHistory and
      // contains recent FILLED / CANCELED / REJECTED / EXPIRED orders.
      //
      // CRITICAL: Skip during reinit (TP filled → new cycle). orderHistory
      // contains FILLED entries from the PREVIOUS cycle. Recovering them
      // would rebuild stale inventory/VWAP → place a TP at the old price →
      // immediate fill → TP storm → financial loss.
      //
      // CRITICAL: Also skip if orderHistory contains FILLED TP orders from
      // this strategy. A FILLED TP means the previous cycle completed — the
      // inventory was already sold. Recovering the old FILLED entries would
      // rebuild stale inventory → place TP at old VWAP → immediate fill →
      // TP storm. This handles the case where the strategy was stopped after
      // a TP storm (multiple TP fills) and is being restarted fresh.
      if (initialData.orderHistory && !isReinit) {
        const ownedHistory = initialData.orderHistory.filter((order) => {
          if (order.symbol !== this._symbol) return false;
          return (
            (order.strategyId && order.strategyId === this.getStrategyId()) ||
            (order.clientOrderId && this.isStrategyOrderId(order.clientOrderId))
          );
        });

        // CRITICAL: Check if orderHistory contains FILLED TP orders from this
        // strategy. A FILLED TP means the cycle already completed — inventory
        // was sold to zero. All FILLED entry orders in this orderHistory belong
        // to COMPLETED cycles and must NOT be recovered. Recovering them would
        // rebuild stale inventory/VWAP → place TP at old VWAP → immediate fill
        // → TP storm.
        const hasFilledTpInHistory = ownedHistory.some(
          (order) =>
            order.clientOrderId &&
            /^T\d+D/.test(order.clientOrderId) &&
            order.status === OrderStatus.FILLED,
        );

        if (hasFilledTpInHistory) {
          // Previous cycle(s) already completed (TP FILLED). Start fresh.
          // Blacklist all old-cycle order IDs to prevent delayed WS pushes
          // from re-introducing them.
          for (const order of ownedHistory) {
            if (order.clientOrderId) {
              this.previousCycleOrderIds.add(order.clientOrderId);
            }
          }

          // CRITICAL FIX: Before skipping all recovery, check if there is REAL
          // unsold inventory from the current (incomplete) cycle.
          //
          // hasFilledTpInHistory detects FILLED TPs from PREVIOUS cycles. But
          // the CURRENT cycle may have a FILLED entry whose TP was never placed
          // (e.g., WS push lost, service crash after fill but before TP signal
          // executed by the engine). In that case:
          //   - openOrders recovery (Step 3) found no active entry/TP for this cycle
          //   - inventoryQty = 0 (no entry recovered from openOrders)
          //   - strategyNetPosition (from DB) > 0 (real unsold position exists)
          //
          // If we skip recovery entirely, the unsold position is abandoned
          // without a TP order → unlimited market risk + inventory accumulation.
          //
          // Fix: recover the MOST RECENT FILLED entry orders from orderHistory
          // (after the last FILLED TP) to rebuild inventory/VWAP, then let the
          // Step 5 safety check + TP placement logic create a TP for them.
          const netPos = initialData.strategyNetPosition;
          if (netPos !== undefined && netPos.gt(0) && this.inventoryQty.lte(0)) {
            // Find the timestamp of the most recent FILLED TP — entries after
            // it belong to the current incomplete cycle.
            let lastFilledTpTime: Date | null = null;
            for (const order of ownedHistory) {
              if (
                order.clientOrderId &&
                /^T\d+D/.test(order.clientOrderId) &&
                order.status === OrderStatus.FILLED &&
                order.timestamp
              ) {
                if (!lastFilledTpTime || order.timestamp > lastFilledTpTime) {
                  lastFilledTpTime = order.timestamp;
                }
              }
            }

            // Recover FILLED entries that were created AFTER the last FILLED TP.
            // These belong to the current incomplete cycle and represent real
            // unsold inventory.
            let recoveredCount = 0;
            for (const order of ownedHistory) {
              if (!order.clientOrderId) continue;
              if (order.side !== OrderSide.BUY) continue;
              if (order.status !== OrderStatus.FILLED) continue;
              // Skip entries without timestamp — can't determine cycle
              // membership, risk of double-counting from previous cycles (R3-M2)
              if (!order.timestamp) continue;
              // Must be after the last FILLED TP (or no FILLED TP at all)
              if (lastFilledTpTime && order.timestamp <= lastFilledTpTime) {
                continue;
              }
              // Skip if already in this.orders
              if (this.orders.has(order.clientOrderId)) continue;

              let metadata = this.orderMetadataMap.get(order.clientOrderId);
              if (!metadata) metadata = this.ensureRecoveredMetadata(order);
              if (!metadata) continue;

              // Remove from blacklist — this is current-cycle inventory
              this.previousCycleOrderIds.delete(order.clientOrderId);

              this.orders.set(order.clientOrderId, order);

              const recoveredStepIndex = this.recoverStepIndex(order);
              if (recoveredStepIndex !== undefined) {
                metadata.stepIndex = recoveredStepIndex;
                const step = this.steps[recoveredStepIndex];
                if (step) {
                  step.entryClientOrderId = order.clientOrderId;
                  step.filled = true;
                }
              }

              if (order.executedQuantity && order.executedQuantity.gt(0)) {
                this.processedQuantityMap.set(
                  order.clientOrderId,
                  order.executedQuantity,
                );
                if (metadata.signalType === SignalType.Entry) {
                  metadata.entryPrice = (order.averagePrice || order.price)?.toString();
                }
              }
              recoveredCount++;
            }

            // Also recover SELL (TP) orders with partial fills from the
            // current cycle (after lastFilledTpTime). Without this, Step 4c
            // would not find them → tpFilledQty=0 → TP oversells by the
            // partial fill amount. R2-C1 fix.
            for (const order of ownedHistory) {
              if (!order.clientOrderId) continue;
              if (order.side !== OrderSide.SELL) continue;
              if (!order.executedQuantity || !order.executedQuantity.gt(0)) continue;
              // Must be after the last FILLED TP
              if (
                lastFilledTpTime &&
                order.timestamp &&
                order.timestamp <= lastFilledTpTime
              ) {
                continue;
              }
              // Skip if already in this.orders
              if (this.orders.has(order.clientOrderId)) continue;

              this.orders.set(order.clientOrderId, order);
              this._logger.info(
                `[processInitialData] Recovered partial-fill TP order ${order.clientOrderId} ` +
                  `(status=${order.status}, executed=${order.executedQuantity.toString()}) for tpFilledQty recovery.`,
              );
            }

            if (recoveredCount > 0) {
              // Re-recalculate VWAP with the recovered entries
              this.recalculateVWAP();
              this._logger.warn(
                `[processInitialData] Found FILLED TP in orderHistory BUT strategyNetPosition=${netPos.toString()} > 0. ` +
                  `Recovered ${recoveredCount} FILLED entries from current incomplete cycle ` +
                  `(after last FILLED TP). inventory=${this.inventoryQty.toString()}, VWAP=${this.vwap.toString()}. ` +
                  `Will place TP to cover unsold position.`,
              );
            } else {
              // No FILLED entries found after the last FILLED TP, but netPos > 0.
              // This can happen if the entry fill is very recent and orderHistory
              // doesn't include it yet, or if the position is from a different source.
              // Use strategyNetPosition as the inventory and recover VWAP from
              // the most recent FILLED entry in history that is AFTER lastFilledTpTime
              // (R2-M4/R3-M1 fix: previously searched ALL ownedHistory, which could
              // pick entries from a completed previous cycle → wrong VWAP).
              let lastFilledEntry: Order | null = null;
              for (const order of ownedHistory) {
                if (
                  order.side === OrderSide.BUY &&
                  order.status === OrderStatus.FILLED &&
                  order.executedQuantity &&
                  order.executedQuantity.gt(0)
                ) {
                  // Skip entries without timestamp — can't determine cycle membership (R3-M2)
                  if (!order.timestamp) continue;
                  // Skip entries at/before lastFilledTpTime (previous cycle)
                  if (lastFilledTpTime && order.timestamp <= lastFilledTpTime) continue;
                  if (
                    !lastFilledEntry ||
                    !lastFilledEntry.timestamp ||
                    order.timestamp > lastFilledEntry.timestamp
                  ) {
                    lastFilledEntry = order;
                  }
                }
              }
              if (lastFilledEntry && lastFilledEntry.clientOrderId) {
                this.previousCycleOrderIds.delete(lastFilledEntry.clientOrderId);
                let metadata = this.orderMetadataMap.get(lastFilledEntry.clientOrderId);
                if (!metadata) metadata = this.ensureRecoveredMetadata(lastFilledEntry);
                if (metadata) {
                  this.orders.set(lastFilledEntry.clientOrderId, lastFilledEntry);
                  const fillPrice = lastFilledEntry.averagePrice || lastFilledEntry.price;
                  if (fillPrice && fillPrice.gt(0)) {
                    // Use DB netPos as authoritative inventory (accounts for
                    // partial TP fills, etc.) and lastKnown fillPrice as VWAP
                    // approximation. Do NOT call recalculateVWAP() here — it
                    // would overwrite netPos with the single order's
                    // executedQuantity, losing the DB-authoritative value.
                    this.inventoryQty = netPos;
                    this.vwap = fillPrice;
                    metadata.entryPrice = fillPrice.toString();
                  }
                  if (lastFilledEntry.executedQuantity) {
                    this.processedQuantityMap.set(
                      lastFilledEntry.clientOrderId,
                      lastFilledEntry.executedQuantity,
                    );
                  }
                }
              }
              this._logger.warn(
                `[processInitialData] Found FILLED TP in orderHistory BUT strategyNetPosition=${netPos.toString()} > 0 ` +
                  `with no recoverable entries after last TP. Used netPos as inventory with last known fill price. ` +
                  `inventory=${this.inventoryQty.toString()}, VWAP=${this.vwap.toString()}.`,
              );
            }
          } else {
            // Recalculate VWAP from openOrders recovery only (Step 4 result).
            // Do NOT recover any FILLED entries from orderHistory.
            this._logger.info(
              `[processInitialData] Found FILLED TP in orderHistory — previous cycle completed. ` +
                `Skipping orderHistory entry recovery to prevent TP storm. ` +
                `Blacklisted ${ownedHistory.length} old-cycle orders.`,
            );
          }
        } else {
          // No FILLED TP in history — safe to recover FILLED entries.

          for (const order of ownedHistory) {
            if (!order.clientOrderId) continue;
            // Skip if already recovered from openOrders
            if (this.orders.has(order.clientOrderId)) continue;

            let metadata = this.orderMetadataMap.get(order.clientOrderId);
            if (!metadata) metadata = this.ensureRecoveredMetadata(order);
            if (!metadata) continue;

            this.orders.set(order.clientOrderId, order);

            if (metadata.signalType === SignalType.Entry) {
              const recoveredStepIndex = this.recoverStepIndex(order);
              if (recoveredStepIndex !== undefined) {
                metadata.stepIndex = recoveredStepIndex;
                const step = this.steps[recoveredStepIndex];
                if (step) {
                  step.entryClientOrderId = order.clientOrderId;
                  if (
                    order.status === OrderStatus.FILLED ||
                    (order.executedQuantity && order.executedQuantity.eq(order.quantity))
                  ) {
                    step.filled = true;
                  }
                }
              }
            }

            if (metadata.signalType === SignalType.TakeProfit) {
              // TP in orderHistory means it was FILLED — cycle already reset.
              // Do NOT set tpClientOrderId (it's no longer active).
            }

            // Track executed quantities for VWAP recalculation
            if (order.executedQuantity && order.executedQuantity.gt(0)) {
              this.processedQuantityMap.set(order.clientOrderId, order.executedQuantity);
              if (metadata.signalType === SignalType.Entry) {
                metadata.entryPrice = (order.averagePrice || order.price)?.toString();
              }
            }
          }

          // Re-recalculate VWAP with the recovered FILLED orders
          this.recalculateVWAP();
        } // end else (no FILLED TP in history)
      }

      // Step 4a-b: Infer filled steps from active TP order quantity.
      // The TP quantity always equals the sum of all filled entry quantities
      // in the current cycle (TP is rebuilt on every entry fill). By matching
      // the TP quantity against the cumulative step quantities, we can
      // determine exactly how many steps have filled — regardless of whether
      // price matching succeeded or the ladder formula changed between versions.
      // This is more reliable than counting orderHistory FILLED entries (which
      // span multiple cycles) or price matching (which breaks on formula changes).
      if (this.tpClientOrderId) {
        const tpOrder = this.orders.get(this.tpClientOrderId);
        if (tpOrder && tpOrder.quantity && tpOrder.quantity.gt(0)) {
          let cumulative = new Decimal(0);
          let filledStepCount = 0;
          for (let i = 0; i < this.steps.length; i++) {
            cumulative = cumulative.plus(this.steps[i].quantity);
            if (tpOrder.quantity.gte(cumulative)) {
              filledStepCount = i + 1;
            } else {
              break;
            }
          }

          // Collect all active (NEW / PARTIALLY_FILLED) entry orders recovered
          // from openOrders. These are the next pending entries in the cycle.
          const activeEntryOrders: Array<{
            coid: string;
            order: Order;
          }> = [];
          for (const [coid, meta] of this.orderMetadataMap) {
            if (meta.signalType !== SignalType.Entry) continue;
            const ord = this.orders.get(coid);
            if (!ord) continue;
            if (
              ord.status === OrderStatus.NEW ||
              ord.status === OrderStatus.PARTIALLY_FILLED
            ) {
              activeEntryOrders.push({ coid, order: ord });
            }
          }

          // Reset all steps' fill state and entryClientOrderId that were set
          // by unreliable price matching. We will rebuild from TP qty inference
          // + active entry orders.
          for (let i = 0; i < this.steps.length; i++) {
            const step = this.steps[i];
            if (i < filledStepCount) {
              // This step must be filled
              step.filled = true;
              // Clear any entryClientOrderId that was set by price matching to
              // an active order — that order belongs to a later step.
              if (step.entryClientOrderId) {
                const linkedOrder = this.orders.get(step.entryClientOrderId);
                if (
                  linkedOrder &&
                  (linkedOrder.status === OrderStatus.NEW ||
                    linkedOrder.status === OrderStatus.PARTIALLY_FILLED)
                ) {
                  step.entryClientOrderId = null;
                }
              }
              this._logger.debug(
                `[processInitialData] TP-qty inference: step ${i} filled ` +
                  `(TP qty=${tpOrder.quantity.toString()})`,
              );
            } else {
              // Not filled — clear any stale price-match assignment
              step.filled = false;
              step.entryClientOrderId = null;
            }
          }

          // Assign active entry orders to steps starting at filledStepCount
          // (the first unfilled step). If there's exactly one active entry,
          // assign it to filledStepCount. If multiple, assign in order.
          let nextStep = filledStepCount;
          for (const { coid } of activeEntryOrders) {
            if (nextStep >= this.steps.length) break;
            if (this.steps[nextStep].entryClientOrderId) {
              nextStep++;
              continue;
            }
            this.steps[nextStep].entryClientOrderId = coid;
            const meta = this.orderMetadataMap.get(coid);
            if (meta) meta.stepIndex = nextStep;
            this._logger.debug(
              `[processInitialData] TP-qty inference: assigned active entry ${coid} ` +
                `to step ${nextStep} (was mismatches by price)`,
            );
            nextStep++;
          }

          // Also handle partial fills: if TP qty > expected cumulative after
          // filledStepCount, the step at filledStepCount has a partial fill.
          // The active entry order assigned to that step handles this.
          const expectedCumulative = this.steps
            .slice(0, filledStepCount)
            .reduce((sum, s) => sum.plus(s.quantity), new Decimal(0));
          if (
            tpOrder.quantity.gt(expectedCumulative) &&
            filledStepCount < this.steps.length
          ) {
            this._logger.debug(
              `[processInitialData] Step ${filledStepCount} likely has partial fill ` +
                `(TP qty=${tpOrder.quantity.toString()} > expected=${expectedCumulative.toString()})`,
            );
          }
        }
      }

      // Step 4b: Infer prior steps as filled.
      // openOrders only contains NEW / PARTIALLY_FILLED orders — FILLED orders
      // are NOT included. In sequential mode, step N can only be open if all
      // prior steps 0..N-1 have fully filled. So if we recovered an active
      // (NEW / PARTIALLY_FILLED) entry at step N, mark all prior steps as
      // filled so placeLadderEntries does not re-place them.
      // Also: if there is an active TP order, at least one entry must have
      // filled — mark step 0 as filled if no entries were recovered.
      for (let i = 0; i < this.steps.length; i++) {
        const step = this.steps[i];
        if (!step.entryClientOrderId) continue;
        const order = this.orders.get(step.entryClientOrderId);
        if (
          order &&
          (order.status === OrderStatus.NEW ||
            order.status === OrderStatus.PARTIALLY_FILLED)
        ) {
          // This step has an active order — all prior steps must be filled.
          for (let j = 0; j < i; j++) {
            if (!this.steps[j].filled) {
              this.steps[j].filled = true;
              this._logger.debug(
                `[processInitialData] Inferred step ${j} as filled ` +
                  `(step ${i} has active order in sequential mode)`,
              );
            }
          }
        }
      }

      // If we have an active TP but no entry was recovered as filled,
      // at least step 0 must have filled to produce the inventory.
      if (this.tpClientOrderId && this.inventoryQty.gt(0)) {
        const hasAnyFilledStep = this.steps.some((s) => s.filled);
        if (!hasAnyFilledStep && this.steps.length > 0) {
          this.steps[0].filled = true;
          this._logger.debug(
            `[processInitialData] Inferred step 0 as filled ` +
              `(active TP + inventory=${this.inventoryQty.toString()} but no filled step recovered)`,
          );
        }
      }

      this._logger.debug(
        `[processInitialData] Recovery: ${ownedOrders.length} orders recovered, ` +
          `inventory=${this.inventoryQty.toString()}, VWAP=${this.vwap.toString()}, ` +
          `active TP=${this.tpClientOrderId ?? 'none'}`,
      );
    }

    // Step 4c: Recover tpFilledQty from ALL SELL orders with executedQuantity > 0
    // in this.orders. This includes:
    //   - PARTIALLY_FILLED TP (from openOrders) — the active TP
    //   - CANCELED TP with partial fill (from orderHistory — happens when
    //     refreshTakeProfit cancels the old TP and places a new one; the old
    //     TP may have partial fills before the cancel took effect)
    //   - Partial-fill SELL orders recovered by the R2-C1 fix in the new
    //     unsold-inventory recovery path (hasFilledTpInHistory && netPos > 0)
    // Without recovering all of them, tpFilledQty would be understated →
    // refreshTakeProfit would oversell by the unrecovered amount.
    // On restart, tpFilledQty starts at 0, so there is no double-counting risk.
    // The new recovery path (R2-C1) now also adds partial-fill SELL orders to
    // this.orders, so they are correctly counted here.
    if (!isReinit) {
      for (const order of this.orders.values()) {
        if (
          order.side === OrderSide.SELL &&
          order.executedQuantity &&
          order.executedQuantity.gt(0)
        ) {
          this.tpFilledQty = this.tpFilledQty.plus(order.executedQuantity);
          this._logger.info(
            `[processInitialData] Recovered tpFilledQty from TP order ` +
              `${order.clientOrderId} (status=${order.status}, executed=${order.executedQuantity.toString()}), ` +
              `tpFilledQty=${this.tpFilledQty.toString()}.`,
          );
        }
      }
    }

    // Step 5: If inventory > 0 but no active TP, create one
    // SAFETY: strategyNetPosition is the net executed position from the DB
    // (BUY FILLED - SELL FILLED, filtered by strategyId). If it's <= 0 while
    // inventoryQty > 0, the inventory was recovered from stale orderHistory
    // after all position was already sold (e.g., TP storm). Placing a TP would
    // sell non-existent position → another TP storm. Reset to 0 and skip TP.
    const netPos = initialData.strategyNetPosition;
    // Store strategyNetPosition for handleOrderUpdates to detect
    // console-restart orphaned fills (delayed WS FILLED arrives post-restart
    // for a blacklisted order that processInitialData couldn't recover).
    this._recoveredNetPos = netPos ?? new Decimal(0);
    this._recoveredNetPosTime = Date.now();
    if (netPos !== undefined && netPos.lte(0) && this.inventoryQty.gt(0)) {
      this._logger.warn(
        `[processInitialData] SAFETY: inventoryQty=${this.inventoryQty.toString()} ` +
          `but strategyNetPosition=${netPos.toString()} <= 0 (from DB). ` +
          `Stale inventory detected — resetting to 0, skipping TP placement.`,
      );
      this.inventoryQty = new Decimal(0);
      this.tpFilledQty = new Decimal(0);
      this.vwap = new Decimal(0);
    }
    if (this.inventoryQty.gt(0) && !this.tpClientOrderId) {
      signals.push(...this.refreshTakeProfit());
    }

    // Step 6: Place remaining ladder entries
    // Decision tree when restarting with a recovered TP order:
    //
    //  hasActiveEntry?  → skip (that order is the current sequential entry)
    //  no active entry + has TP + inventory > 0:
    //    TP qty = sum of filled step quantities.
    //    All steps with cumulative <= TP qty are marked filled.
    //    If all steps are filled → no entry needed (waiting for TP fill).
    //    If steps remain → place next unfilled step's entry.
    //  no active entry + no TP:
    //    Fresh start or all orders were cancelled → place step 0 (or next unfilled).
    const hasActiveEntry = this.steps.some((step) => {
      if (!step.entryClientOrderId) return false;
      const ord = this.orders.get(step.entryClientOrderId);
      return (
        ord &&
        (ord.status === OrderStatus.NEW || ord.status === OrderStatus.PARTIALLY_FILLED)
      );
    });

    if (hasActiveEntry) {
      this._logger.debug(
        '[processInitialData] Active entry order already exists — skipping placeLadderEntries',
      );
    } else if (this.tpClientOrderId && this.inventoryQty.gt(0)) {
      // Has TP + inventory but no active entry.
      // TP qty inference (Step 4a-b) already marked filled steps.
      const allFilled = this.steps.length > 0 && this.steps.every((step) => step.filled);
      if (allFilled) {
        // All entries filled, waiting for TP to fill. Nothing to place.
        this._logger.debug(
          `[processInitialData] All ${this.steps.length} steps filled, ` +
            `TP active (qty=${this.inventoryQty.toString()}) — waiting for TP fill, no entry needed`,
        );
      } else {
        // There are remaining unfilled steps — place the next one.
        this._logger.debug(
          '[processInitialData] No active entry but unfilled steps remain — placing next entry',
        );
        signals.push(...this.placeLadderEntries());
      }
    } else {
      // No TP, no active entry — fresh start or full reset.
      signals.push(...this.placeLadderEntries());
    }

    return signals;
  }

  /**
   * Check if the resetInterval condition is met and perform the reset.
   *
   * Reset condition: ALL of the following must be true:
   * 1. resetInterval > 0 (feature enabled)
   * 2. inventoryQty = 0 (no filled entries)
   * 3. No active TP order (no inventory → no TP)
   * 4. Entry 0 exists and its order status is NEW (unfilled, not even partial)
   * 5. No other entries are active (only entry 0 is pending)
   * 6. entry0PlacedTime > 0 and the elapsed time >= resetInterval minutes
   *
   * Reset action:
   * 1. Cancel entry 0's order
   * 2. Clear all tracking state (resetLadder) to prevent stale data contamination
   * 3. Clear any pending TP debounce state
   * 4. Set _needsReinit=true → engine re-fetches orderbook and re-runs processInitialData
   *
   * Note: Reset is only meaningful when basePrice=0 (dynamic bid0). When basePrice>0
   * (fixed price), rebuilding the ladder produces identical prices, so reset is skipped.
   *
   * @returns StrategyResult[] containing cancel signal if reset was triggered, empty otherwise
   */
  private checkAndPerformReset(): StrategyResult[] {
    if (this.resetInterval <= 0) return [];
    // Reset is only meaningful for dynamic price (basePrice=0). For fixed price,
    // rebuilding produces identical prices — skip to avoid pointless cancel+place.
    if (this.basePrice.gt(0)) return [];
    if (this.entry0PlacedTime <= 0) return [];
    if (this.inventoryQty.gt(0)) return [];
    if (this.tpClientOrderId) return [];

    // Check elapsed time
    const elapsedMs = Date.now() - this.entry0PlacedTime;
    const intervalMs = this.resetInterval * 60 * 1000;
    if (elapsedMs < intervalMs) return [];

    // Find entry 0's active order
    if (this.steps.length === 0) return [];
    const step0 = this.steps[0];
    if (!step0.entryClientOrderId) return [];

    const entry0Order = this.orders.get(step0.entryClientOrderId);
    if (!entry0Order) return [];
    if (entry0Order.status !== OrderStatus.NEW) return [];

    // Verify NO other entries are active (only entry 0 should be pending)
    for (let i = 1; i < this.steps.length; i++) {
      const step = this.steps[i];
      if (step.entryClientOrderId) {
        const ord = this.orders.get(step.entryClientOrderId);
        if (
          ord &&
          (ord.status === OrderStatus.NEW || ord.status === OrderStatus.PARTIALLY_FILLED)
        ) {
          // Another entry is active — not a clean entry-0-only state
          return [];
        }
      }
    }

    // Also check pendingClientOrderIds for any entry signals not yet linked to steps
    for (const coid of this.pendingClientOrderIds) {
      const meta = this.orderMetadataMap.get(coid);
      if (!meta || meta.signalType !== SignalType.Entry) continue;
      if (coid === step0.entryClientOrderId) continue; // entry 0 itself
      const ord = this.orders.get(coid);
      if (
        !ord ||
        ord.status === OrderStatus.NEW ||
        ord.status === OrderStatus.PARTIALLY_FILLED
      ) {
        // Untracked active entry found — abort reset
        this._logger.warn(
          `[checkAndPerformReset] Found untracked active entry ${coid}, aborting reset`,
        );
        return [];
      }
    }

    // Reset condition met — cancel entry 0 and rebuild
    this._logger.info(
      `[checkAndPerformReset] Reset triggered: entry 0 has been pending for ${Math.floor(elapsedMs / 1000)}s ` +
        `(resetInterval=${this.resetInterval}min). Cancelling entry 0.`,
    );

    const signals: StrategyResult[] = [];

    // Set resetCancelPending so handleOrderUpdates knows this is a reset-cancel
    // (not a TP-filled cycle switch) and can process FILLED pushes as a race
    // condition exception (entry 0 may have filled just before cancel arrived).
    // resetCancelPending is cleared in processInitialData (reinit) and placeLadderEntries.
    this.resetCancelPending = true;
    this._lastResetTime = Date.now();

    // Blacklist entry 0's clientOrderId so handleOrderUpdates can detect
    // the race-fill (entry 0 filled before cancel arrived). Without this,
    // race-fill goes through normal path without clearing _needsReinit →
    // processInitialData reinit wipes the fill's TP/entry 1.
    // (resetLadder is NOT called here, so we must add manually.)
    this.previousCycleOrderIds.add(step0.entryClientOrderId);

    // Cancel entry 0. resetLadder() in processInitialData's reinit path will
    // clear all tracking maps and add remaining IDs to previousCycleOrderIds.
    signals.push(
      this.generateCancelSignal(step0.entryClientOrderId, 'ladder_reset_interval'),
    );

    // Clear any pending TP debounce state (defensive — reset condition requires
    // no TP, but tpRefreshPending may be stale from a prior partial fill)
    this.tpRefreshPending = false;
    this.lastPartialFillTpTriggerTime = 0;

    // Do NOT call resetLadder() here. If entry 0 race-fills (cancel arrives at
    // exchange after fill), handleOrderUpdates needs orderMetadataMap intact
    // to process the fill. resetLadder() would clear maps → fill lost → orphaned
    // position. Instead, resetLadder() is deferred to processInitialData's reinit
    // path (normal case: cancel succeeded, no race-fill). In the race-fill case,
    // handleOrderUpdates clears _needsReinit and processes the fill normally.

    // Request engine to re-fetch orderbook via REST and re-run processInitialData
    // with a fresh bid0. The new cycle's ladder will be built with the updated price.
    this._needsReinit = true;
    this._logger.debug(
      `[checkAndPerformReset] Set _needsReinit=true. ` +
        `Engine will re-fetch orderbook and rebuild ladder with fresh bid0.`,
    );

    return signals;
  }

  /**
   * Analyze real-time data updates.
   * Processes order updates and orderbook pushes from WebSocket.
   * Orderbook is subscribed for real-time ask0 used in TP pricing.
   */
  public override async analyze(dataUpdate: DataUpdate): Promise<StrategyAnalyzeResult> {
    // Update real-time ask0 from orderbook push (if present).
    if (dataUpdate.orderbook) {
      const obSymbol = dataUpdate.orderbook.symbol || dataUpdate.symbol;
      const sameSymbol = !obSymbol || obSymbol === this._symbol;
      const sameExchange =
        !dataUpdate.exchangeName || dataUpdate.exchangeName === this._exchangeName;
      if (sameSymbol && sameExchange) {
        const ask0 = dataUpdate.orderbook.asks?.[0]?.[0];
        if (ask0 && ask0.gt(0)) {
          this._currentAsk0 = ask0;
        }
      }
    }

    // Check for deferred TP refresh from partial-fill debounce.
    // If the debounce window has elapsed since the last partial fill,
    // execute the pending TP refresh now (before processing new orders).
    const tpDebounceSignals: StrategyResult[] = [];
    if (
      this.tpRefreshPending &&
      Date.now() - this.lastPartialFillTpTriggerTime >=
        LadderEntrySingleTPStrategy.TP_DEBOUNCE_MS
    ) {
      this.tpRefreshPending = false;
      if (this.inventoryQty.gt(0)) {
        this._logger.debug(
          `[analyze] Executing deferred TP refresh from partial fill. ` +
            `Inventory: ${this.inventoryQty.toString()}, VWAP: ${this.vwap.toString()}`,
        );
        tpDebounceSignals.push(...this.refreshTakeProfit());
      }
    }

    // Check if the resetInterval feature should trigger a reset.
    // This runs BEFORE processing order updates so that a reset (cancel entry 0
    // + rebuild) takes priority over handling incoming WS pushes for entry 0.
    const resetSignals = this.checkAndPerformReset();
    if (resetSignals.length > 0) {
      // Reset triggered — return immediately. The engine will process cancel
      // signals, and if _needsReinit is true, re-fetch orderbook and re-run
      // processInitialData. Any WS orders in this dataUpdate will be processed
      // in the next analyze() call after reinit completes.
      // Note: handleOrderUpdates has a FILLED exception for blacklisted orders
      // to prevent losing fills that happened just before the cancel was sent.
      return resetSignals;
    }

    // Only handle order updates (no orderbook/kline subscription)
    if (dataUpdate.orders && dataUpdate.orders.length > 0) {
      const orderSignals = this.handleOrderUpdates(dataUpdate.orders);
      // Merge deferred TP signals with order update signals
      const allSignals = [...tpDebounceSignals, ...orderSignals];

      // SAFETY NET: If inventory > 0 but no active TP order exists after
      // processing order updates, place a TP immediately. This catches the
      // case where handleEntryFilled's refreshTakeProfit() signal was lost
      // (e.g., engine failed to execute, WS push was missed/replayed, or
      // the TP order was rejected by the exchange). Without this safety net,
      // the strategy accumulates inventory without a corresponding TP order,
      // exposing the position to unlimited market risk.
      // Do NOT trigger during partial-fill debounce — the deferred TP refresh
      // handles that case and the safety net would bypass the debounce.
      // Also skip if computeTpPrice() would return null (misconfigured
      // tpPercent=0 or tpAbsoluteProfit=0) to avoid persistent no-op calls (R2-M5).
      // Also check: if tpClientOrderId is set but points to a ghost order
      // (not in this.orders and not in pendingClientOrderIds), it was rejected
      // by the exchange but the strategy never got the REJECTED event → clear it
      // so the safety net can fire.
      if (
        this.tpClientOrderId &&
        !this.orders.has(this.tpClientOrderId) &&
        !this.pendingClientOrderIds.has(this.tpClientOrderId)
      ) {
        this._logger.warn(
          `[analyze] SAFETY NET: tpClientOrderId=${this.tpClientOrderId} points to ` +
            `a ghost order (not in this.orders or pendingClientOrderIds). ` +
            `Clearing and re-attempting TP placement.`,
        );
        this.tpClientOrderId = null;
      }
      if (
        this.inventoryQty.gt(0) &&
        !this.tpClientOrderId &&
        !this.tpRefreshPending &&
        this.vwap.gt(0) &&
        this.computeTpPrice() !== null
      ) {
        const safetyTpSignals = this.refreshTakeProfit();
        if (safetyTpSignals.length > 0) {
          this._logger.debug(
            `[analyze] SAFETY NET: inventory=${this.inventoryQty.toString()} > 0 but no active TP. ` +
              `Placing TP (VWAP=${this.vwap.toString()}).`,
          );
          allSignals.push(...safetyTpSignals);
        }
      }

      if (allSignals.length > 0) return allSignals;
      return { action: 'hold' };
    }

    // No order updates — return deferred TP signals if any
    if (tpDebounceSignals.length > 0) return tpDebounceSignals;

    return { action: 'hold' };
  }

  protected async onCleanup(): Promise<void> {
    this.orders.clear();
    this.orderMetadataMap.clear();
    this.pendingClientOrderIds.clear();
    this.processedQuantityMap.clear();
    this.processedTerminalIds.clear();
    this.steps = [];
    this.inventoryQty = new Decimal(0);
    this.tpFilledQty = new Decimal(0);
    this.vwap = new Decimal(0);
    this.tpClientOrderId = null;
    this.tpRefreshPending = false;
    this.lastPartialFillTpTriggerTime = 0;
    this._needsReinit = false;
    this.entry0PlacedTime = 0;
    this.resetCancelPending = false;
    this._lastResetTime = 0;
    this._recoveredNetPos = new Decimal(0);
    this._recoveredNetPosTime = 0;
    this._currentAsk0 = new Decimal(0);
    this.previousCycleOrderIds.clear();
    this._logger.debug('LadderEntrySingleTPStrategy cleaned up');
  }

  /**
   * Engine calls this after each analyze() to check if the strategy needs
   * a fresh REST orderbook fetch + processInitialData re-run.
   * True after TP fill when basePrice=0 (reference price is stale).
   */
  public requiresReinitialization(): boolean {
    return this._needsReinit;
  }

  public getStrategyState() {
    return {
      strategyId: this.getStrategyId(),
      referencePrice: this.referencePrice.toString(),
      inventoryQty: this.inventoryQty.toString(),
      tpFilledQty: this.tpFilledQty.toString(),
      vwap: this.vwap.toString(),
      tpClientOrderId: this.tpClientOrderId,
      tpPrice: this.computeTpPrice()?.toString() ?? null,
      resetInterval: this.resetInterval,
      entry0PlacedTime:
        this.entry0PlacedTime > 0 ? new Date(this.entry0PlacedTime).toISOString() : null,
      resetCancelPending: this.resetCancelPending,
      lastResetTime:
        this._lastResetTime > 0 ? new Date(this._lastResetTime).toISOString() : null,
      recoveredNetPos: this._recoveredNetPos.toString(),
      currentAsk0: this._currentAsk0.toString(),
      steps: this.steps.map((s) => ({
        index: s.index,
        price: s.price.toString(),
        quantity: s.quantity.toString(),
        entryClientOrderId: s.entryClientOrderId,
        filled: s.filled,
      })),
      remainingInvestmentCapacity: this.getRemainingInvestmentCapacity().toString(),
      remainingPositionCapacity: this.getRemainingPositionCapacity().toString(),
      buyingPower: this.getBuyingPower().toString(),
      committedNotional: this.getCommittedNotional().toString(),
    };
  }

  /**
   * No real-time subscriptions. Orderbook is only fetched via REST at init.
   */
  public override getSubscriptionConfig() {
    return {
      method: 'websocket' as const,
      exchange: this._context.exchange,
      // Subscribe to orderbook for real-time ask0 — used to floor TP price
      // at max(ask0, expectedTpPrice) so the TP never sells below market.
      orderbook: { enabled: true, depth: 5 },
    };
  }

  /**
   * Initial data config: fetch open orders + orderbook (REST, for basePrice=0).
   */
  public override getInitialDataConfig() {
    // Always fetch orderbook — even for basePrice>0 strategies — to seed
    // _currentAsk0 for TP price flooring (max(ask0, tpPrice)).
    return {
      fetchPositions: true,
      fetchOpenOrders: true,
      fetchBalance: true,
      fetchOrderBook: { enabled: true, depth: 5 },
      // Fetch recent order history to recover FILLED entry orders on restart.
      // openOrders only contains NEW / PARTIALLY_FILLED — FILLED orders are
      // NOT included. Without order history, the strategy cannot know which
      // ladder steps have already filled, leading to duplicate entry orders.
      fetchOrderHistory: {
        enabled: true,
        // Fetch enough history to cover at least 2-3 full cycles (each cycle
        // has up to ladderSteps entries + 1 TP + cancelled orders). With
        // concurrent strategies on the same symbol, 50 is insufficient.
        // 500 ensures we can detect the last FILLED TP and recover the
        // current cycle's FILLED entries even with multiple strategies
        // sharing the symbol.
        limit: 500,
      },
      // Fetch strategy net position from DB (BUY FILLED - SELL FILLED, filtered
      // by strategyId). Used as safety check: if net position <= 0, skip TP
      // placement to prevent TP storms from stale inventory recovery.
      fetchStrategyNetPosition: true,
    };
  }
}
