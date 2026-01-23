import { Decimal } from 'decimal.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Balance } from '@itrade/core';

import { DecimalTransformer } from './Kline';
import type { AccountInfoEntity } from './AccountInfo';

@Entity('balances')
@Index(['asset'])
@Index(['accountInfo', 'asset'], { unique: true })
export class BalanceEntity implements Balance {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne('account_info', (account: AccountInfoEntity) => account.balances, {
    onDelete: 'CASCADE',
  })
  accountInfo!: AccountInfoEntity;

  @Column({ type: 'character varying', length: 20 })
  asset!: string;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  free!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  locked!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  total!: Decimal;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
