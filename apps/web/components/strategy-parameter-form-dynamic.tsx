'use client';

import { useState, useEffect } from 'react';
import { InfoIcon, AlertTriangleIcon } from 'lucide-react';
import {
  getStrategyConfig,
  type StrategyTypeKey,
  type StrategyParameterDefinition,
} from '@itrade/core';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';

interface StrategyParameterFormDynamicProps {
  strategyType: StrategyTypeKey;
  initialParameters?: Record<string, unknown>;
  onParametersChange: (parameters: Record<string, unknown>) => void;
}

export function StrategyParameterFormDynamic({
  strategyType,
  initialParameters = {},
  onParametersChange,
}: StrategyParameterFormDynamicProps) {
  const strategyConfig = getStrategyConfig(strategyType);

  const [parameters, setParameters] = useState<Record<string, unknown>>(() => {
    return {
      ...strategyConfig?.defaultParameters,
      ...initialParameters,
    };
  });

  useEffect(() => {
    const newDefaultParameters = strategyConfig?.defaultParameters || {};
    const newParameters = {
      ...newDefaultParameters,
      ...initialParameters,
    };
    setParameters(newParameters);
    onParametersChange(newParameters);
  }, [strategyType, initialParameters]);

  if (!strategyConfig) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            Strategy configuration not found
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleParameterChange = (paramName: string, value: unknown) => {
    const newParameters = {
      ...parameters,
      [paramName]: value,
    };
    setParameters(newParameters);
    onParametersChange(newParameters);
  };

  const renderField = (paramDef: StrategyParameterDefinition) => {
    const value = parameters[paramDef.name] ?? paramDef.defaultValue;

    switch (paramDef.type) {
      case 'number':
        return (
          <div key={paramDef.name} className="space-y-2">
            <Label htmlFor={paramDef.name}>
              {paramDef.name
                .split(/(?=[A-Z])/)
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')}
              {paramDef.required && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </Label>
            <Input
              id={paramDef.name}
              type="number"
              value={value as number}
              onChange={(e) =>
                handleParameterChange(paramDef.name, Number(e.target.value))
              }
              min={paramDef.min}
              max={paramDef.max}
              required={paramDef.required}
              step={paramDef.step || 'any'}
            />
            <p className="text-xs text-muted-foreground">
              {paramDef.description}
              {paramDef.min !== undefined && paramDef.max !== undefined && (
                <span className="ml-1">
                  (range: {paramDef.min} - {paramDef.max})
                </span>
              )}
            </p>
          </div>
        );

      case 'boolean':
        return (
          <div key={paramDef.name} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor={paramDef.name}>
                  {paramDef.name
                    .split(/(?=[A-Z])/)
                    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {paramDef.description}
                </p>
              </div>
              <Switch
                id={paramDef.name}
                checked={Boolean(value)}
                onCheckedChange={(checked) =>
                  handleParameterChange(paramDef.name, checked)
                }
              />
            </div>
          </div>
        );

      case 'string':
        if (paramDef.validation?.options) {
          // Dropdown for predefined options
          return (
            <div key={paramDef.name} className="space-y-2">
              <Label htmlFor={paramDef.name}>
                {paramDef.name
                  .split(/(?=[A-Z])/)
                  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ')}
                {paramDef.required && (
                  <span className="text-red-500 ml-1">*</span>
                )}
              </Label>
              <Select
                value={value as string}
                onValueChange={(newValue) =>
                  handleParameterChange(paramDef.name, newValue)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paramDef.validation.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {paramDef.description}
              </p>
            </div>
          );
        } else {
          // Text input
          return (
            <div key={paramDef.name} className="space-y-2">
              <Label htmlFor={paramDef.name}>
                {paramDef.name
                  .split(/(?=[A-Z])/)
                  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ')}
                {paramDef.required && (
                  <span className="text-red-500 ml-1">*</span>
                )}
              </Label>
              <Input
                id={paramDef.name}
                type="text"
                value={value as string}
                onChange={(e) =>
                  handleParameterChange(paramDef.name, e.target.value)
                }
                required={paramDef.required}
                pattern={paramDef.validation?.pattern}
              />
              <p className="text-xs text-muted-foreground">
                {paramDef.description}
              </p>
            </div>
          );
        }

      case 'object':
        return (
          <div key={paramDef.name} className="space-y-2">
            <Label htmlFor={paramDef.name}>
              {paramDef.name
                .split(/(?=[A-Z])/)
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')}
              {paramDef.required && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </Label>
            <Textarea
              id={paramDef.name}
              value={JSON.stringify(value, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  handleParameterChange(paramDef.name, parsed);
                } catch {
                  // Invalid JSON, don't update
                }
              }}
              rows={4}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {paramDef.description}
            </p>
          </div>
        );

      case 'date':
        return (
          <div key={paramDef.name} className="space-y-2">
            <Label htmlFor={paramDef.name}>
              {paramDef.name
                .split(/(?=[A-Z])/)
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')}
              {paramDef.required && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </Label>
            <Input
              id={paramDef.name}
              type="date"
              value={
                value instanceof Date
                  ? value.toISOString().split('T')[0]
                  : (value as string)
              }
              onChange={(e) =>
                handleParameterChange(paramDef.name, e.target.value)
              }
              required={paramDef.required}
            />
            <p className="text-xs text-muted-foreground">
              {paramDef.description}
            </p>
          </div>
        );

      case 'enum':
        return (
          <div key={paramDef.name} className="space-y-2">
            <Label htmlFor={paramDef.name}>
              {paramDef.name
                .split(/(?=[A-Z])/)
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')}
              {paramDef.required && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </Label>
            <Select
              value={value as string}
              onValueChange={(newValue) =>
                handleParameterChange(paramDef.name, newValue)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {(paramDef.validation?.options || []).map((option) => (
                  <SelectItem key={option} value={option}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {paramDef.description}
            </p>
          </div>
        );

      case 'range':
        return (
          <div key={paramDef.name} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={paramDef.name}>
                {paramDef.name
                  .split(/(?=[A-Z])/)
                  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ')}
                {paramDef.required && (
                  <span className="text-red-500 ml-1">*</span>
                )}
              </Label>
              <span className="text-sm font-medium">
                {value as number}
                {paramDef.unit && <span className="ml-1">{paramDef.unit}</span>}
              </span>
            </div>
            <Slider
              id={paramDef.name}
              value={[value as number]}
              onValueChange={(values) =>
                handleParameterChange(paramDef.name, values[0])
              }
              min={paramDef.min ?? 0}
              max={paramDef.max ?? 100}
              step={paramDef.step ?? 1}
              className="py-4"
            />
            <p className="text-xs text-muted-foreground">
              {paramDef.description}
              {paramDef.min !== undefined && paramDef.max !== undefined && (
                <span className="ml-1">
                  (range: {paramDef.min} - {paramDef.max}
                  {paramDef.unit && ` ${paramDef.unit}`})
                </span>
              )}
            </p>
          </div>
        );

      case 'color':
        return (
          <div key={paramDef.name} className="space-y-2">
            <Label htmlFor={paramDef.name}>
              {paramDef.name
                .split(/(?=[A-Z])/)
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')}
              {paramDef.required && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </Label>
            <div className="flex gap-2 items-center">
              <Input
                id={paramDef.name}
                type="color"
                value={value as string}
                onChange={(e) =>
                  handleParameterChange(paramDef.name, e.target.value)
                }
                className="w-20 h-10 cursor-pointer"
              />
              <Input
                type="text"
                value={value as string}
                onChange={(e) =>
                  handleParameterChange(paramDef.name, e.target.value)
                }
                pattern="^#[0-9A-Fa-f]{6}$"
                placeholder="#000000"
                className="font-mono"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {paramDef.description}
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  // Separate subscription parameters from strategy parameters
  const strategyParams = strategyConfig.parameterDefinitions.filter(
    (p) => p.name !== 'subscription'
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>{strategyConfig.icon}</span>
          {strategyConfig.name} Parameters
          {!strategyConfig.implemented && (
            <Badge variant="outline" className="text-yellow-600">
              <AlertTriangleIcon className="h-3 w-3 mr-1" />
              Coming Soon
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Strategy Overview */}
        {strategyConfig.documentation?.overview && (
          <div className="bg-muted/30 p-4 rounded-lg">
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <InfoIcon className="h-4 w-4" />
              Strategy Overview
            </h4>
            <p className="text-sm text-muted-foreground">
              {strategyConfig.documentation.overview}
            </p>
          </div>
        )}

        {/* Dynamic Strategy Parameters */}
        {strategyParams.length > 0 && (
          <div className="space-y-4">
            <h4 className="font-medium text-sm">Configuration Parameters</h4>
            <div className="grid gap-4 md:grid-cols-2">
              {strategyParams.map((paramDef) => renderField(paramDef))}
            </div>
          </div>
        )}

        {/* Market Data Subscription */}
        <div className="space-y-4 border-t pt-4">
          <h4 className="font-medium text-sm">Market Data Subscription</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Ticker Data</Label>
                <Switch
                  checked={Boolean(
                    (
                      parameters.subscription as
                        | { ticker?: boolean }
                        | undefined
                    )?.ticker ?? true
                  )}
                  onCheckedChange={(checked) => {
                    const currentSub =
                      (parameters.subscription as Record<string, unknown>) ||
                      {};
                    handleParameterChange('subscription', {
                      ...currentSub,
                      ticker: checked,
                    });
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Kline Data</Label>
                <Switch
                  checked={Boolean(
                    (
                      parameters.subscription as
                        | { klines?: boolean }
                        | undefined
                    )?.klines ?? true
                  )}
                  onCheckedChange={(checked) => {
                    const currentSub =
                      (parameters.subscription as Record<string, unknown>) ||
                      {};
                    handleParameterChange('subscription', {
                      ...currentSub,
                      klines: checked,
                    });
                  }}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Data Method</Label>
            <Select
              value={
                ((parameters.subscription as { method?: string } | undefined)
                  ?.method || 'rest') as string
              }
              onValueChange={(value) => {
                const currentSub =
                  (parameters.subscription as Record<string, unknown>) || {};
                handleParameterChange('subscription', {
                  ...currentSub,
                  method: value,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rest">REST Polling</SelectItem>
                <SelectItem value="websocket">WebSocket Stream</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              REST is more stable, WebSocket provides lower latency
            </p>
          </div>
        </div>

        {/* Risk Factors Warning */}
        {strategyConfig.documentation?.riskFactors &&
          strategyConfig.documentation.riskFactors.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <h4 className="font-medium text-sm mb-2 text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                <AlertTriangleIcon className="h-4 w-4" />
                Risk Factors
              </h4>
              <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
                {strategyConfig.documentation.riskFactors.map((risk, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-yellow-600 mt-0.5">•</span>
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
      </CardContent>
    </Card>
  );
}
