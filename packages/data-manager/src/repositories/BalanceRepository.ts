import { DataSource, In, Repository } from 'typeorm';
import { Decimal } from 'decimal.js';
import { BalanceEntity } from '../entities/Balance';

export class BalanceRepository {
  private repository: Repository<BalanceEntity>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(BalanceEntity);
  }

  async updateBalances(
    accountInfoId: number,
    balances: Array<{
      asset: string;
      free: Decimal | string;
      locked: Decimal | string;
      total: Decimal | string;
    }>,
    options: { allowEmptyPurge?: boolean } = {},
  ): Promise<void> {
    const nonZeroBalances = balances.filter((balance) =>
      new Decimal(balance.total).gt(0),
    );
    const assets = nonZeroBalances.map((b) => b.asset);
    const { allowEmptyPurge = false } = options;

    if (nonZeroBalances.length > 0) {
      await this.repository.upsert(
        nonZeroBalances.map((b) => ({
          accountInfoId,
          asset: b.asset,
          free: new Decimal(b.free),
          locked: new Decimal(b.locked),
          total: new Decimal(b.total),
        })),
        ['accountInfoId', 'asset'],
      );
    } else if (!allowEmptyPurge) {
      return;
    }

    // Clean up assets that no longer exist in this account
    if (assets.length === 0) {
      await this.repository.delete({ accountInfoId });
      return;
    }

    await this.repository
      .createQueryBuilder()
      .delete()
      .where('accountInfoId = :id', { id: accountInfoId })
      .andWhere('asset NOT IN (:...assets)', { assets })
      .execute();
  }

  async getBalances(accountInfoId: number): Promise<BalanceEntity[]> {
    return await this.repository.find({
      where: { accountInfoId },
      order: { asset: 'ASC' },
    });
  }

  async getBalancesForAccounts(accountInfoIds: number[]): Promise<BalanceEntity[]> {
    if (accountInfoIds.length === 0) {
      return [];
    }

    return await this.repository.find({
      where: { accountInfoId: In(accountInfoIds) },
      order: { accountInfoId: 'ASC', asset: 'ASC' },
    });
  }
}
