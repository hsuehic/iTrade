'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  IconPlus,
  IconPlayerPlay,
  IconPlayerStop,
  IconTrash,
  IconRefresh,
  IconChartLine,
  IconClock,
  IconTrendingUp,
  IconActivity,
  IconEye,
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
import { Textarea } from '@/components/ui/textarea';
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

interface DryRunSession {
  id: number;
  name?: string;
  status: 'running' | 'completed' | 'failed' | 'canceled';
  strategy?: StrategyEntity;
  parametersSnapshot?: Record<string, unknown>;
  startTime: string;
  endTime?: string;
  symbols?: string[];
  timeframe?: string;
  initialBalance: string;
  commission: string;
  slippage?: string;
  notes?: string;
  tradesCount?: number;
  totalPnL?: string;
  latestResult?: {
    totalReturn: string;
    annualizedReturn: string;
    sharpeRatio: string;
    maxDrawdown: string;
    winRate: string;
    profitFactor: string;
    totalTrades: number;
    avgTradeDuration: number;
  };
  createdAt: string;
}

interface DryRunTrade {
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

export default function DryRunPage() {
  const [sessions, setSessions] = useState<DryRunSession[]>([]);
  const [strategies, setStrategies] = useState<StrategyEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<DryRunSession | null>(null);
  const [sessionTrades, setSessionTrades] = useState<DryRunTrade[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdatingId, setIsUpdatingId] = useState<number | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    strategyId: '',
    name: '',
    initialBalance: '10000',
    commission: '0.001',
    slippage: '0.0005',
    notes: '',
  });

  const fetchSessions = useCallback(async () => {
    try {
      const response = await fetch('/api/dry-run', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch sessions');
      const data = await response.json();
      setSessions(data.sessions);
    } catch {
      toast.error('Failed to load dry run sessions');
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
    fetchSessions();
    fetchStrategies();
  }, [fetchSessions, fetchStrategies]);

  const createSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreating) return;

    setIsCreating(true);
    try {
      const response = await fetch('/api/dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          strategyId: formData.strategyId ? parseInt(formData.strategyId, 10) : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create session');
      }

      toast.success('Dry run session created successfully');
      setIsCreateDialogOpen(false);
      resetForm();
      fetchSessions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setFormData({
      strategyId: '',
      name: '',
      initialBalance: '10000',
      commission: '0.001',
      slippage: '0.0005',
      notes: '',
    });
  };

  const updateSessionStatus = async (id: number, action: string) => {
    if (isUpdatingId === id) return;

    setIsUpdatingId(id);
    try {
      const response = await fetch(`/api/dry-run/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update status');
      }

      toast.success(`Session ${action === 'stop' ? 'stopped' : action} successfully`);
      fetchSessions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update status');
    } finally {
      setIsUpdatingId(null);
    }
  };

  const deleteSession = async (id: number) => {
    if (isDeletingId === id) return;

    setIsDeletingId(id);
    try {
      const response = await fetch(`/api/dry-run/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete session');
      }

      toast.success('Session deleted successfully');
      fetchSessions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete session');
    } finally {
      setIsDeletingId(null);
    }
  };

  const viewSessionDetails = async (session: DryRunSession) => {
    setSelectedSession(session);
    setIsViewDialogOpen(true);

    // Fetch detailed data
    try {
      const response = await fetch(`/api/dry-run/${session.id}?trades=true&results=true`);
      if (response.ok) {
        const data = await response.json();
        setSelectedSession(data.session);
        setSessionTrades(data.session.trades || []);
      }
    } catch {
      console.error('Failed to fetch session details');
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> =
      {
        running: 'default',
        completed: 'secondary',
        failed: 'destructive',
        canceled: 'outline',
      };
    const colors: Record<string, string> = {
      running: 'bg-green-500/10 text-green-600 border-green-500/20',
      completed: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      failed: 'bg-red-500/10 text-red-600 border-red-500/20',
      canceled: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
    };
    return (
      <Badge variant={variants[status] || 'default'} className={colors[status]}>
        {status === 'running' && (
          <span className="mr-1 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        )}
        {status.toUpperCase()}
      </Badge>
    );
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

  // Calculate summary stats
  const runningCount = sessions.filter((s) => s.status === 'running').length;
  const completedCount = sessions.filter((s) => s.status === 'completed').length;
  const totalSessions = sessions.length;

  return (
    <SidebarInset>
      <SiteHeader title="Paper Trading (Dry Run)" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            {/* Header */}
            <div className="flex justify-between items-start px-4 lg:px-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Paper Trading</h2>
                <p className="text-muted-foreground mt-1">
                  Test your strategies with real-time market data without risking real
                  capital
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => fetchSessions()}>
                  <IconRefresh className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="lg">
                      <IconPlus className="mr-2 h-4 w-4" />
                      New Session
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Create Paper Trading Session</DialogTitle>
                      <DialogDescription>
                        Start a new paper trading session to test your strategy with
                        simulated capital
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={createSession} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="strategy">Strategy (Optional)</Label>
                        <Select
                          value={formData.strategyId}
                          onValueChange={(value) =>
                            setFormData({ ...formData, strategyId: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a strategy to test" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">No strategy (manual trading)</SelectItem>
                            {strategies.map((strategy) => (
                              <SelectItem
                                key={strategy.id}
                                value={strategy.id.toString()}
                              >
                                {strategy.name} ({strategy.type})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="name">Session Name</Label>
                        <Input
                          id="name"
                          placeholder="e.g., BTC Strategy Test"
                          value={formData.name}
                          onChange={(e) =>
                            setFormData({ ...formData, name: e.target.value })
                          }
                        />
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

                      <div className="space-y-2">
                        <Label htmlFor="notes">Notes</Label>
                        <Textarea
                          id="notes"
                          placeholder="Add any notes about this test session..."
                          value={formData.notes}
                          onChange={(e) =>
                            setFormData({ ...formData, notes: e.target.value })
                          }
                          rows={3}
                        />
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
                              <IconPlayerPlay className="h-4 w-4 mr-2" />
                              Start Session
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
                  <CardDescription>Total Sessions</CardDescription>
                  <CardTitle className="text-3xl">{totalSessions}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconChartLine className="h-3 w-3" />
                    All time paper trading sessions
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Running</CardDescription>
                  <CardTitle className="text-3xl text-green-600">
                    {runningCount}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconActivity className="h-3 w-3" />
                    Active sessions in progress
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Completed</CardDescription>
                  <CardTitle className="text-3xl text-blue-600">
                    {completedCount}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconClock className="h-3 w-3" />
                    Finished sessions with results
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Success Rate</CardDescription>
                  <CardTitle className="text-3xl">
                    {completedCount > 0
                      ? `${Math.round(
                          (sessions.filter(
                            (s) =>
                              s.status === 'completed' &&
                              parseFloat(s.latestResult?.totalReturn || '0') > 0,
                          ).length /
                            completedCount) *
                            100,
                        )}%`
                      : '-'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconTrendingUp className="h-3 w-3" />
                    Sessions with positive returns
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sessions List */}
            <div className="px-4 lg:px-6">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center space-y-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                    <p className="text-sm text-muted-foreground">Loading sessions...</p>
                  </div>
                </div>
              ) : sessions.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="rounded-full bg-muted p-4 mb-4">
                      <IconChartLine className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">
                      No paper trading sessions yet
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
                      Start a paper trading session to test your strategies with simulated
                      capital using real market data.
                    </p>
                    <Button onClick={() => setIsCreateDialogOpen(true)}>
                      <IconPlus className="mr-2 h-4 w-4" />
                      Create Your First Session
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {sessions.map((session) => (
                    <Card key={session.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              {session.name || `Session #${session.id}`}
                              {getStatusBadge(session.status)}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {session.strategy ? (
                                <>
                                  Strategy:{' '}
                                  <span className="font-medium">
                                    {session.strategy.name}
                                  </span>
                                  {' • '}
                                </>
                              ) : (
                                'Manual trading • '
                              )}
                              Started {new Date(session.startTime).toLocaleString()}
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            {session.status === 'running' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => updateSessionStatus(session.id, 'stop')}
                                disabled={isUpdatingId === session.id}
                              >
                                {isUpdatingId === session.id ? (
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                ) : (
                                  <IconPlayerStop className="h-4 w-4" />
                                )}
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => viewSessionDetails(session)}
                              >
                                <IconEye className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteSession(session.id)}
                              disabled={
                                isDeletingId === session.id ||
                                session.status === 'running'
                              }
                              className="hover:bg-destructive hover:text-destructive-foreground"
                            >
                              {isDeletingId === session.id ? (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              ) : (
                                <IconTrash className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                          <div>
                            <div className="text-xs text-muted-foreground">
                              Initial Balance
                            </div>
                            <div className="font-medium">
                              ${formatNumber(session.initialBalance)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Trades</div>
                            <div className="font-medium">{session.tradesCount || 0}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Total P&L</div>
                            <div
                              className={`font-medium ${
                                parseFloat(session.totalPnL || '0') >= 0
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {parseFloat(session.totalPnL || '0') >= 0 ? '+' : ''}$
                              {formatNumber(session.totalPnL)}
                            </div>
                          </div>
                          {session.latestResult && (
                            <>
                              <div>
                                <div className="text-xs text-muted-foreground">
                                  Return
                                </div>
                                <div
                                  className={`font-medium ${
                                    parseFloat(session.latestResult.totalReturn) >= 0
                                      ? 'text-green-600'
                                      : 'text-red-600'
                                  }`}
                                >
                                  {formatPercent(session.latestResult.totalReturn)}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">
                                  Win Rate
                                </div>
                                <div className="font-medium">
                                  {formatPercent(session.latestResult.winRate)}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">
                                  Max Drawdown
                                </div>
                                <div className="font-medium text-orange-600">
                                  {formatPercent(session.latestResult.maxDrawdown)}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Session Details Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  {selectedSession?.name || `Session #${selectedSession?.id}`}
                  {selectedSession && getStatusBadge(selectedSession.status)}
                </DialogTitle>
                <DialogDescription>
                  {selectedSession?.strategy
                    ? `Strategy: ${selectedSession.strategy.name}`
                    : 'Manual trading session'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedSession && (
            <Tabs defaultValue="overview" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="trades">Trades</TabsTrigger>
                <TabsTrigger value="metrics">Metrics</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                {/* Performance Summary */}
                {selectedSession.latestResult && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Total Return</CardDescription>
                        <CardTitle
                          className={`text-2xl ${
                            parseFloat(selectedSession.latestResult.totalReturn) >= 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {formatPercent(selectedSession.latestResult.totalReturn)}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Win Rate</CardDescription>
                        <CardTitle className="text-2xl">
                          {formatPercent(selectedSession.latestResult.winRate)}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Sharpe Ratio</CardDescription>
                        <CardTitle className="text-2xl">
                          {formatNumber(selectedSession.latestResult.sharpeRatio)}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Max Drawdown</CardDescription>
                        <CardTitle className="text-2xl text-orange-600">
                          {formatPercent(selectedSession.latestResult.maxDrawdown)}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                  </div>
                )}

                {/* Session Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Session Information</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Start Time</div>
                      <div className="font-medium">
                        {new Date(selectedSession.startTime).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">End Time</div>
                      <div className="font-medium">
                        {selectedSession.endTime
                          ? new Date(selectedSession.endTime).toLocaleString()
                          : 'Running...'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Initial Balance</div>
                      <div className="font-medium">
                        ${formatNumber(selectedSession.initialBalance)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Commission</div>
                      <div className="font-medium">
                        {(parseFloat(selectedSession.commission) * 100).toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Symbols</div>
                      <div className="font-medium">
                        {selectedSession.symbols?.join(', ') || 'All'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Timeframe</div>
                      <div className="font-medium">
                        {selectedSession.timeframe || '1h'}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {selectedSession.notes && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{selectedSession.notes}</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="trades">
                {sessionTrades.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <IconChartLine className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No trades recorded yet</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
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
                        {sessionTrades.map((trade) => (
                          <TableRow key={trade.id}>
                            <TableCell className="font-medium">{trade.symbol}</TableCell>
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
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="metrics">
                {selectedSession.latestResult ? (
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Return Metrics</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Return</span>
                          <span
                            className={`font-medium ${
                              parseFloat(selectedSession.latestResult.totalReturn) >= 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
                          >
                            {formatPercent(selectedSession.latestResult.totalReturn)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Annualized Return</span>
                          <span
                            className={`font-medium ${
                              parseFloat(selectedSession.latestResult.annualizedReturn) >=
                              0
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
                          >
                            {formatPercent(selectedSession.latestResult.annualizedReturn)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Profit Factor</span>
                          <span className="font-medium">
                            {formatNumber(selectedSession.latestResult.profitFactor)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Risk Metrics</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Sharpe Ratio</span>
                          <span className="font-medium">
                            {formatNumber(selectedSession.latestResult.sharpeRatio)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Max Drawdown</span>
                          <span className="font-medium text-orange-600">
                            {formatPercent(selectedSession.latestResult.maxDrawdown)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Win Rate</span>
                          <span className="font-medium">
                            {formatPercent(selectedSession.latestResult.winRate)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="col-span-2">
                      <CardHeader>
                        <CardTitle className="text-base">Trading Activity</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Trades</span>
                          <span className="font-medium">
                            {selectedSession.latestResult.totalTrades}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Avg Trade Duration
                          </span>
                          <span className="font-medium">
                            {formatDuration(
                              selectedSession.latestResult.avgTradeDuration,
                            )}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <IconActivity className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No metrics available yet</p>
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
