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

import { decimalTransformer } from '../utils/transformers';
import type { PositionEntity } from './Position';
import type { StrategyEntity } from './Strategy';
import type { OrderFillEntity } from './OrderFill';

@Entity('orders')
@Index(['symbol'])
@Index(['status'])
@Index(['strategyId'])
@Index(['exchange'])
@Index(['userId'])
export class OrderEntity implements Order {
  @PrimaryGeneratedColumn()
  internalId!: number;

  @Column({ type: 'text', unique: true })
  id!: string;

  @Column({ type: 'text', nullable: true })
  clientOrderId?: string | undefined;

  @Column({ type: 'text', nullable: true })
  userId?: string;

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
    transformer: decimalTransformer,
  })
  quantity!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: decimalTransformer,
  })
  price?: Decimal | undefined;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: decimalTransformer,
  })
  stopLoss?: Decimal | undefined;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: decimalTransformer,
  })
  takeProfit?: Decimal | undefined;

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
    transformer: decimalTransformer,
  })
  executedQuantity?: Decimal | undefined;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: decimalTransformer,
  })
  cummulativeQuoteQuantity?: Decimal | undefined;

  @Column({ type: 'text', nullable: true })
  exchange?: string;

  // TypeORM relation - loads the full Strategy object when needed
  @ManyToOne('strategies', 'orders', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'strategyId' })
  strategy?: StrategyEntity;

  // Strategy ID - explicit column for direct ID access and indexing
  // This works with @JoinColumn above - they reference the same database column
  @Column({ type: 'integer', nullable: true })
  strategyId?: number;

  @Column({ type: 'text', nullable: true })
  strategyType?: string; // Strategy type/class (e.g., "MovingAverage", "RSI") - for analytics

  @Column({ type: 'text', nullable: true })
  strategyName?: string; // User-defined strategy name (e.g., "MA_1") - for display

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: decimalTransformer,
  })
  realizedPnl?: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: decimalTransformer,
  })
  unrealizedPnl?: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: decimalTransformer,
  })
  averagePrice?: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: decimalTransformer,
  })
  commission?: Decimal;

  @Column({ type: 'text', nullable: true })
  commissionAsset?: string;

  @OneToMany('order_fills', 'order', { cascade: true })
  fills?: OrderFillEntity[];

  @ManyToOne('positions', 'orders', {
    nullable: true,
  })
  @JoinColumn({ name: 'positionId' })
  position?: PositionEntity;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
