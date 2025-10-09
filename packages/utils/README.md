# @itrade/utils

Comprehensive utility library providing essential functions and helpers for cryptocurrency trading applications.

## Overview

This package offers a rich collection of utility functions designed specifically for trading systems:

- **Date & Time Utilities** - Advanced date manipulation with trading-specific functions
- **Mathematical Operations** - Precision decimal arithmetic and statistical functions
- **Data Validation** - Comprehensive validation utilities for trading data
- **Formatting Utilities** - Professional formatting for numbers, currencies, and trading data
- **Cryptographic Functions** - API signature generation and security utilities
- **Configuration Management** - Environment and configuration file handling
- **Async Programming Helpers** - Advanced async operations and utilities

## Features

### 📅 Date & Time Management
- **Trading Calendar** - Market hours, weekdays, holidays handling
- **Timeframe Conversions** - Convert between different chart intervals
- **Duration Calculations** - Calculate holding periods and time differences
- **Timezone Handling** - Multi-timezone support for global trading

### 🧮 Mathematical Operations
- **Decimal Precision** - High-precision arithmetic for financial calculations
- **Statistical Functions** - Mean, median, standard deviation, correlation
- **Financial Mathematics** - Returns, Sharpe ratio, risk calculations
- **Technical Analysis Math** - Moving averages, RSI, volatility calculations

### ✅ Data Validation
- **Type Checking** - Comprehensive type validation utilities
- **Trading Data Validation** - Order, price, and symbol validation
- **Schema Validation** - Object structure validation with detailed errors
- **Range Validation** - Min/max bounds checking with decimal support

### 💰 Formatting & Display
- **Currency Formatting** - Multi-currency support with proper decimals
- **Number Formatting** - Large numbers, percentages, scientific notation
- **Trading Displays** - Order status, side indicators, symbol formatting
- **Table Formatting** - Aligned tables for console output

### 🔐 Cryptographic Utilities
- **Exchange API Signatures** - Pre-built signature generators for major exchanges
- **HMAC Operations** - SHA256, SHA512 signing functions
- **Base64 Operations** - Encoding/decoding with URL-safe variants
- **Random Generation** - Secure random strings, nonces, UUIDs

### ⚙️ Configuration Management
- **Environment Variables** - Type-safe environment variable handling
- **Configuration Files** - JSON config loading with validation
- **Merging & Validation** - Deep merge and schema validation
- **Exchange Configs** - Specialized exchange configuration helpers

## Installation

```bash
pnpm add @itrade/utils
```

## Quick Start

### Date Operations
```typescript
import { DateUtils } from '@itrade/utils';

// Trading-specific date functions
const nextTradingDay = DateUtils.getNextWeekday(new Date());
const marketHours = DateUtils.isMarketHours(new Date()); // For traditional markets
const duration = DateUtils.formatDuration(3725000); // "1h 2m 5s"

// Timeframe utilities
const candleStart = DateUtils.getCandleStartTime(new Date(), '1h');
const nextCandle = DateUtils.getNextCandleTime(new Date(), '5m');
const intervalMs = DateUtils.intervalToMilliseconds('1d'); // 86400000
```

### Mathematical Operations
```typescript
import { MathUtils } from '@itrade/utils';
import { Decimal } from 'decimal.js';

// Precision arithmetic
const price1 = new Decimal('45123.456789');
const price2 = new Decimal('45100.123456');
const difference = MathUtils.subtract(price1, price2); // Precise subtraction

// Statistical calculations
const prices = [45000, 45100, 44950, 45200, 45050].map(p => new Decimal(p));
const mean = MathUtils.mean(prices);
const stdDev = MathUtils.standardDeviation(prices);
const sharpe = MathUtils.sharpeRatio(returns, new Decimal(0.02)); // 2% risk-free rate

// Financial calculations
const returns = [0.02, -0.01, 0.015, 0.008, -0.005].map(r => new Decimal(r));
const compoundReturn = MathUtils.compoundReturn(returns);
const annualizedReturn = MathUtils.annualizeReturn(compoundReturn, 5, 252); // 5 days, 252 trading days/year
```

