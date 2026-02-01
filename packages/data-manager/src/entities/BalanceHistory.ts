import { Decimal } from 'decimal.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { decimalTransformer } from '../utils/transformers';
import type { AccountInfoEntity } from './AccountInfo';

export abstract class BaseBalanceHistoryEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne('account_info', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'account_info_id' })
  accountInfo!: AccountInfoEntity;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  free!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  locked!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  total!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
    default: 0,
  })
  saving!: Decimal;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  period!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity('balance_month')
@Index(['accountInfo', 'period'], { unique: true })
export class BalanceMonthEntity extends BaseBalanceHistoryEntity {}

@Entity('balance_week')
@Index(['accountInfo', 'period'], { unique: true })
export class BalanceWeekEntity extends BaseBalanceHistoryEntity {}

@Entity('balance_day')
@Index(['accountInfo', 'period'], { unique: true })
export class BalanceDayEntity extends BaseBalanceHistoryEntity {}

@Entity('balance_hour')
@Index(['accountInfo', 'period'], { unique: true })
export class BalanceHourEntity extends BaseBalanceHistoryEntity {}

@Entity('balance_30min')
@Index(['accountInfo', 'period'], { unique: true })
export class Balance30MinEntity extends BaseBalanceHistoryEntity {}

@Entity('balance_15min')
@Index(['accountInfo', 'period'], { unique: true })
export class Balance15MinEntity extends BaseBalanceHistoryEntity {}

@Entity('balance_5min')
@Index(['accountInfo', 'period'], { unique: true })
export class Balance5MinEntity extends BaseBalanceHistoryEntity {}

@Entity('balance_min')
@Index(['accountInfo', 'period'], { unique: true })
export class BalanceMinEntity extends BaseBalanceHistoryEntity {}
