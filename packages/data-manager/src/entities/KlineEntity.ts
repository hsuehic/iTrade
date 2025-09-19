import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Decimal } from 'decimal.js';

// Custom transformer for Decimal type
export class DecimalTransformer {
  to(value: Decimal): string {
    return value ? value.toString() : '0';
  }

  from(value: string): Decimal {
    return new Decimal(value || '0');
  }
}

@Entity('klines')
@Index(['symbol', 'interval', 'openTime'], { unique: true })
@Index(['symbol', 'interval'])
@Index(['openTime'])
@Index(['symbol'])
export class KlineEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 20 })
  symbol!: string;

  @Column({ length: 10 })
  interval!: string;

  @Column({ type: 'timestamp' })
  openTime!: Date;

  @Column({ type: 'timestamp' })
  closeTime!: Date;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    transformer: new DecimalTransformer()
  })
  open!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    transformer: new DecimalTransformer()
  })
  high!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    transformer: new DecimalTransformer()
  })
  low!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    transformer: new DecimalTransformer()
  })
  close!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    transformer: new DecimalTransformer()
  })
  volume!: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    transformer: new DecimalTransformer()
  })
  quoteVolume!: Decimal;

  @Column({ type: 'int', default: 0 })
  trades!: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    nullable: true,
    transformer: new DecimalTransformer()
  })
  takerBuyBaseVolume?: Decimal;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    nullable: true,
    transformer: new DecimalTransformer()
  })
  takerBuyQuoteVolume?: Decimal;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
