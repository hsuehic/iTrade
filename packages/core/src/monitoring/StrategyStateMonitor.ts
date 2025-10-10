import { EventEmitter } from 'events';

import { ILogger } from '../interfaces';

export interface StateRecoveryMetrics {
  totalRecoveryAttempts: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  averageRecoveryTime: number;
  lastRecoveryAttempt?: Date;
  lastSuccessfulRecovery?: Date;
  lastFailedRecovery?: Date;
  stateCorruptions: number;
  dataInconsistencies: number;
}

interface StrategyHealthStatus {
  strategyId: number;
  isHealthy: boolean;
  lastHealthCheck: Date;
  issues: string[];
  recommendations: string[];
  recoveryCount: number;
  stateVersion: string;
  lastBackupTime?: Date;
}

interface AlertConfig {
  maxFailedRecoveries: number;
  maxRecoveryTime: number; // milliseconds
  healthCheckInterval: number; // milliseconds
  alertCooldown: number; // milliseconds
}

export class StrategyStateMonitor extends EventEmitter {
  private metrics: StateRecoveryMetrics = {
    totalRecoveryAttempts: 0,
    successfulRecoveries: 0,
    failedRecoveries: 0,
    averageRecoveryTime: 0,
    stateCorruptions: 0,
    dataInconsistencies: 0,
  };

  private strategyHealth = new Map<number, StrategyHealthStatus>();
  private recoveryTimes: number[] = [];
  private lastAlerts = new Map<string, Date>();

  private readonly config: AlertConfig = {
    maxFailedRecoveries: 3,
    maxRecoveryTime: 30000, // 30 seconds
    healthCheckInterval: 300000, // 5 minutes
    alertCooldown: 600000, // 10 minutes
  };

  private healthCheckInterval?: NodeJS.Timeout;