### Data Validation
```typescript
import { ValidationUtils } from '@itrade/utils';

// Trading data validation
const isValidSymbol = ValidationUtils.isValidSymbol('BTCUSDT'); // true
const isValidPrice = ValidationUtils.isValidPrice(new Decimal('45000.50')); // true
const isValidSide = ValidationUtils.isValidOrderSide('BUY'); // true

// Order validation
const orderData = {
  symbol: 'ETHUSDT',
  side: 'BUY',
  type: 'LIMIT',
  quantity: '1.5',
  price: '3200.00'
};

const { valid, errors } = ValidationUtils.isValidOrderData(orderData);
if (!valid) {
  console.log('Order validation errors:', errors);
}

// Schema validation
const userSchema = {
  name: ValidationUtils.isString,
  age: ValidationUtils.isNumber,
  balance: ValidationUtils.isPositiveDecimal
};

const { valid: userValid, errors: userErrors } = ValidationUtils.validateSchema(userData, userSchema);
```

### Formatting Utilities
```typescript
import { FormatUtils } from '@itrade/utils';

// Price formatting
const price = FormatUtils.formatPrice(new Decimal('45123.456789'), 2); // "45123.46"
const currency = FormatUtils.formatCurrency(new Decimal('1250.75'), 'USD'); // "$1,250.75"
const percentage = FormatUtils.formatPercentage(new Decimal('2.567')); // "2.57%"

// Large numbers
const volume = FormatUtils.formatLargeNumber(new Decimal('1250000')); // "1.25M"
const compact = FormatUtils.formatCompactNumber(new Decimal('2500000000')); // "2.5B"

// Trading-specific formatting
const symbol = FormatUtils.formatSymbol('BTCUSDT'); // "BTC/USDT"
const orderSide = FormatUtils.formatOrderSide('BUY'); // "🟢 BUY"
const orderStatus = FormatUtils.formatOrderStatus('FILLED'); // "🟢 Filled"

// Address formatting
const address = FormatUtils.formatAddress('0x1234567890abcdef1234567890abcdef12345678'); 
// "0x123456...345678"
```

### Cryptographic Operations
```typescript
import { CryptoUtils } from '@itrade/utils';

// Hashing
const hash = CryptoUtils.sha256('sensitive data');
const hmacSignature = CryptoUtils.hmacSha256('message', 'secret_key');

// Exchange API signatures
const binanceSignature = CryptoUtils.generateBinanceSignature(queryString, secretKey);
const coinbaseSignature = CryptoUtils.generateCoinbaseSignature(timestamp, method, path, body, secret);

// Random generation
const nonce = CryptoUtils.generateNonce();
const apiKey = CryptoUtils.generateRandomHex(32);
const uuid = CryptoUtils.generateUUID();

// URL building for APIs
const apiUrl = CryptoUtils.buildApiUrl('https://api.binance.com', '/api/v3/ticker/24hr', {
  symbol: 'BTCUSDT'
});
```

### Configuration Management
```typescript
import { ConfigUtils } from '@itrade/utils';

// Environment variables with type conversion
const port = ConfigUtils.getEnvAsNumber('PORT', 3000);
const enableTrading = ConfigUtils.getEnvAsBoolean('ENABLE_TRADING', false);
const symbols = ConfigUtils.getEnvAsArray('TRADING_SYMBOLS', ',', ['BTCUSDT']);

// Configuration files
const appConfig = ConfigUtils.loadConfig('./config/app.json');
const exchangeConfig = ConfigUtils.loadExchangeConfig('binance', './config');

// Merge multiple configs
const mergedConfig = ConfigUtils.mergeConfigs(defaultConfig, userConfig, envOverrides);

// Validation
const { valid, errors } = ConfigUtils.validateExchangeConfig(exchangeConfig);
if (!valid) {
  throw new Error(`Invalid exchange config: ${errors.join(', ')}`);
}
```

### Async Programming Utilities
```typescript
import { sleep, retry, debounce, parallel } from '@itrade/utils';

// Delay execution
await sleep(1000); // Wait 1 second

// Retry with exponential backoff
const result = await retry(
  () => fetchMarketData(),
  {
    maxAttempts: 3,
    delay: 1000,
    backoff: 'exponential',
    shouldRetry: (error) => error.code === 'RATE_LIMIT'
  }
);

// Debounced function calls
const debouncedSave = debounce(savePortfolio, 1000);
debouncedSave(portfolioData); // Only executes after 1s of no new calls

// Parallel execution with concurrency control
const tasks = symbols.map(symbol => () => fetchPriceData(symbol));
const results = await parallel(tasks, 5); // Max 5 concurrent requests
```

