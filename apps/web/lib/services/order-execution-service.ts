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
  positionAction?: 'OPEN_LONG' | 'OPEN_SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT';
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

function getBalanceAmount(balances: { asset: string; total: Decimal }[], asset: string) {
  const balance = balances.find(
    (item) => item.asset.toUpperCase() === asset.toUpperCase(),
  );
  return balance?.total ?? new Decimal(0);
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
