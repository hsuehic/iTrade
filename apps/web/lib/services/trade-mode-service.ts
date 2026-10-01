import { IExchange, MarginModeSwitchError } from '@itrade/core';
import { isValidExchange } from '@itrade/data-manager';

import { getDataManager } from '@/lib/data-manager';
import {
  canonicalPerpSymbol,
  isMarginMode,
  isTradeModeExchange,
  TradeModeError,
  type MarginMode,
  type TradeModeErrorCode,
} from '@/lib/trade-mode';

import { createExchangeConnection, getActiveAccount } from './order-execution-service';

export type { MarginMode };
// Re-exported so server callers can keep importing the error from this module.
export { TradeModeError };
export type { TradeModeErrorCode };

/**
 * Close the exchange connection from a `finally` without masking the error that
 * triggered it: a disconnect failure must not turn a 409/401 into a 502.
 */
async function disconnectQuietly(connection: {
  exchange: { disconnect: () => Promise<void> };
}): Promise<void> {
  try {
    await connection.exchange.disconnect();
  } catch (error) {
    console.warn('Failed to close the trade-mode exchange connection:', error);
  }
}

export interface SetTradeModeInput {
  exchange: string;
  symbol: string;
  tradeMode: MarginMode;
}

export interface SetTradeModeResult {
  exchange: string;
  symbol: string;
  tradeMode: MarginMode;
  /** false when the exchange reported the symbol was already in that mode. */
  changed: boolean;
  /**
   * Mode read back from the exchange after the switch. null when the exchange
   * cannot report it for a flat symbol.
   */
  currentMarginMode: MarginMode | null;
}

export interface GetTradeModeResult {
  exchange: string;
  symbol: string;
  marginMode: MarginMode | null;
}

/**
 * 🆕 Switch a perpetual symbol between cross and isolated margin from the
 * position page.
 *
 * The exchange refuses the switch while the symbol still holds a position
 * (Binance -4048) or resting orders (Binance -4047), so both preconditions are
 * verified up front — the stored position first (cheap), then the exchange's
 * live positions and open orders — to turn that rejection into
 * "close the position and cancel the orders first". The exchange stays the
 * final authority: a rejection that still arrives is classified the same way
 * by the connector and mapped to the same message.
 *
 * The switch itself is never automatic: it is exactly what the operator asked
 * for, and a symbol holding a position is refused rather than force-closed.
 */
export async function setSymbolTradeMode(
  userId: string,
  input: SetTradeModeInput,
): Promise<SetTradeModeResult> {
  const exchange = String(input?.exchange ?? '')
    .trim()
    .toLowerCase();
  const symbol = String(input?.symbol ?? '').trim();

  if (!exchange || !symbol || !isMarginMode(input?.tradeMode)) {
    throw new TradeModeError(
      'invalid-input',
      'exchange, symbol and tradeMode (isolated|cross) are required',
    );
  }

  if (!isValidExchange(exchange) || !isTradeModeExchange(exchange)) {
    throw new TradeModeError(
      'unsupported-exchange',
      `${exchange} does not support switching the margin mode`,
    );
  }

  // Only perpetual contracts carry a margin mode: unified perp symbols are
  // BASE/QUOTE:SETTLE (e.g. WLD/USDC:USDC), spot symbols are BASE/QUOTE.
  if (!symbol.includes(':')) {
    throw new TradeModeError(
      'not-perpetual',
      `Margin mode only applies to perpetual symbols, received ${symbol}`,
    );
  }

  const dataManager = await getDataManager();
  const storedPositions = await dataManager.getPositionRepository().findAll({
    userId,
    exchange,
    symbol,
  });
  const storedPosition = storedPositions.find((position) => !position.quantity.isZero());
  if (storedPosition) {
    throw new TradeModeError(
      'position-open',
      `${symbol} still has an open ${storedPosition.side} position on ${exchange}; close it before switching the margin mode`,
    );
  }

  const account = await getActiveAccount(userId, exchange);
  const connection = await createExchangeConnection(account);
  const asExchange = (candidate: typeof connection.exchange): IExchange => candidate;

  try {
    if (typeof asExchange(connection.exchange).setMarginMode !== 'function') {
      throw new TradeModeError(
        'unsupported-exchange',
        `${exchange} does not support switching the margin mode`,
      );
    }

    // Live positions on top of the stored row: the DB can lag the exchange, and
    // a missing row would otherwise let the request through on a symbol that is
    // in fact still open. Symbols are compared canonically — the connector
    // returns unified symbols today, but a formatting difference must not be
    // able to disable this guard.
    const targetSymbol = canonicalPerpSymbol(symbol);
    const livePositions = await connection.exchange.getPositions();
    const livePosition = livePositions.find(
      (position) =>
        canonicalPerpSymbol(position.symbol) === targetSymbol &&
        position.quantity.abs().gt(0),
    );
    if (livePosition) {
      throw new TradeModeError(
        'position-open',
        `${symbol} still has an open ${livePosition.side} position on ${exchange}; close it before switching the margin mode`,
      );
    }

    // getOpenOrders(symbol) is already scoped to the symbol by the connector;
    // the canonical re-check is a second line of defence so that a connector
    // returning a differently formatted (or unfiltered) list cannot silently
    // turn this guard into a blanket refusal.
    const openOrders = (await connection.exchange.getOpenOrders(symbol)).filter(
      (order) => canonicalPerpSymbol(order.symbol) === targetSymbol,
    );
    if (openOrders.length > 0) {
      throw new TradeModeError(
        'open-orders',
        `${symbol} still has ${openOrders.length} open order(s) on ${exchange}; cancel them before switching the margin mode`,
      );
    }

    let result;
    try {
      result = await asExchange(connection.exchange).setMarginMode!(
        symbol,
        input.tradeMode,
      );
    } catch (error) {
      throw toTradeModeError(error, symbol, exchange);
    }

    return {
      exchange,
      symbol,
      tradeMode: input.tradeMode,
      changed: result.changed,
      currentMarginMode: await readMarginMode(connection.exchange, symbol),
    };
  } finally {
    await disconnectQuietly(connection);
  }
}

