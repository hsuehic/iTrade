import winston, { format, transports, Logger } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { ILogger, LogLevel } from '@crypto-trading/core';

export interface FileLoggerOptions {
  logFile: string;
  level?: LogLevel;
  maxFileSize?: number;
  maxFiles?: number;
}

export interface TradingLoggerOptions {
  level?: LogLevel;
  logDir?: string;
  enableConsole?: boolean;
  enableFile?: boolean;
  maxFiles?: string;
  maxSize?: string;
  format?: 'json' | 'simple';
}

export class TradingLogger implements ILogger {
  private logger: Logger;

  constructor(options: TradingLoggerOptions = {}) {
    const logFormat = options.format === 'simple'
      ? format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.colorize(),
        format.printf(info => `${info.timestamp} ${info.level}: ${info.message} ${info.metadata ? JSON.stringify(info.metadata) : ''}`)
      )
      : format.combine(
        format.timestamp(),
        format.json()
      );

    const loggerTransports = [];

    if (options.enableConsole ?? true) {
      loggerTransports.push(new transports.Console({
        format: logFormat
      }));
    }

    if (options.enableFile ?? true) {
      loggerTransports.push(new DailyRotateFile({
        filename: `${options.logDir || './logs'}/application-%DATE%.log`,
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: options.maxSize || '20m',
        maxFiles: options.maxFiles || '14d'
      }));
    }
    
    this.logger = winston.createLogger({
      level: options.level || LogLevel.INFO,
      format: logFormat,
      transports: loggerTransports,
      exitOnError: false
    });
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.logger.debug(message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.logger.info(message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.logger.warn(message, metadata);
  }

  error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
    this.logger.error(message, { error, ...metadata });
  }

  logOrder(message: string, data: Record<string, unknown>): void {
    this.logger.info(message, { type: 'ORDER', ...data });
  }

  logTrade(message: string, data: Record<string, unknown>): void {
    this.logger.info(message, { type: 'TRADE', ...data });
  }

  logStrategy(message: string, data: Record<string, unknown>): void {
    this.logger.info(message, { type: 'STRATEGY', ...data });
  }

  logRisk(message: string, data: Record<string, unknown>): void {
    this.logger.warn(message, { type: 'RISK', ...data });
  }

  createChildLogger(metadata: Record<string, unknown>): ILogger {
    const childWinstonLogger = this.logger.child(metadata);
    const childLogger = new TradingLogger();
    childLogger.logger = childWinstonLogger;
    return childLogger;
  }

  async flush(): Promise<void> {
    const flushPromises = this.logger.transports.map(transport =>
      new Promise<void>(resolve => {
        transport.once('finish', () => resolve());
      })
    );
    this.logger.end();
    await Promise.all(flushPromises);
  }
}

export class ConsoleLogger implements ILogger {
  constructor(private level: LogLevel = LogLevel.INFO) {}

  debug(message: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage(LogLevel.DEBUG, message, metadata));
    }
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage(LogLevel.INFO, message, metadata));
    }
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(LogLevel.WARN, message, metadata));
    }
  }

  error(message: string, error?: Error | Record<string, unknown>, metadata?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      if (error instanceof Error) {
        console.error(this.formatMessage(LogLevel.ERROR, message, { ...metadata, error: error.stack }));
      } else {
        console.error(this.formatMessage(LogLevel.ERROR, message, error));
      }
    }
  }

  logOrder(message: string, data: Record<string, unknown>): void {
    this.info(`[ORDER] ${message}`, data);
  }

  logTrade(message: string, data: Record<string, unknown>): void {
    this.info(`[TRADE] ${message}`, data);
  }

  logStrategy(message: string, data: Record<string, unknown>): void {
    this.info(`[STRATEGY] ${message}`, data);
  }

  logRisk(message: string, data: Record<string, unknown>): void {
    this.warn(`[RISK] ${message}`, data);
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3,
    };
    return levels[level] >= levels[this.level];
  }

  private formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    let formattedMeta = '';
    if (meta && Object.keys(meta).length > 0) {
      formattedMeta = JSON.stringify(meta);
    }
    return `${timestamp} [${level.toUpperCase()}] ${message} ${formattedMeta}`;
  }
}

export class FileLogger implements ILogger {
  private logger: Logger;

  constructor(options: FileLoggerOptions) {
    this.logger = winston.createLogger({
      level: options.level || LogLevel.INFO,
      format: format.combine(
        format.timestamp(),
        format.json()
      ),
      transports: [
        new transports.File({
          filename: options.logFile,
          maxsize: (options.maxFileSize || 5) * 1024 * 1024,
          maxFiles: options.maxFiles || 5,
        })
      ]
    });
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.logger.debug(message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.logger.info(message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.logger.warn(message, metadata);
  }

  error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
    this.logger.error(message, { error, ...metadata });
  }

  logOrder(message: string, data: Record<string, unknown>): void {
    this.logger.info(message, { type: 'ORDER', ...data });
  }

  logTrade(message: string, data: Record<string, unknown>): void {
    this.logger.info(message, { type: 'TRADE', ...data });
  }

  logStrategy(message: string, data: Record<string, unknown>): void {
    this.logger.info(message, { type: 'STRATEGY', ...data });
  }

  logRisk(message: string, data: Record<string, unknown>): void {
    this.logger.warn(message, { type: 'RISK', ...data });
  }

  async flush(): Promise<void> {
    const flushPromise = new Promise<void>(resolve => this.logger.on('finish', resolve));
    this.logger.end();
    return flushPromise;
  }
}
