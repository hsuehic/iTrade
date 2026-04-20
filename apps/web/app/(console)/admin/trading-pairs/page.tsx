'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  IconPlus,
  IconDots,
  IconTrash,
  IconEdit,
  IconRefresh,
  IconCheck,
  IconX,
  IconLoader2,
  IconSearch,
} from '@tabler/icons-react';

import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { SUPPORTED_EXCHANGES } from '@/lib/exchanges';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';

export default function AdminTradingPairsPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [pairs, setPairs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedPair, setSelectedPair] = useState<any | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [exchangeFilter, setExchangeFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [formData, setFormData] = useState({
    symbol: '',
    baseAsset: '',
    quoteAsset: '',
    exchange: 'binance',
    type: 'spot',
    name: '',
    isActive: true,
    baseAssetPrecision: 8,
    quoteAssetPrecision: 8,
  });

  const fetchPairs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/trading-pairs');
      if (!response.ok) throw new Error('Failed to fetch pairs');
      const data = await response.json();
      setPairs(data);
    } catch (error) {
      toast.error('Failed to load trading pairs');
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredPairs = pairs.filter((pair) => {
    const matchesSearch =
      pair.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (pair.name && pair.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesExchange = exchangeFilter === 'all' || pair.exchange === exchangeFilter;
    const matchesType = typeFilter === 'all' || pair.type === typeFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' ? pair.isActive : !pair.isActive);

    return matchesSearch && matchesExchange && matchesType && matchesStatus;
  });

  useEffect(() => {
    if (!sessionPending) {
      if (!session || (session.user as any).role !== 'admin') {
        router.push('/dashboard');
      } else {
        fetchPairs();
      }
    }
  }, [session, sessionPending, router, fetchPairs]);

  const handleOpenDialog = (pair?: any) => {
    if (pair) {
      setIsEditing(true);
      setSelectedPair(pair);
      setFormData({
        symbol: pair.symbol,
        baseAsset: pair.baseAsset,
        quoteAsset: pair.quoteAsset,
        exchange: pair.exchange,
        type: pair.type,
        name: pair.name || '',
        isActive: pair.isActive,
        baseAssetPrecision: pair.baseAssetPrecision,
        quoteAssetPrecision: pair.quoteAssetPrecision,
      });
    } else {
      setIsEditing(false);
      setSelectedPair(null);
      setFormData({
        symbol: '',
        baseAsset: '',
        quoteAsset: '',
        exchange: 'binance',
        type: 'spot',
        name: '',
        isActive: true,
        baseAssetPrecision: 8,
        quoteAssetPrecision: 8,
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const url = isEditing
        ? `/api/admin/trading-pairs/${selectedPair.id}`
        : '/api/admin/trading-pairs';
      const method = isEditing ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Failed to save trading pair');

      toast.success(`Trading pair ${isEditing ? 'updated' : 'created'} successfully`);
      setIsDialogOpen(false);
      fetchPairs();
    } catch (error) {
      toast.error('Failed to save trading pair');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/admin/trading-pairs/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete trading pair');

      toast.success('Trading pair deleted successfully');
      fetchPairs();
    } catch (error) {
      toast.error('Failed to delete trading pair');
    }
  };

  const handleToggleStatus = async (pair: any) => {
    try {
      const response = await fetch(`/api/admin/trading-pairs/${pair.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !pair.isActive }),
      });

      if (!response.ok) throw new Error('Failed to update status');

      toast.success(`Pair ${!pair.isActive ? 'activated' : 'deactivated'} successfully`);
      fetchPairs();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      const response = await fetch('/api/admin/trading-pairs/seed', {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to seed pairs');
      const data = await response.json();

      toast.success(
        `Seeding complete: ${data.added} added, ${data.skipped} skipped, ${data.errors} errors`,
      );
      fetchPairs();
    } catch (error) {
      toast.error('Failed to seed trading pairs');
    } finally {
      setIsSeeding(false);
    }
  };

  if (sessionPending || (session && (session.user as any).role !== 'admin')) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <IconLoader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarInset>
      <SiteHeader title="Admin - Trading Pairs" />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Trading Pairs</h2>
            <p className="text-muted-foreground">
              Manage supported trading pairs for all exchanges.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSeed} disabled={isSeeding}>
              {isSeeding ? (
                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <IconRefresh className="mr-2 h-4 w-4" />
              )}
              Seed from Config
            </Button>
            <Button onClick={() => handleOpenDialog()}>
              <IconPlus className="mr-2 h-4 w-4" />
              Add Pair
            </Button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-end bg-muted/30 p-4 rounded-lg border">
          <div className="flex-1 w-full space-y-1.5">
            <Label htmlFor="search">Search</Label>
            <div className="relative">
              <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Search symbol or name..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="w-full md:w-40 space-y-1.5">
            <Label>Exchange</Label>
            <Select value={exchangeFilter} onValueChange={setExchangeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Exchanges" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Exchanges</SelectItem>
                {SUPPORTED_EXCHANGES.map((ex) => (
                  <SelectItem key={ex.id} value={ex.id}>
                    {ex.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full md:w-32 space-y-1.5">
            <Label>Type</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="spot">Spot</SelectItem>
                <SelectItem value="perpetual">Perpetual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full md:w-32 space-y-1.5">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setSearchQuery('');
              setExchangeFilter('all');
              setTypeFilter('all');
              setStatusFilter('all');
            }}
          >
            Reset
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Exchange</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Base/Quote</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      <IconLoader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filteredPairs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No trading pairs found matching your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPairs.map((pair) => (
                    <TableRow key={pair.id}>
                      <TableCell className="font-medium">
                        <div>
                          <div>{pair.symbol}</div>
                          {pair.name && (
                            <div className="text-xs text-muted-foreground font-normal">
                              {pair.name}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {pair.exchange}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {pair.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {pair.baseAsset} / {pair.quoteAsset}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={pair.isActive}
                          onCheckedChange={() => handleToggleStatus(pair)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <IconDots className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenDialog(pair)}>
                              <IconEdit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(pair.id)}
                            >
                              <IconTrash className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Edit Trading Pair' : 'Add Trading Pair'}
            </DialogTitle>
            <DialogDescription>
              Set the symbol and assets for the new trading pair.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="symbol" className="text-right">
                Symbol
              </Label>
              <Input
                id="symbol"
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                className="col-span-3"
                placeholder="BTC/USDT"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="col-span-3"
                placeholder="Bitcoin / Tether"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="exchange" className="text-right">
                Exchange
              </Label>
              <Select
                value={formData.exchange}
                onValueChange={(value) => setFormData({ ...formData, exchange: value })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select exchange" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_EXCHANGES.map((ex) => (
                    <SelectItem key={ex.id} value={ex.id}>
                      {ex.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="type" className="text-right">
                Type
              </Label>
              <Select
                value={formData.type}
                onValueChange={(value: any) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spot">Spot</SelectItem>
                  <SelectItem value="perpetual">Perpetual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid grid-cols-2 items-center gap-4">
                <Label htmlFor="baseAsset" className="text-right">
                  Base
                </Label>
                <Input
                  id="baseAsset"
                  value={formData.baseAsset}
                  onChange={(e) =>
                    setFormData({ ...formData, baseAsset: e.target.value })
                  }
                  placeholder="BTC"
                  required
                />
              </div>
              <div className="grid grid-cols-2 items-center gap-4">
                <Label htmlFor="quoteAsset" className="text-right">
                  Quote
                </Label>
                <Input
                  id="quoteAsset"
                  value={formData.quoteAsset}
                  onChange={(e) =>
                    setFormData({ ...formData, quoteAsset: e.target.value })
                  }
                  placeholder="USDT"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid grid-cols-2 items-center gap-4">
                <Label htmlFor="basePrec" className="text-right text-xs">
                  Base Prec
                </Label>
                <Input
                  id="basePrec"
                  type="number"
                  value={formData.baseAssetPrecision}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      baseAssetPrecision: parseInt(e.target.value),
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 items-center gap-4">
                <Label htmlFor="quotePrec" className="text-right text-xs">
                  Quote Prec
                </Label>
                <Input
                  id="quotePrec"
                  type="number"
                  value={formData.quoteAssetPrecision}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      quoteAssetPrecision: parseInt(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Add Pair'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SidebarInset>
  );
}
