import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Decimal } from 'decimal.js';
import { DecimalTransformer } from '../transformers/DecimalTransformer';
import { StrategyEntity } from './Strategy';

/**
 * Strategy Performance Entity
 *
 * Stores comprehensive performance metrics for trading strategies.
 * This is a separate entity to allow efficient querying and filtering
 * by performance metrics.
 */
@Entity('strategy_performance')
@Index(['strategyId'], { unique: true })
@Index(['totalPnL'])
@Index(['winRate'])
@Index(['totalOrders'])
@Index(['roi'])
export class StrategyPerformanceEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  // ==================== Relationship ====================

  @OneToOne(() => StrategyEntity, (strategy) => strategy.performance, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'strategyId' })
  strategy!: StrategyEntity;

  @Column({ type: 'integer', unique: true })
  strategyId!: number;

  // ==================== Order Metrics ====================

  // Long Orders
  @Column({ type: 'integer', default: 0 })
  longOrdersFilledCount!: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  longOrdersFilledValue!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  longOrdersFilledQuantity!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  longOrdersFilledFees!: Decimal;

  @Column({ type: 'integer', default: 0 })
  longOrdersPendingCount!: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  longOrdersPendingValue!: Decimal;

  @Column({ type: 'integer', default: 0 })
  longOrdersTotalCount!: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  longOrdersTotalValue!: Decimal;

  // Short Orders
  @Column({ type: 'integer', default: 0 })
  shortOrdersFilledCount!: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  shortOrdersFilledValue!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  shortOrdersFilledQuantity!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  shortOrdersFilledFees!: Decimal;

  @Column({ type: 'integer', default: 0 })
  shortOrdersPendingCount!: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  shortOrdersPendingValue!: Decimal;

  @Column({ type: 'integer', default: 0 })
  shortOrdersTotalCount!: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  shortOrdersTotalValue!: Decimal;

  // Other Orders
  @Column({ type: 'integer', default: 0 })
  cancelledOrdersCount!: number;

  @Column({ type: 'integer', default: 0 })
  rejectedOrdersCount!: number;

  @Column({ type: 'integer', default: 0 })
  totalOrders!: number;

  // ==================== PnL Metrics ====================

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  realizedPnL!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  unrealizedPnL!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  totalPnL!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  totalFees!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  netPnL!: Decimal;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  roi!: Decimal; // Return on Investment (%)

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  winRate!: Decimal; // Win rate (%)

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  profitFactor!: Decimal;

  // ==================== Position Metrics ====================

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  currentPosition!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  avgEntryPrice!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  currentPrice!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  marketValue!: Decimal;

  @Column({ type: 'text', default: 'flat' })
  positionSide!: 'long' | 'short' | 'flat';

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 1,
    transformer: new DecimalTransformer(),
  })
  leverage!: Decimal;

  // ==================== Activity Metrics ====================

  @Column({ type: 'integer', default: 0 })
  totalTrades!: number;

  @Column({ type: 'integer', default: 0 })
  winningTrades!: number;

  @Column({ type: 'integer', default: 0 })
  losingTrades!: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  avgTradeSize!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  avgTradeValue!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  largestWin!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  largestLoss!: Decimal;

  @Column({ type: 'integer', default: 0 })
  avgHoldingTime!: number; // in seconds

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  totalVolume!: Decimal;

  // ==================== Symbol Statistics ====================

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  boughtQuantity!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  boughtValue!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  soldQuantity!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  soldValue!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  netPosition!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  avgBuyPrice!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  avgSellPrice!: Decimal;

  @Column({ type: 'integer', default: 0 })
  buyOrderCount!: number;

  @Column({ type: 'integer', default: 0 })
  sellOrderCount!: number;

  // ==================== Time Metrics ====================

  @Column({ type: 'timestamptz' })
  startTime!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastOrderTime?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastSignalTime?: Date;

  @Column({ type: 'integer', default: 0 })
  totalRuntime!: number; // in seconds

  @Column({ type: 'integer', default: 0 })
  activeTradingTime!: number; // in seconds

  // ==================== Risk Metrics ====================

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  maxDrawdown!: Decimal; // %

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  currentDrawdown!: Decimal; // %

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  sharpeRatio!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  maxPositionSize!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  totalExposure!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  valueAtRisk!: Decimal;

  // ==================== Metadata ====================

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
