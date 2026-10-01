import { AccountWalletType } from './types';

/**
 * 🆕 Static capability table for internal (wallet-to-wallet) transfers, keyed by
 * exchange and expressed as *routes* rather than a flat wallet list — not every
 * pair of wallets is a real route.
 *
 * Binance keeps Funding, Spot, and Perpetual (USDⓈ-M futures) as three distinct
 * wallets and supports every pairwise combination through its Universal
 * Transfer API. Simple Earn is a separate product: only Spot <-> Earn is
 * possible, via the flexible subscribe/redeem endpoints.
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
    [AccountWalletType.FUNDING, AccountWalletType.SPOT],
    [AccountWalletType.FUNDING, AccountWalletType.PERPETUAL],
    [AccountWalletType.SPOT, AccountWalletType.PERPETUAL],
    [AccountWalletType.SPOT, AccountWalletType.EARN],
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
