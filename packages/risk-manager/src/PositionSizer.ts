import { Decimal } from 'decimal.js';
import { Position } from '@itrade/core';

export interface PositionSizeParams {
  portfolioValue: Decimal;
  riskPerTrade: Decimal; // Percentage of portfolio to risk
  entryPrice: Decimal;
  stopLoss: Decimal;
  maxPositionSize?: Decimal; // Maximum position size as % of portfolio
  leverage?: Decimal;
}

export interface KellyParams {
  portfolioValue: Decimal;
  winRate: Decimal; // Win rate as percentage (0-100)
  avgWin: Decimal; // Average winning trade amount
  avgLoss: Decimal; // Average losing trade amount
  kellyFraction?: Decimal; // Fraction of Kelly to use (default 0.25)
  maxPositionSize?: Decimal; // Maximum position size as % of portfolio
}

export interface VolatilityParams {
  portfolioValue: Decimal;
  targetVolatility: Decimal; // Target portfolio volatility (annualized %)
  assetVolatility: Decimal; // Asset volatility (annualized %)
  correlation?: Decimal; // Correlation with existing positions
  maxPositionSize?: Decimal; // Maximum position size as % of portfolio
}

export class PositionSizer {
  private defaultMaxPositionSize = new Decimal(10); // 10% of portfolio
  private defaultKellyFraction = new Decimal(0.25); // 25% of Kelly

  // Fixed Risk Position Sizing
  calculateFixedRiskSize(params: PositionSizeParams): Decimal {
    const {
      portfolioValue,
      riskPerTrade,
      entryPrice,
      stopLoss,
      maxPositionSize = this.defaultMaxPositionSize,
      leverage = new Decimal(1),
    } = params;

    // Validate inputs
    if (portfolioValue.lte(0) || entryPrice.lte(0) || stopLoss.lte(0)) {
      return new Decimal(0);
    }

    if (entryPrice.eq(stopLoss)) {
      return new Decimal(0);
    }

    // Calculate risk amount
    const riskAmount = portfolioValue.mul(riskPerTrade.div(100));

    // Calculate risk per unit
    const riskPerUnit = entryPrice.sub(stopLoss).abs();

    // Calculate position size
    const positionSize = riskAmount.div(riskPerUnit).mul(leverage);

    // Apply maximum position size constraint
    const maxPositionValue = portfolioValue.mul(maxPositionSize.div(100));
    const maxAllowedSize = maxPositionValue.div(entryPrice);

    return Decimal.min(positionSize, maxAllowedSize);
  }

  // Kelly Criterion Position Sizing
  calculateKellySize(params: KellyParams): Decimal {
    const {
      portfolioValue,
      winRate,
      avgWin,
      avgLoss,
      kellyFraction = this.defaultKellyFraction,
      maxPositionSize = this.defaultMaxPositionSize,
    } = params;

    // Validate inputs
    if (
      portfolioValue.lte(0) ||
      avgLoss.lte(0) ||
      winRate.lt(0) ||
      winRate.gt(100)
    ) {
      return new Decimal(0);
    }

    const winProbability = winRate.div(100);
    const lossProbability = new Decimal(1).sub(winProbability);
    const payoffRatio = avgWin.div(avgLoss);

    // Kelly formula: f = (bp - q) / b
    // Where: b = payoff ratio, p = win probability, q = loss probability
    const kellyValue = winProbability
      .mul(payoffRatio)
      .sub(lossProbability)
      .div(payoffRatio);

    // Apply Kelly fraction for safety
    const fractionalKelly = kellyValue.mul(kellyFraction);

    // Ensure positive and within limits
    const kellyPercent = Decimal.max(fractionalKelly, new Decimal(0));
    const cappedKelly = Decimal.min(kellyPercent, maxPositionSize.div(100));

    return portfolioValue.mul(cappedKelly);
  }

