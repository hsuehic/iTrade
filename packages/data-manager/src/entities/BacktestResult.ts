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

import { DecimalTransformer } from './Kline';
import { BacktestTradeEntity } from './BacktestTrade';
import { EquityPointEntity } from './EquityPoint';
import { StrategyEntity } from './Strategy';
import { BacktestConfigEntity } from './BacktestConfig';

@Entity('backtest_results')
@Index(['createdAt'])
export class BacktestResultEntity implements BacktestResult {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne('backtest_configs', (c: { results: BacktestResultEntity[] }) => c.results, {
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
    transformer: new DecimalTransformer(),
  })
  totalReturn!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  annualizedReturn!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  sharpeRatio!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  maxDrawdown!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  winRate!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  profitFactor!: Decimal;

  @Column({ type: 'int' })
  totalTrades!: number;

  @Column({ type: 'int' })
  avgTradeDuration!: number;

  @OneToMany('equity_points', (e: { result: BacktestResultEntity }) => e.result, {
    cascade: true,
  })
  equity!: EquityPointEntity[];

  @OneToMany('backtest_trades', (t: { result: BacktestResultEntity }) => t.result, {
    cascade: true,
  })
  trades!: BacktestTradeEntity[];

  @CreateDateColumn()
  createdAt!: Date;
}
