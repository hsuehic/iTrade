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
  static isString(value: any): value is string {
    return typeof value === 'string';
  }

  static isNumber(value: any): value is number {
    return typeof value === 'number' && !isNaN(value) && isFinite(value);
  }

  static isInteger(value: any): boolean {
    return this.isNumber(value) && Number.isInteger(value);
  }

  static isBoolean(value: any): value is boolean {
    return typeof value === 'boolean';
  }

  static isObject(value: any): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  static isArray(value: any): value is any[] {
    return Array.isArray(value);
  }

  static isDate(value: any): value is Date {
    return value instanceof Date && !isNaN(value.getTime());
  }

  static isFunction(value: any): value is Function {
    return typeof value === 'function';
  }

  static isUndefined(value: any): value is undefined {
    return typeof value === 'undefined';
  }

  static isNull(value: any): value is null {
    return value === null;
  }

  static isNullOrUndefined(value: any): value is null | undefined {
    return this.isNull(value) || this.isUndefined(value);
  }

  // Decimal Validation
  static isDecimal(value: any): value is Decimal {
    return value instanceof Decimal;
  }

  static isValidDecimal(value: any): boolean {
    try {
      new Decimal(value);
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
  static hasProperty(obj: any, property: string): boolean {
    return this.isObject(obj) && Object.prototype.hasOwnProperty.call(obj, property);
  }

  static hasAllProperties(obj: any, properties: string[]): boolean {
    return this.isObject(obj) && properties.every((prop) => this.hasProperty(obj, prop));
  }

  static hasRequiredProperties<T extends object>(
    obj: any,
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
    obj: any,
    schema: Record<keyof T, (value: any) => boolean>,
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
  static isValidOrderData(orderData: any): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!this.hasProperty(orderData, 'symbol') || !this.isValidSymbol(orderData.symbol)) {
      errors.push('Invalid or missing symbol');
    }

    if (!this.hasProperty(orderData, 'side') || !this.isValidOrderSide(orderData.side)) {
      errors.push('Invalid or missing order side');
    }

    if (!this.hasProperty(orderData, 'type') || !this.isValidOrderType(orderData.type)) {
      errors.push('Invalid or missing order type');
    }

    if (
      !this.hasProperty(orderData, 'quantity') ||
      !this.isValidQuantity(orderData.quantity)
    ) {
      errors.push('Invalid or missing quantity');
    }

    if (
      orderData.type === 'LIMIT' &&
      (!this.hasProperty(orderData, 'price') || !this.isValidPrice(orderData.price))
    ) {
      errors.push('Limit orders require a valid price');
    }

    return { valid: errors.length === 0, errors };
  }

  static isValidKlineData(kline: any): { valid: boolean; errors: string[] } {
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

    if (
      this.hasProperty(kline, 'openTime') &&
      !this.isDate(kline.openTime) &&
      !this.isValidDateString(kline.openTime)
    ) {
      errors.push('Invalid openTime format');
    }

    if (
      this.hasProperty(kline, 'closeTime') &&
      !this.isDate(kline.closeTime) &&
      !this.isValidDateString(kline.closeTime)
    ) {
      errors.push('Invalid closeTime format');
    }

    const priceFields = ['open', 'high', 'low', 'close'];
    for (const field of priceFields) {
      if (this.hasProperty(kline, field) && !this.isValidPrice(kline[field])) {
        errors.push(`Invalid ${field} price`);
      }
    }

    if (this.hasProperty(kline, 'volume') && !this.isNonNegativeDecimal(kline.volume)) {
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
    value: any,
    validator: (value: any) => value is T,
    defaultValue: T,
  ): T {
    return validator(value) ? value : defaultValue;
  }
}
