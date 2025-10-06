import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('symbols')
@Index(['symbol'], { unique: true })
@Index(['baseAsset', 'quoteAsset'])
@Index(['exchange'])
export class SymbolEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'character varying', length: 20, unique: true })
  symbol!: string;

  @Column({ type: 'character varying', length: 10 })
  baseAsset!: string;

  @Column({ type: 'character varying', length: 10 })
  quoteAsset!: string;

  @Column({ type: 'character varying', length: 20, default: 'binance' })
  exchange!: string;

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
