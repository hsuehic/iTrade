import { AccountInfo } from '@itrade/core';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

import type { BalanceEntity } from './Balance';
import type { User } from './User';
import { SupportedExchange } from '../constants/exchanges';

@Entity('account_info')
@Index(['user'])
@Index(['user', 'exchange'], { unique: true })
export class AccountInfoEntity implements AccountInfo {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'boolean', default: true })
  canTrade!: boolean;

  @Column({ type: 'boolean', default: true })
  canWithdraw!: boolean;

  @Column({ type: 'boolean', default: true })
  canDeposit!: boolean;

  @Column({ type: 'timestamp' })
  updateTime!: Date;

  @OneToMany('balances', 'accountInfo', {
    cascade: true,
  })
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

  @ManyToOne('user', 'accountInfos', { nullable: false })
  @JoinColumn({ name: 'userId' })
  user!: User;
}
