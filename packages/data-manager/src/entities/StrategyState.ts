import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

import { StrategyEntity } from './Strategy';

@Entity('strategy_states')
@Index(['strategy'], { unique: true }) // 每个策略只能有一个状态记录
@Index(['updatedAt']) // 按更新时间索引便于查询
@Index(['stateVersion']) // 按版本索引便于兼容性检查
export class StrategyStateEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  /**
   * 关联的策略实体
   */
  @ManyToOne(() => StrategyEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'strategyId' })
  strategy!: StrategyEntity;

  @Column({ type: 'int', nullable: false })
  strategyId!: number;

  /**
   * 策略内部状态数据 (JSON)
   * 包含策略特定的运行时状态信息
   */
  @Column({ type: 'jsonb', nullable: false, default: '{}' })
  internalState!: Record<string, unknown>;

  /**
   * 技术指标历史数据 (JSON)
   * 包含移动平均线、RSI、MACD等技术指标的历史计算结果
   */
  @Column({ type: 'jsonb', nullable: false, default: '{}' })
  indicatorData!: Record<string, unknown>;

  /**
   * 最后交易信号
   */
  @Column({ type: 'text', nullable: true })
  lastSignal?: string;

  /**
   * 信号时间
   */
  @Column({ type: 'timestamp', nullable: true })
  signalTime?: Date;

  /**
   * 当前持仓数量（使用字符串存储Decimal以避免精度问题）
   */
  @Column({ type: 'text', nullable: false, default: '0' })
  currentPosition!: string;

  /**
   * 持仓平均价格（使用字符串存储Decimal以避免精度问题）
   */
  @Column({ type: 'text', nullable: true })
  averagePrice?: string;

  /**
   * 状态模式版本号，用于向后兼容性检查
   */
  @Column({ type: 'text', nullable: false, default: '1.0.0' })
  stateVersion!: string;

  /**
   * 最后更新时间戳
   */
  @Column({
    type: 'timestamp',
    nullable: false,
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastUpdateTime!: Date;

  /**
   * 状态快照的哈希值，用于检测数据变化
   */
  @Column({ type: 'text', nullable: true })
  stateHash?: string;

  /**
   * 状态恢复次数计数器
   */
  @Column({ type: 'int', nullable: false, default: 0 })
  recoveryCount!: number;

  /**
   * 最后恢复时间
   */
  @Column({ type: 'timestamp', nullable: true })
  lastRecoveryTime?: Date;

  /**
   * 状态验证状态
   */
  @Column({ type: 'boolean', nullable: false, default: true })
  isValid!: boolean;

  /**
   * 验证失败的错误信息
   */
  @Column({ type: 'text', nullable: true })
  validationError?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
