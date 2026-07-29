import 'reflect-metadata';
import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';

import {
  AccountWalletType,
  Balance,
  IExchange,
  InternalTransfer,
  TransferStatus,
} from '@itrade/core';
import { AccountInfoEntity } from '@itrade/data-manager';

import { getDataManager } from '@/lib/data-manager';
import { createExchangeConnection } from './order-execution-service';

// 🆕 Static capability map for internal (wallet-to-wallet) transfers.
//
// Binance keeps Funding, Spot, and Perpetual (USDⓈ-M futures) as three
// distinct wallets and supports every pairwise combination through its
// Universal Transfer API.
//
// OKX accounts in this app run in unified/multi-currency margin mode, so
// Spot and Perpetual balances already live in the same "Trading" account —
// only Funding <-> Trading is a real transfer there (see
// OKXExchange.getSupportedTransferWallets for details).
//
// Coinbase is intentionally omitted: its retail spot wallet and INTX
// perpetual portfolio are different products without a reliable, well-tested
// transfer endpoint in this codebase.
const TRANSFER_CAPABLE_EXCHANGES: Record<string, AccountWalletType[]> = {
  binance: [
    AccountWalletType.FUNDING,
    AccountWalletType.SPOT,
    AccountWalletType.PERPETUAL,
  ],
  okx: [AccountWalletType.FUNDING, AccountWalletType.TRADING],
};

export function getSupportedTransferWallets(exchange: string): AccountWalletType[] {
  return TRANSFER_CAPABLE_EXCHANGES[exchange.toLowerCase()] ?? [];
}

export function supportsTransfers(exchange: string): boolean {
  return getSupportedTransferWallets(exchange).length > 0;
}

async function getOwnedAccount(
  userId: string,
  accountId: number,
): Promise<AccountInfoEntity> {
  const dm = await getDataManager();
  const repo = dm.getAccountInfoRepository();
  const account = await repo.findOne({ where: { id: accountId, userId } });

  if (!account) {
    throw new Error('Account not found');
  }
  if (!account.apiKey || !account.secretKey) {
    throw new Error('Exchange credentials are missing');
  }

  return account;
}

export interface SerializableBalance {
  asset: string;
  free: string;
  locked: string;
  total: string;
}

function serializeBalances(balances: Balance[]): SerializableBalance[] {
  return balances.map((b) => ({
    asset: b.asset,
    free: b.free.toString(),
    locked: b.locked.toString(),
    total: b.total.toString(),
  }));
}

export async function getWalletBalances(
  userId: string,
  accountId: number,
  walletType: AccountWalletType,
): Promise<SerializableBalance[]> {
  const account = await getOwnedAccount(userId, accountId);

  const supported = getSupportedTransferWallets(account.exchange);
  if (!supported.includes(walletType)) {
    throw new Error(`${account.exchange} does not support the "${walletType}" wallet`);
  }

  // 🆕 transferFunds/getWalletBalances are optional IExchange members (only
  // Binance/OKX implement them). Per the convention documented in
  // BaseExchange.ts, callers must type the connection as `IExchange` — not
  // the concrete exchange union — before checking for them, since TS won't
  // allow accessing a property absent from one union member (CoinbaseExchange).
  const { exchange: connExchange } = await createExchangeConnection(account);
  const exchange: IExchange = connExchange;
  if (typeof exchange.getWalletBalances !== 'function') {
    throw new Error(`${account.exchange} does not support wallet balance lookups`);
  }

  const balances = await exchange.getWalletBalances(walletType);
  return serializeBalances(balances);
}

export interface TransferInput {
  accountId: number;
  asset: string;
  amount: string | number;
  from: AccountWalletType;
  to: AccountWalletType;
}

export async function executeTransfer(
  userId: string,
  input: TransferInput,
): Promise<{ success: true }> {
  const account = await getOwnedAccount(userId, input.accountId);

  if (!account.canTrade) {
    throw new Error('Trading is disabled for this account');
  }

  if (input.from === input.to) {
    throw new Error('Source and destination wallets must be different');
  }

  const supported = getSupportedTransferWallets(account.exchange);
  if (!supported.includes(input.from) || !supported.includes(input.to)) {
    throw new Error(`${account.exchange} does not support this transfer route`);
  }

  if (!input.asset || !input.asset.trim()) {
    throw new Error('Asset is required');
  }

  const amount = new Decimal(input.amount);
  if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
    throw new Error('Amount must be greater than zero');
  }

  const { exchange: connExchange } = await createExchangeConnection(account);
  const exchange: IExchange = connExchange;
  if (typeof exchange.transferFunds !== 'function') {
    throw new Error(`${account.exchange} does not support internal transfers`);
  }

  const asset = input.asset.trim().toUpperCase();
  const result = await exchange.transferFunds({
    asset,
    amount,
    from: input.from,
    to: input.to,
  });

  // 🆕 Record this in the SEPARATE internal_transfers table/entity (not the
  // deposits/withdrawals `transfers` table PnL and balance calculations read
  // as external cash flow — see InternalTransferEntity's doc comment). The
  // exchange call above already moved real funds — if persisting the record
  // fails, we log and still report success rather than telling the user the
  // transfer failed when it didn't.
  try {
    const dm = await getDataManager();
    if (dm.saveInternalTransfers) {
      const id = `internal-${account.exchange.toLowerCase()}-${result?.id || randomUUID()}`;

      const record: InternalTransfer = {
        id,
        exchange: account.exchange,
        accountId: account.id,
        asset,
        amount,
        fromWallet: input.from,
        toWallet: input.to,
        status: TransferStatus.COMPLETED,
        timestamp: new Date(),
        providerTransactionId: result?.id,
      };

      await dm.saveInternalTransfers([record], userId);
    }
  } catch (error) {
    console.error('[transfer-service] Failed to record internal transfer', error);
  }

  return { success: true };
}
