import { Column, Entity } from 'typeorm';

@Entity('verification', { schema: 'public' })
export class Verification {
  @Column('text', { primary: true, name: 'id' })
  id!: string;

  @Column('text', { name: 'identifier' })
  identifier!: string;

  @Column('text', { name: 'value' })
  value!: string;

  @Column('timestamp with time zone', { name: 'expiresAt' })
  expiresAt!: Date;

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
}
