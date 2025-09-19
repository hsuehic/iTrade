import { promises as fs } from 'fs';
import { join } from 'path';
import { TypeOrmDataManager } from './TypeOrmDataManager';
import { Decimal } from 'decimal.js';

export interface MigrationOptions {
  batchSize?: number;
  skipExisting?: boolean;
  validateData?: boolean;
  onProgress?: (current: number, total: number, message: string) => void;
}

export interface MigrationStats {
  totalRecords: number;
  migratedRecords: number;
  skippedRecords: number;
  errorRecords: number;
  errors: string[];
  duration: number;
}

export class MigrationHelper {
  constructor(private targetDataManager: TypeOrmDataManager) {}

  async migrateFromFiles(
    sourceDirectory: string,
    options: MigrationOptions = {}
  ): Promise<MigrationStats> {
    const {
      batchSize = 1000,
      skipExisting = true,
      validateData = true,
      onProgress
    } = options;

    const startTime = Date.now();
    const stats: MigrationStats = {
      totalRecords: 0,
      migratedRecords: 0,
      skippedRecords: 0,
      errorRecords: 0,
      errors: [],
      duration: 0
    };

    try {
      // Get all JSON files in the source directory
      const files = await this.getJsonFiles(sourceDirectory);
      onProgress?.(0, files.length, 'Starting migration...');

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        onProgress?.(i, files.length, `Processing ${file}`);

        try {
          const fileStats = await this.migrateFile(
            join(sourceDirectory, file),
            batchSize,
            skipExisting,
            validateData
          );

          stats.totalRecords += fileStats.totalRecords;
          stats.migratedRecords += fileStats.migratedRecords;
          stats.skippedRecords += fileStats.skippedRecords;
          stats.errorRecords += fileStats.errorRecords;
          stats.errors.push(...fileStats.errors);
        } catch (error) {
          const errorMsg = `Failed to migrate file ${file}: ${error}`;
          stats.errors.push(errorMsg);
          console.error(errorMsg);
        }
      }

      stats.duration = Date.now() - startTime;
      onProgress?.(files.length, files.length, 'Migration completed');

      return stats;
    } catch (error) {
      stats.duration = Date.now() - startTime;
      stats.errors.push(`Migration failed: ${error}`);
      throw error;
    }
  }

  async migrateBetweenDatabases(
    sourceConfig: any,
    _targetConfig: any,
    options: {
      symbols?: string[];
      intervals?: string[];
      dateRange?: { start: string; end: string };
      batchSize?: number;
      onProgress?: (current: number, total: number, message: string) => void;
    } = {}
  ): Promise<MigrationStats> {
    const {
      symbols = [],
      intervals = [],
      dateRange,
      batchSize = 1000,
      onProgress
    } = options;

    const sourceManager = new TypeOrmDataManager(sourceConfig);
    await sourceManager.initialize();

    const startTime = Date.now();
    const stats: MigrationStats = {
      totalRecords: 0,
      migratedRecords: 0,
      skippedRecords: 0,
      errorRecords: 0,
      errors: [],
      duration: 0
    };

    try {
      // Get symbols and intervals to migrate
      const symbolsToMigrate = symbols.length > 0 ? symbols : await sourceManager.getAvailableSymbols();
      
      let totalOperations = 0;
      let completedOperations = 0;

      // Calculate total operations
      for (const symbol of symbolsToMigrate) {
        const availableIntervals = intervals.length > 0 ? intervals : await sourceManager.getAvailableIntervals(symbol);
        totalOperations += availableIntervals.length;
      }

      onProgress?.(0, totalOperations, 'Starting database migration...');

      for (const symbol of symbolsToMigrate) {
        const availableIntervals = intervals.length > 0 ? intervals : await sourceManager.getAvailableIntervals(symbol);
        
        for (const interval of availableIntervals) {
          onProgress?.(completedOperations, totalOperations, `Migrating ${symbol} ${interval}`);

          try {
            const startDate = dateRange?.start ? new Date(dateRange.start) : new Date('2020-01-01');
            const endDate = dateRange?.end ? new Date(dateRange.end) : new Date();

            // Get data from source
            const klines = await sourceManager.getKlines(symbol, interval, startDate, endDate);
            stats.totalRecords += klines.length;

            if (klines.length > 0) {
              // Save to target in batches
              for (let i = 0; i < klines.length; i += batchSize) {
                const batch = klines.slice(i, i + batchSize);
                await this.targetDataManager.saveKlines(symbol, interval, batch);
                stats.migratedRecords += batch.length;
              }
            }
          } catch (error) {
            const errorMsg = `Failed to migrate ${symbol} ${interval}: ${error}`;
            stats.errors.push(errorMsg);
            stats.errorRecords += 1;
          }

          completedOperations++;
        }
      }

      stats.duration = Date.now() - startTime;
      onProgress?.(totalOperations, totalOperations, 'Migration completed');

      return stats;
    } finally {
      await sourceManager.close();
    }
  }

  private async getJsonFiles(directory: string): Promise<string[]> {
    try {
      const files = await fs.readdir(directory);
      return files.filter(file => file.endsWith('.json'));
    } catch (error) {
      throw new Error(`Cannot read directory ${directory}: ${error}`);
    }
  }

  private async migrateFile(
    filePath: string,
    batchSize: number,
    skipExisting: boolean,
    validateData: boolean
  ): Promise<MigrationStats> {
    const stats: MigrationStats = {
      totalRecords: 0,
      migratedRecords: 0,
      skippedRecords: 0,
      errorRecords: 0,
      errors: [],
      duration: 0
    };

    try {
      // Parse symbol and interval from filename
      const fileName = filePath.split('/').pop() || '';
      const match = fileName.match(/^(.+)_(.+)\.json$/);
      
      if (!match) {
        throw new Error(`Invalid filename format: ${fileName}. Expected: SYMBOL_INTERVAL.json`);
      }

      const [, symbol, interval] = match;

      // Read and parse JSON file
      const data = await fs.readFile(filePath, 'utf-8');
      const rawKlines = JSON.parse(data);

      if (!Array.isArray(rawKlines)) {
        throw new Error('File does not contain an array of klines');
      }

      stats.totalRecords = rawKlines.length;

      // Convert raw data to Kline format
      const klines = rawKlines.map((raw: any) => ({
        symbol,
        interval,
        openTime: new Date(raw.openTime),
        closeTime: new Date(raw.closeTime),
        open: new Decimal(raw.open),
        high: new Decimal(raw.high),
        low: new Decimal(raw.low),
        close: new Decimal(raw.close),
        volume: new Decimal(raw.volume),
        quoteVolume: new Decimal(raw.quoteVolume),
        trades: raw.trades
      }));

      // Validate data if requested
      if (validateData) {
        const validKlines = klines.filter(kline => this.validateKline(kline));
        stats.errorRecords = klines.length - validKlines.length;
        
        if (stats.errorRecords > 0) {
          stats.errors.push(`${stats.errorRecords} invalid klines in ${fileName}`);
        }
      }

      // Check if data already exists
      if (skipExisting) {
        const existingData = await this.targetDataManager.validateData(symbol, interval);
        if (existingData) {
          stats.skippedRecords = stats.totalRecords;
          return stats;
        }
      }

      // Save in batches
      for (let i = 0; i < klines.length; i += batchSize) {
        const batch = klines.slice(i, i + batchSize);
        await this.targetDataManager.saveKlines(symbol, interval, batch);
        stats.migratedRecords += batch.length;
      }

      return stats;
    } catch (error) {
      stats.errors.push(`Error migrating ${filePath}: ${error}`);
      throw error;
    }
  }

  private validateKline(kline: any): boolean {
    try {
      // Basic validation
      return (
        kline.symbol &&
        kline.interval &&
        kline.openTime instanceof Date &&
        kline.closeTime instanceof Date &&
        kline.open instanceof Decimal &&
        kline.high instanceof Decimal &&
        kline.low instanceof Decimal &&
        kline.close instanceof Decimal &&
        kline.volume instanceof Decimal &&
        kline.quoteVolume instanceof Decimal &&
        typeof kline.trades === 'number' &&
        kline.high.gte(kline.low) &&
        kline.high.gte(kline.open) &&
        kline.high.gte(kline.close) &&
        kline.low.lte(kline.open) &&
        kline.low.lte(kline.close)
      );
    } catch {
      return false;
    }
  }

  async validateMigration(
    sourceManager: TypeOrmDataManager,
    symbol: string,
    interval: string,
    dateRange?: { start: Date; end: Date }
  ): Promise<{
    isValid: boolean;
    sourceCount: number;
    targetCount: number;
    differences: string[];
  }> {
    const startDate = dateRange?.start || new Date('2020-01-01');
    const endDate = dateRange?.end || new Date();

    const [sourceKlines, targetKlines] = await Promise.all([
      sourceManager.getKlines(symbol, interval, startDate, endDate),
      this.targetDataManager.getKlines(symbol, interval, startDate, endDate)
    ]);

    const differences: string[] = [];
    
    if (sourceKlines.length !== targetKlines.length) {
      differences.push(`Record count mismatch: source=${sourceKlines.length}, target=${targetKlines.length}`);
    }

    // Sample validation of a few records
    const sampleSize = Math.min(10, sourceKlines.length);
    for (let i = 0; i < sampleSize; i++) {
      const source = sourceKlines[i];
      const target = targetKlines[i];

      if (source && target) {
        if (!source.open.eq(target.open)) {
          differences.push(`Open price mismatch at index ${i}: ${source.open} vs ${target.open}`);
        }
        if (!source.close.eq(target.close)) {
          differences.push(`Close price mismatch at index ${i}: ${source.close} vs ${target.close}`);
        }
      }
    }

    return {
      isValid: differences.length === 0,
      sourceCount: sourceKlines.length,
      targetCount: targetKlines.length,
      differences
    };
  }
}
