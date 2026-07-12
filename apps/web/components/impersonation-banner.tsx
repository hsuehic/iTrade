'use client';

import { useState } from 'react';
import { IconUserShield, IconLoader2 } from '@tabler/icons-react';
import { toast } from 'sonner';

import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';

/**
 * Sticky banner shown while an admin is impersonating another user
 * ("Login as user"). Lets the admin exit back to their own account at any
 * time. Exiting goes through /api/admin/impersonate (DELETE) rather than
 * calling authClient.admin.stopImpersonating() directly so the stop event
 * is audit-logged.
 */
export function ImpersonationBanner() {
  const { data: session, isPending } = authClient.useSession();
  const [exiting, setExiting] = useState(false);

  if (isPending || !session) return null;

  const impersonatedBy = (
    session.session as { impersonatedBy?: string | null } | undefined
  )?.impersonatedBy;

  if (!impersonatedBy) return null;

  const handleExit = async () => {
    setExiting(true);
    try {
      const response = await fetch('/api/admin/impersonate', { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(data.error || 'Failed to exit impersonation');
        setExiting(false);
        return;
      }

      toast.success('Returned to your admin account');
      // Better Auth's client-side session store (used by useSession() here,
      // in the sidebar, etc.) doesn't know the session cookie changed under
      // it — only a full navigation forces every consumer to refetch. A
      // client-side router.push() would leave the sidebar/banner stale
      // until a manual refresh.
      window.location.href = '/admin/users';
    } catch (error) {
      console.error('Error exiting impersonation:', error);
      toast.error('An unexpected error occurred while exiting impersonation');
      setExiting(false);
    }
  };

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
      <IconUserShield className="h-4 w-4" />
      <span>
        You are viewing as <strong>{session.user.name || session.user.email}</strong>
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 border-amber-950/30 bg-amber-50 text-amber-950 hover:bg-amber-100"
        onClick={handleExit}
        disabled={exiting}
      >
        {exiting ? <IconLoader2 className="h-3 w-3 animate-spin" /> : null}
        Exit impersonation
      </Button>
    </div>
  );
}
