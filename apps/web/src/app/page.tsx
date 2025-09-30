'use client';

import { useRouter } from 'next/navigation';

import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';

export default function Home() {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
      <div className="text-2xl font-semibold">iTrade Web Dashboard</div>
      {!session ? (
        <div className="flex gap-2">
          <Button onClick={() => router.push('/auth/sign-in')}>Sign in</Button>
          <Button
            variant="secondary"
            onClick={() => router.push('/auth/sign-up')}
          >
            Sign up
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span>Signed in as {session.user.email}</span>
          <Button
            variant="destructive"
            onClick={async () => {
              await authClient.signOut();
              router.refresh();
            }}
          >
            Sign out
          </Button>
        </div>
      )}
    </div>
  );
}
