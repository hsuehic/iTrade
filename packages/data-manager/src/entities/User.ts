import { Column, Entity, OneToMany } from 'typeorm';

import { Account } from './Account';
import { Session } from './Session';
import { StrategyEntity } from './Strategy';

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

  @OneToMany(() => Account, (account: Account) => account.user, { onDelete: 'CASCADE' })
  accounts?: Account[];

  @OneToMany(() => Session, (session: Session) => session.user, { onDelete: 'CASCADE' })
  sessions?: Session[];

  @OneToMany(() => StrategyEntity, (strategy: StrategyEntity) => strategy.user, {
    onDelete: 'CASCADE',
  })
  strategies?: StrategyEntity[];
}
