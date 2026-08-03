import { AccountWalletType, IExchange } from '@itrade/core';
import { AccountInfoEntity } from '@itrade/data-manager';

import { createExchangeConnection } from './order-execution-service';

// 🆕 Wallets to query when building the per-wallet asset breakdown for the
// portfolio assets page. This is intentionally a SUPERSET of the transfer
// wallets in transfer-service.ts: EARN (Simple Earn/savings) holds assets but
// can never be a transfer source/destination, and Coinbase supports balance
// lookups (SPOT retail + PERPETUAL INTX) even though it has no transfer API.
const ASSET_WALLETS: Record<string, AccountWalletType[]> = {
  binance: [
    AccountWalletType.FUNDING,
    AccountWalletType.SPOT,
    AccountWalletType.PERPETUAL,
    AccountWalletType.EARN,
  ],
  okx: [AccountWalletType.FUNDING, AccountWalletType.TRADING, AccountWalletType.EARN],
  coinbase: [AccountWalletType.SPOT, AccountWalletType.PERPETUAL],
};

export function getAssetWallets(exchange: string): AccountWalletType[] {
  return ASSET_WALLETS[exchange.toLowerCase()] ?? [];
}

export interface WalletAssetEntry {
  asset: string;
  exchange: string;
  wallet: AccountWalletType;
  free: number;
  locked: number;
  total: number;
}

export function supportsWalletBreakdown(exchange: string): boolean {
  return getAssetWallets(exchange).length > 0;
}

export async function fetchWalletAssetsForAccount(
  account: AccountInfoEntity,
): Promise<WalletAssetEntry[]> {
  const supportedWallets = getAssetWallets(account.exchange);
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
