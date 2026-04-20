'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  IconArrowLeft,
  IconRefresh,
  IconTrendingUp,
  IconTrendingDown,
  IconActivity,
  IconClock,
  IconPlayerStop,
} from '@tabler/icons-react';

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

interface SessionStats {
  isRunning: boolean;
  sessionId: number;
  status: string;
  initialBalance: string;
  commission: string;
  slippage: string;
  startTime: string;
  endTime?: string;
  stats?: {
    totalOrders: number;
    totalTrades: number;
    totalVolume: string;
    totalCommission: string;
    currentValue: string;
    pnl: string;
    pnlPercent: string;
    winRate: string;
    maxDrawdown: string;
    sharpeRatio: string;
  };
}

interface Order {
  id: string;
  clientOrderId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: string;
  price?: string;
  status: string;
  timestamp: string;
  executedQuantity?: string;
  commission?: string;
}

const orderSchema = z
  .object({
    symbol: z.string().min(3, 'Symbol must be at least 3 characters'),
    side: z.enum(['BUY', 'SELL']),
    type: z.enum(['MARKET', 'LIMIT']),
    quantity: z.string().min(1, 'Quantity is required'),
    price: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const quantity = parseFloat(data.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Quantity must be a positive number',
        path: ['quantity'],
      });
    }

    if (data.type === 'LIMIT') {
      if (!data.price) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Price is required for limit orders',
          path: ['price'],
        });
      } else {
        const price = parseFloat(data.price);
        if (isNaN(price) || price <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Price must be a positive number',
            path: ['price'],
          });
        }
      }
    }
  });

