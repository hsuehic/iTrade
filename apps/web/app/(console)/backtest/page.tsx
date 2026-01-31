'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  IconPlus,
  IconTrash,
  IconRefresh,
  IconChartLine,
  IconCalendar,
  IconTrendingUp,
  IconActivity,
  IconEye,
  IconChartHistogram,
  IconReportAnalytics,
  IconArrowUp,
  IconArrowDown,
  IconTarget,
  IconAlertTriangle,
  IconCheck,
} from '@tabler/icons-react';
import type { StrategyEntity } from '@itrade/data-manager';

import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  SUPPORTED_EXCHANGES,
  getTradingPairsForExchange,
  ExchangeId,
} from '@/lib/exchanges';

interface BacktestConfig {
  id: number;
  startDate: string;
  endDate: string;
  initialBalance: string;
  commission: string;
  slippage?: string;
  symbols: string[];
  timeframe: string;
  resultsCount?: number;
  bestResult?: BacktestResult;
  latestResult?: BacktestResult;
}

interface BacktestResult {
  id: number;
  totalReturn: string;
  annualizedReturn: string;
  sharpeRatio: string;
  maxDrawdown: string;
  winRate: string;
  profitFactor: string;
  totalTrades: number;
  avgTradeDuration: number;
  strategy?: StrategyEntity;
  createdAt: string;
}

interface BacktestTrade {
  id: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  entryTime: string;
  exitTime: string;
  pnl: string;
  commission: string;
  duration: number;
}

interface EquityPoint {
  timestamp: string;
  value: string;
}

