import { AccountInfo } from '@crypto-trading/core';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { BalanceEntity } from './Balance';

@Entity('account_info')
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

  @OneToMany(() => BalanceEntity, (b) => b.accountInfo, {
    cascade: true,
  })
  balances!: BalanceEntity[];

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'character varying', length: 50 })
  exchange!: string;

  @Column({ type: 'character varying', length: 255 })
  accountId!: string;
}
