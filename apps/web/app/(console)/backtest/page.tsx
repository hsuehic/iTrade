'use client';

import { useState, useEffect, useCallback } from 'react';
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
      if (!response.ok) throw new Error('Failed to fetch configs');
      const data = await response.json();
      setConfigs(data.configs);
    } catch {
      toast.error('Failed to load backtest configurations');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStrategies = useCallback(async () => {
    try {
      const response = await fetch('/api/strategies', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch strategies');
      const data = await response.json();
      setStrategies(data.strategies);
    } catch {
      console.error('Failed to fetch strategies');
    }
  }, []);

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
      toast.error('Please select at least one trading pair');
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
        throw new Error(error.error || 'Failed to create config');
      }

      toast.success('Backtest configuration created successfully');
      setIsCreateDialogOpen(false);
      resetForm();
      fetchConfigs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An error occurred');
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
        throw new Error(error.error || 'Failed to delete config');
      }

      toast.success('Configuration deleted successfully');
      fetchConfigs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete config');
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
      console.error('Failed to fetch config details');
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
      console.error('Failed to fetch result details');
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
          label = 'Excellent';
          variant = 'default';
        } else if (value >= 1) {
          label = 'Good';
          variant = 'secondary';
        } else if (value >= 0) {
          label = 'Fair';
          variant = 'outline';
        } else {
          label = 'Poor';
          variant = 'destructive';
        }
        break;
      case 'drawdown':
        if (value <= 0.05) {
          label = 'Low Risk';
          variant = 'default';
        } else if (value <= 0.15) {
          label = 'Moderate';
          variant = 'secondary';
        } else {
          label = 'High Risk';
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
      <SiteHeader title="Strategy Backtesting" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            {/* Header */}
            <div className="flex justify-between items-start px-4 lg:px-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Backtesting</h2>
                <p className="text-muted-foreground mt-1">
                  Test your trading strategies against historical market data to validate
                  performance
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => fetchConfigs()}>
                  <IconRefresh className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="lg">
                      <IconPlus className="mr-2 h-4 w-4" />
                      New Backtest
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Create Backtest Configuration</DialogTitle>
                      <DialogDescription>
                        Configure a new backtest to evaluate strategy performance on
                        historical data
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={createConfig} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="startDate">Start Date</Label>
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
                          <Label htmlFor="endDate">End Date</Label>
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
                        <Label htmlFor="exchange">Exchange</Label>
                        <Select
                          value={formData.exchange}
                          onValueChange={(value: ExchangeId) =>
                            setFormData({ ...formData, exchange: value, symbols: [] })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select exchange" />
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
                        <Label>Trading Pairs</Label>
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
                                ({pair.type === 'perpetual' ? 'Perp' : 'Spot'})
                              </span>
                            </label>
                          ))}
                        </div>
                        {formData.symbols.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Selected: {formData.symbols.length} pair(s)
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="initialBalance">Initial Balance ($)</Label>
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
                          <Label htmlFor="timeframe">Timeframe</Label>
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
                              <SelectItem value="1m">1 Minute</SelectItem>
                              <SelectItem value="5m">5 Minutes</SelectItem>
                              <SelectItem value="15m">15 Minutes</SelectItem>
                              <SelectItem value="30m">30 Minutes</SelectItem>
                              <SelectItem value="1h">1 Hour</SelectItem>
                              <SelectItem value="4h">4 Hours</SelectItem>
                              <SelectItem value="1d">1 Day</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="commission">Commission (%)</Label>
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
                          <Label htmlFor="slippage">Slippage (%)</Label>
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
                          Cancel
                        </Button>
                        <Button type="submit" disabled={isCreating}>
                          {isCreating ? (
                            <>
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                              Creating...
                            </>
                          ) : (
                            <>
                              <IconCheck className="h-4 w-4 mr-2" />
                              Create Configuration
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
                  <CardDescription>Configurations</CardDescription>
                  <CardTitle className="text-3xl">{totalConfigs}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconChartHistogram className="h-3 w-3" />
                    Backtest configurations saved
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Runs</CardDescription>
                  <CardTitle className="text-3xl">{totalResults}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconReportAnalytics className="h-3 w-3" />
                    Backtest results generated
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Profitable</CardDescription>
                  <CardTitle className="text-3xl text-green-600">
                    {profitableConfigs}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconTrendingUp className="h-3 w-3" />
                    Configs with positive best result
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Success Rate</CardDescription>
                  <CardTitle className="text-3xl">
                    {totalConfigs > 0
                      ? `${Math.round((profitableConfigs / totalConfigs) * 100)}%`
                      : '-'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconTarget className="h-3 w-3" />
                    Percentage of profitable configs
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
                    <p className="text-sm text-muted-foreground">
                      Loading configurations...
                    </p>
                  </div>
                </div>
              ) : configs.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="rounded-full bg-muted p-4 mb-4">
                      <IconChartHistogram className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">
                      No backtest configurations yet
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
                      Create a backtest configuration to start testing your strategies
                      against historical market data.
                    </p>
                    <Button onClick={() => setIsCreateDialogOpen(true)}>
                      <IconPlus className="mr-2 h-4 w-4" />
                      Create Your First Backtest
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
                              {new Date(config.startDate).toLocaleDateString()} -{' '}
                              {new Date(config.endDate).toLocaleDateString()}
                              <Badge variant="outline" className="ml-2">
                                {config.timeframe}
                              </Badge>
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {config.symbols.join(', ')} • $
                              {formatNumber(config.initialBalance)} initial •{' '}
                              {config.resultsCount || 0} run(s)
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => viewConfigDetails(config)}
                            >
                              <IconEye className="h-4 w-4 mr-1" />
                              View
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
                              Best Result{' '}
                              {config.bestResult.strategy &&
                                `(${config.bestResult.strategy.name})`}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                              <div>
                                <div className="text-xs text-muted-foreground">
                                  Total Return
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
                                  Sharpe Ratio
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
                                  Max Drawdown
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
                                  Win Rate
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
                                  Total Trades
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
              Backtest Configuration
            </DialogTitle>
            <DialogDescription>
              {selectedConfig && (
                <>
                  {new Date(selectedConfig.startDate).toLocaleDateString()} -{' '}
                  {new Date(selectedConfig.endDate).toLocaleDateString()} •{' '}
                  {selectedConfig.symbols.join(', ')}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedConfig && (
            <Tabs defaultValue="results" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="results">Results</TabsTrigger>
                <TabsTrigger value="config">Configuration</TabsTrigger>
                <TabsTrigger value="analysis">Analysis</TabsTrigger>
              </TabsList>

              <TabsContent value="results" className="space-y-4">
                {/* Results Summary Cards */}
                {selectedResult && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Total Return</CardDescription>
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
                        <CardDescription>Sharpe Ratio</CardDescription>
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
                        <CardDescription>Max Drawdown</CardDescription>
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
                        <CardDescription>Win Rate</CardDescription>
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
                      <CardTitle className="text-base">Trade History</CardTitle>
                      <CardDescription>
                        {resultTrades.length} trades executed
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Symbol</TableHead>
                            <TableHead>Side</TableHead>
                            <TableHead className="text-right">Entry</TableHead>
                            <TableHead className="text-right">Exit</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">P&L</TableHead>
                            <TableHead className="text-right">Duration</TableHead>
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
                                  {trade.side}
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
                          Showing 20 of {resultTrades.length} trades
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <IconChartLine className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No trades recorded</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="config" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Backtest Parameters</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Date Range</div>
                      <div className="font-medium">
                        {new Date(selectedConfig.startDate).toLocaleDateString()} -{' '}
                        {new Date(selectedConfig.endDate).toLocaleDateString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Timeframe</div>
                      <div className="font-medium">{selectedConfig.timeframe}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Initial Balance</div>
                      <div className="font-medium">
                        ${formatNumber(selectedConfig.initialBalance)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Commission</div>
                      <div className="font-medium">
                        {(parseFloat(selectedConfig.commission) * 100).toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Slippage</div>
                      <div className="font-medium">
                        {selectedConfig.slippage
                          ? `${(parseFloat(selectedConfig.slippage) * 100).toFixed(2)}%`
                          : 'Not set'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Symbols</div>
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
                        <CardTitle className="text-base">Return Metrics</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Total Return</span>
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
                          <span className="text-muted-foreground">Annualized Return</span>
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
                          <span className="text-muted-foreground">Profit Factor</span>
                          <span className="font-bold">
                            {formatNumber(selectedResult.profitFactor)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Risk Metrics</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Sharpe Ratio</span>
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
                          <span className="text-muted-foreground">Max Drawdown</span>
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
                          <span className="text-muted-foreground">Win Rate</span>
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
                        <CardTitle className="text-base">Trading Statistics</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Trades</span>
                          <span className="font-bold">{selectedResult.totalTrades}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Avg Trade Duration
                          </span>
                          <span className="font-bold">
                            {formatDuration(selectedResult.avgTradeDuration)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Winning Trades</span>
                          <span className="font-bold text-green-600">
                            {Math.round(
                              selectedResult.totalTrades *
                                parseFloat(selectedResult.winRate),
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Losing Trades</span>
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
                        <CardTitle className="text-base">Performance Rating</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-sm">Risk-Adjusted Return</span>
                              <span className="text-sm font-medium">
                                {parseFloat(selectedResult.sharpeRatio) >= 2
                                  ? 'Excellent'
                                  : parseFloat(selectedResult.sharpeRatio) >= 1
                                    ? 'Good'
                                    : parseFloat(selectedResult.sharpeRatio) >= 0
                                      ? 'Fair'
                                      : 'Poor'}
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
                              <span className="text-sm">Win Consistency</span>
                              <span className="text-sm font-medium">
                                {parseFloat(selectedResult.winRate) >= 0.6
                                  ? 'High'
                                  : parseFloat(selectedResult.winRate) >= 0.5
                                    ? 'Moderate'
                                    : 'Low'}
                              </span>
                            </div>
                            <Progress
                              value={parseFloat(selectedResult.winRate) * 100}
                              className="h-2"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-sm">Risk Control</span>
                              <span className="text-sm font-medium">
                                {parseFloat(selectedResult.maxDrawdown) <= 0.1
                                  ? 'Excellent'
                                  : parseFloat(selectedResult.maxDrawdown) <= 0.2
                                    ? 'Good'
                                    : 'Needs Improvement'}
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
                      <p className="text-muted-foreground">No analysis data available</p>
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
