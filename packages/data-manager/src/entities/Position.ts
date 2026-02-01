import { Decimal } from 'decimal.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Position } from '@itrade/core';

import { decimalTransformer } from '../utils/transformers';
import type { OrderEntity } from './Order';
import type { User } from './User';

@Entity('positions')
@Index(['symbol'])
@Index(['timestamp'])
@Index(['user'])
@Index(['user', 'symbol'])
@Index(['exchange'])
@Index(['exchange', 'symbol'])
@Index(['userId', 'exchange', 'symbol', 'side'], { unique: true })
export class PositionEntity implements Position {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text' })
  userId!: string;

  @Column({ type: 'character varying', length: 20 })
  symbol!: string;

  @Column({ type: 'character varying', length: 50 })
  exchange!: string;

  @Column({ type: 'text' })
  side!: 'long' | 'short';

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  quantity!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  avgPrice!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  markPrice!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  unrealizedPnl!: Decimal;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  leverage!: Decimal;

  @Column({ type: 'timestamptz' })
  timestamp!: Date;

  @OneToMany('orders', 'position')
  orders?: OrderEntity[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne('user', 'positions', { nullable: false })
  @JoinColumn({ name: 'userId' })
  user!: User;
}
