import { DataSource, Repository } from 'typeorm';
import { Decimal } from 'decimal.js';
import { BalanceEntity } from '../entities/Balance';

export class BalanceRepository {
  private repository: Repository<BalanceEntity>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(BalanceEntity);
  }

  async updateBalances(accountInfoId: number, balances: Array<{
    asset: string;
    free: Decimal | string;
    locked: Decimal | string;
    total: Decimal | string;
  }>): Promise<void> {
    const assets = balances.map(b => b.asset);
    
    // Perform bulk upsert
    // Note: TypeORM upsert might be tricky with unique constraints on some DBs
    // but here we use the composite unique index [accountInfoId, asset]
    await this.repository.upsert(
      balances.map(b => ({
        accountInfoId,
        asset: b.asset,
        free: new Decimal(b.free),
        locked: new Decimal(b.locked),
        total: new Decimal(b.total),
      })),
      ['accountInfoId', 'asset']
    );

    // [Optional] Clean up assets that no longer exist in this account
    // For now, we trust the update. If we want to strictly match the latest, we'd delete others.
    // await this.repository.createQueryBuilder()
    //   .delete()
    //   .where('accountInfoId = :id', { id: accountInfoId })
    //   .andWhere('asset NOT IN (:...assets)', { assets })
    //   .execute();
  }

  async getBalances(accountInfoId: number): Promise<BalanceEntity[]> {
    return await this.repository.find({
      where: { accountInfoId },
      order: { asset: 'ASC' },
    });
  }
}
