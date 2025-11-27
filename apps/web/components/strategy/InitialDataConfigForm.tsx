'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { InitialDataConfig as SystemInitialDataConfig } from '@itrade/core';
import { InitialDataRequirements } from '@itrade/strategies';

/**
 * UI-specific types for the form (array format for easier management)
 * The actual system uses object format: { "15m": 20, "1h": 10 }
 * Conversion happens in the parent component (strategy/page.tsx)
 */
export interface InitialKlineConfig {
  interval: string;
  limit: number;
}

export interface InitialDataConfig {
  klines?: InitialKlineConfig[]; // UI uses array format for easier form management
  fetchPositions?: boolean;
  fetchOpenOrders?: boolean;
  fetchBalance?: boolean;
  fetchAccountInfo?: boolean;
  fetchTicker?: boolean;
  fetchOrderBook?: {
    enabled: boolean;
    depth?: number;
  };
}

// Export the system type for reference
export type { SystemInitialDataConfig };

interface InitialDataConfigFormProps {
  value: InitialDataConfig;
  onChange: (config: InitialDataConfig) => void;
  disabled?: boolean;
  // 🆕 Strategy-specific initial data requirements
  requirements?: InitialDataRequirements;
}

const KLINE_INTERVALS = [
  { value: '1m', label: '1 minute' },
  { value: '5m', label: '5 minutes' },
  { value: '15m', label: '15 minutes' },
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '4h', label: '4 hours' },
  { value: '1d', label: '1 day' },
  { value: '1w', label: '1 week' },
];

