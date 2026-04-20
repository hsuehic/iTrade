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
} from '@tabler/icons-react';
import { authClient } from '@/lib/auth-client';
import { toast } from 'sonner';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<
    {
      id: string;
      name?: string | null;
      email?: string;
      role?: string;
      banned?: boolean | null;
      createdAt?: Date | string;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await authClient.admin.listUsers({
        query: {
          limit: 100,
        },
      });

      if (response.data?.users) {
        setUsers(response.data.users);
      } else if (response.error) {
        toast.error(response.error.message || 'Failed to fetch users');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('An unexpected error occurred while fetching users');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

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

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.name?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = roleFilter === 'all' || user.role === roleFilter;

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'banned' && user.banned) ||
      (statusFilter === 'active' && !user.banned);

    return matchesSearch && matchesRole && matchesStatus;
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
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
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
                        <TableCell colSpan={5} className="h-24 text-center">
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
