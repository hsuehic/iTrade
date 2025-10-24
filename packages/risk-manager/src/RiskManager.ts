import { EventEmitter } from 'events';

import { Decimal } from 'decimal.js';
import {
  Balance,
  IRiskManager,
  Order,
  Position,
  RiskAlert,
  RiskLimits,
  RiskMetrics,
} from '@itrade/core';

export interface RiskManagerConfig {
  maxDrawdown: Decimal; // Maximum portfolio drawdown (%)
  maxPositionSize: Decimal; // Maximum position size (% of portfolio)
  maxDailyLoss: Decimal; // Maximum daily loss (% of portfolio)
  maxLeverage: Decimal; // Maximum leverage ratio
  maxCorrelatedExposure: Decimal; // Maximum exposure to correlated assets (%)
  stopLossBuffer: Decimal; // Buffer above stop loss levels (%)
  riskFreeRate: Decimal; // Annual risk-free rate for calculations (%)
}

export class RiskManager extends EventEmitter implements IRiskManager {
  private config: RiskManagerConfig;
  private dailyPnl: Decimal = new Decimal(0);
  private dailyResetTime: Date;
  private currentDrawdown: Decimal = new Decimal(0);
  private peakValue: Decimal = new Decimal(0);
  private emergencyMode = false;

