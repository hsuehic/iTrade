import { Column, Entity, OneToMany } from 'typeorm';

import type { Account } from './Account';
import type { Session } from './Session';
import type { StrategyEntity } from './Strategy';
import type { PositionEntity } from './Position';
import type { AccountInfoEntity } from './AccountInfo';
import type { PushDeviceEntity } from './PushDevice';
import type { EmailPreferencesEntity } from './EmailPreferences';
import type { DryRunSessionEntity } from './DryRunSession';
import type { BacktestConfigEntity } from './BacktestConfig';

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

  @OneToMany('account', 'user', {
    onDelete: 'CASCADE',
  })
  accounts?: Account[];

  @OneToMany('account_info', 'user', {
    onDelete: 'CASCADE',
  })
  accountInfos?: AccountInfoEntity[];

  @OneToMany('session', 'user', {
    onDelete: 'CASCADE',
  })
  sessions?: Session[];

  @OneToMany('strategies', 'user', {
    onDelete: 'CASCADE',
  })
  strategies?: StrategyEntity[];

  @OneToMany('positions', 'user', {
    onDelete: 'CASCADE',
  })
  positions?: PositionEntity[];

  @OneToMany('push_devices', 'user', {
    onDelete: 'CASCADE',
  })
  pushDevices?: PushDeviceEntity[];

  @OneToMany('email_preferences', 'user', {
    onDelete: 'CASCADE',
  })
  emailPreferences?: EmailPreferencesEntity[];

  @OneToMany('dry_run_sessions', 'user', {
    onDelete: 'CASCADE',
  })
  dryRunSessions?: DryRunSessionEntity[];

  @OneToMany('backtest_configs', 'user', {
    onDelete: 'CASCADE',
  })
  backtestConfigs?: BacktestConfigEntity[];
}
