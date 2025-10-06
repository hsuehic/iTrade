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
import type { StrategyParameters } from '@crypto-trading/core';

import { OrderEntity } from './Order';
import { User } from './User';

@Entity('strategies')
@Index(['user'])
@Index(['user', 'name'], { unique: true })
export class StrategyEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'jsonb', nullable: true })
  parameters?: StrategyParameters;

  @OneToMany(() => OrderEntity, (o) => o.strategy)
  orders?: OrderEntity[];

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
