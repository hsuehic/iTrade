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
} from 'typeorm';
import { BacktestResult } from '@itrade/core';

import { decimalTransformer } from '../utils/transformers';
import type { BacktestTradeEntity } from './BacktestTrade';
import type { EquityPointEntity } from './EquityPoint';
import type { StrategyEntity } from './Strategy';
import type { BacktestConfigEntity } from './BacktestConfig';

@Entity('backtest_results')
@Index(['createdAt'])
export class BacktestResultEntity implements BacktestResult {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne('backtest_configs', (c: BacktestConfigEntity) => c.results, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'configId' })
  config!: BacktestConfigEntity;

  @ManyToOne('strategies', { nullable: true })
  @JoinColumn({ name: 'strategyId' })
  strategy?: StrategyEntity;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  totalReturn!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  annualizedReturn!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  sharpeRatio!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  maxDrawdown!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  winRate!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  profitFactor!: Decimal;

  @Column({ type: 'int' })
  totalTrades!: number;

  @Column({ type: 'int' })
  avgTradeDuration!: number;

  @OneToMany('equity_points', (e: EquityPointEntity) => e.result, {
    cascade: true,
  })
  equity!: EquityPointEntity[];

  @OneToMany('backtest_trades', (t: BacktestTradeEntity) => t.result, {
    cascade: true,
  })
  trades!: BacktestTradeEntity[];

  @CreateDateColumn()
  createdAt!: Date;
}
