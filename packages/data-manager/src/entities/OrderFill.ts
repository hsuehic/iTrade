import { Decimal } from 'decimal.js';
import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { OrderFill } from '@itrade/core';

import { DecimalTransformer } from './Kline';
import type { OrderEntity } from './Order';

@Entity('order_fills')
@Index(['timestamp'])
export class OrderFillEntity implements OrderFill {
  @PrimaryGeneratedColumn()
  internalId!: number;

  @Column({ type: 'text', unique: true })
  id!: string;

  @ManyToOne('orders', (o: { fills: OrderFillEntity[] }) => o.fills, {
    onDelete: 'CASCADE',
  })
  order!: OrderEntity;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  price!: Decimal;

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
  commission!: Decimal;

  @Column({ type: 'character varying', length: 10 })
  commissionAsset!: string;

  @Column({ type: 'timestamp' })
  timestamp!: Date;
}
