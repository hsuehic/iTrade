import { Decimal } from 'decimal.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { decimalTransformer } from '../utils/transformers';
import type { AccountInfoEntity } from './AccountInfo';

/**
 * AccountSnapshot Entity - 账户快照实体
 *
 * 用于存储交易所账户的定期快照，包括：
 * - 余额信息
 * - 持仓信息
 * - 统计数据
 */
@Entity('account_snapshots')
@Index(['exchange', 'timestamp'])
@Index(['timestamp'])
export class AccountSnapshotEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'character varying', length: 50 })
  exchange!: string;

  @ManyToOne('account_info', {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'account_info_id' })
  accountInfo?: AccountInfoEntity;

  @Column({ type: 'timestamp' })
  timestamp!: Date;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  totalBalance!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  availableBalance!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  lockedBalance!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  totalPositionValue!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  unrealizedPnl!: Decimal;

  @Column({ type: 'integer' })
  positionCount!: number;

  @Column({ type: 'jsonb' })
  balances!: {
    asset: string;
    free: string;
    locked: string;
    total: string;
  }[];

  @Column({ type: 'jsonb' })
  positions!: {
    symbol: string;
    side: 'long' | 'short';
    quantity: string;
    avgPrice: string;
    markPrice: string;
    unrealizedPnl: string;
    leverage: string;
    timestamp: string;
  }[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
