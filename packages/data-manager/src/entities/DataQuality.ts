import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('data_quality')
@Index(['symbol', 'interval'], { unique: true })
@Index(['lastCheckAt'])
export class DataQualityEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'character varying', length: 20 })
  symbol!: string;

  @Column({ type: 'character varying', length: 10 })
  interval!: string;

  @Column({ type: 'int', default: 0 })
  totalRecords!: number;

  @Column({ type: 'int', default: 0 })
  missingCandles!: number;

  @Column({ type: 'int', default: 0 })
  duplicateCandles!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  completenessPercent!: number;

  @Column({ type: 'timestamp', nullable: true })
  firstCandleTime?: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastCandleTime?: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastUpdateTime?: Date;

  @Column({ type: 'int', default: 0 })
  avgGapMinutes!: number;

  @Column({ type: 'int', default: 0 })
  maxGapMinutes!: number;

  @Column({ type: 'text', nullable: true })
  issues?: string; // JSON array of identified issues

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  lastCheckAt!: Date;
}
