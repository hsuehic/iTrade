'use client';

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IconSettings, IconBraces, IconForms, IconInfoCircle } from '@tabler/icons-react';
import dynamic from 'next/dynamic';
import { SubscriptionConfig } from '@itrade/core';
import { SubscriptionRequirements } from '@itrade/strategies';
import { Alert, AlertDescription } from '@/components/ui/alert';

const JsonEditor = dynamic(
  () => import('@/components/json-editor').then((mod) => mod.JsonEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 flex items-center justify-center">Loading editor...</div>
    ),
  },
);

const SUPPORTED_EXCHANGES = [
  { id: 'binance', name: 'Binance' },
  { id: 'okx', name: 'OKX' },
  { id: 'coinbase', name: 'Coinbase' },
];

const KLINE_INTERVALS = [
  { value: '1m', label: '1 minute' },
  { value: '3m', label: '3 minutes' },
  { value: '5m', label: '5 minutes' },
  { value: '15m', label: '15 minutes' },
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '2h', label: '2 hours' },
  { value: '4h', label: '4 hours' },
  { value: '6h', label: '6 hours' },
  { value: '8h', label: '8 hours' },
  { value: '12h', label: '12 hours' },
  { value: '1d', label: '1 day' },
  { value: '3d', label: '3 days' },
  { value: '1w', label: '1 week' },
  { value: '1M', label: '1 month' },
];

interface SubscriptionConfigFormProps {
  value: SubscriptionConfig;
  onChange: (config: SubscriptionConfig) => void;
  // 🆕 Strategy-specific subscription requirements
  requirements?: SubscriptionRequirements;
}

