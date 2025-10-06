import { Column, Entity, OneToMany } from 'typeorm';

import { Account } from './Account';
import { Session } from './Session';

@Entity('user', { schema: 'public' })
export class User {
  @Column('text', { primary: true, name: 'id' })
  id!: string;

  @Column('text', { name: 'name' })
  name!: string;

  @Column('text', { name: 'email', unique: true })
  email!: string;

  @Column('boolean', { name: 'emailVerified' })
  emailVerified!: boolean;

  @Column('text', { name: 'image', nullable: true })
  image?: string | null;

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

  @Column('text', { name: 'role', nullable: true })
  role?: string | null;

  @OneToMany(() => Account, (account) => account.user)
  accounts?: Account[];

  @OneToMany(() => Session, (session) => session.user)
  sessions?: Session[];
}
