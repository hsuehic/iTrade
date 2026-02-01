import { Decimal } from 'decimal.js';

/**
 * Utility functions for handling decimal precision in trading operations
 */
export class PrecisionUtils {
  /**
   * Round a Decimal value to a specific number of decimal places
   * @param value - The value to round
   * @param precision - Number of decimal places
   * @returns Rounded Decimal value
   */
  public static roundToPrecision(value: Decimal, precision: number): Decimal {
    return value.toDecimalPlaces(precision, Decimal.ROUND_DOWN);
  }

  /**
   * Round a Decimal value to match a specific step size
   * @param value - The value to round
   * @param stepSize - The step size (e.g., 0.01, 0.001)
   * @returns Rounded Decimal value that is a multiple of stepSize
   */
  public static roundToStepSize(value: Decimal, stepSize: Decimal): Decimal {
    if (stepSize.isZero()) {
      return value;
    }
    return value.dividedBy(stepSize).floor().times(stepSize);
  }

  /**
   * Round a price to match exchange tick size requirements
   * @param price - The price to round
   * @param tickSize - Exchange tick size (price increment)
   * @param precision - Number of decimal places (optional, calculated from tickSize if not provided)
   * @returns Rounded price
   */
  public static roundPrice(
    price: Decimal,
    tickSize: Decimal,
    precision?: number,
  ): Decimal {
    if (!tickSize.isZero()) {
      // Prefer tick size to guarantee valid multiples
      return this.roundToStepSize(price, tickSize);
    }
    if (precision !== undefined) {
      return this.roundToPrecision(price, precision);
    }
    return price;
  }

  /**
   * Round a quantity to match exchange lot size requirements
   * @param quantity - The quantity to round
   * @param stepSize - Exchange lot size (quantity increment)
   * @param precision - Number of decimal places (optional, calculated from stepSize if not provided)
   * @returns Rounded quantity
   */
  public static roundQuantity(
    quantity: Decimal,
    stepSize: Decimal,
    precision?: number,
  ): Decimal {
    if (!stepSize.isZero()) {
      // Prefer step size to guarantee valid multiples
      return this.roundToStepSize(quantity, stepSize);
    }
    if (precision !== undefined) {
      return this.roundToPrecision(quantity, precision);
    }
    return quantity;
  }

  /**
   * Validate that a quantity meets exchange requirements
   * @param quantity - The quantity to validate
   * @param minQuantity - Minimum allowed quantity
   * @param maxQuantity - Maximum allowed quantity (optional)
   * @param stepSize - Exchange lot size
   * @throws Error if validation fails
   */
  public static validateQuantity(
    quantity: Decimal,
    minQuantity: Decimal,
    maxQuantity: Decimal | undefined,
    stepSize: Decimal,
  ): void {
    if (quantity.lessThan(minQuantity)) {
      throw new Error(
        `Quantity ${quantity.toString()} is below minimum ${minQuantity.toString()}`,
      );
    }

    if (maxQuantity && quantity.greaterThan(maxQuantity)) {
      throw new Error(
        `Quantity ${quantity.toString()} exceeds maximum ${maxQuantity.toString()}`,
      );
    }

    // Check if quantity is a valid multiple of stepSize
    if (!stepSize.isZero()) {
      const remainder = quantity.modulo(stepSize);
      if (!remainder.isZero()) {
        throw new Error(
          `Quantity ${quantity.toString()} is not a valid multiple of step size ${stepSize.toString()}`,
        );
      }
    }
  }

  /**
   * Validate that a price meets exchange requirements
   * @param price - The price to validate
   * @param tickSize - Exchange tick size
   * @throws Error if validation fails
   */
  public static validatePrice(price: Decimal, tickSize: Decimal): void {
    if (price.lessThanOrEqualTo(0)) {
      throw new Error(`Price ${price.toString()} must be greater than 0`);
    }

    // Check if price is a valid multiple of tickSize
    if (!tickSize.isZero()) {
      const remainder = price.modulo(tickSize);
      if (!remainder.isZero()) {
        throw new Error(
          `Price ${price.toString()} is not a valid multiple of tick size ${tickSize.toString()}`,
        );
      }
    }
  }

  /**
   * Validate that order value (quantity * price) meets minimum notional requirement
   * @param quantity - Order quantity
   * @param price - Order price
   * @param minNotional - Minimum notional value required by exchange
   * @throws Error if validation fails
   */
  public static validateNotional(
    quantity: Decimal,
    price: Decimal,
    minNotional: Decimal,
  ): void {
    const notional = quantity.times(price);
    if (notional.lessThan(minNotional)) {
      throw new Error(
        `Order value ${notional.toString()} is below minimum notional ${minNotional.toString()}`,
      );
    }
  }

  /**
   * Calculate precision (decimal places) from a step size
   * @param stepSize - The step size (e.g., 0.01, 0.001)
   * @returns Number of decimal places
   */
  public static getPrecisionFromStepSize(stepSize: Decimal): number {
    const stepStr = stepSize.toString();
    const parts = stepStr.split('.');
    if (parts.length === 1) {
      return 0;
    }
    return parts[1].length;
  }

  /**
   * Format a Decimal value to a specific precision for display/logging
   * @param value - The value to format
   * @param precision - Number of decimal places
   * @returns Formatted string
   */
  public static formatToPrecision(value: Decimal, precision: number): string {
    return value.toFixed(precision);
  }
}
