import Decimal from 'decimal.js';

import {
  BinanceExchange,
  CoinbaseExchange,
  OKXExchange,
} from '@itrade/exchange-connectors';
import {
  AccountWalletType,
  IExchange,
  Order,
  OrderSide,
  OrderStatus,
  OrderType,
  Position,
  TimeInForce,
  TradeMode,
} from '@itrade/core';
import {
  AccountInfoEntity,
  isValidExchange,
  OrderEntity,
  PositionEntity,
} from '@itrade/data-manager';
import { CryptoUtils } from '@itrade/utils/CryptoUtils';

import { getDataManager } from '@/lib/data-manager';
import { parseSymbol } from '@/lib/exchanges';

import { resolvePerpOrderSettings } from './perp-order-settings';

export interface ManualOrderInput {
  exchange: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: string | number | Decimal;
  price?: string | number | Decimal;
  stopPrice?: string | number | Decimal;
  tradeMode?: TradeMode;
  leverage?: number;
  positionAction?: 'OPEN_LONG' | 'OPEN_SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT';
}

export interface OrderUpdateInput {
  quantity?: string | number | Decimal;
  price?: string | number | Decimal;
  stopPrice?: string | number | Decimal;
}

const OPEN_STATUSES = new Set<OrderStatus>([
  OrderStatus.NEW,
  OrderStatus.PARTIALLY_FILLED,
]);

function getEncryptionKey(): string {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('Server configuration error: ENCRYPTION_KEY missing');
  }
  return encryptionKey;
}

export async function getActiveAccount(userId: string, exchange: string) {
  if (!isValidExchange(exchange)) {
    throw new Error('Invalid exchange');
  }

  const dataManager = await getDataManager();
  const accountRepo = dataManager.getAccountInfoRepository();
  const accounts = await accountRepo.find({
    where: {
      userId,
      exchange,
      isActive: true,
    },
    order: { updateTime: 'DESC' },
  });

  const account = accounts.find((item) => item.apiKey && item.secretKey);

  if (!account) {
    throw new Error('Exchange account not found or inactive');
  }

  if (!account.canTrade) {
    throw new Error('Trading is disabled for this account');
  }

  return account;
}

function getAxiosStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    if (response?.status) {
      return response.status;
    }
  }
  return undefined;
}

function isUnauthorizedError(error: unknown): boolean {
  return getAxiosStatus(error) === 401;
}

export async function createExchangeConnection(
  account: AccountInfoEntity,
  options?: { forceDemo?: boolean },
) {
  const encryptionKey = getEncryptionKey();
  const exchangeName = account.exchange.toLowerCase();
  const useTestnet =
    options?.forceDemo !== undefined
      ? options.forceDemo
      : process.env.EXCHANGE_TESTNET === 'true';

  if (!account.apiKey || !account.secretKey) {
    throw new Error('Exchange credentials are missing');
  }

  const apiKey = CryptoUtils.decrypt(account.apiKey, encryptionKey);
  const secretKey = CryptoUtils.decrypt(account.secretKey, encryptionKey);
  const passphrase = account.passphrase
    ? CryptoUtils.decrypt(account.passphrase, encryptionKey)
    : undefined;

  switch (exchangeName) {
    case 'binance': {
      const exchange = new BinanceExchange(useTestnet);
      await exchange.connect({ apiKey, secretKey, sandbox: useTestnet });
      return { exchange, isDemo: useTestnet };
    }
    case 'okx': {
      if (!passphrase) {
        throw new Error('OKX account requires a passphrase');
      }
      const exchange = new OKXExchange(useTestnet);
      await exchange.connect({
        apiKey,
        secretKey,
        passphrase,
        sandbox: useTestnet,
      });
      return { exchange, isDemo: useTestnet };
    }
    case 'coinbase': {
      const exchange = new CoinbaseExchange();
      await exchange.connect({ apiKey, secretKey, sandbox: useTestnet });
      return { exchange, isDemo: useTestnet };
    }
    default:
      throw new Error('Unsupported exchange');
  }
}

function toDecimal(value: string | number | Decimal): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

function getBalanceAmount(balances: { asset: string; free: Decimal }[], asset: string) {
  const balance = balances.find(
    (item) => item.asset.toUpperCase() === asset.toUpperCase(),
  );
  return balance?.free ?? new Decimal(0);
}

