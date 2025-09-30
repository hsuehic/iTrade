'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { authClient } from '@/lib/auth-client';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const handler = () => router.refresh();
    authClient.$store.listen('$sessionSignal', handler);
    // better-auth listen API doesn't return an unsubscribe function.
    // This effect runs once for app lifetime, which is sufficient here.
  }, [router]);

  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
