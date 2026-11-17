'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_SERVER_IPS } from '@/lib/itrade-server-ip';

/**
 * Client hook exposing the admin-configured server IP whitelist.
 *
 * Reads GET /api/config/server-ips (public read-only). Falls back to the
 * built-in DEFAULT_SERVER_IPS while loading or on fetch failure so display
 * surfaces (accounts notice, onboarding wizard) always render a sensible
 * list instead of going blank.
 *
 * Note: no client-side caching layer on purpose — the endpoint is cheap
 * (30s in-process cache server-side) and every consumer re-mounts rarely.
 */
export function useServerIpWhitelist(): {
  ips: string[];
  loading: boolean;
} {
  const [ips, setIps] = useState<string[]>(DEFAULT_SERVER_IPS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/config/server-ips')
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status))),
      )
      .then((data: { ips?: unknown }) => {
        if (cancelled) return;
        if (Array.isArray(data.ips) && data.ips.length > 0) {
          setIps(data.ips.filter((v): v is string => typeof v === 'string'));
        }
      })
      .catch(() => {
        // Keep defaults — server list is unavailable, not empty.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { ips, loading };
}
