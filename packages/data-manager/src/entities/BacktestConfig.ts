import { Decimal } from 'decimal.js';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { BacktestConfig } from '@crypto-trading/core';

import { DecimalTransformer } from './Kline';
import { BacktestResultEntity } from './BacktestResult';

@Entity('backtest_configs')
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
    transformer: new DecimalTransformer(),
  })
  initialBalance!: Decimal;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 6,
    transformer: new DecimalTransformer(),
  })
  commission!: Decimal;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 6,
    nullable: true,
    transformer: new DecimalTransformer(),
  })
  slippage?: Decimal;

  @Column('simple-array')
  symbols!: string[];

  @Column({ length: 10 })
  timeframe!: string;

  @OneToMany(() => BacktestResultEntity, (r) => r.config)
  results?: BacktestResultEntity[];
}
