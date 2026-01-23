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

  @OneToMany('balances', (b: BalanceEntity) => b.accountInfo, {
    cascade: true,
  })
  balances!: BalanceEntity[];

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'character varying', length: 50 })
  exchange!: string;

  @Column({ type: 'character varying', length: 255 })
  accountId!: string;

  @ManyToOne('user', { nullable: false })
  @JoinColumn({ name: 'userId' })
  user!: User;
}
