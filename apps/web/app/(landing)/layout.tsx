import { headers } from 'next/headers';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/auth';
import { ThemeSwitcher } from '@/components/theme-switcher';

export default async function LandingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const isAuthenticated = !!session?.user;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="font-bold">iT</span>
            </div>
            <span className="font-bold text-xl">iTrade</span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-4">
            <ThemeSwitcher />
            {isAuthenticated ? (
              <Button asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost">
                  <Link href="/auth/sign-in">Sign In</Link>
                </Button>
                <Button asChild>
                  <Link href="/auth/sign-up">Sign Up</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Main content */}
      {children}

      {/* Footer */}
      <footer className="border-t bg-muted/50 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
          <p>&copy; {new Date().getFullYear()} iTrade. All rights reserved.</p>
          <p className="mt-2">Trade responsibly. Cryptocurrency trading involves risk.</p>
        </div>
      </footer>
    </div>
  );
}
