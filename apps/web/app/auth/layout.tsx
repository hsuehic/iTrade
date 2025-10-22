import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: {
    default: 'Authentication',
    template: '%s - iTrade',
  },
  description: 'Sign in or create an account to start trading',
  icons: {
    icon: '/favicon/favicon.ico',
  },
};

/**
 * Auth Layout
 *
 * Provides authentication-specific UI structure:
 * - Centered card layout with promotional image
 * - Logo and navigation back to home
 * - Terms and privacy policy links
 *
 * Note: SessionProvider is handled globally in app/layout.tsx
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted p-4 md:p-10">
      <div className="w-full max-w-sm md:max-w-3xl">
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <Link
            href="/"
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
          >
            <Image
              src="/logo.svg"
              alt="iTrade Logo"
              width={32}
              height={32}
              className="size-8"
            />
            <span className="text-xl font-bold">iTrade</span>
          </Link>
        </div>

        <div className={cn('flex flex-col gap-6')}>
          <Card className="overflow-hidden border-0 p-0 shadow-lg">
            <CardContent className="grid p-0 md:grid-cols-2">
              {/* Auth Form */}
              <div className="w-full md:w-[382px]">{children}</div>

              {/* Promotional Image - Hidden on mobile */}
              <div className="relative hidden min-h-[538px] w-full bg-muted md:block md:w-[384px]">
                <Image
                  src="/promote.png"
                  alt="Trading Platform Preview"
                  fill
                  sizes="(min-width: 768px) 384px, 0px"
                  priority
                  className="absolute inset-0 object-cover dark:brightness-90"
                />
                {/* Gradient overlay for better text contrast */}
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
              </div>
            </CardContent>
          </Card>

          {/* Terms and Privacy */}
          <p className="text-center text-xs text-muted-foreground">
            By clicking continue, you agree to our{' '}
            <Link
              href="/privacy.html"
              className="underline underline-offset-4 transition-colors hover:text-primary"
            >
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link
              href="/privacy.html"
              className="underline underline-offset-4 transition-colors hover:text-primary"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
