import { Decimal } from 'decimal.js';

export type OrderSide = 'BUY' | 'SELL' | 'buy' | 'sell';
export type OrderType =
  | 'MARKET'
  | 'LIMIT'
  | 'STOP_LOSS'
  | 'STOP_LOSS_LIMIT'
  | 'TAKE_PROFIT'
  | 'TAKE_PROFIT_LIMIT';
export type TimeInForce = 'GTC' | 'IOC' | 'FOK';

export class ValidationUtils {
  // Type Validation
  static isString(value: unknown): value is string {
    return typeof value === 'string';
  }

  static isNumber(value: unknown): value is number {
    return typeof value === 'number' && !isNaN(value) && isFinite(value);
  }

  static isInteger(value: unknown): boolean {
    return this.isNumber(value) && Number.isInteger(value);
  }

  static isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
  }

  static isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  static isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  static isDate(value: unknown): value is Date {
    return value instanceof Date && !isNaN(value.getTime());
  }

  static isFunction(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === 'function';
  }

  static isUndefined(value: unknown): value is undefined {
    return typeof value === 'undefined';
  }

  static isNull(value: unknown): value is null {
    return value === null;
  }

  static isNullOrUndefined(value: unknown): value is null | undefined {
    return this.isNull(value) || this.isUndefined(value);
  }

  // Decimal Validation
  static isDecimal(value: unknown): value is Decimal {
    return value instanceof Decimal;
  }

  static isValidDecimal(value: unknown): boolean {
    try {
      new Decimal(value as Decimal.Value);
      return true;
    } catch {
      return false;
    }
  }

  static isPositiveDecimal(value: Decimal | string | number): boolean {
    try {
      const decimal = new Decimal(value);
      return decimal.gt(0);
    } catch {
      return false;
    }
  }

  static isNonNegativeDecimal(value: Decimal | string | number): boolean {
    try {
      const decimal = new Decimal(value);
      return decimal.gte(0);
    } catch {
      return false;
    }
  }

  static isNonZeroDecimal(value: Decimal | string | number): boolean {
    try {
      const decimal = new Decimal(value);
      return !decimal.eq(0);
    } catch {
      return false;
    }
  }

  // String Validation
  static isNotEmpty(value: string): boolean {
    return this.isString(value) && value.trim().length > 0;
  }

  static hasMinLength(value: string, minLength: number): boolean {
    return this.isString(value) && value.length >= minLength;
  }

  static hasMaxLength(value: string, maxLength: number): boolean {
    return this.isString(value) && value.length <= maxLength;
  }

  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return this.isString(email) && emailRegex.test(email);
  }

  static isValidURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static isAlphanumeric(value: string): boolean {
    const alphanumericRegex = /^[a-zA-Z0-9]+$/;
    return this.isString(value) && alphanumericRegex.test(value);
  }

  static isNumericString(value: string): boolean {
    const numericRegex = /^-?(\d+\.?\d*|\.\d+)$/;
    return this.isString(value) && numericRegex.test(value);
  }

  // Financial Validation
  static isValidSymbol(symbol: string): boolean {
    if (!this.isString(symbol)) return false;

    // Common crypto symbol patterns: BTCUSDT, BTC-USD, BTC/USDT
    const symbolRegex = /^[A-Z]{2,10}[/-]?[A-Z]{2,10}$/;
    return symbolRegex.test(symbol.toUpperCase());
  }

  static isValidPrice(price: Decimal | string | number): boolean {
    return this.isPositiveDecimal(price);
  }

  static isValidQuantity(quantity: Decimal | string | number): boolean {
    return this.isPositiveDecimal(quantity);
  }

  static isValidPercentage(
    percentage: Decimal | string | number,
    min = 0,
    max = 100,
  ): boolean {
    try {
      const decimal = new Decimal(percentage);
      return decimal.gte(min) && decimal.lte(max);
    } catch {
      return false;
    }
  }

  static isValidOrderSide(side: string): side is OrderSide {
    return ['BUY', 'SELL', 'buy', 'sell'].includes(side);
  }

  static isValidOrderType(type: string): type is OrderType {
    return [
      'MARKET',
      'LIMIT',
      'STOP_LOSS',
      'STOP_LOSS_LIMIT',
      'TAKE_PROFIT',
      'TAKE_PROFIT_LIMIT',
    ].includes(type.toUpperCase());
  }

  static isValidTimeInForce(tif: string): tif is TimeInForce {
    return ['GTC', 'IOC', 'FOK'].includes(tif.toUpperCase());
  }

  // Array Validation
  static isNotEmptyArray<T>(array: T[]): boolean {
    return this.isArray(array) && array.length > 0;
  }

  static hasMinArrayLength<T>(array: T[], minLength: number): boolean {
    return this.isArray(array) && array.length >= minLength;
  }

  static hasMaxArrayLength<T>(array: T[], maxLength: number): boolean {
    return this.isArray(array) && array.length <= maxLength;
  }

  static allItemsValid<T>(array: T[], validator: (item: T) => boolean): boolean {
    return this.isArray(array) && array.every(validator);
  }

  // Range Validation
  static isInRange(value: number, min: number, max: number): boolean {
    return this.isNumber(value) && value >= min && value <= max;
  }

  static isDecimalInRange(
    value: Decimal | string | number,
    min: Decimal,
    max: Decimal,
  ): boolean {
    try {
      const decimal = new Decimal(value);
      return decimal.gte(min) && decimal.lte(max);
    } catch {
      return false;
    }
  }

  // Date Validation
  static isValidDateString(dateString: string): boolean {
    return this.isString(dateString) && !isNaN(Date.parse(dateString));
  }

  static isDateInRange(date: Date, minDate: Date, maxDate: Date): boolean {
    return this.isDate(date) && date >= minDate && date <= maxDate;
  }

  static isFutureDate(date: Date): boolean {
    return this.isDate(date) && date > new Date();
  }

  static isPastDate(date: Date): boolean {
    return this.isDate(date) && date < new Date();
  }

  // Object Validation
  static hasProperty(obj: Record<string, unknown>, property: string): boolean {
    return this.isObject(obj) && Object.prototype.hasOwnProperty.call(obj, property);
  }

  static hasAllProperties(obj: Record<string, unknown>, properties: string[]): boolean {
    return this.isObject(obj) && properties.every((prop) => this.hasProperty(obj, prop));
  }

  static hasRequiredProperties<T extends Record<string, unknown>>(
    obj: Record<string, unknown>,
    requiredProps: (keyof T)[],
  ): obj is T {
    return (
      this.isObject(obj) &&
      requiredProps.every(
        (prop) =>
          this.hasProperty(obj, prop as string) &&
          !this.isNullOrUndefined((obj as T)[prop]),
      )
    );
  }

  // Schema Validation
  static validateSchema<T extends object>(
    obj: Record<string, unknown>,
    schema: Record<keyof T, (value: unknown) => boolean>,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.isObject(obj)) {
      return { valid: false, errors: ['Value is not an object'] };
    }

    for (const key in schema) {
      const validator = schema[key as keyof typeof schema];
      const value = obj[key as keyof typeof obj];

      if (validator && !validator(value)) {
        errors.push(`Invalid value for property '${key}'`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // Trading-Specific Validation
  static isValidOrderData(orderData: Record<string, unknown>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    const symbol = orderData.symbol;
    if (!this.hasProperty(orderData, 'symbol') || typeof symbol !== 'string') {
      errors.push('Invalid or missing symbol');
    } else if (!this.isValidSymbol(symbol)) {
      errors.push('Invalid or missing symbol');
    }

    const side = orderData.side;
    if (!this.hasProperty(orderData, 'side') || typeof side !== 'string') {
      errors.push('Invalid or missing order side');
    } else if (!this.isValidOrderSide(side)) {
      errors.push('Invalid or missing order side');
    }

    const type = orderData.type;
    if (!this.hasProperty(orderData, 'type') || typeof type !== 'string') {
      errors.push('Invalid or missing order type');
    } else if (!this.isValidOrderType(type)) {
      errors.push('Invalid or missing order type');
    }

    const quantity = orderData.quantity;
    if (
      !this.hasProperty(orderData, 'quantity') ||
      !(
        typeof quantity === 'string' ||
        typeof quantity === 'number' ||
        quantity instanceof Decimal
      ) ||
      !this.isValidQuantity(quantity)
    ) {
      errors.push('Invalid or missing quantity');
    }

    const price = orderData.price;
    if (
      type === 'LIMIT' &&
      (!this.hasProperty(orderData, 'price') ||
        !(
          typeof price === 'string' ||
          typeof price === 'number' ||
          price instanceof Decimal
        ) ||
        !this.isValidPrice(price))
    ) {
      errors.push('Limit orders require a valid price');
    }

    return { valid: errors.length === 0, errors };
  }

  static isValidKlineData(kline: Record<string, unknown>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    const requiredFields = [
      'symbol',
      'openTime',
      'closeTime',
      'open',
      'high',
      'low',
      'close',
      'volume',
    ];

    for (const field of requiredFields) {
      if (!this.hasProperty(kline, field)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    const openTime = kline.openTime;
    if (
      this.hasProperty(kline, 'openTime') &&
      !this.isDate(openTime) &&
      (typeof openTime !== 'string' || !this.isValidDateString(openTime))
    ) {
      errors.push('Invalid openTime format');
    }

    const closeTime = kline.closeTime;
    if (
      this.hasProperty(kline, 'closeTime') &&
      !this.isDate(closeTime) &&
      (typeof closeTime !== 'string' || !this.isValidDateString(closeTime))
    ) {
      errors.push('Invalid closeTime format');
    }

    const priceFields = ['open', 'high', 'low', 'close'];
    for (const field of priceFields) {
      const value = kline[field];
      if (
        this.hasProperty(kline, field) &&
        !(
          typeof value === 'string' ||
          typeof value === 'number' ||
          value instanceof Decimal
        )
      ) {
        errors.push(`Invalid ${field} price`);
        continue;
      }
      if (
        this.hasProperty(kline, field) &&
        (typeof value === 'string' ||
          typeof value === 'number' ||
          value instanceof Decimal) &&
        !this.isValidPrice(value)
      ) {
        errors.push(`Invalid ${field} price`);
      }
    }

    const volume = kline.volume;
    if (
      this.hasProperty(kline, 'volume') &&
      !(
        typeof volume === 'string' ||
        typeof volume === 'number' ||
        volume instanceof Decimal
      )
    ) {
      errors.push('Invalid volume');
    } else if (
      this.hasProperty(kline, 'volume') &&
      (typeof volume === 'string' ||
        typeof volume === 'number' ||
        volume instanceof Decimal) &&
      !this.isNonNegativeDecimal(volume)
    ) {
      errors.push('Invalid volume');
    }

    return { valid: errors.length === 0, errors };
  }

  // Utility Methods
  static sanitizeString(str: string): string {
    if (!this.isString(str)) return '';
    return str.trim().replace(/[<>]/g, ''); // Basic XSS protection
  }

  static normalizeSymbol(symbol: string): string {
    if (!this.isString(symbol)) return '';
    return symbol.toUpperCase().replace(/[/-]/g, '');
  }

  static validateAndThrow(condition: boolean, message: string): void {
    if (!condition) {
      throw new Error(message);
    }
  }

  static validateOrDefault<T>(
    value: unknown,
    validator: (value: unknown) => value is T,
    defaultValue: T,
  ): T {
    return validator(value) ? value : defaultValue;
  }
}
