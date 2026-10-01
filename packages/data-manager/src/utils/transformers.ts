import { ValueTransformer } from 'typeorm';
import { Decimal } from 'decimal.js';

// Custom transformer for Decimal type
export class DecimalTransformer implements ValueTransformer {
  to(value: Decimal | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    return value.toString();
  }

  from(value: string | null | undefined): Decimal | null {
    if (value === null || value === undefined) {
      return null;
    }
    return new Decimal(value || '0');
  }
}

// Create a SINGLE shared instance
export const decimalTransformer = new DecimalTransformer();

/**
 * Transformer for plain-number columns stored as Postgres `numeric`
 * (e.g. `orders.leverage`). Postgres returns `numeric` as a string, so
 * `from` converts it back to a JS number for callers.
 */
export class NumberTransformer implements ValueTransformer {
  to(value: number | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    // Bind numeric columns as a string, like DecimalTransformer: Postgres then
    // keeps the value exact instead of round-tripping through a float.
    return String(value);
  }

  from(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    return Number(value);
  }
}

export const numberTransformer = new NumberTransformer();
