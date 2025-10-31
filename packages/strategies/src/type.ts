import { StrategyParameters } from '@itrade/core';

/**
 * 🎨 Parameter Definition for UI Generation
 * Describes how a parameter should be displayed and validated in the UI
 */
export interface ParameterDefinition<T = unknown> {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'object' | 'enum' | 'range';
  description: string;
  defaultValue: T;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  validation?: {
    pattern?: string;
    options?: string[];
  };
  unit?: string;
  group?: string; // UI grouping
  order?: number; // UI ordering
}

// ============================================================================
// 策略注册配置
// ============================================================================

/**
 * 📋 Strategy Registry Configuration
 * Complete metadata and configuration for a strategy type
 */
export interface StrategyRegistryConfig<
  TParams extends StrategyParameters = StrategyParameters,
> {
  type: string;
  name: string;
  description: string;
  icon?: string;
  implemented: boolean;
  category: 'trend' | 'momentum' | 'volatility' | 'custom';
  defaultParameters: TParams;
  parameterDefinitions: ParameterDefinition[];
  documentation?: {
    overview: string;
    parameters: string;
    signals: string;
    riskFactors: string[];
  };
}
