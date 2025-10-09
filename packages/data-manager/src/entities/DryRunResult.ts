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

import { DecimalTransformer } from './Kline';
import { DryRunSessionEntity } from './DryRunSession';
import { DryRunTradeEntity } from './DryRunTrade';

@Entity('dry_run_results')
export class DryRunResultEntity implements BacktestResult {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => DryRunSessionEntity, (s) => s.results, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionId' })
  session!: DryRunSessionEntity;

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

  // Store equity series as JSON to satisfy BacktestResult interface
  @Column({ type: 'jsonb', nullable: true })
  equity!: Array<{ timestamp: Date; value: Decimal }>;

  @OneToMany(() => DryRunTradeEntity, (t: DryRunTradeEntity) => t.session, {
    cascade: true,
  })
  trades!: DryRunTradeEntity[];

  @CreateDateColumn()
  createdAt!: Date;
}
