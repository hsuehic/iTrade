import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TransferStatus, TransferType } from '@itrade/core';
import { Decimal } from 'decimal.js';
import { decimalTransformer } from '../utils/transformers';

@Entity('transfers')
@Index(['userId', 'exchange'])
@Index(['timestamp'])
export class TransferEntity {
  @PrimaryColumn({ type: 'character varying', length: 255 })
  id!: string;

  @Column({ type: 'text' })
  userId!: string;

  @Column({ type: 'character varying', length: 255 })
  exchange!: string;

  @Column({
    type: 'enum',
    enum: TransferType,
  })
  type!: TransferType;

  @Column({ type: 'character varying', length: 50 })
  asset!: string;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
  })
  amount!: Decimal;

  @Column({
    type: 'enum',
    enum: TransferStatus,
  })
  status!: TransferStatus;

  @Column({ type: 'timestamptz' })
  timestamp!: Date;

  @Column({ type: 'character varying', length: 255, nullable: true })
  network?: string;

  @Column({ type: 'character varying', length: 255, nullable: true })
  txId?: string;

  @Column({
    type: 'decimal',
    precision: 28,
    scale: 10,
    transformer: decimalTransformer,
    nullable: true,
  })
  fee?: Decimal;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updateTime!: Date;
}
