import { AccountInfo } from '@itrade/core';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import type { BalanceEntity } from './Balance';
import { SupportedExchange } from '../constants/exchanges';

@Entity('account_info')
@Index(['userId'])
@Index(['userId', 'exchange'], { unique: true })
export class AccountInfoEntity implements AccountInfo {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text', name: 'userId' })
  userId!: string;

  @Column({ type: 'boolean', default: true })
  canTrade!: boolean;

  @Column({ type: 'boolean', default: true })
  canWithdraw!: boolean;

  @Column({ type: 'boolean', default: true })
  canDeposit!: boolean;

  @Column({ type: 'timestamp' })
  updateTime!: Date;

  balances!: BalanceEntity[];

  @CreateDateColumn()
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
