import { Decimal } from 'decimal.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BacktestResult } from '@itrade/core';

import { decimalTransformer } from '../utils/transformers';
import { StrategyEntity } from './Strategy';
import { BacktestConfigEntity } from './BacktestConfig';

@Entity('backtest_results')
@Index(['createdAt'])
export class BacktestResultEntity implements BacktestResult {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Optional human-readable label for this run (e.g. "Q1 2026 baseline"). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  name?: string;

  @ManyToOne(() => BacktestConfigEntity, (config) => config.results, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'configId' })
  config!: BacktestConfigEntity;

  @ManyToOne(() => StrategyEntity, { nullable: true, onDelete: 'SET NULL' })
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

  @Column({ type: 'jsonb', nullable: true })
  equity_json?: Array<{ timestamp: Date; value: Decimal }>;

  @Column({ type: 'int' })
  totalTrades!: number;

  @Column({ type: 'int' })
  avgTradeDuration!: number;

  @CreateDateColumn()
  createdAt!: Date;

  // These properties satisfy the BacktestResult interface
  // but are intentionally omitted from TypeORM decorators (@OneToMany)
  // to avoid cyclical dependencies that crash the Next.js production build.
  // They are populated manually when fetching detailed results.
  trades!: any[];
  equity!: any[];
}