  constructor(config: Partial<RiskManagerConfig> = {}) {
    super();

    this.config = {
      maxDrawdown: config.maxDrawdown || new Decimal(20), // 20%
      maxPositionSize: config.maxPositionSize || new Decimal(10), // 10%
      maxDailyLoss: config.maxDailyLoss || new Decimal(5), // 5%
      maxLeverage: config.maxLeverage || new Decimal(1), // 1:1 (no leverage)
      maxCorrelatedExposure: config.maxCorrelatedExposure || new Decimal(30), // 30%
      stopLossBuffer: config.stopLossBuffer || new Decimal(1), // 1%
      riskFreeRate: config.riskFreeRate || new Decimal(2), // 2%
      ...config,
    };

    this.dailyResetTime = this.getNextDailyReset();
    this.setupDailyReset();
  }
  get limits(): RiskLimits {
    return this.getLimits();
  }
  checkOrderRisk(
    order: Order,
    currentPositions: Position[],
    balances: Balance[],
  ): Promise<boolean> {
    console.log(order, currentPositions, balances);
    return Promise.resolve(true);
  }
  checkPositionRisk(position: Position, limits: RiskLimits): Promise<boolean> {
    console.log(position, limits);
    return Promise.resolve(true);
  }
  calculateRiskMetrics(positions: Position[], balances: Balance[]): Promise<RiskMetrics> {
    console.log(positions, balances);
    return Promise.resolve({
      currentDrawdown: new Decimal(0),
      dailyPnl: new Decimal(0),
      openPositions: 0,
      totalExposure: new Decimal(0),
      leverage: new Decimal(3),
    });
  }
  updateLimits(limits: Partial<RiskLimits>): void {
    console.log(limits);
    throw new Error('Method not implemented.');
  }
  getLimits(): RiskLimits {
    throw new Error('Method not implemented.');
  }
  liquidateAllPositions(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  stopAllTrading(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  // Risk Limit Validation
  async validateOrder(
    order: any,
    portfolioValue: Decimal,
    positions: Position[],
  ): Promise<boolean> {
    // const checks = [
    //   this.checkPositionSize(order, portfolioValue),
    //   this.checkDailyLoss(),
    //   this.checkDrawdown(),
    //   this.checkLeverage(order, portfolioValue, positions),
    //   this.checkEmergencyMode(),
    // ];

    // const results = await Promise.all(checks);
    // const passed = results.every((result) => result);

    // if (!passed) {
    //   this.emit('orderRejected', {
    //     orderId: order.id,
    //     reason: 'Risk limits exceeded',
    //     checks: results,
    //   });
    // }

    // return passed;
    console.log('validateOrder', order, portfolioValue, positions);
    return Promise.resolve(true);
  }

  private async checkPositionSize(order: any, portfolioValue: Decimal): Promise<boolean> {
    if (portfolioValue.eq(0)) return false;

    const orderValue = order.quantity.mul(order.price || new Decimal(0));
    const positionSizePercent = orderValue.div(portfolioValue).mul(100);

    const passed = positionSizePercent.lte(this.config.maxPositionSize);

    if (!passed) {
      this.emitRiskAlert({
        type: 'POSITION_SIZE_EXCEEDED',
        severity: 'high',
        message: `Position size ${positionSizePercent.toFixed(2)}% exceeds limit ${this.config.maxPositionSize.toFixed(2)}%`,
        data: { orderValue, portfolioValue, positionSizePercent },
      });
    }

    return passed;
  }

  private async checkDailyLoss(): Promise<boolean> {
    // This would need to be calculated based on portfolio value at start of day
    const dailyLossPercent = new Decimal(0); // Placeholder
    const passed = dailyLossPercent.lte(this.config.maxDailyLoss);

    if (!passed) {
      this.emitRiskAlert({
        type: 'DAILY_LOSS_LIMIT',
        severity: 'high',
        message: `Daily loss ${dailyLossPercent.toFixed(2)}% exceeds limit ${this.config.maxDailyLoss.toFixed(2)}%`,
        data: { dailyLossPercent, limit: this.config.maxDailyLoss },
      });
    }

    return passed;
  }

  private async checkDrawdown(): Promise<boolean> {
    const passed = this.currentDrawdown.lte(this.config.maxDrawdown);

    if (!passed) {
      this.emitRiskAlert({
        type: 'MAX_DRAWDOWN_EXCEEDED',
        severity: 'critical',
        message: `Drawdown ${this.currentDrawdown.toFixed(2)}% exceeds limit ${this.config.maxDrawdown.toFixed(2)}%`,
        data: {
          currentDrawdown: this.currentDrawdown,
          maxDrawdown: this.config.maxDrawdown,
        },
      });

      this.enterEmergencyMode();
    }

    return passed;
  }

  private async checkLeverage(
    order: any,
    portfolioValue: Decimal,
    positions: Position[],
  ): Promise<boolean> {
    // Calculate current leverage
    const totalExposure = this.calculateTotalExposure(positions);
    const currentLeverage = portfolioValue.gt(0)
      ? totalExposure.div(portfolioValue)
      : new Decimal(0);

    // Calculate leverage after this order
    const orderExposure = order.quantity.mul(order.price || new Decimal(0));
    const newTotalExposure =
      order.side === 'BUY' ? totalExposure.add(orderExposure) : totalExposure;
    const newLeverage = portfolioValue.gt(0)
      ? newTotalExposure.div(portfolioValue)
      : new Decimal(0);

    const passed = newLeverage.lte(this.config.maxLeverage);

    if (!passed) {
      this.emitRiskAlert({
        type: 'LEVERAGE_EXCEEDED',
        severity: 'high',
        message: `Leverage ${newLeverage.toFixed(2)}x exceeds limit ${this.config.maxLeverage.toFixed(2)}x`,
        data: {
          currentLeverage,
          newLeverage,
          maxLeverage: this.config.maxLeverage,
        },
      });
    }

    return passed;
  }

  private async checkEmergencyMode(): Promise<boolean> {
    if (this.emergencyMode) {
      this.emitRiskAlert({
        type: 'EMERGENCY_MODE_ACTIVE',
        severity: 'critical',
        message: 'Trading halted - Emergency mode active',
        data: { emergencyMode: true },
      });
      return false;
    }
    return true;
  }

  // Position Sizing
  calculatePositionSize(
    portfolioValue: Decimal,
    riskPerTrade: Decimal,
    entryPrice: Decimal,
    stopLoss: Decimal,
  ): Decimal {
    if (stopLoss.eq(0) || entryPrice.eq(stopLoss)) {
      return new Decimal(0);
    }

    const riskAmount = portfolioValue.mul(riskPerTrade.div(100));
    const riskPerUnit = entryPrice.sub(stopLoss).abs();
    const positionSize = riskAmount.div(riskPerUnit);

    // Apply position size limit
    const maxPositionValue = portfolioValue.mul(this.config.maxPositionSize.div(100));
    const maxPositionSize = maxPositionValue.div(entryPrice);

    return Decimal.min(positionSize, maxPositionSize);
  }

  calculateKellyPositionSize(
    portfolioValue: Decimal,
    winRate: Decimal,
    avgWin: Decimal,
    avgLoss: Decimal,
  ): Decimal {
    console.log(portfolioValue);
    if (avgLoss.eq(0)) return new Decimal(0);

    const winProbability = winRate.div(100);
    const lossProbability = new Decimal(1).sub(winProbability);
    const winLossRatio = avgWin.div(avgLoss);

    // Kelly formula: f = (bp - q) / b
    // Where: b = odds received (win/loss ratio), p = probability of win, q = probability of loss
    const kellyFraction = winProbability
      .mul(winLossRatio)
      .sub(lossProbability)
      .div(winLossRatio);

    // Apply a fraction of Kelly (typically 25-50%) for safety
    const fractionalKelly = kellyFraction.mul(0.25);

    // Ensure it doesn't exceed position size limits
    const maxFraction = this.config.maxPositionSize.div(100);
    return Decimal.min(Decimal.max(fractionalKelly, new Decimal(0)), maxFraction);
  }

  // Risk Monitoring
  updatePortfolioMetrics(
    currentValue: Decimal,
    positions: Position[],
    dailyPnl?: Decimal,
  ): RiskAlert {
    // Update peak value and drawdown
    if (currentValue.gt(this.peakValue)) {
      this.peakValue = currentValue;
      this.currentDrawdown = new Decimal(0);
    } else if (this.peakValue.gt(0)) {
      this.currentDrawdown = this.peakValue
        .sub(currentValue)
        .div(this.peakValue)
        .mul(100);
    }

    // Update daily P&L
    if (dailyPnl) {
      this.dailyPnl = dailyPnl;
    }

    const metrics: RiskAlert = {
      type: 'RISK_METRICS_UPDATED',
      severity: 'low',
      message: 'Risk metrics updated',
      data: {
        currentDrawdown: this.currentDrawdown,
        peakValue: this.peakValue,
        totalExposure: this.calculateTotalExposure(positions),
        leverage: currentValue.gt(0)
          ? this.calculateTotalExposure(positions).div(currentValue)
          : new Decimal(0),
        positionCount: positions.length,
        largestPosition: this.getLargestPositionSize(positions, currentValue),
        concentrationRisk: this.calculateConcentrationRisk(positions, currentValue),
        dailyPnl: this.dailyPnl,
        emergencyMode: this.emergencyMode,
      },
    };

    this.emit('riskMetricsUpdated', metrics);
    return metrics;
  }

  private calculateTotalExposure(positions: Position[]): Decimal {
    return positions.reduce((total, position) => {
      const positionValue = position.quantity.mul(position.avgPrice);
      return total.add(positionValue);
    }, new Decimal(0));
  }

  private getLargestPositionSize(
    positions: Position[],
    portfolioValue: Decimal,
  ): Decimal {
    if (positions.length === 0 || portfolioValue.eq(0)) {
      return new Decimal(0);
    }

    const largestValue = positions.reduce((max, position) => {
      const positionValue = position.quantity.mul(position.avgPrice);
      return positionValue.gt(max) ? positionValue : max;
    }, new Decimal(0));

    return largestValue.div(portfolioValue).mul(100);
  }

  private calculateConcentrationRisk(
    positions: Position[],
    portfolioValue: Decimal,
  ): Decimal {
    if (positions.length === 0 || portfolioValue.eq(0)) {
      return new Decimal(0);
    }

    // Calculate Herfindahl-Hirschman Index (HHI) for concentration
    const weights = positions.map((position) => {
      const positionValue = position.quantity.mul(position.avgPrice);
      return positionValue.div(portfolioValue);
    });

    const hhi = weights.reduce((sum, weight) => sum.add(weight.pow(2)), new Decimal(0));
    return hhi.mul(100); // Convert to percentage
  }

  // Stop Loss Management
  calculateDynamicStopLoss(
    entryPrice: Decimal,
    currentPrice: Decimal,
    atr: Decimal,
    side: 'BUY' | 'SELL',
  ): Decimal {
    const atrMultiplier = new Decimal(2); // 2x ATR for stop loss
    const buffer = this.config.stopLossBuffer.div(100);

    let stopLoss: Decimal;

    if (side === 'BUY') {
      // Long position - stop loss below entry
      const trailingStop = currentPrice.sub(atr.mul(atrMultiplier));
      const fixedStop = entryPrice.sub(atr.mul(atrMultiplier));
      stopLoss = Decimal.max(trailingStop, fixedStop);

      // Apply buffer
      stopLoss = stopLoss.mul(new Decimal(1).sub(buffer));
    } else {
      // Short position - stop loss above entry
      const trailingStop = currentPrice.add(atr.mul(atrMultiplier));
      const fixedStop = entryPrice.add(atr.mul(atrMultiplier));
      stopLoss = Decimal.min(trailingStop, fixedStop);

      // Apply buffer
      stopLoss = stopLoss.mul(new Decimal(1).add(buffer));
    }

    return stopLoss;
  }

  // Emergency Controls
  private enterEmergencyMode(): void {
    if (!this.emergencyMode) {
      this.emergencyMode = true;
      this.emit('emergencyModeActivated', {
        reason: 'Risk limits exceeded',
        timestamp: new Date(),
        currentDrawdown: this.currentDrawdown,
      });
    }
  }

  exitEmergencyMode(): void {
    if (this.emergencyMode) {
      this.emergencyMode = false;
      this.emit('emergencyModeDeactivated', {
        timestamp: new Date(),
      });
    }
  }

  isInEmergencyMode(): boolean {
    return this.emergencyMode;
  }

  // Risk Alerts
  private emitRiskAlert(alert: RiskAlert): void {
    this.emit('riskAlert', alert);

    // Log critical alerts
    if (alert.severity === 'critical') {
      console.error(`CRITICAL RISK ALERT: ${alert.message}`, alert.data);
    }
  }

  // Configuration
  updateRiskLimits(newLimits: Partial<RiskManagerConfig>): void {
    this.config = { ...this.config, ...newLimits };
    this.emit('riskLimitsUpdated', this.config);
  }

  getRiskLimits(): RiskManagerConfig {
    return { ...this.config };
  }

  // Daily Reset
  private setupDailyReset(): void {
    const now = new Date();
    const msUntilReset = this.dailyResetTime.getTime() - now.getTime();

    setTimeout(() => {
      this.resetDailyMetrics();
      // Set up next reset
      this.dailyResetTime = this.getNextDailyReset();
      this.setupDailyReset();
    }, msUntilReset);
  }

  private getNextDailyReset(): Date {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }

  private resetDailyMetrics(): void {
    this.dailyPnl = new Decimal(0);
    this.emit('dailyReset', { timestamp: new Date() });
  }

  // Utility Methods
  getVaR(returns: Decimal[], confidence: number = 0.95): Decimal {
    if (returns.length === 0) return new Decimal(0);

    const sortedReturns = returns.sort((a, b) => a.comparedTo(b));
    const index = Math.floor((1 - confidence) * sortedReturns.length);

    return sortedReturns[Math.max(0, index)].abs();
  }

  getCVaR(returns: Decimal[], confidence: number = 0.95): Decimal {
    if (returns.length === 0) return new Decimal(0);

    const sortedReturns = returns.sort((a, b) => a.comparedTo(b));
    const cutoffIndex = Math.floor((1 - confidence) * sortedReturns.length);
    const tailReturns = sortedReturns.slice(0, cutoffIndex + 1);

    if (tailReturns.length === 0) return new Decimal(0);

    return tailReturns
      .reduce((sum, r) => sum.add(r.abs()), new Decimal(0))
      .div(tailReturns.length);
  }
}