export default function PaperTradingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const locale = useLocale();
  const router = useRouter();
  const { id } = use(params);
  const sessionId = parseInt(id, 10);

  const [stats, setStats] = useState<SessionStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isStoppingSession, setIsStoppingSession] = useState(false);

  const [orderForm, setOrderForm] = useState({
    symbol: 'BTC/USDT',
    side: 'BUY' as 'BUY' | 'SELL',
    type: 'MARKET' as 'MARKET' | 'LIMIT',
    quantity: '',
    price: '',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`/api/dry-run/${sessionId}/stats`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        if (response.status === 404) {
          toast.error('Session not found');
          router.push('/dry-run');
          return;
        }
        throw new Error('Failed to fetch session stats');
      }
      const data = await response.json();
      setStats(data);

      // If session is not running, redirect back to main page
      if (!data.isRunning) {
        toast.info('Session is not running');
        router.push('/dry-run');
      }
    } catch (error) {
      toast.error('Failed to load session data');
      console.error('Error fetching stats:', error);
    }
  }, [sessionId, router]);

  const fetchOrders = useCallback(async () => {
    try {
      const response = await fetch(`/api/dry-run/${sessionId}/orders`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Failed to fetch orders');
      const data = await response.json();
      setOrders(data.orders || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  }, [sessionId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchStats(), fetchOrders()]);
    } finally {
      setLoading(false);
    }
  }, [fetchStats, fetchOrders]);

  useEffect(() => {
    fetchData();

    // Set up polling for real-time updates
    const interval = setInterval(() => {
      fetchStats();
      fetchOrders();
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [fetchData, fetchStats, fetchOrders]);

  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPlacingOrder) return;

    // Validate form
    const result = orderSchema.safeParse(orderForm);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((error) => {
        if (error.path[0]) {
          errors[error.path[0] as string] = error.message;
        }
      });
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setIsPlacingOrder(true);

    try {
      const response = await fetch(`/api/dry-run/${sessionId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: orderForm.symbol,
          side: orderForm.side,
          type: orderForm.type,
          quantity: orderForm.quantity,
          price: orderForm.type === 'LIMIT' ? orderForm.price : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to place order');
      }

      toast.success(`${orderForm.side} order placed successfully`);

      // Reset form
      setOrderForm({
        ...orderForm,
        quantity: '',
        price: '',
      });

      // Refresh data
      fetchStats();
      fetchOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to place order');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const stopSession = async () => {
    if (isStoppingSession) return;

    setIsStoppingSession(true);
    try {
      const response = await fetch(`/api/dry-run/${sessionId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to stop session');
      }

      toast.success('Session stopped successfully');
      router.push('/dry-run');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to stop session');
    } finally {
      setIsStoppingSession(false);
    }
  };

  const formatNumber = (value: string | number | undefined, decimals = 2) => {
    if (value === undefined || value === null) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '-';
    return num.toLocaleString(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatPercent = (value: string | number | undefined) => {
    if (value === undefined || value === null) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '-';
    return `${num.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <SidebarInset>
        <SiteHeader title="Paper Trading" />
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
              <p className="text-sm text-muted-foreground">Loading session...</p>
            </div>
          </div>
        </div>
      </SidebarInset>
    );
  }

  if (!stats) {
    return (
      <SidebarInset>
        <SiteHeader title="Paper Trading" />
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-3">
              <p className="text-lg font-semibold">Session not found</p>
              <Button onClick={() => router.push('/dry-run')}>
                <IconArrowLeft className="h-4 w-4 mr-2" />
                Back to Sessions
              </Button>
            </div>
          </div>
        </div>
      </SidebarInset>
    );
  }

  return (
    <SidebarInset>
      <SiteHeader title="Paper Trading" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            {/* Header */}
            <div className="flex justify-between items-start px-4 lg:px-6">
              <div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push('/dry-run')}
                  >
                    <IconArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  <h2 className="text-2xl font-bold tracking-tight">
                    Paper Trading Session #{sessionId}
                  </h2>
                  <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                    <span className="mr-1 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    Live
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1">
                  Started {new Date(stats.startTime).toLocaleString(locale)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={fetchData}>
                  <IconRefresh className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button
                  variant="destructive"
                  onClick={stopSession}
                  disabled={isStoppingSession}
                >
                  {isStoppingSession ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                  ) : (
                    <IconPlayerStop className="h-4 w-4 mr-2" />
                  )}
                  Stop Session
                </Button>
              </div>
            </div>

            {/* Performance Overview */}
            {stats.stats && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-4 lg:px-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Current Value</CardDescription>
                    <CardTitle className="text-2xl">
                      ${formatNumber(stats.stats.currentValue)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-muted-foreground">
                      Initial: ${formatNumber(stats.initialBalance)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>P&L</CardDescription>
                    <CardTitle
                      className={`text-2xl ${
                        parseFloat(stats.stats.pnl) >= 0
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {parseFloat(stats.stats.pnl) >= 0 ? '+' : ''}$
                      {formatNumber(stats.stats.pnl)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`text-xs flex items-center gap-1 ${
                        parseFloat(stats.stats.pnl) >= 0
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {parseFloat(stats.stats.pnl) >= 0 ? (
                        <IconTrendingUp className="h-3 w-3" />
                      ) : (
                        <IconTrendingDown className="h-3 w-3" />
                      )}
                      {formatPercent(stats.stats.pnlPercent)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Total Trades</CardDescription>
                    <CardTitle className="text-2xl">{stats.stats.totalTrades}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <IconActivity className="h-3 w-3" />
                      {stats.stats.totalOrders} orders
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Volume</CardDescription>
                    <CardTitle className="text-2xl">
                      ${formatNumber(stats.stats.totalVolume)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <IconClock className="h-3 w-3" />
                      Commission: ${formatNumber(stats.stats.totalCommission)}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Main Content */}
            <div className="px-4 lg:px-6">
              <Tabs defaultValue="trading" className="space-y-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="trading">Manual Trading</TabsTrigger>
                  <TabsTrigger value="orders">Order History</TabsTrigger>
                </TabsList>

                <TabsContent value="trading" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Place Order</CardTitle>
                      <CardDescription>
                        Execute manual trades in your paper trading session
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={placeOrder} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="symbol">Symbol</Label>
                            <Input
                              id="symbol"
                              placeholder="BTC/USDT"
                              value={orderForm.symbol}
                              onChange={(e) =>
                                setOrderForm({ ...orderForm, symbol: e.target.value })
                              }
                            />
                            {formErrors.symbol && (
                              <p className="text-sm text-red-600">{formErrors.symbol}</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="side">Side</Label>
                            <Select
                              value={orderForm.side}
                              onValueChange={(value: 'BUY' | 'SELL') =>
                                setOrderForm({ ...orderForm, side: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="BUY">Buy</SelectItem>
                                <SelectItem value="SELL">Sell</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="type">Order Type</Label>
                            <Select
                              value={orderForm.type}
                              onValueChange={(value: 'MARKET' | 'LIMIT') =>
                                setOrderForm({ ...orderForm, type: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="MARKET">Market</SelectItem>
                                <SelectItem value="LIMIT">Limit</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="quantity">Quantity</Label>
                            <Input
                              id="quantity"
                              type="number"
                              step="0.000001"
                              placeholder="0.001"
                              value={orderForm.quantity}
                              onChange={(e) =>
                                setOrderForm({ ...orderForm, quantity: e.target.value })
                              }
                            />
                            {formErrors.quantity && (
                              <p className="text-sm text-red-600">
                                {formErrors.quantity}
                              </p>
                            )}
                          </div>
                        </div>

                        {orderForm.type === 'LIMIT' && (
                          <div className="space-y-2">
                            <Label htmlFor="price">Price</Label>
                            <Input
                              id="price"
                              type="number"
                              step="0.01"
                              placeholder="50000"
                              value={orderForm.price}
                              onChange={(e) =>
                                setOrderForm({ ...orderForm, price: e.target.value })
                              }
                            />
                            {formErrors.price && (
                              <p className="text-sm text-red-600">{formErrors.price}</p>
                            )}
                          </div>
                        )}

                        <Separator />
                        <Button
                          type="submit"
                          disabled={isPlacingOrder}
                          className={
                            orderForm.side === 'BUY'
                              ? 'bg-green-600 hover:bg-green-700'
                              : 'bg-red-600 hover:bg-red-700'
                          }
                        >
                          {isPlacingOrder ? (
                            <>
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                              Placing Order...
                            </>
                          ) : (
                            `${orderForm.side} ${orderForm.symbol}`
                          )}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="orders">
                  <Card>
                    <CardHeader>
                      <CardTitle>Order History</CardTitle>
                      <CardDescription>
                        All orders placed in this paper trading session
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {orders.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground">No orders placed yet</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Time</TableHead>
                              <TableHead>Symbol</TableHead>
                              <TableHead>Side</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead className="text-right">Quantity</TableHead>
                              <TableHead className="text-right">Price</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {orders.map((order) => (
                              <TableRow key={order.id}>
                                <TableCell>
                                  {new Date(order.timestamp).toLocaleString(locale)}
                                </TableCell>
                                <TableCell className="font-medium">
                                  {order.symbol}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      order.side === 'BUY' ? 'default' : 'secondary'
                                    }
                                    className={
                                      order.side === 'BUY'
                                        ? 'bg-green-500/10 text-green-600'
                                        : 'bg-red-500/10 text-red-600'
                                    }
                                  >
                                    {order.side}
                                  </Badge>
                                </TableCell>
                                <TableCell>{order.type}</TableCell>
                                <TableCell className="text-right">
                                  {formatNumber(order.quantity, 6)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {order.price
                                    ? `$${formatNumber(order.price)}`
                                    : 'Market'}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      order.status === 'FILLED' ? 'default' : 'secondary'
                                    }
                                  >
                                    {order.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