export async function executeManualOrder(userId: string, input: ManualOrderInput) {
  const account = await getActiveAccount(userId, input.exchange);
  const dataManager = await getDataManager();
  let connection = await createExchangeConnection(account);

  try {
    const { isPerpetual } = parseSymbol(input.symbol);
    const isBinance = account.exchange.toLowerCase() === 'binance';
    const isCoinbase = account.exchange.toLowerCase() === 'coinbase';
    const positionAction = input.positionAction;
    const positionSideMap: Record<
      NonNullable<ManualOrderInput['positionAction']>,
      'LONG' | 'SHORT'
    > = {
      OPEN_LONG: 'LONG',
      CLOSE_LONG: 'LONG',
      OPEN_SHORT: 'SHORT',
      CLOSE_SHORT: 'SHORT',
    };
    const reduceOnlyActions = new Set(['CLOSE_LONG', 'CLOSE_SHORT']);
    const sideOverrideMap: Record<
      NonNullable<ManualOrderInput['positionAction']>,
      OrderSide
    > = {
      OPEN_LONG: OrderSide.BUY,
      CLOSE_LONG: OrderSide.SELL,
      OPEN_SHORT: OrderSide.SELL,
      CLOSE_SHORT: OrderSide.BUY,
    };

    // 🆕 Resolve the trading mode / leverage actually sent to the exchange.
    // A Binance perpetual opening order asks for ISOLATED when the caller omits
    // a mode: Binance USDⓈ-M accounts default to CROSSED, so without an explicit
    // request a brand new perpetual position silently ends up on cross margin
    // (strategy 634 / WLDUSDC, 2026-10-01). Coinbase's perp market is cross-only
    // and its connector ignores a mode, so nothing is sent there (a leverage
    // default of 5x still applies); OKX's connector already defaults tdMode per
    // order, but the requested mode is still recorded below for audit.
    const isClosingOrder = positionAction ? reduceOnlyActions.has(positionAction) : false;
    const { tradeMode: resolvedTradeMode, leverage: resolvedLeverage } =
      resolvePerpOrderSettings({
        isPerpetual,
        isClosingOrder,
        isBinance,
        isCoinbase,
        requestedTradeMode: input.tradeMode,
        requestedLeverage: input.leverage,
      });

    const placeOrder = async () => {
      const quantity = toDecimal(input.quantity);
      const price = input.price !== undefined ? toDecimal(input.price) : undefined;
      const side = positionAction ? sideOverrideMap[positionAction] : input.side;

      if (resolvedTradeMode !== input.tradeMode || resolvedLeverage !== input.leverage) {
        console.info('[Orders] Resolved perpetual order settings for manual order', {
          userId,
          symbol: input.symbol,
          requestedTradeMode: input.tradeMode ?? null,
          requestedLeverage: input.leverage ?? null,
          tradeMode: resolvedTradeMode ?? null,
          leverage: resolvedLeverage ?? null,
        });
      }

      return connection.exchange.createOrder(
        input.symbol,
        side,
        input.type,
        quantity,
        price,
        TimeInForce.GTC,
        undefined,
        {
          // 🆕 Perp only, opening orders only: a spot symbol never gets a
          // mode/leverage (the UI hides those fields) and a CLOSE_* never
          // re-asserts one (see resolvePerpOrderSettings).
          tradeMode: resolvedTradeMode,
          leverage: resolvedLeverage,
          positionSide:
            isBinance && isPerpetual && positionAction
              ? positionSideMap[positionAction]
              : undefined,
          reduceOnly:
            isBinance && isPerpetual && positionAction
              ? reduceOnlyActions.has(positionAction)
              : undefined,
          stopPrice: input.stopPrice ? toDecimal(input.stopPrice) : undefined,
        },
      );
    };

    if (account.exchange.toLowerCase() === 'binance') {
      const { base, quote } = parseSymbol(input.symbol);
      if (base && quote && !isPerpetual) {
        const balances = await connection.exchange.getBalances();
        const baseBalance = getBalanceAmount(balances, base);
        const quoteBalance = getBalanceAmount(balances, quote);
        const quantity = toDecimal(input.quantity);
        const price = input.price !== undefined ? toDecimal(input.price) : undefined;
        const side = positionAction ? sideOverrideMap[positionAction] : input.side;

        if (side === OrderSide.SELL) {
          if (baseBalance.lessThan(quantity)) {
            throw new Error(
              `Insufficient ${base} balance. Available: ${baseBalance.toString()}`,
            );
          }
        } else if (price) {
          const requiredQuote = quantity.mul(price);
          if (quoteBalance.lessThan(requiredQuote)) {
            throw new Error(
              `Insufficient ${quote} balance. Available: ${quoteBalance.toString()}`,
            );
          }
        }
      }
    }

    if (account.exchange.toLowerCase() === 'okx') {
      const { base, quote } = parseSymbol(input.symbol);
      if (base && quote && !isPerpetual) {
        const okxExchange = connection.exchange;
        const quantity = toDecimal(input.quantity);
        const price = input.price !== undefined ? toDecimal(input.price) : undefined;
        const side = positionAction ? sideOverrideMap[positionAction] : input.side;

        const ensureTradingBalance = async (asset: string, required: Decimal) => {
          const tradingBalances = await (okxExchange instanceof OKXExchange
            ? okxExchange.getTradingBalances()
            : okxExchange.getBalances());
          const tradingBalance = getBalanceAmount(tradingBalances, asset);
          if (tradingBalance.greaterThanOrEqualTo(required)) {
            return;
          }

          if (okxExchange instanceof OKXExchange) {
            const fundingBalances = await okxExchange.getFundingBalances();
            const fundingBalance = getBalanceAmount(fundingBalances, asset);
            if (fundingBalance.greaterThanOrEqualTo(required)) {
              await okxExchange.transferFunds({
                asset,
                amount: required,
                from: AccountWalletType.FUNDING,
                to: AccountWalletType.TRADING,
              });
              const refreshedTradingBalances = await okxExchange.getTradingBalances();
              const refreshedTradingBalance = getBalanceAmount(
                refreshedTradingBalances,
                asset,
              );
              if (refreshedTradingBalance.greaterThanOrEqualTo(required)) {
                return;
              }
            }
          }

          throw new Error(
            `Insufficient ${asset} trading balance on OKX. Transfer funds from Funding/Saving to Trading.`,
          );
        };

        if (side === OrderSide.SELL) {
          await ensureTradingBalance(base, quantity);
        } else if (price) {
          const requiredQuote = quantity.mul(price);
          await ensureTradingBalance(quote, requiredQuote);
        }
      }
    }

    let order;
    try {
      order = await placeOrder();
    } catch (error) {
      if (
        account.exchange.toLowerCase() === 'okx' &&
        !connection.isDemo &&
        isUnauthorizedError(error)
      ) {
        await connection.exchange.disconnect();
        connection = await createExchangeConnection(account, { forceDemo: true });
        order = await placeOrder();
      } else {
        throw error;
      }
    }

    order.userId = userId;
    order.exchange = input.exchange;
    // 🆕 Persist what we asked the exchange for (audit). Note this is the
    // request, not the resulting position mode: Binance refuses a margin-type
    // switch (-4048: position open, -4047: open orders).
    if (isPerpetual && !isClosingOrder) {
      order.tradeMode = resolvedTradeMode;
      order.leverage = resolvedLeverage;
    }

    const { fills: _fills, ...orderData } = order;
    const savedOrder = await dataManager.saveOrder({
      ...orderData,
      userId,
      exchange: input.exchange,
    });

    return savedOrder;
  } finally {
    await connection.exchange.disconnect();
  }
}

