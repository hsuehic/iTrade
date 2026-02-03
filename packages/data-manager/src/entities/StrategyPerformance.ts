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
import type { StrategyEntity } from './Strategy';

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

  @OneToOne('strategies', 'performance', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'strategyId' })
  strategy!: StrategyEntity;

  @Column({ type: 'integer', unique: true })
  strategyId!: number;

  // ==================== Order Metrics ====================

  // Long Orders
  @Column({ type: 'integer', default: 0 })
  longOrdersFilledCount!: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  longOrdersFilledValue!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  longOrdersFilledQuantity!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  longOrdersFilledFees!: Decimal;

  @Column({ type: 'integer', default: 0 })
  longOrdersPendingCount!: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  longOrdersPendingValue!: Decimal;

  @Column({ type: 'integer', default: 0 })
  longOrdersTotalCount!: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  longOrdersTotalValue!: Decimal;

  // Short Orders
  @Column({ type: 'integer', default: 0 })
  shortOrdersFilledCount!: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  shortOrdersFilledValue!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  shortOrdersFilledQuantity!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  shortOrdersFilledFees!: Decimal;

  @Column({ type: 'integer', default: 0 })
  shortOrdersPendingCount!: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  shortOrdersPendingValue!: Decimal;

  @Column({ type: 'integer', default: 0 })
  shortOrdersTotalCount!: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  shortOrdersTotalValue!: Decimal;

  // Other Orders
  @Column({ type: 'integer', default: 0 })
  cancelledOrdersCount!: number;

  @Column({ type: 'integer', default: 0 })
  rejectedOrdersCount!: number;

  @Column({ type: 'integer', default: 0 })
  totalOrders!: number;

  // ==================== PnL Metrics ====================

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  realizedPnL!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  unrealizedPnL!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  totalPnL!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  totalFees!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  netPnL!: Decimal;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  roi!: Decimal; // Return on Investment (%)

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  winRate!: Decimal; // Win rate (%)

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  profitFactor!: Decimal;

  // ==================== Position Metrics ====================

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  currentPosition!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  avgEntryPrice!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  currentPrice!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  marketValue!: Decimal;

  @Column({ type: 'text', default: 'flat' })
  positionSide!: 'long' | 'short' | 'flat';

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1 })
  leverage!: Decimal;

  // ==================== Activity Metrics ====================

  @Column({ type: 'integer', default: 0 })
  totalTrades!: number;

  @Column({ type: 'integer', default: 0 })
  winningTrades!: number;

  @Column({ type: 'integer', default: 0 })
  losingTrades!: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  avgTradeSize!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  avgTradeValue!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  largestWin!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  largestLoss!: Decimal;

  @Column({ type: 'integer', default: 0 })
  avgHoldingTime!: number; // in seconds

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  totalVolume!: Decimal;

  // ==================== Symbol Statistics ====================

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  boughtQuantity!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  boughtValue!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  soldQuantity!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  soldValue!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  netPosition!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  avgBuyPrice!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
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

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  maxDrawdown!: Decimal; // %

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  currentDrawdown!: Decimal; // %

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  sharpeRatio!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  maxPositionSize!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  totalExposure!: Decimal;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  valueAtRisk!: Decimal;

  // ==================== Metadata ====================

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
