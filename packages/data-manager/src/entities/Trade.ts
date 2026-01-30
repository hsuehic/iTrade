import { Decimal } from 'decimal.js';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { Trade } from '@itrade/core';

import { decimalTransformer } from '../utils/transformers';

@Entity('trades')
@Index(['symbol', 'timestamp'])
export class TradeEntity implements Trade {
  @PrimaryGeneratedColumn()
  internalId!: number;

  @Column({ type: 'text', unique: true })
  id!: string;

  @Column({ type: 'character varying', length: 20 })
  symbol!: string;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  price!: Decimal;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  quantity!: Decimal;

  @Column({ type: 'text' })
  side!: 'buy' | 'sell';

  @Column({ type: 'timestamp' })
  timestamp!: Date;

  @Column({ type: 'text', nullable: true })
  takerOrderId?: string;

  @Column({ type: 'text', nullable: true })
  makerOrderId?: string;
}