export function SubscriptionConfigForm({
  value,
  onChange,
  requirements,
}: SubscriptionConfigFormProps) {
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleFormChange = (key: string, newValue: unknown) => {
    onChange({
      ...value,
      [key]: newValue,
    });
  };

  const handleJsonChange = (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      setJsonError(null);
      onChange(parsed);
    } catch (error) {
      setJsonError((error as Error).message);
    }
  };

  // 🆕 Get selected kline intervals (support both old single interval and new multiple intervals)
  const getSelectedIntervals = (): string[] => {
    if (!value.klines || typeof value.klines === 'boolean') return [];
    if (value.klines.intervals) return value.klines.intervals;
    if (value.klines.interval) return [value.klines.interval]; // Legacy support
    return [];
  };

  // 🆕 Update kline intervals
  const handleIntervalToggle = (interval: string, checked: boolean) => {
    const currentIntervals = getSelectedIntervals();
    let newIntervals: string[];

    if (checked) {
      newIntervals = [...currentIntervals, interval];
    } else {
      newIntervals = currentIntervals.filter((i) => i !== interval);
    }

    // If using multiple intervals or strategy allows it
    if (requirements?.klines?.allowMultipleIntervals || newIntervals.length > 1) {
      handleFormChange('klines', {
        enabled: true,
        intervals: newIntervals,
      });
    } else {
      // Single interval mode (legacy compatibility)
      handleFormChange('klines', {
        enabled: true,
        interval: newIntervals[0],
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconSettings className="h-5 w-5 text-blue-500" />
          Real-time Data Subscriptions
        </CardTitle>
        <CardDescription>
          Configure real-time market data subscriptions for your strategy (optional)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mode Toggle */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'form' | 'json')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="form" className="flex items-center gap-2">
              <IconForms className="h-4 w-4" />
              Form
            </TabsTrigger>
            <TabsTrigger value="json" className="flex items-center gap-2">
              <IconBraces className="h-4 w-4" />
              JSON
            </TabsTrigger>
          </TabsList>

          {/* Form Mode */}
          <TabsContent value="form" className="space-y-4 mt-4">
            {/* Strategy Requirements Info */}
            {requirements && (
              <Alert>
                <IconInfoCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  This strategy has specific subscription requirements. Required
                  subscriptions are marked.
                </AlertDescription>
              </Alert>
            )}

            {/* Data Type Toggles */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm">Data Types</h4>
              <div className="grid grid-cols-2 gap-4">
                {/* Ticker Data - Show if no requirements OR defined in requirements */}
                {(requirements === undefined || requirements.ticker !== undefined) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm flex items-center gap-1">
                        Ticker Data
                        {requirements?.ticker?.required && (
                          <span className="text-red-500">*</span>
                        )}
                      </Label>
                      <Switch
                        checked={Boolean(
                          value.ticker ?? (requirements?.ticker?.required || false),
                        )}
                        onCheckedChange={(checked) => handleFormChange('ticker', checked)}
                        disabled={
                          requirements?.ticker?.required ||
                          requirements?.ticker?.editable === false
                        }
                      />
                    </div>
                    {requirements?.ticker?.description && (
                      <p className="text-xs text-muted-foreground">
                        {requirements.ticker.description}
                      </p>
                    )}
                  </div>
                )}

                {/* Order Book - Show if no requirements OR defined in requirements */}
                {(requirements === undefined || requirements.orderbook !== undefined) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm flex items-center gap-1">
                        Order Book
                        {requirements?.orderbook?.required && (
                          <span className="text-red-500">*</span>
                        )}
                      </Label>
                      <Switch
                        checked={Boolean(
                          value.orderbook ?? (requirements?.orderbook?.required || false),
                        )}
                        onCheckedChange={(checked) =>
                          handleFormChange(
                            'orderbook',
                            checked
                              ? {
                                  enabled: true,
                                  depth: requirements?.orderbook?.defaultDepth || 20,
                                }
                              : false,
                          )
                        }
                        disabled={
                          requirements?.orderbook?.required ||
                          requirements?.orderbook?.editable === false
                        }
                      />
                    </div>
                    {value.orderbook && (
                      <div className="mt-2">
                        <Label className="text-xs text-muted-foreground">Depth</Label>
                        <Select
                          value={
                            typeof value.orderbook === 'object'
                              ? String(value.orderbook.depth || 20)
                              : '20'
                          }
                          onValueChange={(v) =>
                            handleFormChange('orderbook', {
                              enabled: true,
                              depth: Number(v),
                            })
                          }
                          disabled={requirements?.orderbook?.depthEditable === false}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent container={false}>
                            <SelectItem value="5">5 levels</SelectItem>
                            <SelectItem value="10">10 levels</SelectItem>
                            <SelectItem value="20">20 levels</SelectItem>
                            <SelectItem value="50">50 levels</SelectItem>
                            <SelectItem value="100">100 levels</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {requirements?.orderbook?.description && (
                      <p className="text-xs text-muted-foreground">
                        {requirements.orderbook.description}
                      </p>
                    )}
                  </div>
                )}

                {/* Trades - Show if no requirements OR defined in requirements */}
                {(requirements === undefined || requirements.trades !== undefined) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm flex items-center gap-1">
                        Trades
                        {requirements?.trades?.required && (
                          <span className="text-red-500">*</span>
                        )}
                      </Label>
                      <Switch
                        checked={Boolean(
                          value.trades ?? (requirements?.trades?.required || false),
                        )}
                        onCheckedChange={(checked) => handleFormChange('trades', checked)}
                        disabled={
                          requirements?.trades?.required ||
                          requirements?.trades?.editable === false
                        }
                      />
                    </div>
                    {requirements?.trades?.description && (
                      <p className="text-xs text-muted-foreground">
                        {requirements.trades.description}
                      </p>
                    )}
                  </div>
                )}

                {/* Kline Data - Show only if no requirements or klines is in requirements */}
                {(!requirements || requirements.klines !== undefined) && (
                  <div className="space-y-2 col-span-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm flex items-center gap-1">
                        Kline Data
                        {requirements?.klines?.required && (
                          <span className="text-red-500">*</span>
                        )}
                      </Label>
                      <Switch
                        checked={Boolean(
                          value.klines ?? (requirements?.klines?.required || false),
                        )}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            const defaultIntervals = requirements?.klines
                              ?.defaultIntervals || ['15m'];
                            handleFormChange('klines', {
                              enabled: true,
                              intervals: defaultIntervals,
                            });
                          } else {
                            handleFormChange('klines', false);
                          }
                        }}
                        disabled={requirements?.klines?.required}
                      />
                    </div>

                    {value.klines && (
                      <div className="mt-3 space-y-2">
                        {requirements?.klines?.description && (
                          <p className="text-xs text-muted-foreground">
                            {requirements.klines.description}
                          </p>
                        )}

                        {/* Fixed intervals (user cannot change) */}
                        {requirements?.klines?.fixedIntervals &&
                        requirements.klines.fixedIntervals.length > 0 ? (
                          <div className="border rounded-md p-3 bg-muted/30">
                            <Label className="text-xs text-muted-foreground mb-2 block">
                              Fixed Intervals (required by strategy)
                            </Label>
                            <div className="flex flex-wrap gap-2">
                              {requirements.klines.fixedIntervals.map((interval) => (
                                <div
                                  key={interval}
                                  className="px-2 py-1 bg-primary text-primary-foreground text-xs rounded"
                                >
                                  {KLINE_INTERVALS.find((i) => i.value === interval)
                                    ?.label || interval}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Selectable intervals */}
                            <Label className="text-xs text-muted-foreground">
                              Select Intervals
                              {requirements?.klines?.allowMultipleIntervals
                                ? ' (multiple allowed)'
                                : ' (select one)'}
                            </Label>
                            <div className="border rounded-md p-3 max-h-48 overflow-y-auto">
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {KLINE_INTERVALS.map((interval) => {
                                  const selectedIntervals = getSelectedIntervals();
                                  const isSelected = selectedIntervals.includes(
                                    interval.value,
                                  );

                                  return (
                                    <div
                                      key={interval.value}
                                      className="flex items-center space-x-2"
                                    >
                                      <Checkbox
                                        id={`interval-${interval.value}`}
                                        checked={isSelected}
                                        onCheckedChange={(checked) =>
                                          handleIntervalToggle(
                                            interval.value,
                                            Boolean(checked),
                                          )
                                        }
                                      />
                                      <label
                                        htmlFor={`interval-${interval.value}`}
                                        className="text-xs cursor-pointer flex-1"
                                      >
                                        {interval.label}
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Exchange Selection */}
            <div className="space-y-2">
              <Label className="text-sm">Subscribe to Exchanges</Label>
              <div className="space-y-2 border rounded-md p-3">
                <div className="text-xs text-muted-foreground mb-2">
                  Select which exchanges to subscribe to (leave all unchecked to use all)
                </div>
                {SUPPORTED_EXCHANGES.map((exchange) => {
                  const selectedExchanges = value.exchange
                    ? Array.isArray(value.exchange)
                      ? value.exchange
                      : [value.exchange]
                    : [];
                  const isSelected =
                    selectedExchanges.length === 0 ||
                    selectedExchanges.includes(exchange.id);

                  return (
                    <div key={exchange.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`sub-exchange-${exchange.id}`}
                        checked={isSelected && selectedExchanges.length > 0}
                        onCheckedChange={(checked) => {
                          let newExchanges: string[];
                          if (checked) {
                            if (selectedExchanges.length === 0) {
                              newExchanges = [exchange.id];
                            } else {
                              newExchanges = [...selectedExchanges, exchange.id];
                            }
                          } else {
                            newExchanges = selectedExchanges.filter(
                              (e) => e !== exchange.id,
                            );
                          }

                          handleFormChange(
                            'exchange',
                            newExchanges.length > 0 ? newExchanges : undefined,
                          );
                        }}
                      />
                      <label
                        htmlFor={`sub-exchange-${exchange.id}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {exchange.name}
                      </label>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                If no exchanges selected, will subscribe to all connected exchanges
              </p>
            </div>

            {/* Data Method */}
            <div className="space-y-2">
              <Label className="text-sm">Data Method</Label>
              <Select
                value={value.method || 'websocket'}
                onValueChange={(v) => handleFormChange('method', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={false}>
                  <SelectItem value="rest">REST Polling</SelectItem>
                  <SelectItem value="websocket">WebSocket Stream</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                REST is more stable, WebSocket provides lower latency
              </p>
            </div>
          </TabsContent>

          {/* JSON Mode */}
          <TabsContent value="json" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>JSON Configuration</Label>
              <JsonEditor
                value={JSON.stringify(value, null, 2)}
                onChange={handleJsonChange}
                minHeight="400px"
              />
              {jsonError && (
                <p className="text-xs text-red-500">Invalid JSON: {jsonError}</p>
              )}
            </div>

            <div className="rounded-lg bg-muted p-4">
              <h4 className="text-sm font-medium mb-2">Example Configuration</h4>
              <pre className="text-xs bg-background p-3 rounded overflow-x-auto">
                {`{
  "ticker": true,
  "klines": {
    "enabled": true,
    "intervals": ["15m", "1h"]
  },
  "orderbook": {
    "enabled": true,
    "depth": 20
  },
  "trades": false,
  "exchange": ["binance", "okx"],
  "method": "websocket"
}`}
              </pre>
            </div>

            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>Available subscription types:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>
                  <strong>ticker</strong>: Real-time price updates
                </li>
                <li>
                  <strong>klines</strong>: Candlestick data with specified intervals
                  (supports multiple)
                </li>
                <li>
                  <strong>orderbook</strong>: Order book depth updates
                </li>
                <li>
                  <strong>trades</strong>: Recent trades stream
                </li>
              </ul>
              <p className="mt-2">
                <strong>Note:</strong> Legacy single interval format{' '}
                <code>interval: &quot;15m&quot;</code> is still supported, but{' '}
                <code>intervals: [&quot;15m&quot;]</code> array format is recommended.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
