import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { PushEnvironment, PushPlatform, PushProvider } from './PushDevice';

export type PushTargetType = 'user' | 'tokens' | 'topic' | 'all' | 'filter';
export type PushNotificationCategory =
  | 'general'
  | 'marketing'
  | 'trading'
  | 'security'
  | 'system';

@Entity('push_notification_logs')
@Index(['createdAt'])
@Index(['senderUserId'])
@Index(['senderUserId', 'isRead', 'createdAt']) // For unread count queries
@Index(['targetType'])
@Index(['platform', 'provider'])
export class PushNotificationLogEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ type: 'text', nullable: true })
  senderUserId?: string | null;

  @Column({ type: 'varchar', length: 16 })
  platform!: PushPlatform;

  @Column({ type: 'varchar', length: 16 })
  provider!: PushProvider;

  @Column({ type: 'varchar', length: 16, nullable: true })
  environment?: PushEnvironment | null;

  @Column({ type: 'varchar', length: 32, default: 'general' })
  category!: PushNotificationCategory;

  @Column({ type: 'text' })
  targetType!: PushTargetType;

  /**
   * Target descriptor (e.g., { userId }, { tokensCount }, { topic }, { filters }).
   * We keep it JSONB for future expansion.
   */
  @Column({ type: 'jsonb' })
  target!: Record<string, unknown>;

  /** Firebase "notification" payload (title/body/image). */
  @Column({ type: 'jsonb', nullable: true })
  notification?: Record<string, unknown> | null;

  /** Firebase "data" payload (string->string), stored as JSONB. */
  @Column({ type: 'jsonb', nullable: true })
  data?: Record<string, unknown> | null;

  @Column({ type: 'int', default: 0 })
  successCount!: number;

  @Column({ type: 'int', default: 0 })
  failureCount!: number;

  /**
   * Store a small summary of provider response / errors.
   * Keep this short; do NOT store the full token list to reduce sensitive data exposure.
   */
  @Column({ type: 'jsonb', nullable: true })
  result?: Record<string, unknown> | null;

  /**
   * Whether the notification has been read by the user.
   * Used for badge count / unread count in the mobile app.
   */
  @Column({ type: 'boolean', default: false })
  isRead!: boolean;

  /**
   * When the notification was read (null if unread).
   */
  @Column({ type: 'timestamp with time zone', nullable: true })
  readAt?: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;
}
