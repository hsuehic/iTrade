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

import { decimalTransformer } from '../utils/transformers';
import type { DryRunOrderEntity } from './DryRunOrder';

@Entity('dry_run_order_fills')
@Index(['timestamp'])
export class DryRunOrderFillEntity implements OrderFill {
  @PrimaryGeneratedColumn()
  internalId!: number;

  @Column({ type: 'text' })
  id!: string;

  @ManyToOne('dry_run_orders', 'fills', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'orderId' })
  order!: DryRunOrderEntity;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  price!: Decimal;

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
  commission!: Decimal;

  @Column({ type: 'character varying', length: 10 })
  commissionAsset!: string;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  timestamp!: Date;
}
