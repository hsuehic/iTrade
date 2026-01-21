import { Decimal } from 'decimal.js';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { OrderFill } from '@itrade/core';

import { DecimalTransformer } from './Kline';
import { DryRunOrderEntity } from './DryRunOrder';

@Entity('dry_run_order_fills')
@Index(['timestamp'])
export class DryRunOrderFillEntity implements OrderFill {
  @PrimaryGeneratedColumn()
  internalId!: number;

  @Column({ type: 'text' })
  id!: string;

  @ManyToOne('dry_run_orders', (o: { fills: DryRunOrderFillEntity[] }) => o.fills, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'orderId' })
  order!: DryRunOrderEntity;

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
