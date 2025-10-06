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
import { BacktestResult } from '@crypto-trading/core';

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

  // Equity series is optional for dry run; if needed later we can add a table

  @OneToMany(() => DryRunTradeEntity, (t: DryRunTradeEntity) => t.session, {
    cascade: true,
  })
  trades!: DryRunTradeEntity[];

  @CreateDateColumn()
  createdAt!: Date;
}
