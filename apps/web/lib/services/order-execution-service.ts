import Decimal from 'decimal.js';

import {
  BinanceExchange,
  CoinbaseExchange,
  OKXExchange,
} from '@itrade/exchange-connectors';
import { OrderSide, OrderStatus, OrderType, TimeInForce, TradeMode } from '@itrade/core';
import { AccountInfoEntity, isValidExchange } from '@itrade/data-manager';
import { CryptoUtils } from '@itrade/utils/CryptoUtils';

import { getDataManager } from '@/lib/data-manager';
import { parseSymbol } from '@/lib/exchanges';

export interface ManualOrderInput {
  exchange: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: string | number | Decimal;
  price?: string | number | Decimal;
  tradeMode?: TradeMode;
  leverage?: number;
  leverage?: number;
  positionAction?: 'OPEN_LONG' | 'OPEN_SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT';
  stopPrice?: string | number | Decimal;
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

async function getActiveAccount(userId: string, exchange: string) {
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

async function createExchangeConnection(
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

    const placeOrder = async () => {
      const quantity = toDecimal(input.quantity);
      const price = input.price !== undefined ? toDecimal(input.price) : undefined;
      const side = positionAction ? sideOverrideMap[positionAction] : input.side;
      const tradeMode =
        isCoinbase && isPerpetual && !input.tradeMode
          ? TradeMode.ISOLATED
          : input.tradeMode;
      const leverage = isCoinbase && isPerpetual && !input.leverage ? 5 : input.leverage;

      if (tradeMode !== input.tradeMode || leverage !== input.leverage) {
        console.info('[Orders] Applied Coinbase defaults for perpetual order', {
          userId,
          symbol: input.symbol,
          tradeMode: tradeMode ?? null,
          leverage: leverage ?? null,
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
          tradeMode,
          leverage,
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
              await okxExchange.transferFundingToTrading(asset, required);
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

  if (!nextQuantity.isFinite() || nextQuantity.lte(0)) {
    throw new Error('Quantity must be a positive number');
  }

  if (!nextPrice.isFinite() || nextPrice.lte(0)) {
    throw new Error('Price must be a positive number');
  }

  if (nextStopPrice && (!nextStopPrice.isFinite() || nextStopPrice.lte(0))) {
    throw new Error('Stop Price must be a positive number');
  }

  await cancelUserOrder(userId, orderId);

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
