import { Decimal } from 'decimal.js';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BacktestTrade, OrderSide } from '@itrade/core';

import { decimalTransformer } from '../utils/transformers';
import { BacktestResultEntity } from './BacktestResult';

@Entity('backtest_trades')
export class BacktestTradeEntity implements BacktestTrade {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => BacktestResultEntity, (result) => result.trades, {
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

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  entryTime!: Date;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
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

  /** Cash balance immediately after entry order filled */
  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: decimalTransformer,
  })
  entryCashBalance?: Decimal;

  /** Total open position size immediately after entry order filled */
  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: decimalTransformer,
  })
  entryPositionSize?: Decimal;

  /** Cash balance after this trade closed (exit order filled) */
  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: decimalTransformer,
  })
  cashBalance?: Decimal;

  /** Total open position size remaining after this trade closed */
  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    nullable: true,
    transformer: decimalTransformer,
  })
  positionSize?: Decimal;
}
