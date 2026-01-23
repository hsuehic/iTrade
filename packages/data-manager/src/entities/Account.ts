import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import type { User } from './User';

@Entity('account', { schema: 'public' })
export class Account {
  @Column('text', { primary: true, name: 'id' })
  id!: string;

  @Column('text', { name: 'accountId' })
  accountId!: string;

  @Column('text', { name: 'providerId' })
  providerId!: string;

  @Column('text', { name: 'accessToken', nullable: true })
  accessToken?: string | null;

  @Column('text', { name: 'refreshToken', nullable: true })
  refreshToken?: string | null;

  @Column('text', { name: 'idToken', nullable: true })
  idToken?: string | null;

  @Column('timestamp with time zone', {
    name: 'accessTokenExpiresAt',
    nullable: true,
  })
  accessTokenExpiresAt?: Date | null;

  @Column('timestamp with time zone', {
    name: 'refreshTokenExpiresAt',
    nullable: true,
  })
  refreshTokenExpiresAt?: Date | null;

  @Column('text', { name: 'scope', nullable: true })
  scope?: string | null;

  @Column('text', { name: 'password', nullable: true })
  password?: string | null;

  @Column('timestamp with time zone', {
    name: 'createdAt',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date;

  @Column('timestamp with time zone', { name: 'updatedAt' })
  updatedAt!: Date;

  @ManyToOne('user', (user: User) => user.accounts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'userId', referencedColumnName: 'id' }])
  user!: User;
}
