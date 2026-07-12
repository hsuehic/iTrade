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
import {
  IconLoader2,
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';
import { toast } from 'sonner';

interface AuditLogEntry {
  id: string;
  actorId: string;
  actorEmail?: string | null;
  targetUserId: string;
  targetEmail?: string | null;
  action: string;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  'impersonate.start': 'Started impersonation',
  'impersonate.stop': 'Stopped impersonation',
  'strategy.create': 'Created strategy',
  'strategy.update': 'Updated strategy',
  'strategy.delete': 'Deleted strategy',
  'order.create': 'Placed order',
  'order.update': 'Updated order',
  'order.cancel': 'Cancelled order',
};

const PAGE_SIZE = 25;

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchLogs = useCallback(async (targetPage: number) => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/admin/audit-log?page=${targetPage}&pageSize=${PAGE_SIZE}`,
      );
      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Failed to fetch audit log');
        return;
      }

      setLogs(data.logs || []);
      setTotal(data.pagination?.total ?? 0);
    } catch (error) {
      console.error('Error fetching audit log:', error);
      toast.error('An unexpected error occurred while fetching the audit log');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(page);
  }, [page, fetchLogs]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchLogs(page);
  };

  const formatDate = (date: string) =>
    new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <SidebarInset>
      <SiteHeader title="Admin - Audit Log" />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Audit Log</h2>
            <p className="text-muted-foreground text-sm">
              Impersonation events and write actions taken by admins on behalf of users.
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <IconRefresh className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3 px-6 pt-6">
            <CardTitle>Events</CardTitle>
            <CardDescription>Most recent actions first.</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            {loading && !isRefreshing ? (
              <div className="flex h-64 flex-col items-center justify-center">
                <IconLoader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-2 text-sm text-muted-foreground">Loading audit log...</p>
              </div>
            ) : (
              <>
                <div className="relative overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Admin</TableHead>
                        <TableHead>Target user</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>IP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.length > 0 ? (
                        logs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              {formatDate(log.createdAt)}
                            </TableCell>
                            <TableCell>{log.actorEmail || log.actorId}</TableCell>
                            <TableCell>{log.targetEmail || log.targetUserId}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {ACTION_LABELS[log.action] || log.action}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {log.ipAddress || '—'}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center">
                            No audit events recorded yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages} ({total} events)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <IconChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      <IconChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  );
}
