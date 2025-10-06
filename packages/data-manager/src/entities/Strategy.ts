import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { StrategyParameters } from '@crypto-trading/core';

import { OrderEntity } from './Order';

@Entity('strategies')
export class StrategyEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text', unique: true })
  name!: string;

  @Column({ type: 'jsonb', nullable: true })
  parameters?: StrategyParameters;

  @OneToMany(() => OrderEntity, (o) => o.strategy)
  orders?: OrderEntity[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
