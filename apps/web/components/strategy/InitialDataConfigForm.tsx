'use client';

import React, { useState } from 'react';
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
}: InitialDataConfigFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

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
          Pre-load historical data and account state when strategy starts (optional)
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Historical Kline Data */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Historical Kline Data</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addKlineConfig}
              disabled={disabled}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Kline Configuration
            </Button>
          </div>

          {(!value.klines || value.klines.length === 0) && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                No kline data configured. Click &ldquo;Add Kline Configuration&rdquo; to
                provide historical price data for your strategy.
              </AlertDescription>
            </Alert>
          )}

          {value.klines?.map((kline, index) => (
            <Card key={index} className="p-4 border-dashed">
              <div className="flex items-start gap-4">
                <div className="flex-1 space-y-2">
                  <Label>Interval</Label>
                  <Select
                    value={kline.interval}
                    onValueChange={(val) => updateKlineConfig(index, 'interval', val)}
                    disabled={disabled}
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
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={kline.limit}
                    onChange={(e) => updateKlineConfig(index, 'limit', e.target.value)}
                    disabled={disabled}
                    placeholder="e.g., 20"
                  />
                  <p className="text-xs text-muted-foreground">
                    Fetch latest {kline.limit} klines
                  </p>
                </div>

                <div className="pt-7">
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    onClick={() => removeKlineConfig(index)}
                    disabled={disabled}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Account Data */}
        <div className="space-y-4">
          <Label className="text-base font-semibold">Account Data</Label>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="fetchPositions" className="cursor-pointer">
                  Position Info
                </Label>
                <p className="text-sm text-muted-foreground">
                  Fetch current positions for the symbol (Perpetual/Futures)
                </p>
              </div>
              <Switch
                id="fetchPositions"
                checked={value.fetchPositions || false}
                onCheckedChange={(checked) =>
                  onChange({ ...value, fetchPositions: checked })
                }
                disabled={disabled}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="fetchOpenOrders" className="cursor-pointer">
                  Open Orders
                </Label>
                <p className="text-sm text-muted-foreground">
                  Fetch open orders for the current symbol
                </p>
              </div>
              <Switch
                id="fetchOpenOrders"
                checked={value.fetchOpenOrders || false}
                onCheckedChange={(checked) =>
                  onChange({ ...value, fetchOpenOrders: checked })
                }
                disabled={disabled}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="fetchBalance" className="cursor-pointer">
                  Account Balance
                </Label>
                <p className="text-sm text-muted-foreground">
                  Fetch balance information for all assets
                </p>
              </div>
              <Switch
                id="fetchBalance"
                checked={value.fetchBalance || false}
                onCheckedChange={(checked) =>
                  onChange({ ...value, fetchBalance: checked })
                }
                disabled={disabled}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="fetchAccountInfo" className="cursor-pointer">
                  Account Details
                </Label>
                <p className="text-sm text-muted-foreground">
                  Fetch complete account information
                </p>
              </div>
              <Switch
                id="fetchAccountInfo"
                checked={value.fetchAccountInfo || false}
                onCheckedChange={(checked) =>
                  onChange({ ...value, fetchAccountInfo: checked })
                }
                disabled={disabled}
              />
            </div>
          </div>
        </div>

        {/* Market Data Snapshot */}
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
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="fetchTicker" className="cursor-pointer">
                    Ticker Data
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Fetch latest price and 24h statistics
                  </p>
                </div>
                <Switch
                  id="fetchTicker"
                  checked={value.fetchTicker || false}
                  onCheckedChange={(checked) =>
                    onChange({ ...value, fetchTicker: checked })
                  }
                  disabled={disabled}
                />
              </div>

              <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="fetchOrderBook" className="cursor-pointer">
                      Order Book
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Fetch order book depth data
                    </p>
                  </div>
                  <Switch
                    id="fetchOrderBook"
                    checked={value.fetchOrderBook?.enabled || false}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...value,
                        fetchOrderBook: checked
                          ? { enabled: true, depth: 20 }
                          : undefined,
                      })
                    }
                    disabled={disabled}
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
                      disabled={disabled}
                      placeholder="e.g., 20"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Fetch {value.fetchOrderBook.depth || 20} levels for each side
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Help Tip */}
        <Alert className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-900">
            <strong>Tip:</strong> Initial data will be automatically loaded when the
            strategy starts. This is useful for strategies that need historical data for
            initialization (e.g., moving averages, RSI). If not configured, the strategy
            will start running from real-time data.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
