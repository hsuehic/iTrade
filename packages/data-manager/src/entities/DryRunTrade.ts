import { Decimal } from 'decimal.js';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BacktestTrade, OrderSide } from '@crypto-trading/core';

import { DecimalTransformer } from './Kline';
import { DryRunSessionEntity } from './DryRunSession';

@Entity('dry_run_trades')
@Index(['entryTime'])
@Index(['exitTime'])
export class DryRunTradeEntity implements BacktestTrade {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => DryRunSessionEntity, (s) => s.trades, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionId' })
  session!: DryRunSessionEntity;

  @Column({ type: 'character varying', length: 20 })
  symbol!: string;

  @Column({ type: 'enum', enum: OrderSide })
  side!: OrderSide;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  entryPrice!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  exitPrice!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  quantity!: Decimal;

  @Column({ type: 'timestamp' })
  entryTime!: Date;

  @Column({ type: 'timestamp' })
  exitTime!: Date;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  pnl!: Decimal;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 6,
    transformer: new DecimalTransformer(),
  })
  commission!: Decimal;

  @Column({ type: 'int' })
  duration!: number;
}
