import { DataSource, Repository } from 'typeorm';
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
    const assets = balances.map((b) => b.asset);
    const { allowEmptyPurge = false } = options;

    // Perform bulk upsert
    // Note: TypeORM upsert might be tricky with unique constraints on some DBs
    // but here we use the composite unique index [accountInfoId, asset]
    if (balances.length > 0) {
      await this.repository.upsert(
        balances.map((b) => ({
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
}
