import { Decimal } from 'decimal.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order, OrderSide, OrderStatus, OrderType, TimeInForce } from '@itrade/core';

import { DecimalTransformer } from './Kline';
import type { DryRunSessionEntity } from './DryRunSession';
import type { DryRunOrderFillEntity } from './DryRunOrderFill';

@Entity('dry_run_orders')
@Index(['symbol'])
@Index(['status'])
@Index(['timestamp'])
export class DryRunOrderEntity implements Order {
  @PrimaryGeneratedColumn()
  internalId!: number;

  @Column({ type: 'text' })
  id!: string;

  @Column({ type: 'text', nullable: true })
  clientOrderId?: string | undefined;

  @ManyToOne('dry_run_sessions', (s: DryRunSessionEntity) => s.orders, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionId' })
  session!: DryRunSessionEntity;

  @Column({ type: 'character varying', length: 20 })
  symbol!: string;

  @Column({ type: 'enum', enum: OrderSide })
  side!: OrderSide;

  @Column({ type: 'enum', enum: OrderType })
  type!: OrderType;

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
    nullable: true,
    transformer: new DecimalTransformer(),
  })
  price?: Decimal | undefined;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: new DecimalTransformer(),
  })
  stopPrice?: Decimal | undefined;

  @Column({ type: 'enum', enum: OrderStatus })
  status!: OrderStatus;

  @Column({ type: 'enum', enum: TimeInForce })
  timeInForce!: TimeInForce;

  @Column({ type: 'timestamp' })
  timestamp!: Date;

  @Column({ type: 'timestamp', nullable: true })
  updateTime?: Date | undefined;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: new DecimalTransformer(),
  })
  executedQuantity?: Decimal | undefined;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: new DecimalTransformer(),
  })
  cummulativeQuoteQuantity?: Decimal | undefined;

  @OneToMany('dry_run_order_fills', (f: DryRunOrderFillEntity) => f.order, {
    cascade: true,
  })
  fills?: DryRunOrderFillEntity[] | undefined;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
