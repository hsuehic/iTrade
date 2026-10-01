import { AccountWalletType } from './types';

/**
 * 🆕 Static capability table for internal (wallet-to-wallet) transfers, keyed by
 * exchange and expressed as *routes* rather than a flat wallet list — not every
 * pair of wallets is a real route.
 *
 * Binance keeps every account type as its own wallet and moves funds between
 * them through a single "Universal Transfer" endpoint keyed by a `type` enum
 * (see BinanceExchange.TRANSFER_TYPE_MAP). The pairs below are exactly the
 * `type` values Binance documents, and the gaps are real, not oversights:
 *
 *   - USDⓈ-M <-> COIN-M (UMFUTURE <-> CMFUTURE) has no transfer type
 *   - COIN-M <-> Options (CMFUTURE <-> OPTION) has no transfer type
 *   - Funding / Options <-> Isolated Margin has no transfer type either; only
 *     Spot and cross Margin can reach isolated margin
 *
 * Simple Earn is a separate product: only Spot <-> Earn is possible, via the
 * flexible subscribe/redeem endpoints.
 *
 * OKX accounts in this app run in unified/multi-currency margin mode, so Spot
 * and Perpetual balances already live in the same "Trading" account — only
 * Funding <-> Trading is a real transfer there (see
 * OKXExchange.getSupportedTransferWallets for details). Savings (Earn) is
 * purchased/redeemed against the Trading account only.
 *
 * Coinbase is intentionally omitted: its retail spot wallet and INTX perpetual
 * portfolio are different products without a reliable, well-tested transfer
 * endpoint in this codebase.
 *
 * It lives here (rather than in the web service layer) so both the server-side
 * validation and the client-facing transfer form read the same table without
 * pulling in a data-manager/connector dependency graph.
 */
export const TRANSFER_ROUTES: Record<
  string,
  Array<[AccountWalletType, AccountWalletType]>
> = {
  // Every route below is bidirectional; only the forward direction is listed.
  binance: [
    // Funding wallet pairs.
    [AccountWalletType.FUNDING, AccountWalletType.SPOT],
    [AccountWalletType.FUNDING, AccountWalletType.PERPETUAL],
    [AccountWalletType.FUNDING, AccountWalletType.COIN_M],
    [AccountWalletType.FUNDING, AccountWalletType.MARGIN],
    [AccountWalletType.FUNDING, AccountWalletType.OPTION],
    // Spot pairs (includes the isolated-margin routes, which need a pair).
    [AccountWalletType.SPOT, AccountWalletType.PERPETUAL],
    [AccountWalletType.SPOT, AccountWalletType.COIN_M],
    [AccountWalletType.SPOT, AccountWalletType.MARGIN],
    [AccountWalletType.SPOT, AccountWalletType.OPTION],
    [AccountWalletType.SPOT, AccountWalletType.ISOLATED_MARGIN],
    [AccountWalletType.SPOT, AccountWalletType.EARN],
    // Derivative-account pairs.
    [AccountWalletType.PERPETUAL, AccountWalletType.MARGIN],
    [AccountWalletType.PERPETUAL, AccountWalletType.OPTION],
    [AccountWalletType.COIN_M, AccountWalletType.MARGIN],
    [AccountWalletType.MARGIN, AccountWalletType.OPTION],
    [AccountWalletType.MARGIN, AccountWalletType.ISOLATED_MARGIN],
  ],
  okx: [
    [AccountWalletType.FUNDING, AccountWalletType.TRADING],
    [AccountWalletType.TRADING, AccountWalletType.EARN],
  ],
};

export interface TransferRoute {
  from: AccountWalletType;
  to: AccountWalletType;
}

/** All supported routes for an exchange, both directions expanded. */
export function getSupportedTransferRoutes(exchange: string): TransferRoute[] {
  const routes = TRANSFER_ROUTES[exchange.toLowerCase()] ?? [];
  const expanded: TransferRoute[] = [];

  for (const [from, to] of routes) {
    expanded.push({ from, to });
    if (from !== to) expanded.push({ from: to, to: from });
  }

  return expanded;
}

export function isTransferRouteSupported(
  exchange: string,
  from: AccountWalletType,
  to: AccountWalletType,
): boolean {
  return getSupportedTransferRoutes(exchange).some(
    (route) => route.from === from && route.to === to,
  );
}

/**
 * 🆕 Whether a supported route also needs the caller to name the isolated-margin
 * pair (`TransferFundsParams.symbol`). Isolated margin holds one balance per
 * pair, so asset + wallet cannot identify the position on its own.
 *
 * Returns false for routes that need no pair *and* for unsupported routes —
 * validate the route separately with `isTransferRouteSupported`.
 */
export function transferRouteNeedsSymbol(
  exchange: string,
  from: AccountWalletType,
  to: AccountWalletType,
): boolean {
  if (!isTransferRouteSupported(exchange, from, to)) return false;

  return (
    from === AccountWalletType.ISOLATED_MARGIN || to === AccountWalletType.ISOLATED_MARGIN
  );
}

/** Wallets reachable by at least one route, in first-seen order. */
export function getSupportedTransferWallets(exchange: string): AccountWalletType[] {
  const wallets: AccountWalletType[] = [];

  for (const { from, to } of getSupportedTransferRoutes(exchange)) {
    if (!wallets.includes(from)) wallets.push(from);
    if (!wallets.includes(to)) wallets.push(to);
  }

  return wallets;
}

export function supportsTransfers(exchange: string): boolean {
  return getSupportedTransferRoutes(exchange).length > 0;
}
