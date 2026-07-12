import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Actions we currently record. Kept as a loose string union (not a Postgres enum)
 * so new admin actions can be added without a schema migration.
 */
export type AuditLogAction =
  | 'impersonate.start'
  | 'impersonate.stop'
  | 'strategy.create'
  | 'strategy.update'
  | 'strategy.delete'
  | 'order.create'
  | 'order.update'
  | 'order.cancel';

/**
 * Audit trail for admin actions taken on/as another user's account
 * (impersonation start/stop, plus any write action performed while impersonating).
 *
 * `actorId` is always the admin who initiated the action. `targetUserId` is the
 * account being acted upon/as. For impersonation events they differ; for a
 * regular user acting on their own account this table is not written to.
 */
@Entity('audit_logs')
@Index(['actorId', 'createdAt'])
@Index(['targetUserId', 'createdAt'])
@Index(['action', 'createdAt'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  /** Admin user id performing the action. */
  @Column({ type: 'text' })
  actorId!: string;

  /** Snapshot of the admin's email at the time of the action (survives account changes). */
  @Column({ type: 'text', nullable: true })
  actorEmail?: string | null;

  /** User id being acted upon/as. */
  @Column({ type: 'text' })
  targetUserId!: string;

  /** Snapshot of the target user's email at the time of the action. */
  @Column({ type: 'text', nullable: true })
  targetEmail?: string | null;

  @Column({ type: 'text' })
  action!: AuditLogAction;

  /** Free-form structured detail, e.g. { strategyId, changes } or { orderId }. */
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  ipAddress?: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent?: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;
}
