import { Decimal } from 'decimal.js';
import { AccountInfo } from '@itrade/core';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import type { BalanceEntity } from './Balance';
import { SupportedExchange } from '../constants/exchanges';

import { decimalTransformer } from '../utils/transformers';

@Entity('account_info')
@Index(['userId'])
@Index(['userId', 'exchange'], { unique: true })
export class AccountInfoEntity implements AccountInfo {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    default: 0,
    transformer: decimalTransformer,
  })
  totalBalance: Decimal = new Decimal(0);

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    default: 0,
    transformer: decimalTransformer,
  })
  availableBalance: Decimal = new Decimal(0);

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    default: 0,
    transformer: decimalTransformer,
  })
  lockedBalance: Decimal = new Decimal(0);

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    default: 0,
    transformer: decimalTransformer,
  })
  totalPositionValue: Decimal = new Decimal(0);

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    default: 0,
    transformer: decimalTransformer,
  })
  unrealizedPnl: Decimal = new Decimal(0);

  @Column({ type: 'integer', default: 0 })
  positionCount!: number;

  @Column({ type: 'text', name: 'userId' })
  userId!: string;

  @Column({ type: 'boolean', default: true })
  canTrade!: boolean;

  @Column({ type: 'boolean', default: true })
  canWithdraw!: boolean;

  @Column({ type: 'boolean', default: true })
  canDeposit!: boolean;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updateTime!: Date;

  balances!: BalanceEntity[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({
    type: 'enum',
    enum: SupportedExchange,
    comment: 'Exchange name (binance, okx, coinbase)',
  })
  exchange!: string;

  @Column({ type: 'character varying', length: 255 })
  accountId!: string;

  @Column({ type: 'text', nullable: true })
  apiKey!: string;

  @Column({ type: 'text', nullable: true })
  secretKey!: string;

  @Column({ type: 'text', nullable: true })
  passphrase?: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}
