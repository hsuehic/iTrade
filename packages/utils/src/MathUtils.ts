import { Decimal } from 'decimal.js';

export class MathUtils {
  // Basic Math Operations with Decimal precision
  static add(a: Decimal | number, b: Decimal | number): Decimal {
    return new Decimal(a).add(new Decimal(b));
  }

  static subtract(a: Decimal | number, b: Decimal | number): Decimal {
    return new Decimal(a).sub(new Decimal(b));
  }

  static multiply(a: Decimal | number, b: Decimal | number): Decimal {
    return new Decimal(a).mul(new Decimal(b));
  }

  static divide(a: Decimal | number, b: Decimal | number): Decimal {
    const divisor = new Decimal(b);
    if (divisor.eq(0)) {
      throw new Error('Division by zero');
    }
    return new Decimal(a).div(divisor);
  }

  // Statistical Functions
  static mean(values: Decimal[]): Decimal {
    if (values.length === 0) return new Decimal(0);

    const sum = values.reduce((acc, val) => acc.add(val), new Decimal(0));
    return sum.div(values.length);
  }

  static median(values: Decimal[]): Decimal {
    if (values.length === 0) return new Decimal(0);

    const sorted = [...values].sort((a, b) => a.comparedTo(b));
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return sorted[mid - 1].add(sorted[mid]).div(2);
    } else {
      return sorted[mid];
    }
  }

  static mode(values: Decimal[]): Decimal {
    if (values.length === 0) return new Decimal(0);

    const frequency = new Map<string, number>();
    for (const value of values) {
      const key = value.toString();
      frequency.set(key, (frequency.get(key) || 0) + 1);
    }

    let maxFreq = 0;
    let mode = values[0];

    for (const [valueStr, freq] of frequency.entries()) {
      if (freq > maxFreq) {
        maxFreq = freq;
        mode = new Decimal(valueStr);
      }
    }

    return mode;
  }

  static standardDeviation(values: Decimal[]): Decimal {
    if (values.length < 2) return new Decimal(0);

    const mean = this.mean(values);
    const squaredDiffs = values.map((val) => val.sub(mean).pow(2));
    const variance = this.mean(squaredDiffs);

    return variance.sqrt();
  }

  static variance(values: Decimal[]): Decimal {
    if (values.length < 2) return new Decimal(0);

    const mean = this.mean(values);
    const squaredDiffs = values.map((val) => val.sub(mean).pow(2));

    return squaredDiffs
      .reduce((acc, val) => acc.add(val), new Decimal(0))
      .div(values.length - 1);
  }

  static skewness(values: Decimal[]): Decimal {
    if (values.length < 3) return new Decimal(0);

    const mean = this.mean(values);
    const stdDev = this.standardDeviation(values);

    if (stdDev.eq(0)) return new Decimal(0);

    const cubedDeviations = values.map((val) => val.sub(mean).div(stdDev).pow(3));

    return this.mean(cubedDeviations);
  }

  static kurtosis(values: Decimal[]): Decimal {
    if (values.length < 4) return new Decimal(0);

    const mean = this.mean(values);
    const stdDev = this.standardDeviation(values);

    if (stdDev.eq(0)) return new Decimal(0);

    const fourthPowerDeviations = values.map((val) => val.sub(mean).div(stdDev).pow(4));

    return this.mean(fourthPowerDeviations).sub(3); // Excess kurtosis
  }

  // Correlation and Covariance
  static correlation(xValues: Decimal[], yValues: Decimal[]): Decimal {
    if (xValues.length !== yValues.length || xValues.length < 2) {
      return new Decimal(0);
    }

    const covar = this.covariance(xValues, yValues);
    const xStdDev = this.standardDeviation(xValues);
    const yStdDev = this.standardDeviation(yValues);

    if (xStdDev.eq(0) || yStdDev.eq(0)) {
      return new Decimal(0);
    }

    return covar.div(xStdDev.mul(yStdDev));
  }

  static covariance(xValues: Decimal[], yValues: Decimal[]): Decimal {
    if (xValues.length !== yValues.length || xValues.length < 2) {
      return new Decimal(0);
    }

    const xMean = this.mean(xValues);
    const yMean = this.mean(yValues);

    const products = xValues.map((x, i) => x.sub(xMean).mul(yValues[i].sub(yMean)));

    return products
      .reduce((acc, val) => acc.add(val), new Decimal(0))
      .div(xValues.length - 1);
  }

  // Percentage Calculations
  static percentageChange(oldValue: Decimal, newValue: Decimal): Decimal {
    if (oldValue.eq(0)) {
      return new Decimal(0);
    }

    return newValue.sub(oldValue).div(oldValue).mul(100);
  }

  static percentageOf(part: Decimal, whole: Decimal): Decimal {
    if (whole.eq(0)) {
      return new Decimal(0);
    }

    return part.div(whole).mul(100);
  }

  static applyPercentage(value: Decimal, percentage: Decimal): Decimal {
    return value.mul(percentage.div(100).add(1));
  }

  // Rounding and Precision
  static roundToDecimals(value: Decimal, decimals: number): Decimal {
    return value.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
  }

  static roundToSignificantFigures(value: Decimal, figures: number): Decimal {
    return value.toSignificantDigits(figures);
  }

  static floor(value: Decimal, decimals: number = 0): Decimal {
    if (decimals === 0) {
      return value.floor();
    }

    const multiplier = new Decimal(10).pow(decimals);
    return value.mul(multiplier).floor().div(multiplier);
  }

  static ceil(value: Decimal, decimals: number = 0): Decimal {
    if (decimals === 0) {
      return value.ceil();
    }

    const multiplier = new Decimal(10).pow(decimals);
    return value.mul(multiplier).ceil().div(multiplier);
  }

  // Min/Max Operations
  static min(...values: Decimal[]): Decimal {
    if (values.length === 0) return new Decimal(0);

    return values.reduce((min, val) => (val.lt(min) ? val : min));
  }

  static max(...values: Decimal[]): Decimal {
    if (values.length === 0) return new Decimal(0);

    return values.reduce((max, val) => (val.gt(max) ? val : max));
  }

  static clamp(value: Decimal, min: Decimal, max: Decimal): Decimal {
    if (value.lt(min)) return min;
    if (value.gt(max)) return max;
    return value;
  }

  // Range Operations
  static range(values: Decimal[]): Decimal {
    if (values.length === 0) return new Decimal(0);

    return this.max(...values).sub(this.min(...values));
  }

  static normalize(values: Decimal[]): Decimal[] {
    if (values.length === 0) return [];

    const min = this.min(...values);
    const max = this.max(...values);
    const range = max.sub(min);

    if (range.eq(0)) {
      return values.map(() => new Decimal(0.5));
    }

    return values.map((val) => val.sub(min).div(range));
  }

  static standardize(values: Decimal[]): Decimal[] {
    if (values.length === 0) return [];

    const mean = this.mean(values);
    const stdDev = this.standardDeviation(values);

    if (stdDev.eq(0)) {
      return values.map(() => new Decimal(0));
    }

    return values.map((val) => val.sub(mean).div(stdDev));
  }

  // Financial Mathematics
  static compoundReturn(returns: Decimal[]): Decimal {
    if (returns.length === 0) return new Decimal(0);

    let compound = new Decimal(1);
    for (const ret of returns) {
      compound = compound.mul(ret.div(100).add(1));
    }

    return compound.sub(1).mul(100);
  }

  static annualizeReturn(
    totalReturn: Decimal,
    periods: number,
    periodsPerYear: number = 365,
  ): Decimal {
    if (periods === 0 || totalReturn.eq(-100)) return new Decimal(0);

    const years = periods / periodsPerYear;
    const factor = totalReturn.div(100).add(1);

    return factor
      .pow(1 / years)
      .sub(1)
      .mul(100);
  }

  static sharpeRatio(
    returns: Decimal[],
    riskFreeRate: Decimal = new Decimal(0),
  ): Decimal {
    if (returns.length < 2) return new Decimal(0);

    const excessReturns = returns.map((ret) => ret.sub(riskFreeRate));
    const meanExcessReturn = this.mean(excessReturns);
    const stdDev = this.standardDeviation(excessReturns);

    if (stdDev.eq(0)) return new Decimal(0);

    return meanExcessReturn.div(stdDev);
  }

  static beta(assetReturns: Decimal[], marketReturns: Decimal[]): Decimal {
    if (assetReturns.length !== marketReturns.length || assetReturns.length < 2) {
      return new Decimal(1); // Market beta
    }

    const covar = this.covariance(assetReturns, marketReturns);
    const marketVariance = this.variance(marketReturns);

    if (marketVariance.eq(0)) return new Decimal(1);

    return covar.div(marketVariance);
  }

  // Utility Functions
  static isDecimal(value: any): boolean {
    return value instanceof Decimal;
  }

  static toDecimal(value: any): Decimal {
    try {
      return new Decimal(value);
    } catch {
      return new Decimal(0);
    }
  }

  static sum(values: Decimal[]): Decimal {
    return values.reduce((acc, val) => acc.add(val), new Decimal(0));
  }

  static product(values: Decimal[]): Decimal {
    if (values.length === 0) return new Decimal(1);

    return values.reduce((acc, val) => acc.mul(val), new Decimal(1));
  }

  static absolute(value: Decimal): Decimal {
    return value.abs();
  }

  static sign(value: Decimal): number {
    if (value.gt(0)) return 1;
    if (value.lt(0)) return -1;
    return 0;
  }

  static power(base: Decimal, exponent: number): Decimal {
    return base.pow(exponent);
  }

  static sqrt(value: Decimal): Decimal {
    return value.sqrt();
  }

  static logarithm(value: Decimal, base?: number): Decimal {
    if (base) {
      return value.ln().div(new Decimal(base).ln());
    }
    return value.ln();
  }

  static exponential(exponent: Decimal): Decimal {
    return exponent.exp();
  }
}