export function InitialDataConfigForm({
  value,
  onChange,
  disabled = false,
  requirements,
}: InitialDataConfigFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 🆕 Auto-populate defaults from requirements on first render
  useEffect(() => {
    if (requirements && (!value.klines || value.klines.length === 0)) {
      // Auto-populate kline config from requirements
      if (requirements.klines?.defaultConfig) {
        const defaultKlines: InitialKlineConfig[] = Object.entries(
          requirements.klines.defaultConfig,
        ).map(([interval, limit]) => ({ interval, limit }));

        if (defaultKlines.length > 0) {
          onChange({ ...value, klines: defaultKlines });
        }
      }

      // Auto-enable required fields
      const updates: Partial<InitialDataConfig> = {};
      if (requirements.fetchPositions?.required) updates.fetchPositions = true;
      if (requirements.fetchOpenOrders?.required) updates.fetchOpenOrders = true;
      if (requirements.fetchBalance?.required) updates.fetchBalance = true;
      if (requirements.fetchAccountInfo?.required) updates.fetchAccountInfo = true;
      if (requirements.fetchTicker?.required) updates.fetchTicker = true;
      if (requirements.fetchOrderBook?.required) {
        updates.fetchOrderBook = {
          enabled: true,
          depth: requirements.fetchOrderBook.defaultDepth || 20,
        };
      }

      if (Object.keys(updates).length > 0) {
        onChange({ ...value, ...updates });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirements]); // Only run when requirements change (not value!)

  const addKlineConfig = () => {
    const newKlines = [...(value.klines || []), { interval: '15m', limit: 20 }];
    onChange({ ...value, klines: newKlines });
  };

  const updateKlineConfig = (
    index: number,
    field: 'interval' | 'limit',
    val: string | number,
  ) => {
    const newKlines = [...(value.klines || [])];
    if (field === 'interval') {
      newKlines[index].interval = val as string;
    } else {
      newKlines[index].limit = typeof val === 'string' ? parseInt(val, 10) : val;
    }
    onChange({ ...value, klines: newKlines });
  };

  const removeKlineConfig = (index: number) => {
    const newKlines = (value.klines || []).filter((_, i) => i !== index);
    onChange({ ...value, klines: newKlines.length > 0 ? newKlines : undefined });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="h-5 w-5 text-blue-500" />
          Initial Data Configuration
        </CardTitle>
        <CardDescription>
          Pre-load historical data and account state when strategy starts
          {requirements && ' (strategy has specific requirements)'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Strategy Requirements Info */}
        {requirements && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              This strategy has specific initial data requirements. Required fields are
              marked with <span className="text-red-500">*</span>
            </AlertDescription>
          </Alert>
        )}

        {/* Historical Kline Data */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold flex items-center gap-1">
              Historical Kline Data
              {requirements?.klines?.required && <span className="text-red-500">*</span>}
              {requirements?.klines?.allowMultipleIntervals !== false && (
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  (multiple intervals supported)
                </span>
              )}
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addKlineConfig}
              disabled={
                disabled ||
                (requirements?.klines?.allowMultipleIntervals === false &&
                  value.klines &&
                  value.klines.length >= 1)
              }
            >
              <Plus className="h-4 w-4 mr-1" />
              {requirements?.klines?.allowMultipleIntervals === false
                ? 'Add Kline Interval'
                : 'Add Kline Interval'}
            </Button>
          </div>

          {requirements?.klines?.description && (
            <p className="text-sm text-muted-foreground">
              {requirements.klines.description}
            </p>
          )}

          {(!value.klines || value.klines.length === 0) && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                {requirements?.klines?.required
                  ? 'Historical kline data is required for this strategy. Click "Add Kline Interval" to configure.'
                  : 'No kline data configured. Click "Add Kline Interval" to provide historical price data for your strategy.'}
                {requirements?.klines?.allowMultipleIntervals !== false && (
                  <span className="block mt-1">
                    💡 You can add multiple intervals for multi-timeframe analysis.
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {value.klines?.map((kline, index) => (
            <Card key={index} className="p-4 border-dashed">
              <div className="flex items-start gap-4">
                <div className="flex-1 space-y-2">
                  <Label className="flex items-center gap-2">
                    Interval
                    {requirements?.klines?.intervalsEditable === false && (
                      <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded">
                        Fixed
                      </span>
                    )}
                  </Label>
                  <Select
                    value={kline.interval}
                    onValueChange={(val) => updateKlineConfig(index, 'interval', val)}
                    disabled={
                      disabled || requirements?.klines?.intervalsEditable === false
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select interval" />
                    </SelectTrigger>
                    <SelectContent>
                      {KLINE_INTERVALS.map((interval) => (
                        <SelectItem key={interval.value} value={interval.value}>
                          {interval.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex-1 space-y-2">
                  <Label className="flex items-center gap-2">
                    Quantity
                    {requirements?.klines?.limitsEditable === false && (
                      <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">
                        Fixed: {kline.limit} bars
                      </span>
                    )}
                  </Label>
                  {requirements?.klines?.limitsEditable === false ? (
                    <div className="h-10 px-3 py-2 bg-muted rounded-md flex items-center text-muted-foreground">
                      {kline.limit} bars (required by strategy)
                    </div>
                  ) : (
                    <>
                      <Input
                        type="number"
                        min={1}
                        max={1000}
                        value={kline.limit}
                        onChange={(e) =>
                          updateKlineConfig(index, 'limit', e.target.value)
                        }
                        disabled={disabled}
                        placeholder="e.g., 20"
                      />
                      <p className="text-xs text-muted-foreground">
                        Fetch latest {kline.limit} klines
                      </p>
                    </>
                  )}
                </div>

                <div className="pt-7">
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    onClick={() => removeKlineConfig(index)}
                    disabled={disabled || requirements?.klines?.required}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Account Data - Only show section if any field is needed */}
        {(requirements === undefined ||
          requirements.fetchPositions !== undefined ||
          requirements.fetchOpenOrders !== undefined ||
          requirements.fetchBalance !== undefined ||
          requirements.fetchAccountInfo !== undefined) && (
          <div className="space-y-4">
            <Label className="text-base font-semibold">Account Data</Label>

            <div className="space-y-3">
              {/* Position Info - Show if no requirements OR defined in requirements */}
              {(requirements === undefined ||
                requirements.fetchPositions !== undefined) && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="space-y-0.5 flex-1">
                    <Label
                      htmlFor="fetchPositions"
                      className="cursor-pointer flex items-center gap-1"
                    >
                      Position Info
                      {requirements?.fetchPositions?.required && (
                        <span className="text-red-500">*</span>
                      )}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {requirements?.fetchPositions?.description ||
                        'Fetch current positions for the symbol (Perpetual/Futures)'}
                    </p>
                  </div>
                  <Switch
                    id="fetchPositions"
                    checked={
                      value.fetchPositions ||
                      requirements?.fetchPositions?.required ||
                      false
                    }
                    onCheckedChange={(checked) =>
                      onChange({ ...value, fetchPositions: checked })
                    }
                    disabled={
                      disabled ||
                      requirements?.fetchPositions?.required ||
                      requirements?.fetchPositions?.editable === false
                    }
                  />
                </div>
              )}

              {/* Open Orders - Show if no requirements OR defined in requirements */}
              {(requirements === undefined ||
                requirements.fetchOpenOrders !== undefined) && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="space-y-0.5 flex-1">
                    <Label
                      htmlFor="fetchOpenOrders"
                      className="cursor-pointer flex items-center gap-1"
                    >
                      Open Orders
                      {requirements?.fetchOpenOrders?.required && (
                        <span className="text-red-500">*</span>
                      )}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {requirements?.fetchOpenOrders?.description ||
                        'Fetch open orders for the current symbol'}
                    </p>
                  </div>
                  <Switch
                    id="fetchOpenOrders"
                    checked={
                      value.fetchOpenOrders ||
                      requirements?.fetchOpenOrders?.required ||
                      false
                    }
                    onCheckedChange={(checked) =>
                      onChange({ ...value, fetchOpenOrders: checked })
                    }
                    disabled={
                      disabled ||
                      requirements?.fetchOpenOrders?.required ||
                      requirements?.fetchOpenOrders?.editable === false
                    }
                  />
                </div>
              )}

              {/* Account Balance - Show if no requirements OR defined in requirements */}
              {(requirements === undefined ||
                requirements.fetchBalance !== undefined) && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="space-y-0.5 flex-1">
                    <Label
                      htmlFor="fetchBalance"
                      className="cursor-pointer flex items-center gap-1"
                    >
                      Account Balance
                      {requirements?.fetchBalance?.required && (
                        <span className="text-red-500">*</span>
                      )}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {requirements?.fetchBalance?.description ||
                        'Fetch balance information for all assets'}
                    </p>
                  </div>
                  <Switch
                    id="fetchBalance"
                    checked={
                      value.fetchBalance || requirements?.fetchBalance?.required || false
                    }
                    onCheckedChange={(checked) =>
                      onChange({ ...value, fetchBalance: checked })
                    }
                    disabled={
                      disabled ||
                      requirements?.fetchBalance?.required ||
                      requirements?.fetchBalance?.editable === false
                    }
                  />
                </div>
              )}

              {/* Account Details - Show if no requirements OR defined in requirements */}
              {(requirements === undefined ||
                requirements.fetchAccountInfo !== undefined) && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="space-y-0.5 flex-1">
                    <Label
                      htmlFor="fetchAccountInfo"
                      className="cursor-pointer flex items-center gap-1"
                    >
                      Account Details
                      {requirements?.fetchAccountInfo?.required && (
                        <span className="text-red-500">*</span>
                      )}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {requirements?.fetchAccountInfo?.description ||
                        'Fetch complete account information'}
                    </p>
                  </div>
                  <Switch
                    id="fetchAccountInfo"
                    checked={
                      value.fetchAccountInfo ||
                      requirements?.fetchAccountInfo?.required ||
                      false
                    }
                    onCheckedChange={(checked) =>
                      onChange({ ...value, fetchAccountInfo: checked })
                    }
                    disabled={
                      disabled ||
                      requirements?.fetchAccountInfo?.required ||
                      requirements?.fetchAccountInfo?.editable === false
                    }
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Market Data Snapshot - Only show if any field is needed */}
        {(requirements === undefined ||
          requirements.fetchTicker !== undefined ||
          requirements.fetchOrderBook !== undefined) && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Market Data Snapshot</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? 'Hide' : 'Show'} Advanced Options
              </Button>
            </div>

            {showAdvanced && (
              <div className="space-y-3">
                {/* Ticker Data - Show if no requirements OR defined in requirements */}
                {(requirements === undefined ||
                  requirements.fetchTicker !== undefined) && (
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="space-y-0.5 flex-1">
                      <Label
                        htmlFor="fetchTicker"
                        className="cursor-pointer flex items-center gap-1"
                      >
                        Ticker Data
                        {requirements?.fetchTicker?.required && (
                          <span className="text-red-500">*</span>
                        )}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {requirements?.fetchTicker?.description ||
                          'Fetch latest price and 24h statistics'}
                      </p>
                    </div>
                    <Switch
                      id="fetchTicker"
                      checked={
                        value.fetchTicker || requirements?.fetchTicker?.required || false
                      }
                      onCheckedChange={(checked) =>
                        onChange({ ...value, fetchTicker: checked })
                      }
                      disabled={
                        disabled ||
                        requirements?.fetchTicker?.required ||
                        requirements?.fetchTicker?.editable === false
                      }
                    />
                  </div>
                )}

                {/* Order Book - Show if no requirements OR defined in requirements */}
                {(requirements === undefined ||
                  requirements.fetchOrderBook !== undefined) && (
                  <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 flex-1">
                        <Label
                          htmlFor="fetchOrderBook"
                          className="cursor-pointer flex items-center gap-1"
                        >
                          Order Book
                          {requirements?.fetchOrderBook?.required && (
                            <span className="text-red-500">*</span>
                          )}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {requirements?.fetchOrderBook?.description ||
                            'Fetch order book depth data'}
                        </p>
                      </div>
                      <Switch
                        id="fetchOrderBook"
                        checked={
                          value.fetchOrderBook?.enabled ||
                          requirements?.fetchOrderBook?.required ||
                          false
                        }
                        onCheckedChange={(checked) =>
                          onChange({
                            ...value,
                            fetchOrderBook: checked
                              ? {
                                  enabled: true,
                                  depth: requirements?.fetchOrderBook?.defaultDepth || 20,
                                }
                              : undefined,
                          })
                        }
                        disabled={
                          disabled ||
                          requirements?.fetchOrderBook?.required ||
                          requirements?.fetchOrderBook?.editable === false
                        }
                      />
                    </div>

                    {value.fetchOrderBook?.enabled && (
                      <div>
                        <Label htmlFor="orderBookDepth">Depth</Label>
                        <Input
                          id="orderBookDepth"
                          type="number"
                          min={5}
                          max={100}
                          value={value.fetchOrderBook.depth || 20}
                          onChange={(e) =>
                            onChange({
                              ...value,
                              fetchOrderBook: {
                                enabled: true,
                                depth: parseInt(e.target.value, 10),
                              },
                            })
                          }
                          disabled={
                            disabled ||
                            requirements?.fetchOrderBook?.depthEditable === false
                          }
                          placeholder="e.g., 20"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Fetch {value.fetchOrderBook.depth || 20} levels for each side
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Help Tip */}
        <Alert className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-900">
            <strong>Tip:</strong> Initial data will be automatically loaded when the
            strategy starts. This is useful for strategies that need historical data for
            initialization (e.g., moving averages, RSI). If not configured, the strategy
            will start running from real-time data.
            <div className="mt-2">
              <strong>Multiple Intervals:</strong> You can load klines from multiple
              timeframes (e.g., 15m + 1h + 4h) for multi-timeframe analysis. Each interval
              can have a different number of bars.
            </div>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
