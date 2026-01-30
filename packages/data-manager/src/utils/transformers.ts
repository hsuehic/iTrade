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
