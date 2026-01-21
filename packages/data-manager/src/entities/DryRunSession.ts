import { Decimal } from 'decimal.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';

import { DecimalTransformer } from './Kline';
import { StrategyEntity } from './Strategy';
import { User } from './User';
import { DryRunOrderEntity } from './DryRunOrder';
import { DryRunTradeEntity } from './DryRunTrade';
import { DryRunResultEntity } from './DryRunResult';

export enum DryRunStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

@Entity('dry_run_sessions')
@Index(['createdAt'])
@Index(['status'])
@Index(['user'])
export class DryRunSessionEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne('strategies', { nullable: true })
  @JoinColumn({ name: 'strategyId' })
  strategy?: StrategyEntity;

  @Column({ type: 'text', nullable: true })
  name?: string;

  @Column({ type: 'jsonb', nullable: true })
  parametersSnapshot?: Record<string, unknown>;

  @Column({ type: 'timestamp' })
  startTime!: Date;

  @Column({ type: 'timestamp', nullable: true })
  endTime?: Date;

  @Column({ type: 'enum', enum: DryRunStatus, default: DryRunStatus.RUNNING })
  status!: DryRunStatus;

  @Column({ type: 'character varying', length: 20, nullable: true })
  timeframe?: string;

  @Column('simple-array', { nullable: true })
  symbols?: string[];

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
    default: 0,
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

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @OneToMany('dry_run_orders', (o: DryRunOrderEntity) => o.session)
  orders?: DryRunOrderEntity[];

  @OneToMany('dry_run_trades', (t: DryRunTradeEntity) => t.session)
  trades?: DryRunTradeEntity[];

  @OneToMany('dry_run_results', (r: DryRunResultEntity) => r.session)
  results?: DryRunResultEntity[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;
}
