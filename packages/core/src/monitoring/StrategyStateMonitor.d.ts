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
export interface StrategyHealthStatus {
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
    maxRecoveryTime: number;
    healthCheckInterval: number;
    alertCooldown: number;
}
export declare class StrategyStateMonitor extends EventEmitter {
    private logger;
    private metrics;
    private strategyHealth;
    private recoveryTimes;
    private lastAlerts;
    private readonly config;
    private healthCheckInterval?;
    constructor(logger: ILogger, config?: Partial<AlertConfig>);
    /**
     * Start monitoring system
     */
    start(): void;
    /**
     * Stop monitoring system
     */
    stop(): void;
    /**
     * Record a recovery attempt
     */
    recordRecoveryAttempt(strategyId: number, startTime: Date): void;
    /**
     * Record a successful recovery
     */
    recordRecoverySuccess(strategyId: number, startTime: Date, endTime: Date): void;
    /**
     * Record a failed recovery
     */
    recordRecoveryFailure(strategyId: number, error: string): void;
    /**
     * Record state corruption
     */
    recordStateCorruption(strategyId: number, details: string): void;
    /**
     * Record data inconsistency
     */
    recordDataInconsistency(strategyId: number, details: string): void;
    /**
     * Record successful backup
     */
    recordBackupSuccess(strategyId: number): void;
    /**
     * Record backup failure
     */
    recordBackupFailure(strategyId: number, error: string): void;
    /**
     * Get current metrics
     */
    getMetrics(): StateRecoveryMetrics;
    /**
     * Get strategy health status
     */
    getStrategyHealth(strategyId: number): StrategyHealthStatus | undefined;
    /**
     * Get all strategy health statuses
     */
    getAllStrategyHealth(): Map<number, StrategyHealthStatus>;
    /**
     * Generate health report
     */
    generateHealthReport(): {
        overall: {
            totalStrategies: number;
            healthyStrategies: number;
            unhealthyStrategies: number;
            successRate: number;
        };
        metrics: StateRecoveryMetrics;
        strategies: StrategyHealthStatus[];
    };
    private getOrCreateHealthStatus;
    private getRecentRecoveryFailures;
    private performHealthChecks;
    private triggerAlert;
}
export {};
//# sourceMappingURL=StrategyStateMonitor.d.ts.map