export default function BacktestPage() {
  const t = useTranslations('backtest');
  const locale = useLocale();
  const [configs, setConfigs] = useState<BacktestConfig[]>([]);
  const [_strategies, setStrategies] = useState<StrategyEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<BacktestConfig | null>(null);
  const [selectedResult, setSelectedResult] = useState<BacktestResult | null>(null);
  const [resultTrades, setResultTrades] = useState<BacktestTrade[]>([]);
  const [_equityPoints, setEquityPoints] = useState<EquityPoint[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    initialBalance: '10000',
    commission: '0.001',
    slippage: '0.0005',
    exchange: 'coinbase' as ExchangeId,
    symbols: [] as string[],
    timeframe: '1h',
  });

  const fetchConfigs = useCallback(async () => {
    try {
      const response = await fetch('/api/backtest', { cache: 'no-store' });
      if (!response.ok) throw new Error(t('errors.fetchConfigs'));
      const data = await response.json();
      setConfigs(data.configs);
    } catch {
      toast.error(t('errors.loadConfigs'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchStrategies = useCallback(async () => {
    try {
      const response = await fetch('/api/strategies', { cache: 'no-store' });
      if (!response.ok) throw new Error(t('errors.fetchStrategies'));
      const data = await response.json();
      setStrategies(data.strategies);
    } catch {
      console.error(t('errors.fetchStrategies'));
    }
  }, [t]);

  useEffect(() => {
    fetchConfigs();
    fetchStrategies();
    // Set default dates
    const today = new Date();
    const oneMonthAgo = new Date(today);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    setFormData((prev) => ({
      ...prev,
      startDate: oneMonthAgo.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0],
    }));
  }, [fetchConfigs, fetchStrategies]);

  const createConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreating) return;

    if (formData.symbols.length === 0) {
      toast.error(t('errors.selectSymbol'));
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: formData.startDate,
          endDate: formData.endDate,
          initialBalance: formData.initialBalance,
          commission: formData.commission,
          slippage: formData.slippage,
          symbols: formData.symbols,
          timeframe: formData.timeframe,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('errors.createConfig'));
      }

      toast.success(t('messages.created'));
      setIsCreateDialogOpen(false);
      resetForm();
      fetchConfigs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.generic'));
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    const today = new Date();
    const oneMonthAgo = new Date(today);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    setFormData({
      startDate: oneMonthAgo.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0],
      initialBalance: '10000',
      commission: '0.001',
      slippage: '0.0005',
      exchange: 'coinbase' as ExchangeId,
      symbols: [],
      timeframe: '1h',
    });
  };

  const deleteConfig = async (id: number) => {
    if (isDeletingId === id) return;

    setIsDeletingId(id);
    try {
      const response = await fetch(`/api/backtest/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('errors.deleteConfig'));
      }

      toast.success(t('messages.deleted'));
      fetchConfigs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.deleteConfig'));
    } finally {
      setIsDeletingId(null);
    }
  };

  const viewConfigDetails = async (config: BacktestConfig) => {
    setSelectedConfig(config);
    setSelectedResult(config.bestResult || config.latestResult || null);
    setIsViewDialogOpen(true);

    // Fetch detailed results
    try {
      const response = await fetch(`/api/backtest/${config.id}?results=true`);
      if (response.ok) {
        const data = await response.json();
        setSelectedConfig(data.config);
      }
    } catch {
      console.error(t('errors.fetchDetails'));
    }
  };

  const _viewResultDetails = async (result: BacktestResult) => {
    setSelectedResult(result);
    setResultTrades([]);
    setEquityPoints([]);

    try {
      const response = await fetch(
        `/api/backtest/results/${result.id}?trades=true&equity=true`,
      );
      if (response.ok) {
        const data = await response.json();
        setResultTrades(data.result.trades || []);
        setEquityPoints(data.result.equity || []);
      }
    } catch {
      console.error(t('errors.fetchResultDetails'));
    }
  };

  const formatNumber = (value: string | number | undefined, decimals = 2) => {
    if (value === undefined || value === null) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '-';
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatPercent = (value: string | number | undefined) => {
    if (value === undefined || value === null) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '-';
    return `${(num * 100).toFixed(2)}%`;
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  const getMetricColor = (
    value: number,
    type: 'return' | 'sharpe' | 'drawdown' | 'winrate',
  ) => {
    switch (type) {
      case 'return':
        return value >= 0 ? 'text-green-600' : 'text-red-600';
      case 'sharpe':
        if (value >= 2) return 'text-green-600';
        if (value >= 1) return 'text-blue-600';
        if (value >= 0) return 'text-yellow-600';
        return 'text-red-600';
      case 'drawdown':
        if (value <= 0.05) return 'text-green-600';
        if (value <= 0.15) return 'text-yellow-600';
        return 'text-red-600';
      case 'winrate':
        if (value >= 0.6) return 'text-green-600';
        if (value >= 0.5) return 'text-blue-600';
        if (value >= 0.4) return 'text-yellow-600';
        return 'text-red-600';
      default:
        return '';
    }
  };

  const getMetricBadge = (value: number, type: string) => {
    let label = '';
    let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'outline';

    switch (type) {
      case 'sharpe':
        if (value >= 2) {
          label = t('badges.excellent');
          variant = 'default';
        } else if (value >= 1) {
          label = t('badges.good');
          variant = 'secondary';
        } else if (value >= 0) {
          label = t('badges.fair');
          variant = 'outline';
        } else {
          label = t('badges.poor');
          variant = 'destructive';
        }
        break;
      case 'drawdown':
        if (value <= 0.05) {
          label = t('badges.lowRisk');
          variant = 'default';
        } else if (value <= 0.15) {
          label = t('badges.moderate');
          variant = 'secondary';
        } else {
          label = t('badges.highRisk');
          variant = 'destructive';
        }
        break;
    }

    return label ? (
      <Badge variant={variant} className="ml-2 text-xs">
        {label}
      </Badge>
    ) : null;
  };

  // Calculate summary stats
  const totalConfigs = configs.length;
  const totalResults = configs.reduce((sum, c) => sum + (c.resultsCount || 0), 0);
  const profitableConfigs = configs.filter(
    (c) => c.bestResult && parseFloat(c.bestResult.totalReturn) > 0,
  ).length;

  const availablePairs = getTradingPairsForExchange(formData.exchange);

  return (
    <SidebarInset>
      <SiteHeader title={t('title')} />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            {/* Header */}
            <div className="flex justify-between items-start px-4 lg:px-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">{t('heading')}</h2>
                <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => fetchConfigs()}>
                  <IconRefresh className="h-4 w-4 mr-2" />
                  {t('actions.refresh')}
                </Button>
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="lg">
                      <IconPlus className="mr-2 h-4 w-4" />
                      {t('actions.new')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>{t('dialog.title')}</DialogTitle>
                      <DialogDescription>{t('dialog.description')}</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={createConfig} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="startDate">{t('fields.startDate')}</Label>
                          <Input
                            id="startDate"
                            type="date"
                            value={formData.startDate}
                            onChange={(e) =>
                              setFormData({ ...formData, startDate: e.target.value })
                            }
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="endDate">{t('fields.endDate')}</Label>
                          <Input
                            id="endDate"
                            type="date"
                            value={formData.endDate}
                            onChange={(e) =>
                              setFormData({ ...formData, endDate: e.target.value })
                            }
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="exchange">{t('fields.exchange')}</Label>
                        <Select
                          value={formData.exchange}
                          onValueChange={(value: ExchangeId) =>
                            setFormData({ ...formData, exchange: value, symbols: [] })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('fields.exchangePlaceholder')} />
                          </SelectTrigger>
                          <SelectContent>
                            {SUPPORTED_EXCHANGES.map((exchange) => (
                              <SelectItem key={exchange.id} value={exchange.id}>
                                {exchange.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>{t('fields.tradingPairs')}</Label>
                        <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                          {availablePairs.map((pair) => (
                            <label
                              key={pair.symbol}
                              className="flex items-center gap-2 cursor-pointer hover:bg-muted p-1 rounded"
                            >
                              <input
                                type="checkbox"
                                checked={formData.symbols.includes(pair.symbol)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData({
                                      ...formData,
                                      symbols: [...formData.symbols, pair.symbol],
                                    });
                                  } else {
                                    setFormData({
                                      ...formData,
                                      symbols: formData.symbols.filter(
                                        (s) => s !== pair.symbol,
                                      ),
                                    });
                                  }
                                }}
                                className="rounded"
                              />
                              <span className="text-sm font-medium">{pair.name}</span>
                              <span className="text-xs text-muted-foreground">
                                (
                                {pair.type === 'perpetual'
                                  ? t('pairTypes.perp')
                                  : t('pairTypes.spot')}
                                )
                              </span>
                            </label>
                          ))}
                        </div>
                        {formData.symbols.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {t('fields.selectedPairs', {
                              count: formData.symbols.length,
                            })}
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="initialBalance">
                            {t('fields.initialBalance')}
                          </Label>
                          <Input
                            id="initialBalance"
                            type="number"
                            step="100"
                            min="100"
                            value={formData.initialBalance}
                            onChange={(e) =>
                              setFormData({ ...formData, initialBalance: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="timeframe">{t('fields.timeframe')}</Label>
                          <Select
                            value={formData.timeframe}
                            onValueChange={(value) =>
                              setFormData({ ...formData, timeframe: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1m">{t('timeframes.1m')}</SelectItem>
                              <SelectItem value="5m">{t('timeframes.5m')}</SelectItem>
                              <SelectItem value="15m">{t('timeframes.15m')}</SelectItem>
                              <SelectItem value="30m">{t('timeframes.30m')}</SelectItem>
                              <SelectItem value="1h">{t('timeframes.1h')}</SelectItem>
                              <SelectItem value="4h">{t('timeframes.4h')}</SelectItem>
                              <SelectItem value="1d">{t('timeframes.1d')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="commission">{t('fields.commission')}</Label>
                          <Input
                            id="commission"
                            type="number"
                            step="0.0001"
                            min="0"
                            value={(parseFloat(formData.commission) * 100).toString()}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                commission: (parseFloat(e.target.value) / 100).toString(),
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="slippage">{t('fields.slippage')}</Label>
                          <Input
                            id="slippage"
                            type="number"
                            step="0.001"
                            min="0"
                            value={(parseFloat(formData.slippage) * 100).toString()}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                slippage: (parseFloat(e.target.value) / 100).toString(),
                              })
                            }
                          />
                        </div>
                      </div>

                      <Separator />
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setIsCreateDialogOpen(false);
                            resetForm();
                          }}
                        >
                          {t('actions.cancel')}
                        </Button>
                        <Button type="submit" disabled={isCreating}>
                          {isCreating ? (
                            <>
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                              {t('actions.creating')}
                            </>
                          ) : (
                            <>
                              <IconCheck className="h-4 w-4 mr-2" />
                              {t('actions.createConfig')}
                            </>
                          )}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-4 lg:px-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>{t('stats.configurations')}</CardDescription>
                  <CardTitle className="text-3xl">{totalConfigs}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconChartHistogram className="h-3 w-3" />
                    {t('stats.configurationsHelp')}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>{t('stats.totalRuns')}</CardDescription>
                  <CardTitle className="text-3xl">{totalResults}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconReportAnalytics className="h-3 w-3" />
                    {t('stats.totalRunsHelp')}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>{t('stats.profitable')}</CardDescription>
                  <CardTitle className="text-3xl text-green-600">
                    {profitableConfigs}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconTrendingUp className="h-3 w-3" />
                    {t('stats.profitableHelp')}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>{t('stats.successRate')}</CardDescription>
                  <CardTitle className="text-3xl">
                    {totalConfigs > 0
                      ? `${Math.round((profitableConfigs / totalConfigs) * 100)}%`
                      : '-'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconTarget className="h-3 w-3" />
                    {t('stats.successRateHelp')}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Configurations List */}
            <div className="px-4 lg:px-6">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center space-y-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                    <p className="text-sm text-muted-foreground">{t('states.loading')}</p>
                  </div>
                </div>
              ) : configs.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="rounded-full bg-muted p-4 mb-4">
                      <IconChartHistogram className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t('empty.title')}</h3>
                    <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
                      {t('empty.description')}
                    </p>
                    <Button onClick={() => setIsCreateDialogOpen(true)}>
                      <IconPlus className="mr-2 h-4 w-4" />
                      {t('empty.action')}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {configs.map((config) => (
                    <Card key={config.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              <IconCalendar className="h-4 w-4 text-muted-foreground" />
                              {new Date(config.startDate).toLocaleDateString(
                                locale,
                              )} - {new Date(config.endDate).toLocaleDateString(locale)}
                              <Badge variant="outline" className="ml-2">
                                {config.timeframe}
                              </Badge>
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {t('config.symbols', {
                                symbols: config.symbols.join(', '),
                              })}{' '}
                              •{' '}
                              {t('config.initial', {
                                amount: formatNumber(config.initialBalance),
                              })}{' '}
                              •{' '}
                              {t('config.runs', {
                                count: config.resultsCount || 0,
                              })}
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => viewConfigDetails(config)}
                            >
                              <IconEye className="h-4 w-4 mr-1" />
                              {t('actions.view')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteConfig(config.id)}
                              disabled={isDeletingId === config.id}
                              className="hover:bg-destructive hover:text-destructive-foreground"
                            >
                              {isDeletingId === config.id ? (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              ) : (
                                <IconTrash className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      {config.bestResult && (
                        <CardContent>
                          <div className="bg-muted/50 rounded-lg p-4">
                            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                              <IconTrendingUp className="h-3 w-3" />
                              {t('results.best')}{' '}
                              {config.bestResult.strategy &&
                                t('results.bestStrategy', {
                                  name: config.bestResult.strategy.name,
                                })}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                              <div>
                                <div className="text-xs text-muted-foreground">
                                  {t('metrics.totalReturn')}
                                </div>
                                <div
                                  className={`font-bold text-lg ${getMetricColor(
                                    parseFloat(config.bestResult.totalReturn),
                                    'return',
                                  )}`}
                                >
                                  {parseFloat(config.bestResult.totalReturn) >= 0
                                    ? '+'
                                    : ''}
                                  {formatPercent(config.bestResult.totalReturn)}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">
                                  {t('metrics.sharpeRatio')}
                                </div>
                                <div
                                  className={`font-bold text-lg ${getMetricColor(
                                    parseFloat(config.bestResult.sharpeRatio),
                                    'sharpe',
                                  )}`}
                                >
                                  {formatNumber(config.bestResult.sharpeRatio)}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">
                                  {t('metrics.maxDrawdown')}
                                </div>
                                <div
                                  className={`font-bold text-lg ${getMetricColor(
                                    parseFloat(config.bestResult.maxDrawdown),
                                    'drawdown',
                                  )}`}
                                >
                                  {formatPercent(config.bestResult.maxDrawdown)}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">
                                  {t('metrics.winRate')}
                                </div>
                                <div
                                  className={`font-bold text-lg ${getMetricColor(
                                    parseFloat(config.bestResult.winRate),
                                    'winrate',
                                  )}`}
                                >
                                  {formatPercent(config.bestResult.winRate)}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">
                                  {t('metrics.totalTrades')}
                                </div>
                                <div className="font-bold text-lg">
                                  {config.bestResult.totalTrades}
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Config Details Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconChartHistogram className="h-5 w-5" />
              {t('details.title')}
            </DialogTitle>
            <DialogDescription>
              {selectedConfig && (
                <>
                  {new Date(selectedConfig.startDate).toLocaleDateString(locale)} -{' '}
                  {new Date(selectedConfig.endDate).toLocaleDateString(locale)} •{' '}
                  {t('details.symbols', {
                    symbols: selectedConfig.symbols.join(', '),
                  })}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedConfig && (
            <Tabs defaultValue="results" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="results">{t('tabs.results')}</TabsTrigger>
                <TabsTrigger value="config">{t('tabs.configuration')}</TabsTrigger>
                <TabsTrigger value="analysis">{t('tabs.analysis')}</TabsTrigger>
              </TabsList>

              <TabsContent value="results" className="space-y-4">
                {/* Results Summary Cards */}
                {selectedResult && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>{t('metrics.totalReturn')}</CardDescription>
                        <CardTitle
                          className={`text-2xl flex items-center ${getMetricColor(
                            parseFloat(selectedResult.totalReturn),
                            'return',
                          )}`}
                        >
                          {parseFloat(selectedResult.totalReturn) >= 0 ? (
                            <IconArrowUp className="h-5 w-5 mr-1" />
                          ) : (
                            <IconArrowDown className="h-5 w-5 mr-1" />
                          )}
                          {formatPercent(selectedResult.totalReturn)}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>{t('metrics.sharpeRatio')}</CardDescription>
                        <CardTitle className="text-2xl flex items-center">
                          {formatNumber(selectedResult.sharpeRatio)}
                          {getMetricBadge(
                            parseFloat(selectedResult.sharpeRatio),
                            'sharpe',
                          )}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>{t('metrics.maxDrawdown')}</CardDescription>
                        <CardTitle className="text-2xl flex items-center">
                          <IconAlertTriangle
                            className={`h-5 w-5 mr-1 ${getMetricColor(
                              parseFloat(selectedResult.maxDrawdown),
                              'drawdown',
                            )}`}
                          />
                          {formatPercent(selectedResult.maxDrawdown)}
                          {getMetricBadge(
                            parseFloat(selectedResult.maxDrawdown),
                            'drawdown',
                          )}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>{t('metrics.winRate')}</CardDescription>
                        <CardTitle
                          className={`text-2xl ${getMetricColor(
                            parseFloat(selectedResult.winRate),
                            'winrate',
                          )}`}
                        >
                          {formatPercent(selectedResult.winRate)}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                  </div>
                )}

                {/* Trades Table */}
                {resultTrades.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{t('trades.title')}</CardTitle>
                      <CardDescription>
                        {t('trades.count', { count: resultTrades.length })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('trades.table.symbol')}</TableHead>
                            <TableHead>{t('trades.table.side')}</TableHead>
                            <TableHead className="text-right">
                              {t('trades.table.entry')}
                            </TableHead>
                            <TableHead className="text-right">
                              {t('trades.table.exit')}
                            </TableHead>
                            <TableHead className="text-right">
                              {t('trades.table.quantity')}
                            </TableHead>
                            <TableHead className="text-right">
                              {t('trades.table.pnl')}
                            </TableHead>
                            <TableHead className="text-right">
                              {t('trades.table.duration')}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {resultTrades.slice(0, 20).map((trade) => (
                            <TableRow key={trade.id}>
                              <TableCell className="font-medium">
                                {trade.symbol}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={trade.side === 'BUY' ? 'default' : 'secondary'}
                                  className={
                                    trade.side === 'BUY'
                                      ? 'bg-green-500/10 text-green-600'
                                      : 'bg-red-500/10 text-red-600'
                                  }
                                >
                                  {trade.side === 'BUY'
                                    ? t('trades.side.buy')
                                    : t('trades.side.sell')}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                ${formatNumber(trade.entryPrice)}
                              </TableCell>
                              <TableCell className="text-right">
                                ${formatNumber(trade.exitPrice)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatNumber(trade.quantity, 4)}
                              </TableCell>
                              <TableCell
                                className={`text-right ${
                                  parseFloat(trade.pnl) >= 0
                                    ? 'text-green-600'
                                    : 'text-red-600'
                                }`}
                              >
                                {parseFloat(trade.pnl) >= 0 ? '+' : ''}$
                                {formatNumber(trade.pnl)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatDuration(trade.duration)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {resultTrades.length > 20 && (
                        <div className="text-center py-2 text-sm text-muted-foreground">
                          {t('trades.showing', { count: resultTrades.length })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <IconChartLine className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">{t('trades.empty')}</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="config" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {t('configDetails.title')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t('configDetails.dateRange')}
                      </div>
                      <div className="font-medium">
                        {new Date(selectedConfig.startDate).toLocaleDateString(locale)} -{' '}
                        {new Date(selectedConfig.endDate).toLocaleDateString(locale)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t('configDetails.timeframe')}
                      </div>
                      <div className="font-medium">{selectedConfig.timeframe}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t('configDetails.initialBalance')}
                      </div>
                      <div className="font-medium">
                        ${formatNumber(selectedConfig.initialBalance)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t('configDetails.commission')}
                      </div>
                      <div className="font-medium">
                        {(parseFloat(selectedConfig.commission) * 100).toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t('configDetails.slippage')}
                      </div>
                      <div className="font-medium">
                        {selectedConfig.slippage
                          ? `${(parseFloat(selectedConfig.slippage) * 100).toFixed(2)}%`
                          : t('configDetails.notSet')}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t('configDetails.symbols')}
                      </div>
                      <div className="font-medium">
                        {selectedConfig.symbols.join(', ')}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="analysis" className="space-y-4">
                {selectedResult ? (
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">
                          {t('analysis.returnMetrics')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            {t('metrics.totalReturn')}
                          </span>
                          <span
                            className={`font-bold ${getMetricColor(
                              parseFloat(selectedResult.totalReturn),
                              'return',
                            )}`}
                          >
                            {formatPercent(selectedResult.totalReturn)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            {t('metrics.annualizedReturn')}
                          </span>
                          <span
                            className={`font-bold ${getMetricColor(
                              parseFloat(selectedResult.annualizedReturn),
                              'return',
                            )}`}
                          >
                            {formatPercent(selectedResult.annualizedReturn)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            {t('metrics.profitFactor')}
                          </span>
                          <span className="font-bold">
                            {formatNumber(selectedResult.profitFactor)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">
                          {t('analysis.riskMetrics')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            {t('metrics.sharpeRatio')}
                          </span>
                          <span
                            className={`font-bold ${getMetricColor(
                              parseFloat(selectedResult.sharpeRatio),
                              'sharpe',
                            )}`}
                          >
                            {formatNumber(selectedResult.sharpeRatio)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            {t('metrics.maxDrawdown')}
                          </span>
                          <span
                            className={`font-bold ${getMetricColor(
                              parseFloat(selectedResult.maxDrawdown),
                              'drawdown',
                            )}`}
                          >
                            {formatPercent(selectedResult.maxDrawdown)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            {t('metrics.winRate')}
                          </span>
                          <span
                            className={`font-bold ${getMetricColor(
                              parseFloat(selectedResult.winRate),
                              'winrate',
                            )}`}
                          >
                            {formatPercent(selectedResult.winRate)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="col-span-2">
                      <CardHeader>
                        <CardTitle className="text-base">
                          {t('analysis.tradingStats')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t('metrics.totalTrades')}
                          </span>
                          <span className="font-bold">{selectedResult.totalTrades}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t('analysis.avgTradeDuration')}
                          </span>
                          <span className="font-bold">
                            {formatDuration(selectedResult.avgTradeDuration)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t('analysis.winningTrades')}
                          </span>
                          <span className="font-bold text-green-600">
                            {Math.round(
                              selectedResult.totalTrades *
                                parseFloat(selectedResult.winRate),
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t('analysis.losingTrades')}
                          </span>
                          <span className="font-bold text-red-600">
                            {Math.round(
                              selectedResult.totalTrades *
                                (1 - parseFloat(selectedResult.winRate)),
                            )}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Performance Rating */}
                    <Card className="col-span-2">
                      <CardHeader>
                        <CardTitle className="text-base">
                          {t('analysis.performanceRating')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-sm">
                                {t('analysis.riskAdjustedReturn')}
                              </span>
                              <span className="text-sm font-medium">
                                {parseFloat(selectedResult.sharpeRatio) >= 2
                                  ? t('badges.excellent')
                                  : parseFloat(selectedResult.sharpeRatio) >= 1
                                    ? t('badges.good')
                                    : parseFloat(selectedResult.sharpeRatio) >= 0
                                      ? t('badges.fair')
                                      : t('badges.poor')}
                              </span>
                            </div>
                            <Progress
                              value={Math.min(
                                100,
                                (parseFloat(selectedResult.sharpeRatio) / 3) * 100,
                              )}
                              className="h-2"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-sm">
                                {t('analysis.winConsistency')}
                              </span>
                              <span className="text-sm font-medium">
                                {parseFloat(selectedResult.winRate) >= 0.6
                                  ? t('analysis.high')
                                  : parseFloat(selectedResult.winRate) >= 0.5
                                    ? t('analysis.moderate')
                                    : t('analysis.low')}
                              </span>
                            </div>
                            <Progress
                              value={parseFloat(selectedResult.winRate) * 100}
                              className="h-2"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-sm">{t('analysis.riskControl')}</span>
                              <span className="text-sm font-medium">
                                {parseFloat(selectedResult.maxDrawdown) <= 0.1
                                  ? t('badges.excellent')
                                  : parseFloat(selectedResult.maxDrawdown) <= 0.2
                                    ? t('badges.good')
                                    : t('analysis.needsImprovement')}
                              </span>
                            </div>
                            <Progress
                              value={Math.max(
                                0,
                                (1 - parseFloat(selectedResult.maxDrawdown)) * 100,
                              )}
                              className="h-2"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <IconActivity className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">{t('analysis.empty')}</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </SidebarInset>
  );
}
