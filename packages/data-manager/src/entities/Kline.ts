import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Decimal } from 'decimal.js';

import { decimalTransformer } from '../utils/transformers';

@Entity('klines')
@Index(['symbol', 'interval', 'openTime'], { unique: true })
@Index(['symbol', 'interval'])
@Index(['openTime'])
@Index(['symbol'])
export class KlineEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'character varying', length: 20 })
  symbol!: string;

  @Column({ type: 'character varying', length: 10 })
  interval!: string;

  @Column({ type: 'timestamp' })
  openTime!: Date;

  @Column({ type: 'timestamp' })
  closeTime!: Date;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    transformer: decimalTransformer, // Use shared instance
  })
  open!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    transformer: decimalTransformer, // Use shared instance
  })
  high!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    transformer: decimalTransformer, // Use shared instance
  })
  low!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    transformer: decimalTransformer, // Use shared instance
  })
  close!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    transformer: decimalTransformer, // Use shared instance
  })
  volume!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    transformer: decimalTransformer, // Use shared instance
  })
  quoteVolume!: Decimal;

  @Column({ type: 'int', default: 0 })
  trades!: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    nullable: true,
    transformer: decimalTransformer, // Use shared instance
  })
  takerBuyBaseVolume?: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    nullable: true,
    transformer: decimalTransformer, // Use shared instance
  })
  takerBuyQuoteVolume?: Decimal;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
