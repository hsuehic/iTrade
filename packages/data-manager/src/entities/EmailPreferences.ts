import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

import type { User } from './User';

@Entity('email_preferences')
@Index(['user'], { unique: true })
export class EmailPreferencesEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne('user', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'text', name: 'userId' })
  userId!: string;

  // Trading notifications
  @Column({ type: 'boolean', default: true })
  tradingAlerts!: boolean;

  @Column({ type: 'boolean', default: true })
  priceAlerts!: boolean;

  @Column({ type: 'boolean', default: true })
  orderUpdates!: boolean;

  // Account & Security
  @Column({ type: 'boolean', default: true })
  accountActivity!: boolean;

  // Reports & Updates
  @Column({ type: 'boolean', default: true })
  weeklyReports!: boolean;

  @Column({ type: 'boolean', default: false })
  productUpdates!: boolean;

  @Column({ type: 'boolean', default: true })
  newsAndTips!: boolean;

  // Marketing
  @Column({ type: 'boolean', default: true })
  marketingEmails!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
