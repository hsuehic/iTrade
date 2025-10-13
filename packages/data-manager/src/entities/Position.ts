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

import { DecimalTransformer } from './Kline';
import type { OrderEntity } from './Order';
import type { User } from './User';

@Entity('positions')
@Index(['symbol'])
@Index(['timestamp'])
@Index(['user'])
@Index(['user', 'symbol'])
export class PositionEntity implements Position {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'character varying', length: 20 })
  symbol!: string;

  @Column({ type: 'text' })
  side!: 'long' | 'short';

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  quantity!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  avgPrice!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  markPrice!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  unrealizedPnl!: Decimal;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: new DecimalTransformer(),
  })
  leverage!: Decimal;

  @Column({ type: 'timestamp' })
  timestamp!: Date;

  @OneToMany('OrderEntity', (o: OrderEntity) => o.position)
  orders?: OrderEntity[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne('User', { nullable: false })
  @JoinColumn({ name: 'userId' })
  user!: User;
}
