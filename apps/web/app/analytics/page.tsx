'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconFileInvoice,
  IconChartBar,
} from '@tabler/icons-react';

import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { SymbolIcon } from '@/components/symbol-icon';

type PnLData = {
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalOrders: number;
  filledOrders?: number;
  strategies?: Array<{
    strategyId: number;
    strategyName: string;
    pnl: number;
    realizedPnl: number;
    unrealizedPnl: number;
  }>;
};

type Order = {
  id: string;
  symbol: string;
  side: string;
  type: string;
  quantity: string;
  price?: string;
  status: string;
  timestamp: string;
  realizedPnl?: string;
  unrealizedPnl?: string;
  strategy?: {
    id: number;
    name: string;
  };
  normalizedSymbol?: string;
  marketType?: string;
};

type Strategy = {
  id: number;
  name: string;
};

export default function AnalyticsPage() {
  const [overallPnL, setOverallPnL] = useState<PnLData | null>(null);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('all');
  const [strategyPnL, setStrategyPnL] = useState<PnLData | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [pnlResponse, strategiesResponse] = await Promise.all([
        fetch('/api/analytics/pnl'),
        fetch('/api/strategies'),
      ]);

      if (pnlResponse.ok) {
        const pnlData = await pnlResponse.json();
        setOverallPnL(pnlData.pnl);
      }

      if (strategiesResponse.ok) {
        const strategiesData = await strategiesResponse.json();
        setStrategies(strategiesData.strategies);
      }

      await fetchOrders();
    } catch {
      toast.error('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (selectedStrategyId !== 'all') {
      fetchStrategyPnL(parseInt(selectedStrategyId));
      fetchOrders(parseInt(selectedStrategyId));
    } else {
      setStrategyPnL(null);
      fetchOrders();
    }
  }, [selectedStrategyId]);

  const fetchStrategyPnL = async (strategyId: number) => {
    try {
      const response = await fetch(`/api/analytics/pnl?strategyId=${strategyId}`);
      if (response.ok) {
        const data = await response.json();
        setStrategyPnL(data.pnl);
      }
    } catch {
      toast.error('Failed to load strategy PnL');
    }
  };

  const fetchOrders = async (strategyId?: number) => {
    try {
      const url = strategyId ? `/api/orders?strategyId=${strategyId}` : '/api/orders';
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setOrders(data.orders);
      }
    } catch {
      toast.error('Failed to load orders');
    }
  };

  const formatNumber = (num: number | string | undefined): string => {
    if (num === undefined || num === null) return 'N/A';
    const value = typeof num === 'string' ? parseFloat(num) : num;
    return value.toFixed(2);
  };

  const formatPnL = (pnl: number | string | undefined): React.ReactElement => {
    if (pnl === undefined || pnl === null) return <span>N/A</span>;
    const value = typeof pnl === 'string' ? parseFloat(pnl) : pnl;
    const formatted = value.toFixed(2);
    const isPositive = value >= 0;

    return (
      <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
        {isPositive ? '+' : ''}
        {formatted}
      </span>
    );
  };

  const displayPnL = strategyPnL || overallPnL;

  return (
    <SidebarInset>
      <SiteHeader title="Analytics & PnL" />
      <div className="p-6">
        <div className="mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Trading Analytics</h2>
              <p className="text-muted-foreground">
                Track your performance and profitability
              </p>
            </div>
            <Select value={selectedStrategyId} onValueChange={setSelectedStrategyId}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="All Strategies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Strategies</SelectItem>
                {strategies.map((strategy) => (
                  <SelectItem key={strategy.id} value={strategy.id.toString()}>
                    {strategy.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading analytics...</div>
        ) : (
          <>
            {/* PnL Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total PnL</CardTitle>
                  {displayPnL && displayPnL.totalPnl >= 0 ? (
                    <IconTrendingUp className="h-4 w-4 text-green-600" />
                  ) : (
                    <IconTrendingDown className="h-4 w-4 text-red-600" />
                  )}
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {displayPnL ? formatPnL(displayPnL.totalPnl) : 'N/A'}
                  </div>
                  <p className="text-xs text-muted-foreground">Realized + Unrealized</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Realized PnL</CardTitle>
                  <IconChartBar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {displayPnL ? formatPnL(displayPnL.realizedPnl) : 'N/A'}
                  </div>
                  <p className="text-xs text-muted-foreground">Closed positions</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Unrealized PnL</CardTitle>
                  <IconChartBar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {displayPnL ? formatPnL(displayPnL.unrealizedPnl) : 'N/A'}
                  </div>
                  <p className="text-xs text-muted-foreground">Open positions</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                  <IconFileInvoice className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{displayPnL?.totalOrders || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {displayPnL?.filledOrders || 0} filled
                  </p>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="orders" className="space-y-4">
              <TabsList>
                <TabsTrigger value="orders">Orders</TabsTrigger>
                <TabsTrigger value="strategies">By Strategy</TabsTrigger>
              </TabsList>

              <TabsContent value="orders">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Orders</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {orders.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No orders found
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Time</TableHead>
                              <TableHead>Strategy</TableHead>
                              <TableHead>Symbol</TableHead>
                              <TableHead>Side</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Quantity</TableHead>
                              <TableHead>Price</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Realized PnL</TableHead>
                              <TableHead>Unrealized PnL</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {orders.map((order) => (
                              <TableRow key={order.id}>
                                <TableCell className="text-xs">
                                  {new Date(order.timestamp).toLocaleString()}
                                </TableCell>
                                <TableCell>{order.strategy?.name || 'N/A'}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <SymbolIcon symbol={order.symbol} size="sm" />
                                    <div className="flex flex-col">
                                      <span className="font-mono text-sm">
                                        {order.symbol}
                                      </span>
                                      {order.normalizedSymbol && (
                                        <span className="text-xs text-muted-foreground">
                                          {order.normalizedSymbol}
                                          {order.marketType === 'perpetual' && (
                                            <Badge
                                              variant="outline"
                                              className="ml-1 text-xs py-0 px-1 h-4"
                                            >
                                              PERP
                                            </Badge>
                                          )}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      order.side === 'BUY' ? 'default' : 'secondary'
                                    }
                                  >
                                    {order.side}
                                  </Badge>
                                </TableCell>
                                <TableCell>{order.type}</TableCell>
                                <TableCell>{formatNumber(order.quantity)}</TableCell>
                                <TableCell>
                                  {order.price ? formatNumber(order.price) : 'Market'}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{order.status}</Badge>
                                </TableCell>
                                <TableCell>{formatPnL(order.realizedPnl)}</TableCell>
                                <TableCell>{formatPnL(order.unrealizedPnl)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="strategies">
                <Card>
                  <CardHeader>
                    <CardTitle>PnL by Strategy</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!overallPnL?.strategies || overallPnL.strategies.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No strategy data available
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Strategy</TableHead>
                            <TableHead>Total PnL</TableHead>
                            <TableHead>Realized PnL</TableHead>
                            <TableHead>Unrealized PnL</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {overallPnL.strategies.map((strategy) => (
                            <TableRow key={strategy.strategyId}>
                              <TableCell className="font-medium">
                                {strategy.strategyName}
                              </TableCell>
                              <TableCell>{formatPnL(strategy.pnl)}</TableCell>
                              <TableCell>{formatPnL(strategy.realizedPnl)}</TableCell>
                              <TableCell>{formatPnL(strategy.unrealizedPnl)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </SidebarInset>
  );
}
