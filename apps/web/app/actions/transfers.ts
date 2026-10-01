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

export async function getWalletBalances(
  accountId: number,
  walletType: AccountWalletType,
): Promise<SerializableBalance[]> {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');

  return transferService.getWalletBalances(user.id, accountId, walletType);
}

export async function transferFunds(input: TransferFundsInput) {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');

  return transferService.executeTransfer(user.id, input);
}
