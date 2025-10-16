import { Decimal } from 'decimal.js';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BacktestTrade, OrderSide } from '@itrade/core';

import { DecimalTransformer } from './Kline';
import { BacktestResultEntity } from './BacktestResult';

@Entity('backtest_trades')
export class BacktestTradeEntity implements BacktestTrade {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(
    () => BacktestResultEntity,
    (r: BacktestResultEntity) => r.trades,
    {
      onDelete: 'CASCADE',
    }
  )
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
