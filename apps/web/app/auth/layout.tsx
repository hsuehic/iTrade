// app/auth/layout.tsx
import Image from 'next/image';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const metadata = {
  title: {
    default: 'iTrade',
    template: '%s - iTrade',
  },
  description: 'iTrade - Trade crypto with intelligence',
  icons: {
    icon: '/favicon/favicon.ico',
  },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted flex min-h-screen flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-3xl">
        <div className={cn('flex flex-col gap-6')}>
          <Card className="overflow-hidden p-0">
            <CardContent className="grid p-0 md:grid-cols-2">
              {children}
              <div className="bg-muted relative hidden md:block">
                <Image
                  src="/promote.png"
                  alt="Promote"
                  fill
                  sizes="(min-width: 768px) 50vw, 100vw"
                  priority
                  className="absolute inset-0 object-cover dark:brightness"
                />
              </div>
            </CardContent>
          </Card>
          <div className="text-muted-foreground text-center text-xs *:[a]:underline *:[a]:underline-offset-4 *:[a]:hover:text-primary">
            By clicking continue, you agree to our{' '}
            <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
          </div>
        </div>
      </div>
    </div>
  );
}
