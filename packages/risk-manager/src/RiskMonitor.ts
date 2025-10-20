import { EventEmitter } from 'events';

import { Decimal } from 'decimal.js';
import { RiskAlert } from '@itrade/core';

export interface MonitoringConfig {
  checkInterval: number; // Monitoring interval in milliseconds
  portfolioVarLimit: Decimal; // Portfolio VaR limit (%)
  positionVarLimit: Decimal; // Individual position VaR limit (%)
  correlationThreshold: Decimal; // Correlation threshold for alerts
  liquidityThreshold: Decimal; // Minimum liquidity requirement
  maxDrawdownAlert: Decimal; // Drawdown level for alerts (%)
}

export interface RiskSnapshot {
  timestamp: Date;
  portfolioValue: Decimal;
  totalExposure: Decimal;
  leverage: Decimal;
  drawdown: Decimal;
  var95: Decimal;
  largestPosition: Decimal;
  concentrationRisk: Decimal;
  correlationRisk: Decimal;
  liquidityRisk: Decimal;
}

export class RiskMonitor extends EventEmitter {
  private config: MonitoringConfig;
  private snapshots: RiskSnapshot[] = [];
  private maxSnapshots = 1000;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  // Market data cache
  marketPrices: Map<string, Decimal> = new Map();
  volatilities: Map<string, Decimal> = new Map();
  private correlations: Map<string, Map<string, Decimal>> = new Map();

  // Alert state
  private activeAlerts: Set<string> = new Set();
  private alertCooldowns: Map<string, Date> = new Map();

  constructor(config: Partial<MonitoringConfig> = {}) {
    super();

    this.config = {
      checkInterval: config.checkInterval || 5000, // 5 seconds
      portfolioVarLimit: config.portfolioVarLimit || new Decimal(5), // 5%
      positionVarLimit: config.positionVarLimit || new Decimal(2), // 2%
      correlationThreshold: config.correlationThreshold || new Decimal(70), // 70%
      liquidityThreshold: config.liquidityThreshold || new Decimal(10000), // $10k daily volume
      maxDrawdownAlert: config.maxDrawdownAlert || new Decimal(15), // 15%
    };
  }

