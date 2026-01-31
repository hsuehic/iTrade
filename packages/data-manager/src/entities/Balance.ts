import { Decimal } from 'decimal.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Balance } from '@itrade/core';

import { decimalTransformer } from '../utils/transformers';
@Entity('balances')
@Index(['asset'])
@Index(['accountInfoId', 'asset'], { unique: true })
export class BalanceEntity implements Balance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer', name: 'accountInfoId' })
  accountInfoId!: number;

  @Column({ type: 'character varying', length: 20 })
  asset!: string;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  free!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  locked!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  total!: Decimal;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
