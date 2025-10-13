import { Decimal } from 'decimal.js';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { DecimalTransformer } from './Kline';
import type { BacktestResultEntity } from './BacktestResult';

@Entity('equity_points')
@Index(['timestamp'])
export class EquityPointEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne('BacktestResultEntity', (r: BacktestResultEntity) => r.equity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'resultId' })
  result!: BacktestResultEntity;

  @Column({ type: 'timestamp' })
  timestamp!: Date;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  value!: Decimal;
}
