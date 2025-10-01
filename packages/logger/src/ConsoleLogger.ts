import { ILogger, LogLevel } from '@crypto-trading/core';

export class ConsoleLogger implements ILogger {
  private level: LogLevel;
  private colors: { [key in LogLevel]: string } = {
    debug: '\x1b[36m', // Cyan
    info: '\x1b[32m', // Green
    warn: '\x1b[33m', // Yellow
    error: '\x1b[31m', // Red
  };
  private reset = '\x1b[0m';

  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: { [key in LogLevel]: number } = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3,
    };
    return levels[level] >= levels[this.level];
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ): string {
    const timestamp = new Date().toISOString();
    const color = this.colors[level];
    const levelStr = level.toUpperCase().padEnd(5);
    const metaStr = meta ? ' ' + JSON.stringify(meta, null, 2) : '';

    return `${color}${timestamp} [${levelStr}]${this.reset} ${message}${metaStr}`;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage(LogLevel.DEBUG, message, meta));
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage(LogLevel.INFO, message, meta));
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(LogLevel.WARN, message, meta));
    }
  }

  error(message: string, error?: Error | Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      if (error instanceof Error) {
        console.error(
          this.formatMessage(LogLevel.ERROR, message, {
            error: error.message,
            stack: error.stack,
            name: error.name,
          })
        );
      } else {
        console.error(this.formatMessage(LogLevel.ERROR, message, error));
      }
    }
  }

  logTrade(message: string, data: Record<string, unknown>): void {
    this.info(`[TRADE] ${message}`, data);
  }

  logOrder(message: string, data: Record<string, unknown>): void {
    this.info(`[ORDER] ${message}`, data);
  }

  logStrategy(message: string, data: Record<string, unknown>): void {
    this.info(`[STRATEGY] ${message}`, data);
  }

  logRisk(message: string, data: Record<string, unknown>): void {
    this.warn(`[RISK] ${message}`, data);
  }

  logPerformance(message: string, data: Record<string, unknown>): void {
    this.info(`[PERFORMANCE] ${message}`, data);
  }

  logExchange(message: string, data: Record<string, unknown>): void {
    this.info(`[EXCHANGE] ${message}`, data);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}