## Core Modules

### DateUtils
Comprehensive date and time manipulation:

```typescript
// Trading calendar functions
DateUtils.isWeekend(date)
DateUtils.isWeekday(date)
DateUtils.getNextWeekday(date)
DateUtils.isMarketHours(date, timezone)

// Time calculations
DateUtils.diffInDays(date1, date2)
DateUtils.addBusinessDays(date, days)
DateUtils.getBusinessDaysBetween(start, end)

// Formatting
DateUtils.formatTimestamp(date, 'YYYY-MM-DD HH:mm:ss')
DateUtils.formatDuration(milliseconds)
DateUtils.getRelativeTime(date) // "2 hours ago"

// Candle/interval utilities
DateUtils.getCandleStartTime(time, interval)
DateUtils.getNextCandleTime(time, interval)
DateUtils.intervalToMilliseconds('5m') // 300000
```

### MathUtils
Precision mathematics and statistics:

```typescript
// Basic operations (with Decimal precision)
MathUtils.add(a, b)
MathUtils.multiply(a, b)
MathUtils.divide(a, b) // Safe division with zero check

// Statistical functions
MathUtils.mean(values)
MathUtils.median(values)
MathUtils.standardDeviation(values)
MathUtils.correlation(xValues, yValues)

// Financial calculations
MathUtils.percentageChange(oldValue, newValue)
MathUtils.compoundReturn(returns)
MathUtils.sharpeRatio(returns, riskFreeRate)
MathUtils.beta(assetReturns, marketReturns)

// Utility functions
MathUtils.min(...values)
MathUtils.max(...values)
MathUtils.clamp(value, min, max)
MathUtils.normalize(values) // Scale to 0-1 range
```

### ValidationUtils
Comprehensive validation utilities:

```typescript
// Type validation
ValidationUtils.isString(value)
ValidationUtils.isNumber(value)
ValidationUtils.isDecimal(value)
ValidationUtils.isPositiveDecimal(value)

// Trading-specific validation
ValidationUtils.isValidSymbol('BTCUSDT')
ValidationUtils.isValidPrice(price)
ValidationUtils.isValidOrderSide('BUY')
ValidationUtils.isValidOrderType('LIMIT')

// Complex validation
ValidationUtils.isValidOrderData(orderObject)
ValidationUtils.isValidKlineData(klineObject)
ValidationUtils.validateSchema(object, schemaDefinition)

// Array validation
ValidationUtils.isNotEmptyArray(array)
ValidationUtils.allItemsValid(array, validatorFunction)
```

### FormatUtils
Professional formatting for display:

```typescript
// Number formatting
FormatUtils.formatDecimal(value, decimals)
FormatUtils.formatPrice(price, 2)
FormatUtils.formatCurrency(amount, 'USD', 2)
FormatUtils.formatPercentage(value, 2)

// Large number formatting
FormatUtils.formatLargeNumber(value) // 1.5M, 2.3B
FormatUtils.formatCompactNumber(value)

// String formatting
FormatUtils.truncate(str, maxLength, '...')
FormatUtils.capitalize(str)
FormatUtils.camelCase(str)
FormatUtils.kebabCase(str)

// Trading formatting
FormatUtils.formatSymbol('BTCUSDT') // "BTC/USDT"
FormatUtils.formatOrderSide('BUY') // "🟢 BUY"
FormatUtils.formatOrderStatus('FILLED') // "🟢 Filled"

// Table formatting
FormatUtils.formatTableRow(values, columnWidths)
FormatUtils.formatTableHeader(headers, columnWidths)
```

### CryptoUtils
Security and API utilities:

```typescript
// Hashing and HMAC
CryptoUtils.sha256(data)
CryptoUtils.hmacSha256(data, key)
CryptoUtils.md5(data)

// Encoding/decoding
CryptoUtils.base64Encode(data)
CryptoUtils.base64Decode(data)
CryptoUtils.base64UrlEncode(data) // URL-safe variant

// Random generation
CryptoUtils.generateRandomHex(length)
CryptoUtils.generateNonce()
CryptoUtils.generateUUID()

// Exchange-specific signatures
CryptoUtils.generateBinanceSignature(queryString, secret)
CryptoUtils.generateCoinbaseSignature(timestamp, method, path, body, secret)
CryptoUtils.generateHuobiSignature(method, hostname, path, params, secret)

// URL utilities
CryptoUtils.buildQueryString(params)
CryptoUtils.buildApiUrl(baseUrl, endpoint, params)
```

