import { Decimal } from 'decimal.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { DecimalTransformer } from './Kline';

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

  @Column({ type: 'timestamp' })
  timestamp!: Date;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  totalBalance!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  availableBalance!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  lockedBalance!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  totalPositionValue!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
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

