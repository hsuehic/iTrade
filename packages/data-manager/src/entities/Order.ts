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
import { PositionEntity } from './Position';
import { StrategyEntity } from './Strategy';
import { OrderFillEntity } from './OrderFill';

@Entity('orders')
@Index(['symbol'])
@Index(['status'])
@Index(['timestamp'])
export class OrderEntity implements Order {
  @PrimaryGeneratedColumn()
  internalId!: number;

  @Column({ type: 'text', unique: true })
  id!: string;

  @Column({ type: 'text', nullable: true })
  clientOrderId?: string | undefined;

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

  @Column({ type: 'text', nullable: true })
  exchange?: string;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: new DecimalTransformer(),
  })
  realizedPnl?: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: new DecimalTransformer(),
  })
  unrealizedPnl?: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: new DecimalTransformer(),
  })
  averagePrice?: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: new DecimalTransformer(),
  })
  commission?: Decimal;

  @Column({ type: 'text', nullable: true })
  commissionAsset?: string;

  @OneToMany(() => OrderFillEntity, (f) => f.order, { cascade: true })
  fills?: OrderFillEntity[];

  @ManyToOne(() => StrategyEntity, (s) => s.orders, { nullable: true })
  @JoinColumn({ name: 'strategyId' })
  strategy?: StrategyEntity;

  @ManyToOne(() => PositionEntity, (p) => p.orders, { nullable: true })
  @JoinColumn({ name: 'positionId' })
  position?: PositionEntity;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
