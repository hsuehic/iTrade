import { Decimal } from 'decimal.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BacktestResult } from '@itrade/core';

import { decimalTransformer } from '../utils/transformers';
import type { DryRunSessionEntity } from './DryRunSession';
import type { DryRunTradeEntity } from './DryRunTrade';

@Entity('dry_run_results')
export class DryRunResultEntity implements BacktestResult {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne('dry_run_sessions', (s: DryRunSessionEntity) => s.results, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionId' })
  session!: DryRunSessionEntity;

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

  // Store equity series as JSON to satisfy BacktestResult interface
  @Column({ type: 'jsonb', nullable: true })
  equity!: Array<{ timestamp: Date; value: Decimal }>;

  @OneToMany('dry_run_trades', (t: DryRunTradeEntity) => t.session, {
    cascade: true,
  })
  trades!: DryRunTradeEntity[];

  @CreateDateColumn()
  createdAt!: Date;
}
