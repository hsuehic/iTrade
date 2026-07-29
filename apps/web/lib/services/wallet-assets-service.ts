import { AccountWalletType, IExchange } from '@itrade/core';
import { AccountInfoEntity } from '@itrade/data-manager';

import { createExchangeConnection } from './order-execution-service';
import { getSupportedTransferWallets } from './transfer-service';

export interface WalletAssetEntry {
  asset: string;
  exchange: string;
  wallet: AccountWalletType;
  free: number;
  locked: number;
  total: number;
}

export function supportsWalletBreakdown(exchange: string): boolean {
  return getSupportedTransferWallets(exchange).length > 0;
}

export async function fetchWalletAssetsForAccount(
  account: AccountInfoEntity,
): Promise<WalletAssetEntry[]> {
  const supportedWallets = getSupportedTransferWallets(account.exchange);
  if (supportedWallets.length === 0) return [];

  const { exchange: connection } = await createExchangeConnection(account);
  const exchange: IExchange = connection;
  if (typeof exchange.getWalletBalances !== 'function') return [];

  const entries: WalletAssetEntry[] = [];

  await Promise.all(
    supportedWallets.map(async (walletType) => {
      try {
        const balances = await exchange.getWalletBalances!(walletType);
        for (const balance of balances) {
          const total = parseFloat(balance.total.toString());
          if (total <= 0) continue;

          entries.push({
            asset: balance.asset,
            exchange: account.exchange,
            wallet: walletType,
            free: parseFloat(balance.free.toString()),
            locked: parseFloat(balance.locked.toString()),
            total,
          });
        }
      } catch (error) {
        console.error(
          `[wallet-assets-service] Failed to fetch ${walletType} balances for account ${account.id}`,
          error,
        );
      }
    }),
  );

  return entries;
}
