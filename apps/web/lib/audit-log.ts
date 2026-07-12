import type { AuditLogAction } from '@itrade/data-manager';

import { getDataManager } from '@/lib/data-manager';
import { getClientIp } from '@/lib/auth';

interface LogIfImpersonatingParams {
  request: Request;
  // Deliberately loose: getSession()'s return type differs between the
  // cookie-session branch and the API-key fallback branch, and the
  // `impersonatedBy` field (added by the admin plugin) isn't always visible
  // through that union. We only ever read `user.id`/`user.email` and probe
  // for `session.impersonatedBy` defensively below.
  session: {
    user: { id: string; email: string };
    session?: unknown;
  };
  action: AuditLogAction;
  metadata?: Record<string, unknown>;
}

/**
 * Records an audit log entry for a write action, but only when the current
 * session is an admin impersonating another user (session.session.impersonatedBy
 * is set). No-op for a user acting on their own account.
 *
 * actorId is the impersonating admin; targetUserId/targetEmail is the account
 * the write was performed against. Never throws — a failure to log must not
 * block the underlying action (strategy/order write already succeeded).
 */
export async function logIfImpersonating({
  request,
  session,
  action,
  metadata,
}: LogIfImpersonatingParams): Promise<void> {
  const impersonatedBy = (
    session.session as { impersonatedBy?: string | null } | null | undefined
  )?.impersonatedBy;
  if (!impersonatedBy) return;

  try {
    const dataManager = await getDataManager();
    await dataManager.createAuditLog({
      actorId: impersonatedBy,
      targetUserId: session.user.id,
      targetEmail: session.user.email,
      action,
      metadata: metadata ?? null,
      ipAddress: getClientIp(request.headers),
      userAgent: request.headers.get('user-agent'),
    });
  } catch (error) {
    console.error('[Audit Log] Failed to record impersonated action:', error);
  }
}