export async function cancelUserOrder(userId: string, orderId: string) {
  const dataManager = await getDataManager();
  const order = await dataManager.getOrder(orderId);

  if (!order) {
    throw new Error('Order not found');
  }

  if (order.userId !== userId) {
    throw new Error('Unauthorized');
  }

  if (!order.exchange) {
    throw new Error('Order exchange is missing');
  }

  if (!OPEN_STATUSES.has(order.status as OrderStatus)) {
    throw new Error('Order is not open');
  }

  const account = await getActiveAccount(userId, order.exchange);
  let connection = await createExchangeConnection(account);

  try {
    let cancelled;
    try {
      cancelled = await connection.exchange.cancelOrder(
        order.symbol,
        order.id,
        order.clientOrderId,
      );
    } catch (error) {
      if (
        account.exchange.toLowerCase() === 'okx' &&
        !connection.isDemo &&
        isUnauthorizedError(error)
      ) {
        await connection.exchange.disconnect();
        connection = await createExchangeConnection(account, { forceDemo: true });
        cancelled = await connection.exchange.cancelOrder(
          order.symbol,
          order.id,
          order.clientOrderId,
        );
      } else {
        throw error;
      }
    }

    await dataManager.updateOrder(order.id, {
      status: cancelled.status,
      updateTime: cancelled.updateTime || new Date(),
      executedQuantity: cancelled.executedQuantity,
      cummulativeQuoteQuantity: cancelled.cummulativeQuoteQuantity,
    });

    return {
      ...order,
      status: cancelled.status,
      updateTime: cancelled.updateTime || new Date(),
    };
  } finally {
    await connection.exchange.disconnect();
  }
}

