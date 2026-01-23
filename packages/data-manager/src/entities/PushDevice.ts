import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { User } from './User';

export enum PushPlatform {
  IOS = 'ios',
  ANDROID = 'android',
  WEB = 'web',
}

export enum PushProvider {
  FCM = 'fcm',
  APNS = 'apns',
  WEBPUSH = 'webpush',
}

export enum PushEnvironment {
  SANDBOX = 'sandbox',
  PRODUCTION = 'production',
}

@Entity('push_devices')
@Index(['platform', 'provider', 'pushToken'], { unique: true })
@Index(['platform', 'provider', 'deviceId', 'appId', 'environment'], { unique: true })
@Index(['userId'])
@Index(['appVersion'])
@Index(['isActive'])
@Index(['lastSeenAt'])
export class PushDeviceEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  /**
   * Optional user association.
   * - Allows device registration before login (userId = null)
   * - When the user is deleted, keep the device record but null out userId
   */
  @ManyToOne('user', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user?: User | null;

  @Column({ type: 'text', nullable: true })
  userId?: string | null;

  @Column({ type: 'varchar', length: 64 })
  deviceId!: string;

  @Column({ type: 'varchar', length: 16 })
  platform!: PushPlatform;

  @Column({ type: 'varchar', length: 16 })
  provider!: PushProvider;

  @Column({ type: 'text' })
  pushToken!: string;

  @Column({ type: 'varchar', length: 64 })
  appId!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  appVersion?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  environment?: PushEnvironment | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastSeenAt!: Date;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
