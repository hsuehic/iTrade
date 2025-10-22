import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { headers } from 'next/headers';

import { AppSidebar } from '@/components/app-sidebar';
import { SessionProvider } from '@/components/session-provider';
import { SidebarProvider } from '@/components/ui/sidebar';
import './globals.css';
import { auth } from '@/lib/auth';

const geistSans = GeistSans;

const geistMono = GeistMono;

export const metadata: Metadata = {
  title: {
    default: 'iTrade',
    template: '%s - iTrade',
  },
  description: 'iTrade - Trade crypto with intelligence',
  icons: {
    icon: '/favicon/favicon.ico',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = (await headers()).get('x-current-pathname') || '';
  const isAuth = pathname.startsWith('/auth');
  const isLandingPage = pathname === '' || pathname === '/' || pathname === '/landing';
  // Dashboard has its own layout with SidebarProvider
  const hasSeparateLayout = pathname.startsWith('/dashboard');
  const needsSidebar = !isAuth && !isLandingPage && !hasSeparateLayout;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  console.log('pathname', pathname);

  // For landing page, don't add extra layout - page.tsx handles everything
  if (isLandingPage) {
    return (
      <html lang="en" suppressHydrationWarning>
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </head>
        <body
          className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
        >
          <SessionProvider session={session}>
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem
              disableTransitionOnChange
            >
              {children}
              <Toaster
                position="top-center"
                richColors={true}
                toastOptions={{
                  duration: 3000,
                }}
              />
            </ThemeProvider>
          </SessionProvider>
        </body>
      </html>
    );
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <SessionProvider session={session}>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            {needsSidebar ? (
              <SidebarProvider
                style={
                  {
                    '--sidebar-width': 'calc(var(--spacing) * 72)',
                    '--header-height': 'calc(var(--spacing) * 12)',
                  } as React.CSSProperties
                }
              >
                <AppSidebar variant="inset" />
                {children}
              </SidebarProvider>
            ) : (
              children
            )}
            <Toaster
              position="top-center"
              richColors={true}
              toastOptions={{
                duration: 3000,
              }}
            />
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