export async function modifyUserOrder(
  userId: string,
  orderId: string,
  updates: OrderUpdateInput,
) {
  const dataManager = await getDataManager();
  const order = await dataManager.getOrder(orderId);

  if (!order) {
    throw new Error('Order not found');
  }

  if (order.userId !== userId) {
    throw new Error('Unauthorized');
  }

  if (!order.exchange) {
    throw new Error('Order exchange is missing');
  }

  if (!OPEN_STATUSES.has(order.status as OrderStatus)) {
    throw new Error('Order is not open');
  }

  if (
    ![OrderType.LIMIT, OrderType.STOP_LOSS_LIMIT, OrderType.TAKE_PROFIT_LIMIT].includes(
      order.type as OrderType,
    )
  ) {
    throw new Error('Only LIMIT and STOP/TP LIMIT orders can be modified');
  }

  const nextQuantity =
    updates.quantity !== undefined
      ? toDecimal(updates.quantity)
      : new Decimal(order.quantity.toString());
  const nextPrice =
    updates.price !== undefined
      ? toDecimal(updates.price)
      : order.price
        ? new Decimal(order.price.toString())
        : undefined;
  const nextStopPrice =
    updates.stopPrice !== undefined ? toDecimal(updates.stopPrice) : undefined;

  if (!nextPrice) {
    throw new Error('Order price is missing');
  }

  if (
    (order.type === OrderType.STOP_LOSS_LIMIT ||
      order.type === OrderType.TAKE_PROFIT_LIMIT) &&
    !nextStopPrice
  ) {
    throw new Error('Stop price is required for this order type');
  }

  // Basic validation
  if (!nextQuantity.isFinite() || nextQuantity.lte(0)) {
    throw new Error('Quantity must be a positive number');
  }

  if (!nextPrice.isFinite() || nextPrice.lte(0)) {
    throw new Error('Price must be a positive number');
  }

  if (nextStopPrice && (!nextStopPrice.isFinite() || nextStopPrice.lte(0))) {
    throw new Error('Stop Price must be a positive number');
  }

  // 🆕 Native in-place edit (orderId/clientOrderId preserved at the venue).
  // Preferred whenever the connector supports it: editOrder?(...) exists and
  // canEditOrder(symbol, type) says yes. Anything else (Binance spot,
  // MARKET orders, STOP/TP conditional orders with a stopPrice) falls back
  // to the legacy cancel+replace path.
  const account = await getActiveAccount(userId, order.exchange);
  let connection = await createExchangeConnection(account);
  try {
    const exchange = connection.exchange as IExchange;
    // Both methods are optional on the interface: guard on existence first,
    // then bind to the instance so the connector keeps its `this`.
    const hasNativeEdit =
      typeof exchange.editOrder === 'function' &&
      typeof exchange.canEditOrder === 'function';
    const canEdit = hasNativeEdit
      ? (exchange.canEditOrder as NonNullable<IExchange['canEditOrder']>).bind(exchange)(
          order.symbol,
          order.type as OrderType,
        ) && !nextStopPrice
      : false;

    if (!canEdit) {
      // No native support for this symbol/type (or connector predates the
      // interface) → legacy cancel + replace, exactly as before.
      return await legacyModify(userId, order, nextQuantity, nextPrice, nextStopPrice);
    }

    const editOrderFn = (exchange.editOrder as NonNullable<IExchange['editOrder']>).bind(
      exchange,
    );
    const editParams = {
      symbol: order.symbol,
      orderId: order.id,
      clientOrderId: order.clientOrderId,
      quantity: nextQuantity,
      price: nextPrice,
      side: order.side as OrderSide,
    };
    let edited: Order;
    try {
      try {
        edited = await editOrderFn(editParams);
      } catch (error) {
        // Same OKX demo-fallback as cancel/place: a live-key 401 in the web
        // layer means the account is demo-scoped; retry once on demo keys.
        // The retry's OWN outcome flows through the SAME classification below
        // (it is inside this outer catch, so a retry fatal/rejection is
        // handled identically to the first attempt's).
        if (
          account.exchange.toLowerCase() === 'okx' &&
          !connection.isDemo &&
          isUnauthorizedError(error)
        ) {
          await connection.exchange.disconnect();
          connection = await createExchangeConnection(account, {
            forceDemo: true,
          });
          const retryExchange = connection.exchange as IExchange;
          const retryEdit = retryExchange.editOrder;
          if (!retryEdit) {
            throw new Error('OKX demo connection does not support editOrder');
          }
          edited = await retryEdit.bind(retryExchange)(editParams);
        } else {
          throw error;
        }
      }
    } catch (error) {
      if ((error as { editOrderFatal?: boolean }).editOrderFatal) {
        // 🆕 Venue auto-canceled the original (Binance: new total ≤
        // executedQty). The venue state is KNOWN — sync the DB to CANCELED
        // (including the final executed amount carried on the error, since
        // the order is necessarily partially filled here) so the DB stops
        // showing a live order that no longer exists, then surface the loss
        // of the original order to the user.
        const fatalQty = (error as { executedQuantity?: Decimal }).executedQuantity;
        await dataManager.updateOrder(order.id, {
          status: OrderStatus.CANCELED,
          ...(fatalQty ? { executedQuantity: fatalQty } : {}),
          updateTime: new Date(),
        } as Partial<OrderEntity>);
        throw error;
      } else {
        // Plain rejection (venue left the original untouched) or transport
        // error (venue state unknown). The original stays live in both
        // cases; re-read it so the DB at least matches the venue on the
        // fields we can observe — via the CURRENT connection (after a demo
        // retry this is the demo exchange, not the disconnected original) —
        // then let the caller see the failure.
        try {
          const live = await (connection.exchange as IExchange).getOrder(
            order.symbol,
            order.id,
            order.clientOrderId,
          );
          await dataManager.updateOrder(order.id, {
            quantity: live.quantity,
            price: live.price,
            executedQuantity: live.executedQuantity,
            status: live.status,
            updateTime: live.updateTime || new Date(),
          } as Partial<OrderEntity>);
        } catch {
          // Read-back failed too — nothing more we can do locally; the
          // periodic order-sync will reconcile.
        }
        throw error;
      }
    }

    // In-place edit keeps BOTH the venue orderId and the DB row id —
    // update the existing row instead of saving a replacement order.
    // executedQuantity is only written when the venue reported one (the
    // OKX/Coinbase synthesized fallback deliberately omits it — writing
    // undefined could NULL the column and lose the last-known fill amount).
    // Same for status: a synthesized NEW must not DOWNGRADE a row that is
    // already PARTIALLY_FILLED (the fallback means "fill state unknown", not
    // "no fills") — keep the DB status in that case.
    const fillUnknown = edited.executedQuantity === undefined;
    const keepStatus = fillUnknown && order.status === OrderStatus.PARTIALLY_FILLED;
    const nextStatus = keepStatus ? order.status : edited.status;
    await dataManager.updateOrder(order.id, {
      quantity: edited.quantity,
      price: edited.price,
      ...(edited.executedQuantity ? { executedQuantity: edited.executedQuantity } : {}),
      status: nextStatus,
      updateTime: edited.updateTime || new Date(),
    } as Partial<OrderEntity>);

    return {
      ...order,
      quantity: edited.quantity,
      price: edited.price,
      executedQuantity: edited.executedQuantity ?? order.executedQuantity,
      status: nextStatus,
      updateTime: edited.updateTime || new Date(),
    };
  } finally {
    // BaseExchange.disconnect() only closes OPEN websockets and clears the
    // map, so a double call (reassigned connection + finally) is a no-op.
    await connection.exchange.disconnect();
  }
}

