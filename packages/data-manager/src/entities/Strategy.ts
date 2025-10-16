import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import type { StrategyParameters, StrategyTypeKey } from '@itrade/core';
import { getAllStrategyTypes } from '@itrade/core';

import { OrderEntity } from './Order';
import { User } from './User';

export enum StrategyStatus {
  ACTIVE = 'active',
  STOPPED = 'stopped',
  PAUSED = 'paused',
  ERROR = 'error',
}

// ⚠️ 策略类型枚举 - 必须与 @itrade/core 中的 STRATEGY_REGISTRY 保持同步
// 🔧 添加新策略时，需要同时更新策略配置文件和此枚举
export enum StrategyType {
  MOVING_AVERAGE = 'moving_average',
  RSI = 'rsi',
  MACD = 'macd',
  BOLLINGER_BANDS = 'bollinger_bands',
  CUSTOM = 'custom',
}

// 🔍 编译时验证：确保枚举与策略配置保持同步
const validateStrategyTypeSync = () => {
  const registryTypes = getAllStrategyTypes();
  const enumTypes = Object.values(StrategyType);

  // 检查是否所有注册的策略类型都存在于枚举中
  const missingInEnum = registryTypes.filter(
    (type) => !enumTypes.includes(type as any)
  );
  if (missingInEnum.length > 0) {
    console.warn(
      `⚠️ Strategy types missing in StrategyType enum: ${missingInEnum.join(', ')}`
    );
  }

  // 检查是否枚举中有未注册的类型
  const missingInRegistry = enumTypes.filter(
    (type) => !registryTypes.includes(type as StrategyTypeKey)
  );
  if (missingInRegistry.length > 0) {
    console.warn(
      `⚠️ Strategy types missing in STRATEGY_REGISTRY: ${missingInRegistry.join(', ')}`
    );
  }

  return missingInEnum.length === 0 && missingInRegistry.length === 0;
};

// 在开发环境下进行同步验证
if (process.env.NODE_ENV === 'development') {
  try {
    validateStrategyTypeSync();
  } catch (error) {
    console.warn('⚠️ Strategy type validation failed:', error);
  }
}

export enum MarketType {
  SPOT = 'spot',
  PERPETUAL = 'perpetual',
  FUTURES = 'futures',
  MARGIN = 'margin',
}

@Entity('strategies')
@Index(['user'])
@Index(['user', 'name'], { unique: true })
@Index(['status'])
@Index(['exchange'])
@Index(['marketType'])
export class StrategyEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: StrategyType,
    default: StrategyType.CUSTOM,
  })
  type!: StrategyType;

  @Column({
    type: 'enum',
    enum: StrategyStatus,
    default: StrategyStatus.STOPPED,
  })
  status!: StrategyStatus;

  @Column({ type: 'text', nullable: true })
  exchange?: string;

  @Column({ type: 'text', nullable: true })
  symbol?: string;

  @Column({ type: 'text', nullable: true })
  normalizedSymbol?: string;

  @Column({
    type: 'enum',
    enum: MarketType,
    default: MarketType.SPOT,
  })
  marketType!: MarketType;

  @Column({ type: 'jsonb', nullable: true })
  parameters?: StrategyParameters;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ type: 'timestamp', nullable: true })
  lastExecutionTime?: Date;

  @OneToMany(() => OrderEntity, (o: OrderEntity) => o.strategy)
  orders?: OrderEntity[];

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