  // Volatility-Based Position Sizing
  calculateVolatilitySize(params: VolatilityParams): Decimal {
    const {
      portfolioValue,
      targetVolatility,
      assetVolatility,
      correlation = new Decimal(0),
      maxPositionSize = this.defaultMaxPositionSize,
    } = params;

    // Validate inputs
    if (
      portfolioValue.lte(0) ||
      assetVolatility.lte(0) ||
      targetVolatility.lte(0)
    ) {
      return new Decimal(0);
    }

    // Adjust for correlation (simplified approach)
    const adjustedVolatility = assetVolatility.mul(
      new Decimal(1).add(correlation.abs())
    );

    // Calculate position size as percentage of portfolio
    const positionPercent = targetVolatility.div(adjustedVolatility);

    // Apply maximum position size constraint
    const cappedPercent = Decimal.min(positionPercent, maxPositionSize);

    return portfolioValue.mul(cappedPercent.div(100));
  }

  // Equal Risk Contribution Sizing
  calculateEqualRiskSize(
    portfolioValue: Decimal,
    targetRisk: Decimal, // Target risk contribution as % of portfolio
    assetVolatility: Decimal,
    maxPositionSize?: Decimal
  ): Decimal {
    const maxSize = maxPositionSize || this.defaultMaxPositionSize;

    if (portfolioValue.lte(0) || assetVolatility.lte(0)) {
      return new Decimal(0);
    }

    // Position size = Target Risk / Asset Volatility
    const positionPercent = targetRisk.div(assetVolatility);
    const cappedPercent = Decimal.min(positionPercent, maxSize);

    return portfolioValue.mul(cappedPercent.div(100));
  }

  // Optimal f Position Sizing (Ralph Vince)
  calculateOptimalF(
    portfolioValue: Decimal,
    tradeOutcomes: Decimal[], // Historical trade outcomes
    maxPositionSize?: Decimal
  ): Decimal {
    const maxSize = maxPositionSize || this.defaultMaxPositionSize;

    if (tradeOutcomes.length === 0 || portfolioValue.lte(0)) {
      return new Decimal(0);
    }

    // Find the largest loss
    const largestLoss = tradeOutcomes
      .reduce(
        (min, outcome) => (outcome.lt(min) ? outcome : min),
        new Decimal(0)
      )
      .abs();

    if (largestLoss.eq(0)) {
      return new Decimal(0);
    }

    // Calculate optimal f using geometric mean maximization
    let bestF = new Decimal(0);
    let bestGeomean = new Decimal(-1);

    // Test different f values from 0.01 to maxPositionSize
    for (let fPercent = 1; fPercent <= maxSize.toNumber(); fPercent++) {
      const f = new Decimal(fPercent).div(100);
      const geomean = this.calculateGeometricMean(
        tradeOutcomes,
        f,
        largestLoss
      );

      if (geomean.gt(bestGeomean)) {
        bestGeomean = geomean;
        bestF = f;
      }
    }

    return portfolioValue.mul(bestF);
  }

  private calculateGeometricMean(
    outcomes: Decimal[],
    f: Decimal,
    largestLoss: Decimal
  ): Decimal {
    let product = new Decimal(1);

    for (const outcome of outcomes) {
      // HPR = 1 + (outcome * f / largest_loss)
      const hpr = new Decimal(1).add(outcome.mul(f).div(largestLoss));

      if (hpr.lte(0)) {
        return new Decimal(-1); // Invalid - would cause ruin
      }

      product = product.mul(hpr);
    }

    const n = outcomes.length;
    return product.pow(1 / n).sub(1);
  }

  // ATR-Based Position Sizing
  calculateATRSize(
    portfolioValue: Decimal,
    riskPerTrade: Decimal,
    atr: Decimal,
    atrMultiplier: Decimal = new Decimal(2),
    maxPositionSize?: Decimal
  ): Decimal {
    const maxSize = maxPositionSize || this.defaultMaxPositionSize;

    if (portfolioValue.lte(0) || atr.lte(0)) {
      return new Decimal(0);
    }

    const riskAmount = portfolioValue.mul(riskPerTrade.div(100));
    const stopDistance = atr.mul(atrMultiplier);
    const positionSize = riskAmount.div(stopDistance);

    const maxPositionValue = portfolioValue.mul(maxSize.div(100));
    return Decimal.min(positionSize, maxPositionValue);
  }