/**
 * 🆕 Legacy modify path — cancel + replace. Used when the venue/connector has
 * no native editOrder support (e.g. Binance spot) or the order type cannot be
 * edited in place (MARKET, STOP/TP conditional orders with a stopPrice).
 * The replacement gets NEW orderId/clientOrderId — that is inherent to this
 * path and the reason the native path is preferred whenever available.
 */
async function legacyModify(
  userId: string,
  order: OrderEntity,
  nextQuantity: Decimal,
  nextPrice: Decimal,
  nextStopPrice: Decimal | undefined,
) {
  if (!order.exchange) {
    // Unreachable in practice — modifyUserOrder validates this before
    // choosing the legacy path — but the parameter type allows undefined.
    throw new Error('Order exchange is missing');
  }

  // Cancel the existing order
  await cancelUserOrder(userId, order.id);

  // Place new order
  try {
    const updatedOrder = await executeManualOrder(userId, {
      exchange: order.exchange,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      quantity: nextQuantity,
      price: nextPrice,
      stopPrice: nextStopPrice,
    });
    return updatedOrder;
  } catch (error) {
    // If placement fails, we should probably warn the user that the original order was cancelled
    console.error('Failed to place replacement order', error);
    throw error;
  }
}

export interface MarginAdjustmentInput {
  type: 'add' | 'reduce';
  amount: string | number | Decimal;
}

