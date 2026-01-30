import { Decimal } from 'decimal.js';
import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BacktestConfig } from '@itrade/core';

import { decimalTransformer } from '../utils/transformers';
import type { BacktestResultEntity } from './BacktestResult';
import type { User } from './User';

@Entity('backtest_configs')
@Index(['user'])
@Index(['user', 'startDate'])
export class BacktestConfigEntity implements BacktestConfig {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'timestamp' })
  startDate!: Date;

  @Column({ type: 'timestamp' })
  endDate!: Date;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  initialBalance!: Decimal;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 6,
    transformer: decimalTransformer,
  })
  commission!: Decimal;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  slippage?: Decimal;

  @Column('simple-array')
  symbols!: string[];

  @Column({ type: 'character varying', length: 10 })
  timeframe!: string;

  @OneToMany('backtest_results', (r: BacktestResultEntity) => r.config, {
    onDelete: 'CASCADE',
  })
  results?: BacktestResultEntity[];

  @ManyToOne('user', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;
}
