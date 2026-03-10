import { describe, it, expect } from 'vitest';
import { PrecisionUtils } from '../utils/PrecisionUtils';
import { Decimal } from 'decimal.js';

describe('PrecisionUtils', () => {
  describe('roundPrice', () => {
    it('should round to nearest tick (HALF_UP)', () => {
      const tickSize = new Decimal('0.0001');

      // Case from user: 0.3768864 -> 0.3769
      expect(
        PrecisionUtils.roundPrice(new Decimal('0.3768864'), tickSize).toString(),
      ).toBe('0.3769');

      // Case from user: 0.35548226 -> 0.3555
      expect(
        PrecisionUtils.roundPrice(new Decimal('0.35548226'), tickSize).toString(),
      ).toBe('0.3555');

      // Upward rounding: 0.37685 -> 0.3769 (HALF_UP)
      expect(PrecisionUtils.roundPrice(new Decimal('0.37685'), tickSize).toString()).toBe(
        '0.3769',
      );

      // Downward rounding: 0.37684 -> 0.3768 (HALF_UP)
      expect(PrecisionUtils.roundPrice(new Decimal('0.37684'), tickSize).toString()).toBe(
        '0.3768',
      );
    });

    it('should handle large tick sizes correctly (e.g. 0.1)', () => {
      const tickSize = new Decimal('0.1');
      expect(PrecisionUtils.roundPrice(new Decimal('0.376'), tickSize).toString()).toBe(
        '0.4',
      );
      expect(PrecisionUtils.roundPrice(new Decimal('0.344'), tickSize).toString()).toBe(
        '0.3',
      );
    });

    it('should fall back to precision if tickSize is zero', () => {
      expect(
        PrecisionUtils.roundPrice(new Decimal('1.2345'), new Decimal(0), 2).toString(),
      ).toBe('1.23');
      expect(
        PrecisionUtils.roundPrice(new Decimal('1.2355'), new Decimal(0), 2).toString(),
      ).toBe('1.24');
    });
  });

  describe('roundQuantity', () => {
    it('should always round DOWN to nearest stepSize', () => {
      const stepSize = new Decimal('0.1');
      expect(PrecisionUtils.roundQuantity(new Decimal('1.29'), stepSize).toString()).toBe(
        '1.2',
      );
      expect(PrecisionUtils.roundQuantity(new Decimal('1.21'), stepSize).toString()).toBe(
        '1.2',
      );
      expect(PrecisionUtils.roundQuantity(new Decimal('1.30'), stepSize).toString()).toBe(
        '1.3',
      );
    });
  });

  describe('validateQuantity', () => {
    it('should throw error for invalid multiple', () => {
      const stepSize = new Decimal('0.1');
      expect(() =>
        PrecisionUtils.validateQuantity(
          new Decimal('1.25'),
          new Decimal('0.1'),
          undefined,
          stepSize,
        ),
      ).toThrow();
      expect(() =>
        PrecisionUtils.validateQuantity(
          new Decimal('1.20'),
          new Decimal('0.1'),
          undefined,
          stepSize,
        ),
      ).not.toThrow();
    });
  });
});
