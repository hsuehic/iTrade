import { Decimal } from 'decimal.js';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BacktestTrade, OrderSide } from '@itrade/core';

import { decimalTransformer } from '../utils/transformers';
import type { BacktestResultEntity } from './BacktestResult';

@Entity('backtest_trades')
export class BacktestTradeEntity implements BacktestTrade {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne('backtest_results', 'trades', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'resultId' })
  result!: BacktestResultEntity;

  @Column({ type: 'character varying', length: 20 })
  symbol!: string;

  @Column({ type: 'enum', enum: OrderSide })
  side!: OrderSide;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  entryPrice!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  exitPrice!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
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
    transformer: decimalTransformer,
  })
  pnl!: Decimal;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 6,
    transformer: decimalTransformer,
  })
  commission!: Decimal;

  @Column({ type: 'int' })
  duration!: number;
}