### ConfigUtils
Configuration and environment management:

```typescript
// Environment variables
ConfigUtils.getEnv('API_KEY', defaultValue)
ConfigUtils.getEnvRequired('SECRET_KEY') // Throws if missing
ConfigUtils.getEnvAsNumber('PORT', 3000)
ConfigUtils.getEnvAsBoolean('DEBUG', false)
ConfigUtils.getEnvAsArray('SYMBOLS', ',', ['BTCUSDT'])

// Configuration files
ConfigUtils.loadConfig('./config.json')
ConfigUtils.saveConfig('./config.json', configObject)
ConfigUtils.configExists('./config.json')

// Specialized configs
ConfigUtils.loadExchangeConfig('binance')
ConfigUtils.loadTradingConfig('./trading.json')
ConfigUtils.getDatabaseConfig('postgres')
ConfigUtils.getLoggingConfig()

// Validation and merging
ConfigUtils.validateExchangeConfig(config)
ConfigUtils.mergeConfigs(config1, config2, config3)
ConfigUtils.createDefaultConfig('trading')
```

## Advanced Usage Examples

### Custom Validation Pipeline
```typescript
class OrderValidator {
  private static validators = [
    ValidationUtils.isValidSymbol,
    ValidationUtils.isValidOrderSide,
    ValidationUtils.isValidOrderType,
    ValidationUtils.isValidPrice,
    ValidationUtils.isValidQuantity
  ];

  static validate(order: OrderData): ValidationResult {
    const errors: string[] = [];

    // Basic structure validation
    const { valid, errors: structureErrors } = ValidationUtils.isValidOrderData(order);
    if (!valid) {
      errors.push(...structureErrors);
    }

    // Custom business logic validation
    if (order.type === 'LIMIT' && !order.price) {
      errors.push('Limit orders require a price');
    }

    if (order.timeInForce === 'IOC' && order.type !== 'LIMIT') {
      errors.push('IOC only supported for limit orders');
    }

    return { valid: errors.length === 0, errors };
  }
}
```

### Performance Monitoring Utilities
```typescript
class PerformanceMonitor {
  private static timers = new Map<string, number>();

  static startTimer(label: string): void {
    this.timers.set(label, Date.now());
  }

  static endTimer(label: string): string {
    const start = this.timers.get(label);
    if (!start) return 'Timer not found';
    
    const elapsed = Date.now() - start;
    this.timers.delete(label);
    
    return FormatUtils.formatDuration(elapsed);
  }

  static async measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.startTimer(label);
    try {
      const result = await fn();
      console.log(`${label}: ${this.endTimer(label)}`);
      return result;
    } catch (error) {
      console.log(`${label} failed: ${this.endTimer(label)}`);
      throw error;
    }
  }
}

// Usage
const data = await PerformanceMonitor.measureAsync('API_CALL', () => 
  fetchMarketData('BTCUSDT')
);
```

### Exchange API Client Helper
```typescript
class ExchangeApiClient {
  constructor(
    private config: ExchangeConfig,
    private baseUrl: string
  ) {}

  private signRequest(params: Record<string, any>): string {
    const queryString = CryptoUtils.buildQueryString(params);
    return CryptoUtils.generateBinanceSignature(queryString, this.config.secretKey);
  }

  async makeSignedRequest(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    // Add timestamp and signature
    const timestamp = Date.now().toString();
    const signedParams = {
      ...params,
      timestamp,
      signature: this.signRequest({ ...params, timestamp })
    };

    const url = CryptoUtils.buildApiUrl(this.baseUrl, endpoint, signedParams);
    
    return retry(
      () => fetch(url, { 
        headers: { 'X-MBX-APIKEY': this.config.apiKey }
      }),
      { maxAttempts: 3, backoff: 'exponential' }
    );
  }
}
```

