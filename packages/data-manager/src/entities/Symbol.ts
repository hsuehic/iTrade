import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('symbols')
@Index(['symbol', 'exchange'], { unique: true })
@Index(['baseAsset', 'quoteAsset'])
@Index(['exchange'])
export class SymbolEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'character varying', length: 50 })
  symbol!: string;

  @Column({ type: 'character varying', length: 20 })
  baseAsset!: string;

  @Column({ type: 'character varying', length: 20 })
  quoteAsset!: string;

  @Column({ type: 'character varying', length: 20, default: 'binance' })
  exchange!: string;

  @Column({ type: 'character varying', length: 20, default: 'spot' })
  type!: 'spot' | 'perpetual';

  @Column({ type: 'character varying', length: 100, nullable: true })
  name?: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'int', default: 8 })
  baseAssetPrecision!: number;

  @Column({ type: 'int', default: 8 })
  quoteAssetPrecision!: number;

  @Column('simple-array', { nullable: true })
  orderTypes?: string[];

  @Column('simple-array', { nullable: true })
  timeInForces?: string[];

  @Column({ type: 'text', nullable: true })
  filters?: string; // JSON string for complex filters

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
