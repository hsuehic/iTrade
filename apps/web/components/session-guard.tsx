// components/session-guard.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';

/**
 * SessionGuard — client-side session expiry detection
 *
 * Monitors the Better Auth client-side session (via useSession()) and
 * intercepts global fetch 401 responses. If either signal indicates an
 * expired/invalid session, the user is immediately redirected to sign-in.
 *
 * Layers of protection:
 * 1. useSession() periodically polls Better Auth's /api/auth/get-session
 *    endpoint. When the session expires, useSession().data becomes null.
 * 2. A global fetch interceptor catches 401s from any API call made while
 *    the page was idle (the session might still appear valid client-side
 *    between polls).
 *
 * Together these cover the "refresh on /dashboard with expired session"
 * gap: the server-side layout check handles SSR, and SessionGuard handles
 * the client-side SPA navigation and polling cases.
 *
 * Known scope limitation: only intercepts `window.fetch`. EventSource/SSE
 * (chat-widget/help-widget support streams) and WebSocket (market ticker)
 * connections are not covered — but both of those use unauthenticated,
 * secret-token-based access (not the Better Auth session cookie), so a
 * session expiry does not affect them either way.
 */
export function SessionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const redirectingRef = useRef(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const redirectToSignIn = () => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    setIsRedirecting(true);
    // Preserve both path and query string so filters/view state survive
    // the round trip through sign-in.
    const currentPath = window.location.pathname + window.location.search;
    const signInUrl = `/auth/sign-in?callbackUrl=${encodeURIComponent(currentPath)}`;
    router.replace(signInUrl);
  };

  // 1. useSession() signal — session became null (expired or invalidated)
  useEffect(() => {
    if (!isPending && !session) {
      redirectToSignIn();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isPending]);

  // 2. Global fetch interceptor — catches 401 from any API call
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const response = await originalFetch(input, init);
      if (response.status === 401 && !redirectingRef.current) {
        // Ignore 401s from auth endpoints themselves (sign-in, sign-up, etc.)
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.pathname
              : input.url;
        if (!url.includes('/api/auth/')) {
          redirectToSignIn();
        }
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Avoid flashing a frame of authenticated dashboard content while the
  // client-side redirect (router.replace) is in flight.
  if (isRedirecting) return null;

  return <>{children}</>;
}
