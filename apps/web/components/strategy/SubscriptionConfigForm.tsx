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
import { IconSettings, IconBraces, IconForms } from '@tabler/icons-react';
import dynamic from 'next/dynamic';

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

interface SubscriptionConfig {
  ticker?: boolean;
  orderbook?: boolean | { enabled: boolean; depth: number };
  trades?: boolean;
  klines?: boolean | { enabled: boolean; interval: string };
  exchange?: string | string[];
  method?: 'rest' | 'websocket';
}

interface SubscriptionConfigFormProps {
  value: SubscriptionConfig;
  onChange: (config: SubscriptionConfig) => void;
}

export function SubscriptionConfigForm({ value, onChange }: SubscriptionConfigFormProps) {
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
            {/* Data Type Toggles */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm">Data Types</h4>
              <div className="grid grid-cols-2 gap-4">
                {/* Ticker Data */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Ticker Data</Label>
                    <Switch
                      checked={Boolean(value.ticker ?? true)}
                      onCheckedChange={(checked) => handleFormChange('ticker', checked)}
                    />
                  </div>
                </div>

                {/* Order Book */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Order Book</Label>
                    <Switch
                      checked={Boolean(value.orderbook ?? false)}
                      onCheckedChange={(checked) =>
                        handleFormChange(
                          'orderbook',
                          checked ? { enabled: true, depth: 20 } : false,
                        )
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
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5 levels</SelectItem>
                          <SelectItem value="10">10 levels</SelectItem>
                          <SelectItem value="20">20 levels</SelectItem>
                          <SelectItem value="50">50 levels</SelectItem>
                          <SelectItem value="100">100 levels</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Trades */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Trades</Label>
                    <Switch
                      checked={Boolean(value.trades ?? false)}
                      onCheckedChange={(checked) => handleFormChange('trades', checked)}
                    />
                  </div>
                </div>

                {/* Kline Data */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Kline Data</Label>
                    <Switch
                      checked={Boolean(value.klines ?? true)}
                      onCheckedChange={(checked) =>
                        handleFormChange(
                          'klines',
                          checked ? { enabled: true, interval: '15m' } : false,
                        )
                      }
                    />
                  </div>
                  {value.klines && (
                    <div className="mt-2">
                      <Label className="text-xs text-muted-foreground">Interval</Label>
                      <Select
                        value={
                          typeof value.klines === 'object'
                            ? value.klines.interval || '15m'
                            : '15m'
                        }
                        onValueChange={(v) =>
                          handleFormChange('klines', {
                            enabled: true,
                            interval: v,
                          })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1m">1 minute</SelectItem>
                          <SelectItem value="3m">3 minutes</SelectItem>
                          <SelectItem value="5m">5 minutes</SelectItem>
                          <SelectItem value="15m">15 minutes</SelectItem>
                          <SelectItem value="30m">30 minutes</SelectItem>
                          <SelectItem value="1h">1 hour</SelectItem>
                          <SelectItem value="2h">2 hours</SelectItem>
                          <SelectItem value="4h">4 hours</SelectItem>
                          <SelectItem value="6h">6 hours</SelectItem>
                          <SelectItem value="8h">8 hours</SelectItem>
                          <SelectItem value="12h">12 hours</SelectItem>
                          <SelectItem value="1d">1 day</SelectItem>
                          <SelectItem value="3d">3 days</SelectItem>
                          <SelectItem value="1w">1 week</SelectItem>
                          <SelectItem value="1M">1 month</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
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
                <SelectContent>
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
    "interval": "15m"
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
                  <strong>klines</strong>: Candlestick data with specified interval
                </li>
                <li>
                  <strong>orderbook</strong>: Order book depth updates
                </li>
                <li>
                  <strong>trades</strong>: Recent trades stream
                </li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
