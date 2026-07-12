import { NextRequest, NextResponse } from 'next/server';
import type { AuditLogAction } from '@itrade/data-manager';

import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/admin/audit-log — admin-only. Lists audit log entries recording
 * impersonation start/stop and write actions taken while impersonating,
 * most recent first.
 *
 * Query params: page, pageSize, actorId, targetUserId, action
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    const role = (session?.user as { role?: string | null } | undefined)?.role;

    if (!session?.user || role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page');
    const pageSize = searchParams.get('pageSize');
    const actorId = searchParams.get('actorId') || undefined;
    const targetUserId = searchParams.get('targetUserId') || undefined;
    const action = (searchParams.get('action') as AuditLogAction | null) || undefined;

    const dataManager = await getDataManager();
    const { logs, total } = await dataManager.getAuditLogs({
      actorId,
      targetUserId,
      action,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });

    return NextResponse.json({
      logs,
      pagination: {
        total,
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : 50,
      },
    });
  } catch (error) {
    console.error('[Admin Audit Log] Failed to fetch audit logs:', error);
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}
