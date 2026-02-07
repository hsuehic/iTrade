import { ValueTransformer } from 'typeorm';
import { Decimal } from 'decimal.js';

/**
 * Transforms Decimal values to and from database format.
 * Ensures that Decimal objects are correctly stringified for the database driver,
 * and parsed back into Decimal objects when retrieving.
 */
export class DecimalTransformer implements ValueTransformer {
  /**
   * Transforms data from the object to the database.
   * TypeORM uses this when saving entities.
   */
  to(data: Decimal | number | string | null | undefined): string | null {
    if (data === null || data === undefined) {
      return null;
    }

    // Handle Decimal object
    if (Decimal.isDecimal(data)) {
      return data.toString();
    }

    // Handle number
    if (typeof data === 'number') {
      return data.toString();
    }

    // Handle string: strip extra quotes if present
    if (typeof data === 'string') {
      let cleaned = data.trim();
      // Remove surrounding quotes if they exist (e.g. '"123.45"' -> '123.45')
      while (
        (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith("'") && cleaned.endsWith("'"))
      ) {
        cleaned = cleaned.slice(1, -1).trim();
      }
      return cleaned;
    }

    // Fallback
    return String(data);
  }

  /**
   * Transforms data from the database to the object.
   * TypeORM uses this when loading entities.
   */
  from(data: string | number | null | undefined): Decimal {
    if (data === null || data === undefined) {
      return new Decimal(0);
    }

    try {
      if (typeof data === 'string') {
        const cleaned = data.replace(/["']/g, '').trim();
        return new Decimal(cleaned || 0);
      }
      return new Decimal(data);
    } catch {
      return new Decimal(0);
    }
  }
}
