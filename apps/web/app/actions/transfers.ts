'use server';

import { headers } from 'next/headers';

import { AccountWalletType } from '@itrade/core';

import { getAuthFromHeaders } from '@/lib/auth';
import * as transferService from '@/lib/services/transfer-service';
import type { SerializableBalance } from '@/lib/services/transfer-service';

async function getUser() {
  const requestHeaders = await headers();
  const auth = getAuthFromHeaders(requestHeaders);
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });
  return session?.user;
}

export interface TransferFundsInput {
  accountId: number;
  asset: string;
  amount: string;
  from: AccountWalletType;
  to: AccountWalletType;
  // 🆕 Isolated-margin pair (e.g. BTCUSDT). Required when either side of the
  // route is ISOLATED_MARGIN — see transferRouteNeedsSymbol.
  symbol?: string;
}

export async function getTransferWallets(exchange: string): Promise<AccountWalletType[]> {
  return transferService.getSupportedTransferWallets(exchange);
}

// 🆕 The form drives its From/To dropdowns off routes, not a flat wallet list —
// e.g. Binance allows Spot <-> Earn but Funding <-> Earn is not a real route.
export async function getTransferRoutes(
  exchange: string,
): Promise<transferService.TransferRoute[]> {
  return transferService.getSupportedTransferRoutes(exchange);
}

// 🆕 Whether a route additionally needs the isolated-margin pair, so the form
// knows when to ask for it.
export async function getTransferRouteNeedsSymbol(
  exchange: string,
  from: AccountWalletType,
  to: AccountWalletType,
): Promise<boolean> {
  return transferService.transferRouteNeedsSymbol(exchange, from, to);
}

export async function getWalletBalances(
  accountId: number,
  walletType: AccountWalletType,
  symbol?: string,
): Promise<SerializableBalance[]> {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');

  return transferService.getWalletBalances(user.id, accountId, walletType, symbol);
}

// 🆕 Isolated-margin pairs the account can transfer against (empty for accounts
// whose exchange has no isolated margin product).
export async function getIsolatedMarginSymbols(accountId: number): Promise<string[]> {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');

  return transferService.getIsolatedMarginSymbols(user.id, accountId);
}

export async function transferFunds(input: TransferFundsInput) {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');

  return transferService.executeTransfer(user.id, input);
}
