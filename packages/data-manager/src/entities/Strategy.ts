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
import type { StrategyParameters } from '@itrade/core';

import { SupportedExchange } from '../constants/exchanges';
import type { OrderEntity } from './Order';
import type { User } from './User';

export enum StrategyStatus {
  ACTIVE = 'active',
  STOPPED = 'stopped',
  PAUSED = 'paused',
  ERROR = 'error',
}

// Strategy type is now a string (strategy class name) - no enum needed
// Simply use the strategy class name directly (e.g., "MovingAverageStrategy", "RSIStrategy")

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

  @Column({ type: 'text' })
  type!: string; // Strategy class name (e.g., "MovingAverageStrategy", "RSIStrategy")

  @Column({
    type: 'enum',
    enum: StrategyStatus,
    default: StrategyStatus.STOPPED,
  })
  status!: StrategyStatus;

  @Column({
    type: 'enum',
    enum: SupportedExchange,
    nullable: true,
  })
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

  /**
   * Strategy-specific parameters (stored as JSONB)
   * Only stores strategy parameters (e.g., fastPeriod, slowPeriod)
   * Does NOT store runtime context (symbol, exchange, etc.) - those have dedicated columns
   */
  @Column({ type: 'jsonb', nullable: true })
  parameters?: StrategyParameters;

  /**
   * Subscription configuration (stored as JSONB)
   * Defines what market data the strategy subscribes to
   * Example: { ticker: true, klines: { enabled: true, interval: '1m' }, method: 'websocket' }
   */
  @Column({ type: 'jsonb', nullable: true })
  subscription?: Record<string, unknown>;

  /**
   * Subscription configuration (stored as JSONB)
   * Defines what market data the strategy subscribes to
   * Example: { ticker: true, klines: { enabled: true, interval: '1m' }, method: 'websocket' }
   */
  @Column({ type: 'jsonb', nullable: true })
  initialDataConfig?: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ type: 'timestamp', nullable: true })
  lastExecutionTime?: Date;

  @OneToMany('orders', (o: OrderEntity) => o.strategy, {
    onDelete: 'CASCADE',
  })
  orders?: OrderEntity[];

  // TypeORM relation - loads the full User object when needed
  @ManyToOne('user', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  // User ID - explicit column for direct ID access and indexing
  // This works with @JoinColumn above - they reference the same database column
  @Column({ type: 'text' })
  userId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