/**
 * 🆕 Add or reduce isolated-margin collateral on an open position. Only
 * exchanges whose adapter implements `adjustIsolatedMargin` (currently
 * Binance and OKX) support this — Coinbase positions are cross-margin only
 * on this platform, so `connection.exchange.adjustIsolatedMargin` will be
 * undefined and we reject with a clear error rather than silently no-op'ing.
 */
export async function adjustPositionMargin(
  userId: string,
  positionId: number,
  input: MarginAdjustmentInput,
) {
  const dataManager = await getDataManager();
  const position = await dataManager.getPositionRepository().findById(positionId);

  if (!position) {
    throw new Error('Position not found');
  }

  if (position.userId !== userId) {
    throw new Error('Unauthorized');
  }

  if (position.marginMode !== 'isolated') {
    throw new Error('Margin can only be adjusted for isolated-margin positions');
  }

  const amount = toDecimal(input.amount);
  if (!amount.isFinite() || amount.lte(0)) {
    throw new Error('Amount must be a positive number');
  }

  const account = await getActiveAccount(userId, position.exchange);
  let connection = await createExchangeConnection(account);

  // `connection.exchange` is typed as the concrete union of exchange classes
  // (Binance | OKX | Coinbase), which TypeScript won't let us probe for an
  // optional member unless narrowed via the shared `IExchange` interface —
  // `adjustIsolatedMargin` is declared there as optional (see @itrade/core).
  const asExchange = (exchange: typeof connection.exchange): IExchange => exchange;

  try {
    if (typeof asExchange(connection.exchange).adjustIsolatedMargin !== 'function') {
      throw new Error(`${position.exchange} does not support margin adjustment`);
    }

    let result;
    try {
      result = await asExchange(connection.exchange).adjustIsolatedMargin!(
        position.symbol,
        amount,
        input.type,
        position.side,
      );
    } catch (error) {
      if (
        account.exchange.toLowerCase() === 'okx' &&
        !connection.isDemo &&
        isUnauthorizedError(error)
      ) {
        await connection.exchange.disconnect();
        connection = await createExchangeConnection(account, { forceDemo: true });
        if (typeof asExchange(connection.exchange).adjustIsolatedMargin !== 'function') {
          throw new Error(`${position.exchange} does not support margin adjustment`);
        }
        result = await asExchange(connection.exchange).adjustIsolatedMargin!(
          position.symbol,
          amount,
          input.type,
          position.side,
        );
      } else {
        throw error;
      }
    }

    const refreshed = await syncPositionFromExchange(
      userId,
      positionId,
      asExchange(connection.exchange),
    );

    return { result, refreshed };
  } finally {
    await connection.exchange.disconnect();
  }
}

/**
 * 🆕 Fetch live max add/reduce bounds for an isolated-margin position.
 */
