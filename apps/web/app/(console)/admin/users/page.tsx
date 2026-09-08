'use client';

import { useState, useEffect, useCallback } from 'react';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  IconDotsVertical,
  IconUserShield,
  IconUser,
  IconSearch,
  IconLoader2,
  IconRefresh,
  IconBan,
  IconCheck,
  IconLogin,
} from '@tabler/icons-react';
import { authClient } from '@/lib/auth-client';
import { toast } from 'sonner';

export default function AdminUsersPage() {
  const { data: currentSession } = authClient.useSession();
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  const [users, setUsers] = useState<
    {
      id: string;
      name?: string | null;
      email?: string;
      role?: string;
      banned?: boolean | null;
      createdAt?: Date | string;
      exchangeAccounts?: number | null;
      balance?: number | null;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  type SortKey =
    | 'name'
    | 'role'
    | 'status'
    | 'createdAt'
    | 'exchangeAccounts'
    | 'balance';
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const fetchExchangeStats = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/users/exchange-stats', {
        cache: 'no-store',
      });
      if (!response.ok) {
        toast.error('Failed to load exchange account stats');
        return {};
      }
      const data = await response.json().catch(() => ({}));
      return (data.stats ?? {}) as Record<
        string,
        { exchangeAccounts: number; balance: number | null }
      >;
    } catch (error) {
      console.error('Error fetching exchange stats:', error);
      // A non-blocking warning so the admin knows the Exchange Accounts /
      // Balance columns may be showing N/A due to a failed lookup, not a
      // genuine lack of linked accounts.
      toast.error('Failed to load exchange account stats');
      return {};
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const [userResponse, stats] = await Promise.all([
        authClient.admin.listUsers({
          query: {
            limit: 100,
          },
        }),
        fetchExchangeStats(),
      ]);

      if (userResponse.data?.users) {
        // Merge per-user exchange stats. Users with no linked account stay
        // null and render "N/A" in the new columns.
        setUsers(
          userResponse.data.users.map((user) => {
            const s = stats?.[user.id] ?? null;
            return {
              ...user,
              exchangeAccounts: s?.exchangeAccounts ?? null,
              balance: s?.balance ?? null,
            };
          }),
        );
      } else if (userResponse.error) {
        toast.error(userResponse.error.message || 'Failed to fetch users');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('An unexpected error occurred while fetching users');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [fetchExchangeStats]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'createdAt' ? 'desc' : 'asc');
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchUsers();
  };

  const handleSetRole = async (userId: string, role: string) => {
    try {
      const { error } = await authClient.admin.setRole({
        userId,
        role: role as 'user' | 'admin',
      });

      if (error) {
        toast.error(error.message || `Failed to set role to ${role}`);
      } else {
        toast.success(`User role updated to ${role}`);
        fetchUsers();
      }
    } catch (error) {
      console.error('Error setting role:', error);
      toast.error('An unexpected error occurred while updating role');
    }
  };

  const handleBanUser = async (userId: string) => {
    try {
      const { error } = await authClient.admin.banUser({
        userId,
      });

      if (error) {
        toast.error(error.message || 'Failed to ban user');
      } else {
        toast.success('User banned successfully');
        fetchUsers();
      }
    } catch (error) {
      console.error('Error banning user:', error);
      toast.error('An unexpected error occurred');
    }
  };

  const handleUnbanUser = async (userId: string) => {
    try {
      const { error } = await authClient.admin.unbanUser({
        userId,
      });

      if (error) {
        toast.error(error.message || 'Failed to unban user');
      } else {
        toast.success('User unbanned successfully');
        fetchUsers();
      }
    } catch (error) {
      console.error('Error unbanning user:', error);
      toast.error('An unexpected error occurred');
    }
  };

  const handleImpersonate = async (userId: string) => {
    setImpersonatingId(userId);
    try {
      const response = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(data.error || 'Failed to start impersonation');
        setImpersonatingId(null);
        return;
      }

      toast.success('Signed in as user');
      // Force a full navigation (not client-side router.push) so Better
      // Auth's client session store — used by the sidebar, this page, and
      // the impersonation banner — refetches against the new cookie
      // immediately instead of only after a manual refresh.
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Error starting impersonation:', error);
      toast.error('An unexpected error occurred while starting impersonation');
      setImpersonatingId(null);
    }
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const filteredUsers = users
    .filter((user) => {
      const matchesSearch =
        user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.name?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRole = roleFilter === 'all' || user.role === roleFilter;

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'banned' && user.banned) ||
        (statusFilter === 'active' && !user.banned);

      return matchesSearch && matchesRole && matchesStatus;
    })
    .sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'name': {
          const av = (a.name || '').toLowerCase();
          const bv = (b.name || '').toLowerCase();
          return av.localeCompare(bv) * dir;
        }
        case 'role': {
          const av = (a.role || '').toLowerCase();
          const bv = (b.role || '').toLowerCase();
          return av.localeCompare(bv) * dir;
        }
        case 'status': {
          const av = a.banned ? 1 : 0;
          const bv = b.banned ? 1 : 0;
          return (av - bv) * dir;
        }
        case 'exchangeAccounts': {
          // Users with no account (null) always sort last, regardless of
          // direction, so an explicit "no exchange account" never interleaves
          // into the numeric ordering.
          const av = a.exchangeAccounts;
          const bv = b.exchangeAccounts;
          if ((av === null || av === undefined) && (bv === null || bv === undefined))
            return 0;
          if (av === null || av === undefined) return 1;
          if (bv === null || bv === undefined) return -1;
          return (av - bv) * dir;
        }
        case 'balance': {
          // Users with no account (null) always sort last, regardless of
          // direction.
          const av = a.balance;
          const bv = b.balance;
          if ((av === null || av === undefined) && (bv === null || bv === undefined))
            return 0;
          if (av === null || av === undefined) return 1;
          if (bv === null || bv === undefined) return -1;
          return (av - bv) * dir;
        }
        case 'createdAt':
        default: {
          const av = new Date(a.createdAt || 0).getTime();
          const bv = new Date(b.createdAt || 0).getTime();
          return (av - bv) * dir;
        }
      }
    });

  const formatDate = (date: string | Date | undefined) => {
    if (!date) return 'N/A';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(date));
  };

  return (
    <SidebarInset>
      <SiteHeader title="Admin - User Management" />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">User Management</h2>
            <p className="text-muted-foreground text-sm">
              Manage system users, roles, and permissions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <IconRefresh className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3 px-6 pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Users</CardTitle>
                <CardDescription>
                  A list of all users registered in the system.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    className="pl-8"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="banned">Banned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            {loading && !isRefreshing ? (
              <div className="flex h-64 flex-col items-center justify-center">
                <IconLoader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-2 text-sm text-muted-foreground">Loading users...</p>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={() => handleSort('name')}
                        >
                          User
                          {sortKey === 'name' && (
                            <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={() => handleSort('role')}
                        >
                          Role
                          {sortKey === 'role' && (
                            <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={() => handleSort('status')}
                        >
                          Status
                          {sortKey === 'status' && (
                            <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={() => handleSort('exchangeAccounts')}
                        >
                          Exchange Accounts
                          {sortKey === 'exchangeAccounts' && (
                            <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="text-right">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={() => handleSort('balance')}
                        >
                          Balance
                          {sortKey === 'balance' && (
                            <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={() => handleSort('createdAt')}
                        >
                          Joined
                          {sortKey === 'createdAt' && (
                            <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length > 0 ? (
                      filteredUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="py-3">
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {user.name || 'No Name'}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {user.email}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={user.role === 'admin' ? 'default' : 'secondary'}
                              className="capitalize"
                            >
                              {user.role || 'user'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {user.banned ? (
                              <Badge
                                variant="destructive"
                                className="flex w-fit items-center gap-1"
                              >
                                <IconBan className="h-3 w-3" />
                                Banned
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="flex w-fit items-center gap-1 text-green-600 border-green-200 bg-green-50"
                              >
                                <IconCheck className="h-3 w-3" />
                                Active
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {user.exchangeAccounts === null ||
                            user.exchangeAccounts === undefined ? (
                              <span className="text-muted-foreground/60">N/A</span>
                            ) : (
                              user.exchangeAccounts
                            )}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {user.balance === null || user.balance === undefined ? (
                              <span className="text-muted-foreground/60">N/A</span>
                            ) : (
                              formatCurrency(user.balance)
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(user.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <IconDotsVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={
                                    user.role === 'admin' ||
                                    user.id === currentSession?.user.id ||
                                    impersonatingId !== null
                                  }
                                  onClick={() => handleImpersonate(user.id)}
                                >
                                  {impersonatingId === user.id ? (
                                    <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <IconLogin className="mr-2 h-4 w-4" />
                                  )}
                                  <span>Login as user</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleSetRole(
                                      user.id,
                                      user.role === 'admin' ? 'user' : 'admin',
                                    )
                                  }
                                >
                                  {user.role === 'admin' ? (
                                    <>
                                      <IconUser className="mr-2 h-4 w-4" />
                                      <span>Demote to User</span>
                                    </>
                                  ) : (
                                    <>
                                      <IconUserShield className="mr-2 h-4 w-4" />
                                      <span>Promote to Admin</span>
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {user.banned ? (
                                  <DropdownMenuItem
                                    onClick={() => handleUnbanUser(user.id)}
                                  >
                                    <IconCheck className="mr-2 h-4 w-4 text-green-600" />
                                    <span>Unban User</span>
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => handleBanUser(user.id)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <IconBan className="mr-2 h-4 w-4" />
                                    <span>Ban User</span>
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center">
                          No users found matching your filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  );
}
