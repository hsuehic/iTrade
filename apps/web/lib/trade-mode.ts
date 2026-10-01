/**
 * Venues whose API can switch a perpetual symbol's margin mode — shared by the
 * server service (`lib/services/trade-mode-service.ts`) and the position-page
 * dialog so the two lists cannot drift apart.
 *
 * Binance only, deliberately:
 * - OKX exposes no endpoint that switches a perpetual instrument's margin mode.
 *   Its mode follows the `tdMode` each order carries (which the OKX connector
 *   asserts on every perpetual order), and `POST /api/v5/account/set-leverage`
 *   only writes the leverage recorded for a `mgnMode`.
 * - Coinbase perps are cross-only on this platform.
 * Those venues are left out of the dialog rather than offered a switch that
 * cannot be honoured.
 *
 * Client-safe: this module must stay free of server-only imports so the dialog
 * (a client component) can use it.
 */
export const TRADE_MODE_EXCHANGES = ['binance'] as const;

export type MarginMode = 'isolated' | 'cross';

export function isMarginMode(value: unknown): value is MarginMode {
  return value === 'isolated' || value === 'cross';
}

export function isTradeModeExchange(exchange: string): boolean {
  return (TRADE_MODE_EXCHANGES as readonly string[]).includes(exchange.toLowerCase());
}

/**
 * Canonical key for comparing a perpetual symbol across layers.
 *
 * iTrade stores and validates perpetual symbols in the unified form
 * (`WLD/USDC:USDC`), and the Binance connector's `getPositions()` /
 * `getOpenOrders()` denormalize to that same form — but the raw exchange form
 * (`WLDUSDC`) still reaches older call sites, and an equality check that
 * silently misses would quietly disable a guard. Collapsing both to
 * `WLDUSDC` here keeps the guard meaningful regardless of which form arrives.
 *
 * The settle suffix is dropped, so a coin-margined `BTC/USD:BTC` and a
 * stable-margined `BTC/USD:USD` collapse to the same key. That can only make a
 * guard *over*-match (refuse a symbol it might have allowed) — the safe
 * direction — and no such pair is offered for a switch today (only USDC/USDT
 * perps on Binance).
 */
export function canonicalPerpSymbol(symbol: string): string {
  return String(symbol ?? '')
    .trim()
    .toUpperCase()
    .split(':')[0]
    .replace(/[-/]/g, '');
}

/**
 * Failure classes the API route maps to an HTTP status and user-facing copy:
 * - 'position-open' / 'open-orders' → the operator has to flatten the symbol
 *   (or cancel its resting orders) before the exchange will accept a switch;
 * - 'unsupported-exchange' → the exchange has no margin-mode switch at all;
 * - 'not-perpetual' → margin mode is meaningless for a spot symbol;
 * - 'invalid-input' → missing/malformed request body;
 * - 'exchange-error' → anything else the exchange reported.
 */
export type TradeModeErrorCode =
  | 'invalid-input'
  | 'unsupported-exchange'
  | 'not-perpetual'
  | 'position-open'
  | 'open-orders'
  | 'exchange-error';

/**
 * Raised by the server-side margin-mode service. Lives in this client-safe
 * module (it has no dependencies) so both the service and the API route's
 * error mapping can share it.
 */
export class TradeModeError extends Error {
  constructor(
    public readonly code: TradeModeErrorCode,
    message: string,
    /**
     * HTTP status of the underlying exchange response, when there was one.
     * Carried through the wrapper so a credential failure stays a 401 instead
     * of degrading into "the exchange said no" (502).
     */
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'TradeModeError';
  }
}