  // Monitoring Control
  startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.performRiskChecks();
    }, this.config.checkInterval);

    this.emit('monitoringStarted');
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.emit('monitoringStopped');
  }

  // Main Monitoring Logic
  private async performRiskChecks(): Promise<void> {
    try {
      // This would typically get real data from the portfolio manager
      const snapshot = await this.captureRiskSnapshot();
      this.snapshots.push(snapshot);

      // Maintain snapshot history
      if (this.snapshots.length > this.maxSnapshots) {
        this.snapshots.shift();
      }

      // Perform risk checks
      await this.checkPortfolioRisk(snapshot);
      await this.checkPositionRisk(snapshot);
      await this.checkDrawdownRisk(snapshot);
      await this.checkConcentrationRisk(snapshot);
      await this.checkCorrelationRisk(snapshot);
      await this.checkLiquidityRisk(snapshot);

      this.emit('riskCheckComplete', snapshot);
    } catch (error) {
      this.emit('monitoringError', error);
    }
  }

  private async captureRiskSnapshot(): Promise<RiskSnapshot> {
    // This would integrate with real portfolio data
    // Placeholder implementation
    return {
      timestamp: new Date(),
      portfolioValue: new Decimal(100000),
      totalExposure: new Decimal(80000),
      leverage: new Decimal(0.8),
      drawdown: new Decimal(0),
      var95: new Decimal(5000),
      largestPosition: new Decimal(15),
      concentrationRisk: new Decimal(25),
      correlationRisk: new Decimal(30),
      liquidityRisk: new Decimal(10),
    };
  }

  // Risk Check Methods
  private async checkPortfolioRisk(snapshot: RiskSnapshot): Promise<void> {
    const portfolioVarPercent = snapshot.var95.div(snapshot.portfolioValue).mul(100);

    if (portfolioVarPercent.gt(this.config.portfolioVarLimit)) {
      await this.emitAlert({
        type: 'PORTFOLIO_VAR_EXCEEDED',
        severity: 'high',
        message: `Portfolio VaR ${portfolioVarPercent.toFixed(2)}% exceeds limit ${this.config.portfolioVarLimit.toFixed(2)}%`,
        data: {
          portfolioVar: portfolioVarPercent,
          limit: this.config.portfolioVarLimit,
          portfolioValue: snapshot.portfolioValue,
        },
      });
    }
  }

  private async checkPositionRisk(snapshot: RiskSnapshot): Promise<void> {
    if (snapshot.largestPosition.gt(this.config.positionVarLimit.mul(5))) {
      await this.emitAlert({
        type: 'POSITION_SIZE_EXCESSIVE',
        severity: 'medium',
        message: `Largest position ${snapshot.largestPosition.toFixed(2)}% is excessive`,
        data: {
          largestPosition: snapshot.largestPosition,
          threshold: this.config.positionVarLimit.mul(5),
        },
      });
    }
  }

  private async checkDrawdownRisk(snapshot: RiskSnapshot): Promise<void> {
    if (snapshot.drawdown.gt(this.config.maxDrawdownAlert)) {
      await this.emitAlert({
        type: 'DRAWDOWN_WARNING',
        severity: 'high',
        message: `Portfolio drawdown ${snapshot.drawdown.toFixed(2)}% exceeds warning level`,
        data: {
          drawdown: snapshot.drawdown,
          warningLevel: this.config.maxDrawdownAlert,
        },
      });
    }
  }

  private async checkConcentrationRisk(snapshot: RiskSnapshot): Promise<void> {
    if (snapshot.concentrationRisk.gt(50)) {
      // 50% concentration threshold
      await this.emitAlert({
        type: 'CONCENTRATION_RISK_HIGH',
        severity: 'medium',
        message: `Portfolio concentration risk ${snapshot.concentrationRisk.toFixed(2)}% is high`,
        data: {
          concentrationRisk: snapshot.concentrationRisk,
          threshold: new Decimal(50),
        },
      });
    }
  }

  private async checkCorrelationRisk(snapshot: RiskSnapshot): Promise<void> {
    if (snapshot.correlationRisk.gt(this.config.correlationThreshold)) {
      await this.emitAlert({
        type: 'CORRELATION_RISK_HIGH',
        severity: 'medium',
        message: `Portfolio correlation risk ${snapshot.correlationRisk.toFixed(2)}% exceeds threshold`,
        data: {
          correlationRisk: snapshot.correlationRisk,
          threshold: this.config.correlationThreshold,
        },
      });
    }
  }

  private async checkLiquidityRisk(snapshot: RiskSnapshot): Promise<void> {
    if (snapshot.liquidityRisk.gt(20)) {
      // 20% liquidity risk threshold
      await this.emitAlert({
        type: 'LIQUIDITY_RISK_HIGH',
        severity: 'medium',
        message: `Portfolio liquidity risk ${snapshot.liquidityRisk.toFixed(2)}% is elevated`,
        data: {
          liquidityRisk: snapshot.liquidityRisk,
          threshold: new Decimal(20),
        },
        timestamp: new Date(),
      });
    }
  }

  // Alert Management
  private async emitAlert(alert: RiskAlert): Promise<void> {
    const alertKey = `${alert.type}_${JSON.stringify(alert.data)}`;

    // Check if alert is in cooldown
    const cooldown = this.alertCooldowns.get(alertKey);
    const now = new Date();

    if (cooldown && now.getTime() - cooldown.getTime() < 300000) {
      // 5 minute cooldown
      return;
    }

    // Set cooldown
    this.alertCooldowns.set(alertKey, now);
    this.activeAlerts.add(alertKey);

    // Emit alert
    this.emit('riskAlert', {
      ...alert,
      timestamp: now,
      id: alertKey,
    });

    // Auto-clear non-critical alerts after 1 hour
    if (alert.severity !== 'critical') {
      setTimeout(() => {
        this.activeAlerts.delete(alertKey);
        this.alertCooldowns.delete(alertKey);
      }, 3600000);
    }
  }

  // Market Data Updates
  updateMarketPrices(prices: Map<string, Decimal>): void {
    this.marketPrices = new Map(prices);
    this.emit('marketPricesUpdated', prices);
  }

  updateVolatilities(volatilities: Map<string, Decimal>): void {
    this.volatilities = new Map(volatilities);
    this.emit('volatilitiesUpdated', volatilities);
  }

  updateCorrelations(correlations: Map<string, Map<string, Decimal>>): void {
    this.correlations = new Map();
    for (const [symbol, corrs] of correlations) {
      this.correlations.set(symbol, new Map(corrs));
    }
    this.emit('correlationsUpdated', correlations);
  }

  // Analysis Methods
  getVaRTrend(periods: number = 24): { dates: Date[]; values: Decimal[] } {
    const recentSnapshots = this.snapshots.slice(-periods);

    return {
      dates: recentSnapshots.map((s) => s.timestamp),
      values: recentSnapshots.map((s) => s.var95),
    };
  }

  getDrawdownTrend(periods: number = 100): {
    dates: Date[];
    values: Decimal[];
  } {
    const recentSnapshots = this.snapshots.slice(-periods);

    return {
      dates: recentSnapshots.map((s) => s.timestamp),
      values: recentSnapshots.map((s) => s.drawdown),
    };
  }

  getLeverageTrend(periods: number = 24): { dates: Date[]; values: Decimal[] } {
    const recentSnapshots = this.snapshots.slice(-periods);

    return {
      dates: recentSnapshots.map((s) => s.timestamp),
      values: recentSnapshots.map((s) => s.leverage),
    };
  }

  calculateStressTest(stressScenarios: Map<string, Decimal>): Map<string, Decimal> {
    const results = new Map<string, Decimal>();

    for (const [scenario, shockPercent] of stressScenarios) {
      // Simplified stress test calculation
      const latestSnapshot = this.snapshots[this.snapshots.length - 1];
      if (latestSnapshot) {
        const stressedValue = latestSnapshot.portfolioValue.mul(
          new Decimal(1).add(shockPercent.div(100)),
        );
        const portfolioLoss = latestSnapshot.portfolioValue.sub(stressedValue);
        results.set(scenario, portfolioLoss);
      }
    }

    return results;
  }

  // Reporting
  generateRiskReport(): {
    summary: RiskSnapshot | undefined;
    trends: {
      var: Decimal[];
      drawdown: Decimal[];
      leverage: Decimal[];
    };
    alerts: { type: string; count: number }[];
    recommendations: string[];
  } {
    const latest = this.snapshots[this.snapshots.length - 1];
    const last24Hours = this.snapshots.slice(-24);

    const alertCounts = new Map<string, number>();
    for (const alertKey of this.activeAlerts) {
      const alertType = alertKey.split('_')[0];
      alertCounts.set(alertType, (alertCounts.get(alertType) || 0) + 1);
    }

    const recommendations = this.generateRecommendations(latest);

    return {
      summary: latest,
      trends: {
        var: last24Hours.map((s) => s.var95),
        drawdown: last24Hours.map((s) => s.drawdown),
        leverage: last24Hours.map((s) => s.leverage),
      },
      alerts: Array.from(alertCounts.entries()).map(([type, count]) => ({
        type,
        count,
      })),
      recommendations,
    };
  }

  private generateRecommendations(snapshot?: RiskSnapshot): string[] {
    if (!snapshot) return [];

    const recommendations: string[] = [];

    if (snapshot.leverage.gt(0.8)) {
      recommendations.push('Consider reducing leverage to below 80%');
    }

    if (snapshot.concentrationRisk.gt(40)) {
      recommendations.push('Diversify portfolio to reduce concentration risk');
    }

    if (snapshot.drawdown.gt(10)) {
      recommendations.push('Review risk management rules - drawdown is elevated');
    }

    if (snapshot.correlationRisk.gt(60)) {
      recommendations.push('Reduce exposure to highly correlated assets');
    }

    return recommendations;
  }

  // Configuration
  updateConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('configUpdated', this.config);
  }

  getConfig(): MonitoringConfig {
    return { ...this.config };
  }

  // State
  isActive(): boolean {
    return this.isMonitoring;
  }

  getActiveAlerts(): string[] {
    return Array.from(this.activeAlerts);
  }

  clearAlert(alertKey: string): void {
    this.activeAlerts.delete(alertKey);
    this.alertCooldowns.delete(alertKey);
    this.emit('alertCleared', alertKey);
  }

  clearAllAlerts(): void {
    this.activeAlerts.clear();
    this.alertCooldowns.clear();
    this.emit('allAlertsCleared');
  }
}
