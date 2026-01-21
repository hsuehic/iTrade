import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import type { User } from './User';

@Entity('session', { schema: 'public' })
export class Session {
  @Column('text', { primary: true, name: 'id' })
  id!: string;

  @Column('timestamp with time zone', { name: 'expiresAt' })
  expiresAt!: Date;

  @Column('text', { name: 'token', unique: true })
  token!: string;

  @Column('timestamp with time zone', {
    name: 'createdAt',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date;

  @Column('timestamp with time zone', { name: 'updatedAt' })
  updatedAt!: Date;

  @Column('text', { name: 'ipAddress', nullable: true })
  ipAddress?: string | null;

  @Column('text', { name: 'userAgent', nullable: true })
  userAgent?: string | null;

  @ManyToOne('user', (user: { sessions: Session[] }) => user.sessions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'userId', referencedColumnName: 'id' }])
  user!: User;
}
