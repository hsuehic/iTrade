import { Decimal } from 'decimal.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { DecimalTransformer } from './Kline';
import { AccountInfoEntity } from './AccountInfo';

export abstract class BaseBalanceHistoryEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne('account_info', {
    onDelete: 'CASCADE',
  })
  accountInfo!: AccountInfoEntity;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  free!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  locked!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
  })
  total!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: new DecimalTransformer(),
    default: 0,
  })
  saving!: Decimal;

  @Column({ type: 'timestamp' })
  period!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
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
