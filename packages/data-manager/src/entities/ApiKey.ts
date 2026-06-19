import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import type { User } from './User';

/**
 * ApiKey entity — mirrors better-auth's `apikey` table.
 *
 * Created automatically by TypeORM `synchronize: true` (via `sync-schema`).
 * Do NOT rename columns — better-auth queries this table directly using
 * the camelCase field names below.
 */
@Entity('apikey', { schema: 'public' })
export class ApiKey {
  @Column('text', { primary: true, name: 'id' })
  id!: string;

  /** Human-readable label set by the user (e.g. "My trading bot") */
  @Column('text', { name: 'name', nullable: true })
  name?: string | null;

  /** First N characters of the key stored in plain text for display purposes */
  @Column('text', { name: 'start', nullable: true })
  start?: string | null;

  /** Key prefix (e.g. "itrade_"), stored in plain text */
  @Column('text', { name: 'prefix', nullable: true })
  prefix?: string | null;

  /** Hashed API key value (unique per user) */
  @Column('text', { name: 'key', unique: true })
  key!: string;

  @ManyToOne('user', { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'userId', referencedColumnName: 'id' }])
  user!: User;

  /** Rate-limit bucket refill interval in milliseconds */
  @Column('integer', { name: 'refillInterval', nullable: true })
  refillInterval?: number | null;

  /** Number of requests added per refill interval */
  @Column('integer', { name: 'refillAmount', nullable: true })
  refillAmount?: number | null;

  @Column('timestamp with time zone', { name: 'lastRefillAt', nullable: true })
  lastRefillAt?: Date | null;

  @Column('boolean', { name: 'enabled', default: true })
  enabled!: boolean;

  @Column('boolean', { name: 'rateLimitEnabled', default: true })
  rateLimitEnabled!: boolean;

  /** Rate-limit window in milliseconds (default 24 h) */
  @Column('integer', { name: 'rateLimitTimeWindow', nullable: true, default: 86400000 })
  rateLimitTimeWindow?: number | null;

  /** Maximum requests allowed within the rate-limit window */
  @Column('integer', { name: 'rateLimitMax', nullable: true, default: 10 })
  rateLimitMax?: number | null;

  /** Total lifetime request count */
  @Column('integer', { name: 'requestCount', default: 0 })
  requestCount!: number;

  /** Remaining requests in current window (null = unlimited) */
  @Column('integer', { name: 'remaining', nullable: true })
  remaining?: number | null;

  @Column('timestamp with time zone', { name: 'lastRequest', nullable: true })
  lastRequest?: Date | null;

  @Column('timestamp with time zone', { name: 'expiresAt', nullable: true })
  expiresAt?: Date | null;

  @Column('timestamp with time zone', {
    name: 'createdAt',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date;

  @Column('timestamp with time zone', {
    name: 'updatedAt',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt!: Date;

  /**
   * JSON-encoded permissions map, e.g.:
   * '{"read":["portfolio","orders"],"write":["orders"]}'
   */
  @Column('text', { name: 'permissions', nullable: true })
  permissions?: string | null;

  /**
   * JSON-encoded freeform metadata, e.g.:
   * '{"allowedIps":["203.0.113.1"]}'
   */
  @Column('text', { name: 'metadata', nullable: true })
  metadata?: string | null;
}
