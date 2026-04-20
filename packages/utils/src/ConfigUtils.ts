/* eslint-disable no-prototype-builtins */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export class ConfigUtils {
  private static configCache = new Map<string, unknown>();

  // Environment Variables
  static getEnv(key: string, defaultValue?: string): string | undefined {
    return process.env[key] || defaultValue;
  }

  static getEnvRequired(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }

  static getEnvAsNumber(key: string, defaultValue?: number): number | undefined {
    const value = process.env[key];
    if (!value) return defaultValue;

    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
      throw new Error(`Environment variable ${key} is not a valid number: ${value}`);
    }

    return parsed;
  }

  static getEnvAsBoolean(key: string, defaultValue?: boolean): boolean | undefined {
    const value = process.env[key];
    if (!value) return defaultValue;

    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;

    throw new Error(`Environment variable ${key} is not a valid boolean: ${value}`);
  }

  static getEnvAsArray(
    key: string,
    separator: string = ',',
    defaultValue?: string[],
  ): string[] | undefined {
    const value = process.env[key];
    if (!value) return defaultValue;

    return value
      .split(separator)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  // JSON Configuration Files
  static loadConfig<T = unknown>(configPath: string, useCache: boolean = true): T {
    if (useCache && this.configCache.has(configPath)) {
      return this.configCache.get(configPath) as T;
    }

    if (!existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    try {
      const content = readFileSync(configPath, 'utf8');
      const config = JSON.parse(content) as T;

      if (useCache) {
        this.configCache.set(configPath, config);
      }

      return config;
    } catch (error) {
      throw new Error(`Failed to load configuration from ${configPath}: ${error}`);
    }
  }

  static saveConfig<T = unknown>(configPath: string, config: T): void {
    try {
      const content = JSON.stringify(config, null, 2);
      writeFileSync(configPath, content, 'utf8');

      // Update cache
      this.configCache.set(configPath, config);
    } catch (error) {
      throw new Error(`Failed to save configuration to ${configPath}: ${error}`);
    }
  }

  static configExists(configPath: string): boolean {
    return existsSync(configPath);
  }

  static clearConfigCache(configPath?: string): void {
    if (configPath) {
      this.configCache.delete(configPath);
    } else {
      this.configCache.clear();
    }
  }

  // Configuration Merging
  static mergeConfigs<T extends Record<string, unknown>>(...configs: Partial<T>[]): T {
    const merged = {} as T;
    for (const config of configs) {
      this.deepMerge(
        merged as Record<string, unknown>,
        config as Record<string, unknown>,
      );
    }
    return merged;
  }

  private static deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ): Record<string, unknown> {
    if (source === null || source === undefined) {
      return target;
    }

    if (typeof source !== 'object' || Array.isArray(source)) {
      return source;
    }

    const result: Record<string, unknown> = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        const sourceValue = source[key];
        if (
          typeof sourceValue === 'object' &&
          sourceValue !== null &&
          !Array.isArray(sourceValue) &&
          typeof result[key] === 'object' &&
          result[key] !== null &&
          !Array.isArray(result[key])
        ) {
          result[key] = this.deepMerge(
            result[key] as Record<string, unknown>,
            sourceValue as Record<string, unknown>,
          );
        } else {
          result[key] = sourceValue;
        }
      }
    }

    return result;
  }

  // Configuration Validation
  static validateConfig<T extends object>(
    config: Record<string, unknown>,
    schema: Record<keyof T, (value: unknown) => boolean>,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const key in schema) {
      const validator = schema[key as keyof typeof schema];
      if (!config.hasOwnProperty(key)) {
        errors.push(`Missing required configuration key: ${key}`);
        continue;
      }

      if (validator && !validator(config[key])) {
        errors.push(`Invalid value for configuration key: ${key}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  static getRequiredConfig<T>(config: Record<string, unknown>, key: keyof T): T[keyof T] {
    if (!config.hasOwnProperty(key)) {
      throw new Error(`Required configuration key not found: ${String(key)}`);
    }
    return config[key as string] as T[keyof T];
  }

  static getOptionalConfig<T>(
    config: Record<string, unknown>,
    key: keyof T,
    defaultValue: T[keyof T],
  ): T[keyof T] {
    return config.hasOwnProperty(key)
      ? (config[key as string] as T[keyof T])
      : defaultValue;
  }

  // Exchange Configuration Helpers
  static loadExchangeConfig(
    exchangeName: string,
    configDir: string = './config',
  ): Record<string, unknown> {
    const configPath = join(configDir, `${exchangeName.toLowerCase()}.json`);
    return this.loadConfig<Record<string, unknown>>(configPath);
  }

  static validateExchangeConfig(config: Record<string, unknown>): {
    valid: boolean;
    errors: string[];
  } {
    const requiredKeys = ['apiKey', 'secretKey', 'baseUrl'];
    const errors: string[] = [];

    for (const key of requiredKeys) {
      const value = config[key];
      if (!value || typeof value !== 'string' || value.trim() === '') {
        errors.push(`Missing or invalid ${key}`);
      }
    }

    // Validate testnet flag
    if (config.hasOwnProperty('testnet') && typeof config.testnet !== 'boolean') {
      errors.push('testnet must be a boolean value');
    }

    // Validate timeout
    if (config.hasOwnProperty('timeout')) {
      const timeout = config.timeout;
      if (typeof timeout !== 'number' || !Number.isInteger(timeout) || timeout <= 0) {
        errors.push('timeout must be a positive integer');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // Trading Configuration Helpers
  static loadTradingConfig(
    configPath: string = './config/trading.json',
  ): Record<string, unknown> {
    const config = this.loadConfig<Record<string, unknown>>(configPath);

    // Apply environment variable overrides
    const envOverrides = {
      maxPositionSize: this.getEnvAsNumber('MAX_POSITION_SIZE'),
      maxDailyLoss: this.getEnvAsNumber('MAX_DAILY_LOSS'),
      riskPerTrade: this.getEnvAsNumber('RISK_PER_TRADE'),
      enableTrading: this.getEnvAsBoolean('ENABLE_TRADING'),
    };

    // Remove undefined values
    const cleanOverrides = Object.fromEntries(
      Object.entries(envOverrides).filter(([_, value]) => value !== undefined),
    );

    return this.mergeConfigs(config, cleanOverrides);
  }

  static validateTradingConfig(config: Record<string, unknown>): {
    valid: boolean;
    errors: string[];
  } {
    const schema = {
      maxPositionSize: (value: unknown) =>
        typeof value === 'number' && value > 0 && value <= 100,
      maxDailyLoss: (value: unknown) =>
        typeof value === 'number' && value > 0 && value <= 50,
      riskPerTrade: (value: unknown) =>
        typeof value === 'number' && value > 0 && value <= 10,
      enableTrading: (value: unknown) => typeof value === 'boolean',
      symbols: (value: unknown) => Array.isArray(value) && value.length > 0,
    };

    return this.validateConfig(config, schema);
  }

  // Database Configuration
  static getDatabaseConfig(
    type: 'sqlite' | 'postgres' | 'mysql' = 'sqlite',
  ): Record<string, unknown> {
    switch (type) {
      case 'sqlite':
        return {
          type: 'sqlite',
          database: this.getEnv('DB_PATH', './data/trading.db'),
        };

      case 'postgres':
        return {
          type: 'postgres',
          host: this.getEnvRequired('DB_HOST'),
          port: this.getEnvAsNumber('DB_PORT', 5432),
          username: this.getEnvRequired('DB_USERNAME'),
          password: this.getEnvRequired('DB_PASSWORD'),
          database: this.getEnvRequired('DB_DATABASE'),
        };

      case 'mysql':
        return {
          type: 'mysql',
          host: this.getEnvRequired('DB_HOST'),
          port: this.getEnvAsNumber('DB_PORT', 3306),
          username: this.getEnvRequired('DB_USERNAME'),
          password: this.getEnvRequired('DB_PASSWORD'),
          database: this.getEnvRequired('DB_DATABASE'),
        };

      default:
        throw new Error(`Unsupported database type: ${type}`);
    }
  }

  // Logging Configuration
  static getLoggingConfig(): Record<string, unknown> {
    return {
      level: this.getEnv('LOG_LEVEL', 'info'),
      logDir: this.getEnv('LOG_DIR', './logs'),
      enableConsole: this.getEnvAsBoolean('LOG_CONSOLE', true),
      enableFile: this.getEnvAsBoolean('LOG_FILE', true),
      maxFiles: this.getEnv('LOG_MAX_FILES', '14d'),
      maxSize: this.getEnv('LOG_MAX_SIZE', '20m'),
      format: this.getEnv('LOG_FORMAT', 'json') as 'json' | 'simple',
    };
  }

  // Application Configuration
  static getAppConfig(): Record<string, unknown> {
    return {
      env: this.getEnv('NODE_ENV', 'development'),
      port: this.getEnvAsNumber('PORT', 3000),
      debug: this.getEnvAsBoolean('DEBUG', false),
      version: this.getEnv('APP_VERSION', '1.0.0'),
    };
  }

  // Utility Methods
  static isDevelopment(): boolean {
    return this.getEnv('NODE_ENV', 'development') === 'development';
  }

  static isProduction(): boolean {
    return this.getEnv('NODE_ENV') === 'production';
  }

  static isTest(): boolean {
    return this.getEnv('NODE_ENV') === 'test';
  }

  // Configuration Templates
  static createDefaultConfig(
    type: 'exchange' | 'trading' | 'logging',
  ): Record<string, unknown> {
    switch (type) {
      case 'exchange':
        return {
          apiKey: '',
          secretKey: '',
          baseUrl: '',
          testnet: false,
          timeout: 30000,
          rateLimit: {
            requests: 1200,
            window: 60000,
          },
        };

      case 'trading':
        return {
          maxPositionSize: 10,
          maxDailyLoss: 5,
          riskPerTrade: 1,
          enableTrading: false,
          symbols: ['BTCUSDT', 'ETHUSDT'],
          timeframes: ['1h', '4h', '1d'],
        };

      case 'logging':
        return {
          level: 'info',
          logDir: './logs',
          enableConsole: true,
          enableFile: true,
          maxFiles: '14d',
          maxSize: '20m',
          format: 'json',
        };

      default:
        throw new Error(`Unknown configuration type: ${type}`);
    }
  }

  // Config file generation
  static generateConfigFile(
    configPath: string,
    type: 'exchange' | 'trading' | 'logging',
  ): void {
    const defaultConfig = this.createDefaultConfig(type);
    this.saveConfig(configPath, defaultConfig);
  }
}