export async function getPositionMarginLimits(userId: string, positionId: number) {
  const dataManager = await getDataManager();
  const position = await dataManager.getPositionRepository().findById(positionId);

  if (!position) {
    throw new Error('Position not found');
  }

  if (position.userId !== userId) {
    throw new Error('Unauthorized');
  }

  if (position.marginMode !== 'isolated') {
    throw new Error('Margin can only be adjusted for isolated-margin positions');
  }

  const account = await getActiveAccount(userId, position.exchange);
  let connection = await createExchangeConnection(account);
  const asExchange = (exchange: typeof connection.exchange): IExchange => exchange;

  try {
    if (typeof asExchange(connection.exchange).getIsolatedMarginLimits !== 'function') {
      throw new Error(`${position.exchange} does not support margin adjustment`);
    }

    let limits;
    try {
      limits = await asExchange(connection.exchange).getIsolatedMarginLimits!(
        position.symbol,
        position.side,
      );
    } catch (error) {
      if (
        account.exchange.toLowerCase() === 'okx' &&
        !connection.isDemo &&
        isUnauthorizedError(error)
      ) {
        await connection.exchange.disconnect();
        connection = await createExchangeConnection(account, { forceDemo: true });
        if (
          typeof asExchange(connection.exchange).getIsolatedMarginLimits !== 'function'
        ) {
          throw new Error(`${position.exchange} does not support margin adjustment`);
        }
        limits = await asExchange(connection.exchange).getIsolatedMarginLimits!(
          position.symbol,
          position.side,
        );
      } else {
        throw error;
      }
    }

    return limits;
  } finally {
    await connection.exchange.disconnect();
  }
}

function findLivePosition(
  livePositions: Position[],
  position: Pick<PositionEntity, 'symbol' | 'side'>,
): Position | undefined {
  return livePositions.find(
    (live) =>
      live.symbol === position.symbol &&
      live.side === position.side &&
      live.quantity.abs().gt(0),
  );
}

function buildPositionUpdates(live: Position): Partial<PositionEntity> {
  return {
    quantity: live.quantity,
    avgPrice: live.avgPrice,
    markPrice: live.markPrice,
    unrealizedPnl: live.unrealizedPnl,
    leverage: live.leverage,
    liquidationPrice: live.liquidationPrice,
    marginMode: live.marginMode,
    timestamp: live.timestamp ?? new Date(),
  };
}

/** Pull the latest position snapshot from the exchange and persist it to the DB. */
export async function syncPositionFromExchange(
  userId: string,
  positionId: number,
  exchange?: IExchange,
): Promise<PositionEntity | null> {
  const dataManager = await getDataManager();
  const position = await dataManager.getPositionRepository().findById(positionId);

  if (!position || position.userId !== userId) {
    return null;
  }

  let connection: Awaited<ReturnType<typeof createExchangeConnection>> | undefined;
  let ownsConnection = false;

  try {
    if (!exchange) {
      const account = await getActiveAccount(userId, position.exchange);
      connection = await createExchangeConnection(account);
      ownsConnection = true;
      exchange = connection.exchange;
    }

    const livePositions = await exchange.getPositions();
    const live = findLivePosition(livePositions, position);
    if (!live) {
      return position;
    }

    await dataManager.updatePosition(position.id, buildPositionUpdates(live));
    return dataManager.getPosition(position.id);
  } finally {
    if (ownsConnection && connection) {
      await connection.exchange.disconnect();
    }
  }
}

/** Refresh open positions for the given exchanges from live exchange APIs. */
export async function refreshUserPositionsFromExchanges(
  userId: string,
  exchanges: string[],
): Promise<void> {
  const uniqueExchanges = Array.from(
    new Set(exchanges.map((exchange) => exchange.toLowerCase())),
  );
  if (uniqueExchanges.length === 0) {
    return;
  }

  const dataManager = await getDataManager();
  const dbPositions = await dataManager.getPositionRepository().findAll({ userId });
  const activePositions = dbPositions.filter((pos) => !pos.quantity.isZero());

  await Promise.all(
    uniqueExchanges.map(async (exchangeName) => {
      const exchangePositions = activePositions.filter(
        (pos) => pos.exchange.toLowerCase() === exchangeName,
      );
      if (exchangePositions.length === 0) {
        return;
      }

      let connection: Awaited<ReturnType<typeof createExchangeConnection>> | undefined;
      try {
        const account = await getActiveAccount(userId, exchangeName);
        connection = await createExchangeConnection(account);
        const livePositions = await connection.exchange.getPositions();

        await Promise.all(
          exchangePositions.map(async (dbPosition) => {
            const live = findLivePosition(livePositions, dbPosition);
            if (!live) {
              return;
            }
            await dataManager.updatePosition(dbPosition.id, buildPositionUpdates(live));
          }),
        );
      } catch (error) {
        console.error(
          `Failed to refresh ${exchangeName} positions from exchange:`,
          error,
        );
      } finally {
        if (connection) {
          await connection.exchange.disconnect();
        }
      }
    }),
  );
}
