import { Decimal } from 'decimal.js';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OrderFill } from '@crypto-trading/core';

import { DecimalTransformer } from './Kline';
import { OrderEntity } from './Order';

@Entity('order_fills')
@Index(['timestamp'])
export class OrderFillEntity implements OrderFill {
  @PrimaryGeneratedColumn()
  internalId!: number;

  @Column({ type: 'text', unique: true })
  id!: string;

  @ManyToOne(() => OrderEntity, (o) => o.fills, { onDelete: 'CASCADE' })
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

  @Column({ length: 10 })
  commissionAsset!: string;

  @Column({ type: 'timestamp' })
  timestamp!: Date;
}