/**
 * 🆕 Best-effort read of a perpetual symbol's current margin mode, used by the
 * dialog to show what the symbol is on before switching it.
 */
export async function getSymbolTradeMode(
  userId: string,
  exchangeInput: string,
  symbolInput: string,
): Promise<GetTradeModeResult> {
  const exchange = String(exchangeInput ?? '')
    .trim()
    .toLowerCase();
  const symbol = String(symbolInput ?? '').trim();

  if (!exchange || !symbol) {
    throw new TradeModeError('invalid-input', 'exchange and symbol are required');
  }

  if (!isValidExchange(exchange) || !isTradeModeExchange(exchange)) {
    throw new TradeModeError(
      'unsupported-exchange',
      `${exchange} does not support switching the margin mode`,
    );
  }

  // Same perpetual-only rule as the switch: a spot symbol has no margin mode,
  // and querying one would only produce a meaningless answer.
  if (!symbol.includes(':')) {
    throw new TradeModeError(
      'not-perpetual',
      `Margin mode only applies to perpetual symbols, received ${symbol}`,
    );
  }

  const account = await getActiveAccount(userId, exchange);
  const connection = await createExchangeConnection(account);

  try {
    return {
      exchange,
      symbol,
      marginMode: await readMarginMode(connection.exchange, symbol),
    };
  } finally {
    await disconnectQuietly(connection);
  }
}

/**
 * Read the live mode without failing the request: the switch has already been
 * accepted at this point, so a read error only means "unknown", not "failed".
 */
async function readMarginMode(
  exchange: unknown,
  symbol: string,
): Promise<MarginMode | null> {
  const asExchange = exchange as IExchange;
  if (typeof asExchange.getMarginMode !== 'function') {
    return null;
  }

  try {
    return await asExchange.getMarginMode(symbol);
  } catch {
    return null;
  }
}

function toTradeModeError(error: unknown, symbol: string, exchange: string): Error {
  if (error instanceof TradeModeError) {
    return error;
  }

  if (error instanceof MarginModeSwitchError) {
    switch (error.reason) {
      case 'position-open':
        return new TradeModeError('position-open', error.message, error.httpStatus);
      case 'open-orders':
        return new TradeModeError('open-orders', error.message, error.httpStatus);
      case 'unsupported':
        return new TradeModeError(
          'unsupported-exchange',
          error.message,
          error.httpStatus,
        );
      default:
        // httpStatus is forwarded so a credential failure (401) survives the
        // wrapper and stays a 401 at the API layer.
        return new TradeModeError('exchange-error', error.message, error.httpStatus);
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  return new TradeModeError(
    'exchange-error',
    `${exchange} rejected the margin-mode switch for ${symbol}: ${message}`,
  );
}
