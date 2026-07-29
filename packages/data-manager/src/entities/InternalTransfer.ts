import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountWalletType, TransferStatus } from '@itrade/core';
import { Decimal } from 'decimal.js';
import { decimalTransformer } from '../utils/transformers';

/**
 * A same-exchange, wallet-to-wallet move (e.g. Funding -> Perpetual),
 * initiated via `IExchange.transferFunds` from the Accounts page's Transfer
 * dialog.
 *
 * Deliberately a SEPARATE table from `transfers` (see `TransferEntity`).
 * `transfers` rows (DEPOSIT/WITHDRAW) cross the exchange boundary and are
 * read as external cash flow by PnL/balance calculations (the analytics
 * pnl-chart and account routes, and `TypeOrmDataManager.getTransfersSummary`).
 * An internal transfer moves no money in or out of the exchange, so it lives
 * here instead of as a third `type` value on `transfers` — there is no shared
 * table/enum for a future PnL query to forget to filter out.
 */
@Entity('internal_transfers')
@Index(['userId', 'exchange'])
@Index(['timestamp'])
export class InternalTransferEntity {
  @PrimaryColumn({ type: 'character varying', length: 255 })
  id!: string;

  @Column({ type: 'text' })
  userId!: string;

  @Column({ type: 'character varying', length: 255 })
  exchange!: string;

  // The specific AccountInfoEntity row this transfer was made on, when known.
  @Column({ type: 'int', nullable: true })
  accountId?: number;

  @Column({ type: 'character varying', length: 50 })
  asset!: string;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  amount!: Decimal;

  @Column({
    type: 'enum',
    enum: AccountWalletType,
  })
  fromWallet!: AccountWalletType;

  @Column({
    type: 'enum',
    enum: AccountWalletType,
  })
  toWallet!: AccountWalletType;

  @Column({
    type: 'enum',
    enum: TransferStatus,
  })
  status!: TransferStatus;

  @Column({ type: 'timestamptz' })
  timestamp!: Date;

  // The exchange's own transaction id, when its API returns one (Binance
  // `tranId`, OKX `transId`).
  @Column({ type: 'character varying', length: 255, nullable: true })
  providerTransactionId?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updateTime!: Date;
}