### Trading Calendar Utility
```typescript
class TradingCalendar {
  private static holidays = new Set([
    '2024-01-01', // New Year
    '2024-07-04', // Independence Day
    '2024-12-25'  // Christmas
  ]);

  static isTradingDay(date: Date): boolean {
    if (DateUtils.isWeekend(date)) return false;
    
    const dateStr = DateUtils.formatTimestamp(date, 'YYYY-MM-DD');
    return !this.holidays.has(dateStr);
  }

  static getNextTradingDay(date: Date): Date {
    let next = DateUtils.addDays(date, 1);
    while (!this.isTradingDay(next)) {
      next = DateUtils.addDays(next, 1);
    }
    return next;
  }

  static getTradingDaysInMonth(year: number, month: number): number {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    
    let count = 0;
    let current = new Date(start);
    
    while (current <= end) {
      if (this.isTradingDay(current)) count++;
      current = DateUtils.addDays(current, 1);
    }
    
    return count;
  }
}
```

## Error Handling

### Validation Error Handling
```typescript
try {
  const { valid, errors } = ValidationUtils.validateSchema(data, schema);
  
  if (!valid) {
    throw new ValidationError('Schema validation failed', errors);
  }
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation errors:', error.details);
  } else {
    console.error('Unexpected error:', error.message);
  }
}
```

### Async Operation Error Handling
```typescript
const fetchWithRetry = async (url: string): Promise<any> => {
  try {
    return await retry(
      () => fetch(url),
      {
        maxAttempts: 3,
        shouldRetry: (error) => error.code !== 'AUTHENTICATION_ERROR'
      }
    );
  } catch (error) {
    console.error(`Failed to fetch ${url} after retries:`, error);
    throw error;
  }
};
```

## Best Practices

### 1. Use Type-Safe Validation
```typescript
// Good: Type-safe validation with detailed errors
const result = ValidationUtils.validateSchema(data, schema);
if (!result.valid) {
  throw new Error(`Validation failed: ${result.errors.join(', ')}`);
}

// Avoid: Generic validation without error details  
if (!isValid(data)) {
  throw new Error('Invalid data');
}
```

### 2. Consistent Decimal Usage
```typescript
// Good: Use Decimal for all financial calculations
const price = new Decimal('45123.456789');
const quantity = new Decimal('1.5');
const total = MathUtils.multiply(price, quantity);

// Avoid: JavaScript number precision issues
const total = 45123.456789 * 1.5; // Precision loss
```

### 3. Proper Error Handling in Async Operations
```typescript
// Good: Comprehensive error handling with retries
const data = await retry(
  () => apiCall(),
  { 
    shouldRetry: (error) => error.code === 'RATE_LIMIT',
    maxAttempts: 3
  }
);

// Avoid: No retry logic for transient failures
const data = await apiCall(); // May fail on rate limits
```

### 4. Environment-Specific Configuration
```typescript
// Good: Environment-aware configuration
const config = {
  logLevel: ConfigUtils.getEnv('LOG_LEVEL', 'info'),
  enableTrading: ConfigUtils.getEnvAsBoolean('ENABLE_TRADING', false),
  maxPositionSize: ConfigUtils.getEnvAsNumber('MAX_POSITION_SIZE', 5)
};

// Avoid: Hardcoded values
const config = {
  logLevel: 'debug',  // Wrong for production
  enableTrading: true // Dangerous default
};
```

## Performance Considerations

### Memory Management
```typescript
// Use streaming for large datasets
const processLargeDataset = async (data: LargeDataset) => {
  const batchSize = 1000;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    await processBatch(batch);
    
    // Allow garbage collection
    if (i % 10000 === 0) {
      await sleep(1);
    }
  }
};
```

### Efficient Validation
```typescript
// Cache validation results for repeated checks
const validationCache = new Map<string, boolean>();

const isValidCached = (symbol: string): boolean => {
  if (validationCache.has(symbol)) {
    return validationCache.get(symbol)!;
  }
  
  const isValid = ValidationUtils.isValidSymbol(symbol);
  validationCache.set(symbol, isValid);
  return isValid;
};
```

## API Reference

### Core Functions
Each utility class provides both static methods and instance methods where appropriate. All functions are fully typed with TypeScript for IDE support and compile-time checking.

### Return Types
- **Validation functions** return `boolean` or `{valid: boolean, errors: string[]}`
- **Math functions** return `Decimal` for precision
- **Formatting functions** return formatted `string`
- **Async functions** return `Promise<T>`

### Error Handling
- Functions validate inputs and provide meaningful error messages
- Async functions include timeout and retry capabilities
- All errors include context information for debugging

## Dependencies

- **decimal.js** - Precision decimal arithmetic
- **moment** - Date/time manipulation (will migrate to date-fns)
- **crypto** - Node.js cryptographic functions
