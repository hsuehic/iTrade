import { TradeModeError, type TradeModeErrorCode } from './trade-mode';

/**
 * HTTP mapping for the margin-mode switch endpoint. Kept out of the route so it
 * can be unit-tested without a Next.js request context.
 *
 * Margin-mode switching is operator-driven, so every failure has to come back
 * with a status the UI can act on:
 * - 400 malformed payload / exchange or symbol that has no margin mode;
 * - 409 the exchange refuses while the symbol holds a position or orders
 *   (that is the "close the position and cancel the orders first" case);
 * - 401 the exchange rejected the API credentials;
 * - 502 anything else, with the exchange's own message.
 */
export interface MappedTradeModeError {
  status: number;
  code: TradeModeErrorCode | 'unauthorized';
  message: string;
}

/**
 * Errors the operator can act on (raised by `getActiveAccount` /
 * `createExchangeConnection` before the exchange is even called) — they must
 * not surface as a 500.
 *
 * NOTE: keyed on the message text because these throw sites carry no error code
 * yet. If that copy changes the request degrades to a 502 rather than a 400 —
 * it never turns into a wrong action — so treat this as a stopgap, not a
 * contract. `trade-mode-errors.test.ts` pins the mapping.
 */
const CLIENT_ACTIONABLE_MESSAGES = new Set([
  'Invalid exchange',
  'Exchange account not found or inactive',
  'Trading is disabled for this account',
  'Exchange credentials are missing',
  'OKX account requires a passphrase',
]);

/**
 * Reads the HTTP status off an error. Wrapped exchange errors carry it as a
 * field (the connectors attach `httpStatus` when they classify a failure); raw
 * axios errors still expose it under `response.status`.
 */
function getExchangeStatus(error: unknown): number | undefined {
  if (error instanceof TradeModeError && error.httpStatus !== undefined) {
    return error.httpStatus;
  }

  const response =
    error && typeof error === 'object' && 'response' in error
      ? (error as { response?: { status?: number } }).response
      : undefined;
  return response?.status;
}

export function mapTradeModeError(error: unknown): MappedTradeModeError {
  if (error instanceof TradeModeError) {
    // A credential failure has to stay a 401 even though it was classified as
    // an 'exchange-error' by the service.
    if (error.httpStatus === 401) {
      return {
        status: 401,
        code: 'unauthorized',
        message: 'Unauthorized: check the exchange API credentials or demo mode',
      };
    }

    const status =
      error.code === 'position-open' || error.code === 'open-orders'
        ? 409
        : error.code === 'exchange-error'
          ? 502
          : 400;
    return { status, code: error.code, message: error.message };
  }

  if (error instanceof Error && CLIENT_ACTIONABLE_MESSAGES.has(error.message)) {
    return { status: 400, code: 'invalid-input', message: error.message };
  }

  if (getExchangeStatus(error) === 401) {
    return {
      status: 401,
      code: 'unauthorized',
      message: 'Unauthorized: check the exchange API credentials or demo mode',
    };
  }

  return {
    status: 502,
    code: 'exchange-error',
    message: error instanceof Error ? error.message : 'Failed to switch the margin mode',
  };
}
