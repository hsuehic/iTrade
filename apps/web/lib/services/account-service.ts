import 'reflect-metadata';
import { getDataManager } from '@/lib/data-manager';
import type { AccountListItem } from '@/lib/types/account';
import { AccountInfoEntity } from '@itrade/data-manager';
import { CryptoUtils } from '@itrade/utils/CryptoUtils';

export interface AccountDto {
  id?: number;
  userId: string;
  exchange: string;
  accountId: string;
  apiKey: string;
  secretKey: string;
  passphrase?: string;
  isActive: boolean;
}

export async function getUserAccounts(userId: string): Promise<AccountListItem[]> {
  const dm = await getDataManager();
  const repo = dm.getAccountInfoRepository();

  const accounts = await repo.find({
    where: { userId },
    order: { createdAt: 'DESC' },
  });

  const encryptionKey = process.env.ENCRYPTION_KEY;

  return accounts.map((acc) => {
    let maskedKey = '************';
    if (acc.apiKey && encryptionKey) {
      try {
        const decrypted = CryptoUtils.decrypt(acc.apiKey, encryptionKey);
        maskedKey = CryptoUtils.maskApiKey(decrypted);
      } catch {
        maskedKey = 'Invalid Key';
      }
    }

    return {
      id: acc.id,
      exchange: acc.exchange,
      accountId: acc.accountId,
      isActive: acc.isActive,
      updatedTime: acc.updateTime,
      apiKey: maskedKey,
    };
  });
}

export async function upsertAccount(data: AccountDto) {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey)
    throw new Error('Server configuration error: ENCRYPTION_KEY missing');

  const dm = await getDataManager();
  const repo = dm.getAccountInfoRepository();

  // Encrypt keys
  const encryptedApiKey = CryptoUtils.encrypt(data.apiKey, encryptionKey);
  const encryptedSecretKey = CryptoUtils.encrypt(data.secretKey, encryptionKey);
  const encryptedPassphrase = data.passphrase
    ? CryptoUtils.encrypt(data.passphrase, encryptionKey)
    : undefined;

  let entity: AccountInfoEntity;

  if (data.id) {
    const existing = await repo.findOne({
      where: { id: data.id, userId: data.userId },
    });
    if (!existing) throw new Error('Account not found');
    entity = existing;
  } else {
    entity = new AccountInfoEntity();
    entity.userId = data.userId;
  }

  entity.exchange = data.exchange;
  entity.accountId = data.accountId;
  entity.apiKey = encryptedApiKey;
  entity.secretKey = encryptedSecretKey;
  entity.passphrase = encryptedPassphrase;
  entity.isActive = data.isActive;
  entity.updateTime = new Date();

  if (!data.id) {
    entity.canTrade = true;
    entity.canDeposit = true;
    entity.canWithdraw = true;
  }

  await repo.save(entity);
  return entity;
}

export async function removeAccount(id: number, userId: string) {
  const dm = await getDataManager();
  const repo = dm.getAccountInfoRepository();

  // Fetch the account before deletion so we know the exchange to clean up
  const account = await repo.findOne({ where: { id, userId } });
  if (!account) return false;

  // Delete the account_info row (balance_* and account_snapshots cascade automatically)
  await repo.delete({ id, userId });

  // Clean up orphaned data that has no FK to account_info.
  // All three tables (orders, positions, transfers) are keyed by userId + exchange,
  // not by account_info.id, so they survive the account_info deletion.
  const exchange = account.exchange;

  // 1. Delete orders (order_fills cascade via FK ON DELETE CASCADE on orders.internalId)
  await dm.dataSource
    .createQueryBuilder()
    .delete()
    .from('orders')
    .where('"userId" = :userId', { userId })
    .andWhere('LOWER(exchange) = LOWER(:exchange)', { exchange })
    .execute();

  // 2. Delete positions
  await dm.dataSource
    .createQueryBuilder()
    .delete()
    .from('positions')
    .where('"userId" = :userId', { userId })
    .andWhere('LOWER(exchange) = LOWER(:exchange)', { exchange })
    .execute();

  // 3. Delete transfers
  await dm.dataSource
    .createQueryBuilder()
    .delete()
    .from('transfers')
    .where('"userId" = :userId', { userId })
    .andWhere('LOWER(exchange) = LOWER(:exchange)', { exchange })
    .execute();

  return true;
}