  // Monte Carlo Position Sizing
  calculateMonteCarloSize(
    portfolioValue: Decimal,
    // expectedReturn: Decimal,
    volatility: Decimal,
    timeHorizon: number, // in days
    confidenceLevel: Decimal = new Decimal(95), // 95%
    maxPositionSize?: Decimal
  ): Decimal {
    const maxSize = maxPositionSize || this.defaultMaxPositionSize;

    if (portfolioValue.lte(0) || volatility.lte(0)) {
      return new Decimal(0);
    }

    // Simplified approach using normal distribution
    // const dailyReturn = expectedReturn.div(365);
    const dailyVol = volatility.div(Math.sqrt(365));

    // Calculate VaR using z-score
    const zScore = this.getZScore(confidenceLevel.div(100));
    const var95 = dailyVol.mul(zScore).mul(Math.sqrt(timeHorizon));

    // Position size based on VaR target
    const targetVaR = portfolioValue.mul(0.05); // 5% VaR target
    const positionSize = targetVaR.div(var95);

    const maxPositionValue = portfolioValue.mul(maxSize.div(100));
    return Decimal.min(positionSize, maxPositionValue);
  }

  private getZScore(confidence: Decimal): number {
    // Approximate z-scores for common confidence levels
    const conf = confidence.toNumber();

    if (conf >= 0.995) return 2.576;
    if (conf >= 0.99) return 2.326;
    if (conf >= 0.975) return 1.96;
    if (conf >= 0.95) return 1.645;
    if (conf >= 0.9) return 1.282;

    // Linear interpolation for other values
    return 1.645; // Default to 95% confidence
  }

  // Correlation-Adjusted Position Sizing
  calculateCorrelationAdjustedSize(
    basePositionSize: Decimal,
    existingPositions: Position[],
    newAssetCorrelations: Map<string, Decimal>,
    maxTotalCorrelatedExposure: Decimal = new Decimal(50) // 50% max
  ): Decimal {
    if (existingPositions.length === 0) {
      return basePositionSize;
    }

    // Calculate total correlated exposure
    let correlatedExposure = new Decimal(0);

    for (const position of existingPositions) {
      const correlation =
        newAssetCorrelations.get(position.symbol) || new Decimal(0);
      const positionValue = position.quantity.mul(position.avgPrice);
      correlatedExposure = correlatedExposure.add(
        positionValue.mul(correlation.abs())
      );
    }

    // Adjust position size based on correlation exposure
    const maxCorrelatedValue = correlatedExposure.mul(
      maxTotalCorrelatedExposure.div(100)
    );

    if (correlatedExposure.gte(maxCorrelatedValue)) {
      // Reduce position size proportionally
      const reductionFactor = maxCorrelatedValue.div(
        correlatedExposure.add(basePositionSize)
      );
      return basePositionSize.mul(reductionFactor);
    }

    return basePositionSize;
  }

  // Utility Methods
  calculateRiskReward(
    entryPrice: Decimal,
    stopLoss: Decimal,
    takeProfit: Decimal
  ): Decimal {
    if (entryPrice.eq(stopLoss) || entryPrice.eq(takeProfit)) {
      return new Decimal(0);
    }

    const risk = entryPrice.sub(stopLoss).abs();
    const reward = takeProfit.sub(entryPrice).abs();

    return reward.div(risk);
  }

  validatePositionSize(
    positionSize: Decimal,
    portfolioValue: Decimal,
    maxPositionPercent: Decimal = this.defaultMaxPositionSize
  ): boolean {
    if (portfolioValue.lte(0) || positionSize.lte(0)) {
      return false;
    }

    const positionPercent = positionSize.div(portfolioValue).mul(100);
    return positionPercent.lte(maxPositionPercent);
  }
}
