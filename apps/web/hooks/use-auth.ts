import { useSession } from '@/lib/auth-client';

export function useAuth() {
  const { data: session } = useSession();
  return session?.user as
    | { name: string; email: string; image?: string | null }
    | undefined;
}
