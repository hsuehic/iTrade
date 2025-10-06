import { Decimal } from 'decimal.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Position } from '@crypto-trading/core';

import { DecimalTransformer } from './Kline';
import { OrderEntity } from './Order';

@Entity('positions')
@Index(['symbol'])
@Index(['timestamp'])
export class PositionEntity implements Position {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 20 })
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

  @OneToMany(() => OrderEntity, (o) => o.position)
  orders?: OrderEntity[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