  constructor(
    private logger: ILogger,
    config?: Partial<AlertConfig>
  ) {
    super();
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Start monitoring system
   */
  public start(): void {
    this.logger.info('🔍 Strategy State Monitor started');

    // Start periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop monitoring system
   */
  public stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    this.logger.info('🔍 Strategy State Monitor stopped');
  }

  /**
   * Record a recovery attempt
   */
  public recordRecoveryAttempt(strategyId: number, startTime: Date): void {
    this.metrics.totalRecoveryAttempts++;
    this.metrics.lastRecoveryAttempt = startTime;

    // Update strategy health
    const health = this.getOrCreateHealthStatus(strategyId);
    health.recoveryCount++;
    health.lastHealthCheck = new Date();
  }

  /**
   * Record a successful recovery
   */
  public recordRecoverySuccess(
    strategyId: number,
    startTime: Date,
    endTime: Date
  ): void {
    const recoveryTime = endTime.getTime() - startTime.getTime();

    this.metrics.successfulRecoveries++;
    this.metrics.lastSuccessfulRecovery = endTime;
    this.recoveryTimes.push(recoveryTime);

    // Update average recovery time
    this.metrics.averageRecoveryTime =
      this.recoveryTimes.reduce((sum, time) => sum + time, 0) /
      this.recoveryTimes.length;

    // Keep only last 100 recovery times for rolling average
    if (this.recoveryTimes.length > 100) {
      this.recoveryTimes = this.recoveryTimes.slice(-100);
    }

    // Update strategy health
    const health = this.getOrCreateHealthStatus(strategyId);
    health.isHealthy = true;
    health.lastHealthCheck = endTime;
    health.issues = health.issues.filter(
      (issue) => !issue.includes('recovery')
    );

    this.logger.info(
      `✅ Strategy ${strategyId} recovery successful (${recoveryTime}ms)`
    );

    // Check for slow recovery
    if (recoveryTime > this.config.maxRecoveryTime) {
      this.triggerAlert('slow_recovery', {
        strategyId,
        recoveryTime,
        threshold: this.config.maxRecoveryTime,
      });
    }
  }

  /**
   * Record a failed recovery
   */
  public recordRecoveryFailure(
    strategyId: number,
    startTime: Date,
    error: string
  ): void {
    this.metrics.failedRecoveries++;
    this.metrics.lastFailedRecovery = new Date();

    // Update strategy health
    const health = this.getOrCreateHealthStatus(strategyId);
    health.isHealthy = false;
    health.lastHealthCheck = new Date();
    health.issues.push(`Recovery failed: ${error}`);
    health.recommendations.push('Check strategy state consistency');

    this.logger.error(`❌ Strategy ${strategyId} recovery failed: ${error}`);

    // Check for excessive failures
    const recentFailures = this.getRecentRecoveryFailures(strategyId);
    if (recentFailures >= this.config.maxFailedRecoveries) {
      this.triggerAlert('excessive_failures', {
        strategyId,
        failures: recentFailures,
        threshold: this.config.maxFailedRecoveries,
      });
    }
  }

  /**
   * Record state corruption
   */
  public recordStateCorruption(strategyId: number, details: string): void {
    this.metrics.stateCorruptions++;

    const health = this.getOrCreateHealthStatus(strategyId);
    health.isHealthy = false;
    health.issues.push(`State corruption: ${details}`);
    health.recommendations.push(
      'Consider rebuilding strategy state from orders'
    );

    this.triggerAlert('state_corruption', {
      strategyId,
      details,
    });
  }

  /**
   * Record data inconsistency
   */
  public recordDataInconsistency(strategyId: number, details: string): void {
    this.metrics.dataInconsistencies++;

    const health = this.getOrCreateHealthStatus(strategyId);
    health.issues.push(`Data inconsistency: ${details}`);
    health.recommendations.push(
      'Verify order and position data synchronization'
    );

    this.triggerAlert('data_inconsistency', {
      strategyId,
      details,
    });
  }

  /**
   * Record successful backup
   */
  public recordBackupSuccess(strategyId: number): void {
    const health = this.getOrCreateHealthStatus(strategyId);
    health.lastBackupTime = new Date();

    // Remove backup-related issues
    health.issues = health.issues.filter((issue) => !issue.includes('backup'));
  }

  /**
   * Record backup failure
   */
  public recordBackupFailure(strategyId: number, error: string): void {
    const health = this.getOrCreateHealthStatus(strategyId);
    health.issues.push(`Backup failed: ${error}`);
    health.recommendations.push('Check database connectivity and permissions');
  }

  /**
   * Get current metrics
   */
  public getMetrics(): StateRecoveryMetrics {
    return { ...this.metrics };
  }

  /**
   * Get strategy health status
   */
  public getStrategyHealth(
    strategyId: number
  ): StrategyHealthStatus | undefined {
    return this.strategyHealth.get(strategyId);
  }

  /**
   * Get all strategy health statuses
   */
  public getAllStrategyHealth(): Map<number, StrategyHealthStatus> {
    return new Map(this.strategyHealth);
  }

  /**
   * Generate health report
   */
  public generateHealthReport(): {
    overall: {
      totalStrategies: number;
      healthyStrategies: number;
      unhealthyStrategies: number;
      successRate: number;
    };
    metrics: StateRecoveryMetrics;
    strategies: StrategyHealthStatus[];
  } {
    const strategies = Array.from(this.strategyHealth.values());
    const healthyCount = strategies.filter((s) => s.isHealthy).length;

    return {
      overall: {
        totalStrategies: strategies.length,
        healthyStrategies: healthyCount,
        unhealthyStrategies: strategies.length - healthyCount,
        successRate:
          this.metrics.totalRecoveryAttempts > 0
            ? (this.metrics.successfulRecoveries /
                this.metrics.totalRecoveryAttempts) *
              100
            : 100,
      },
      metrics: this.getMetrics(),
      strategies: strategies.sort((a, b) => {
        // Sort by health status, then by strategy ID
        if (a.isHealthy !== b.isHealthy) {
          return a.isHealthy ? 1 : -1;
        }
        return a.strategyId - b.strategyId;
      }),
    };
  }

  private getOrCreateHealthStatus(strategyId: number): StrategyHealthStatus {
    if (!this.strategyHealth.has(strategyId)) {
      this.strategyHealth.set(strategyId, {
        strategyId,
        isHealthy: true,
        lastHealthCheck: new Date(),
        issues: [],
        recommendations: [],
        recoveryCount: 0,
        stateVersion: '1.0.0',
      });
    }
    return this.strategyHealth.get(strategyId)!;
  }

  private getRecentRecoveryFailures(strategyId: number): number {
    // This is a simplified implementation
    // In a real system, you'd track failure timestamps
    const health = this.strategyHealth.get(strategyId);
    return health
      ? health.issues.filter((issue) => issue.includes('Recovery failed'))
          .length
      : 0;
  }

  private performHealthChecks(): void {
    const now = new Date();
    let issuesFound = 0;

    for (const [strategyId, health] of this.strategyHealth) {
      const issues: string[] = [];
      const recommendations: string[] = [];

      // Check for stale backups
      if (health.lastBackupTime) {
        const backupAge = now.getTime() - health.lastBackupTime.getTime();
        const maxBackupAge = 24 * 60 * 60 * 1000; // 24 hours

        if (backupAge > maxBackupAge) {
          issues.push(
            `Backup is ${Math.round(backupAge / (60 * 60 * 1000))} hours old`
          );
          recommendations.push('Check backup service and schedule');
        }
      } else {
        issues.push('No backup recorded');
        recommendations.push('Ensure backup service is running');
      }

      // Check for excessive recovery attempts
      if (health.recoveryCount > 10) {
        issues.push(`High recovery count: ${health.recoveryCount}`);
        recommendations.push('Investigate root cause of frequent restarts');
      }

      // Update health status
      if (issues.length > 0) {
        health.issues = [...health.issues, ...issues];
        health.recommendations = [
          ...health.recommendations,
          ...recommendations,
        ];
        health.isHealthy = false;
        issuesFound++;
      }

      health.lastHealthCheck = now;
    }

    if (issuesFound > 0) {
      this.logger.warn(
        `⚠️  Health check found issues in ${issuesFound} strategies`
      );
    }
  }

  private triggerAlert(type: string, data: any): void {
    const alertKey = `${type}_${data.strategyId}`;
    const now = new Date();
    const lastAlert = this.lastAlerts.get(alertKey);

    // Check cooldown
    if (
      lastAlert &&
      now.getTime() - lastAlert.getTime() < this.config.alertCooldown
    ) {
      return;
    }

    this.lastAlerts.set(alertKey, now);

    this.emit('alert', {
      type,
      timestamp: now,
      ...data,
    });

    this.logger.warn(`🚨 ALERT [${type}]: Strategy ${data.strategyId}`, data);
  }
}
