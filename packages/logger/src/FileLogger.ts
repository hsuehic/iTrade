import { promises as fs } from 'fs';
import { dirname } from 'path';

import { ILogger, LogLevel } from '@crypto-trading/core';

export interface FileLoggerOptions {
  logFile: string;
  level?: LogLevel;
  maxFileSize?: number; // in MB
  maxFiles?: number;
}

export class FileLogger implements ILogger {
  private options: Required<FileLoggerOptions>;
  private writeQueue: string[] = [];
  private isWriting = false;

  constructor(options: FileLoggerOptions) {
    this.options = {
      level: options.level || LogLevel.INFO,
      maxFileSize: options.maxFileSize || 50, // 50MB default
      maxFiles: options.maxFiles || 5,
      ...options,
    };

    this.ensureLogDirectory();
  }

  private async ensureLogDirectory(): Promise<void> {
    const logDir = dirname(this.options.logFile);
    await fs.mkdir(logDir, { recursive: true });
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: { [key in LogLevel]: number } = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3,
    };
    return levels[level] >= levels[this.options.level];
  }

  private formatLogEntry(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...meta,
    };
    return JSON.stringify(logEntry) + '\n';
  }

  private async writeToFile(content: string): Promise<void> {
    this.writeQueue.push(content);

    if (this.isWriting) {
      return;
    }

    this.isWriting = true;

    while (this.writeQueue.length > 0) {
      const batch = this.writeQueue.splice(0, 100); // Process in batches
      const batchContent = batch.join('');

      try {
        await this.checkFileSize();
        await fs.appendFile(this.options.logFile, batchContent, 'utf8');
      } catch (error) {
        console.error('Failed to write to log file:', error);
      }
    }

    this.isWriting = false;
  }

  private async checkFileSize(): Promise<void> {
    try {
      const stats = await fs.stat(this.options.logFile);
      const sizeInMB = stats.size / (1024 * 1024);

      if (sizeInMB > this.options.maxFileSize) {
        await this.rotateLogFile();
      }
    } catch (error) {
      console.error('Failed to check file size:', error);
      // File doesn't exist yet, which is fine
    }
  }

  private async rotateLogFile(): Promise<void> {
    const baseFile = this.options.logFile;
    const extension = '.log';
    const baseName = baseFile.replace(extension, '');

    // Rotate existing files
    for (let i = this.options.maxFiles - 1; i > 0; i--) {
      const oldFile = `${baseName}.${i}${extension}`;
      const newFile = `${baseName}.${i + 1}${extension}`;

      try {
        await fs.access(oldFile);
        if (i === this.options.maxFiles - 1) {
          // Delete the oldest file
          await fs.unlink(oldFile);
        } else {
          await fs.rename(oldFile, newFile);
        }
      } catch {
        // File doesn't exist, skip
      }
    }

    // Move current log to .1
    try {
      await fs.rename(baseFile, `${baseName}.1${extension}`);
    } catch {
      // Current file doesn't exist, skip
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const logEntry = this.formatLogEntry(LogLevel.DEBUG, message, meta);
      this.writeToFile(logEntry);
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const logEntry = this.formatLogEntry(LogLevel.INFO, message, meta);
      this.writeToFile(logEntry);
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const logEntry = this.formatLogEntry(LogLevel.WARN, message, meta);
      this.writeToFile(logEntry);
    }
  }

  error(message: string, error?: Error | Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      let logMeta: Record<string, unknown> = {};

      if (error instanceof Error) {
        logMeta = {
          error: error.message,
          stack: error.stack,
          name: error.name,
        };
      } else if (error) {
        logMeta = error;
      }

      const logEntry = this.formatLogEntry(LogLevel.ERROR, message, logMeta);
      this.writeToFile(logEntry);
    }
  }

  logTrade(message: string, data: Record<string, unknown>): void {
    this.info(`[TRADE] ${message}`, { type: 'TRADE', ...data });
  }

  logOrder(message: string, data: Record<string, unknown>): void {
    this.info(`[ORDER] ${message}`, { type: 'ORDER', ...data });
  }

  logStrategy(message: string, data: Record<string, unknown>): void {
    this.info(`[STRATEGY] ${message}`, { type: 'STRATEGY', ...data });
  }

  logRisk(message: string, data: Record<string, unknown>): void {
    this.warn(`[RISK] ${message}`, { type: 'RISK', ...data });
  }

  logPerformance(message: string, data: Record<string, unknown>): void {
    this.info(`[PERFORMANCE] ${message}`, { type: 'PERFORMANCE', ...data });
  }

  logExchange(message: string, data: Record<string, unknown>): void {
    this.info(`[EXCHANGE] ${message}`, { type: 'EXCHANGE', ...data });
  }

  async flush(): Promise<void> {
    // Wait for all pending writes to complete
    while (this.writeQueue.length > 0 || this.isWriting) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}
