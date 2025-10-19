'use client';

import { useState, useEffect } from 'react';
import { InfoIcon, AlertTriangleIcon } from 'lucide-react';
import {
  getStrategyConfig,
  getStrategyDefaultParameters,
  type StrategyTypeKey,
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

interface SubscriptionConfig {
  ticker?: boolean;
  klines?: boolean;
  method?: 'rest' | 'websocket';
}

interface StrategyParameterFormSimpleProps {
  strategyType: StrategyTypeKey;
  initialParameters?: Record<string, unknown>;
  onParametersChange: (parameters: Record<string, unknown>) => void;
}

export function StrategyParameterFormSimple({
  strategyType,
  initialParameters = {},
  onParametersChange,
}: StrategyParameterFormSimpleProps) {
  const strategyConfig = getStrategyConfig(strategyType);
  const defaultParameters = getStrategyDefaultParameters(strategyType);

  const [parameters, setParameters] = useState<Record<string, unknown>>(() => {
    return {
      ...defaultParameters,
      ...initialParameters,
    };
  });

  useEffect(() => {
    const newDefaultParameters = getStrategyDefaultParameters(strategyType);
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

  const renderMovingAverageParams = () => (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fastPeriod">
            Fast Period <span className="text-red-500">*</span>
          </Label>
          <Input
            type="number"
            value={(parameters.fastPeriod as number) || 12}
            onChange={(e) => handleParameterChange('fastPeriod', Number(e.target.value))}
            min={2}
            max={100}
          />
          <p className="text-xs text-muted-foreground">
            Short-term moving average period (default: 12)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="slowPeriod">
            Slow Period <span className="text-red-500">*</span>
          </Label>
          <Input
            type="number"
            value={(parameters.slowPeriod as number) || 26}
            onChange={(e) => handleParameterChange('slowPeriod', Number(e.target.value))}
            min={3}
            max={200}
          />
          <p className="text-xs text-muted-foreground">
            Long-term moving average period (default: 26)
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="threshold">Signal Threshold</Label>
        <Input
          type="number"
          value={(parameters.threshold as number) || 0.001}
          onChange={(e) => handleParameterChange('threshold', Number(e.target.value))}
          min={0}
          max={0.1}
          step={0.001}
        />
        <p className="text-xs text-muted-foreground">
          Minimum crossover threshold (0.001 = 0.1%, default: 0.001)
        </p>
      </div>
    </div>
  );

  const renderRSIParams = () => (
    <div className="grid gap-4">
      <div className="space-y-2">
        <Label htmlFor="period">
          RSI Period <span className="text-red-500">*</span>
        </Label>
        <Input
          type="number"
          value={(parameters.period as number) || 14}
          onChange={(e) => handleParameterChange('period', Number(e.target.value))}
          min={2}
          max={50}
        />
        <p className="text-xs text-muted-foreground">
          RSI calculation period (default: 14)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="overboughtLevel">Overbought Level</Label>
          <Input
            type="number"
            value={(parameters.overboughtLevel as number) || 70}
            onChange={(e) =>
              handleParameterChange('overboughtLevel', Number(e.target.value))
            }
            min={50}
            max={95}
          />
          <p className="text-xs text-muted-foreground">
            Sell signal threshold (default: 70)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="oversoldLevel">Oversold Level</Label>
          <Input
            type="number"
            value={(parameters.oversoldLevel as number) || 30}
            onChange={(e) =>
              handleParameterChange('oversoldLevel', Number(e.target.value))
            }
            min={5}
            max={50}
          />
          <p className="text-xs text-muted-foreground">
            Buy signal threshold (default: 30)
          </p>
        </div>
      </div>
    </div>
  );

  const renderCustomParams = () => (
    <div className="space-y-4">
      <div className="text-center py-8 text-muted-foreground">
        <p>Custom strategy parameters can be configured in JSON mode</p>
        <p className="text-xs mt-2">Switch to JSON mode for advanced configuration</p>
      </div>
    </div>
  );

  const renderParametersByType = () => {
    switch (strategyType) {
      case 'moving_average':
        return renderMovingAverageParams();
      case 'rsi':
        return renderRSIParams();
      case 'custom':
        return renderCustomParams();
      default:
        return (
          <div className="text-center py-8 text-muted-foreground">
            <p>Parameter form for {strategyConfig.name} is coming soon</p>
            <p className="text-xs mt-2">Please use JSON mode for now</p>
          </div>
        );
    }
  };

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
        {strategyConfig.documentation?.overview && (
          <div className="bg-muted/30 p-4 rounded-lg">
            <h4 className="font-medium text-sm mb-2">Strategy Overview</h4>
            <p className="text-sm text-muted-foreground">
              {strategyConfig.documentation.overview}
            </p>
          </div>
        )}

        <div className="space-y-4">
          <h4 className="font-medium text-sm">Configuration Parameters</h4>
          {renderParametersByType()}
        </div>

        {/* 订阅设置 */}
        <div className="space-y-4 border-t pt-4">
          <h4 className="font-medium text-sm">Market Data Subscription</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Ticker Data</Label>
                <InfoIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              <Switch
                checked={Boolean((parameters.subscription as SubscriptionConfig)?.ticker)}
                onCheckedChange={(checked: boolean) => {
                  const currentSub =
                    (parameters.subscription as SubscriptionConfig) || {};
                  handleParameterChange('subscription', {
                    ...currentSub,
                    ticker: checked,
                  });
                }}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Kline Data</Label>
                <InfoIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              <Switch
                checked={Boolean((parameters.subscription as SubscriptionConfig)?.klines)}
                onCheckedChange={(checked: boolean) => {
                  const currentSub =
                    (parameters.subscription as SubscriptionConfig) || {};
                  handleParameterChange('subscription', {
                    ...currentSub,
                    klines: checked,
                  });
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Data Method</Label>
            <Select
              value={(parameters.subscription as SubscriptionConfig)?.method || 'rest'}
              onValueChange={(value) => {
                const currentSub = (parameters.subscription as SubscriptionConfig) || {};
                handleParameterChange('subscription', {
                  ...currentSub,
                  method: value as 'rest' | 'websocket',
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

        {/* 风险警告 */}
        {strategyConfig.documentation?.riskFactors &&
          strategyConfig.documentation.riskFactors.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <h4 className="font-medium text-sm mb-2 text-yellow-800 dark:text-yellow-200">
                ⚠️ Risk Factors
              </h4>
              <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
                {strategyConfig.documentation.riskFactors.map(
                  (risk: string, index: number) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-yellow-600 mt-0.5">•</span>
                      <span>{risk}</span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}
      </CardContent>
    </Card>
  );
}
