import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { headers } from 'next/headers';

import { SessionProvider } from '@/components/session-provider';
import { getAuthFromHeaders } from '@/lib/auth';
import './globals.css';
import Script from 'next/script';

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

/**
 * Root Layout
 *
 * Provides global providers and structure for the entire application:
 *
 * 1. **HTML Structure**: Base HTML, meta tags, fonts
 * 2. **SessionProvider**: Global authentication state (needed everywhere)
 * 3. **ThemeProvider**: Light/dark mode switching
 * 4. **Toaster**: Global toast notifications
 *
 * Route-specific UI (sidebars, headers, etc.) are handled by nested layouts:
 * - `/` → Landing page with custom header (in page.tsx)
 * - `/auth/*` → app/auth/layout.tsx (centered card layout)
 * - `/dashboard/*` → app/dashboard/layout.tsx (sidebar navigation)
 * - Other routes → Use nested layouts as needed
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get session once at the root level
  // Use getAuthFromHeaders to get proper base URL for session validation in production
  const requestHeaders = await headers();
  const auth = getAuthFromHeaders(requestHeaders);
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
          strategy="afterInteractive"
        />
        {/* 初始化 GA */}
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}');
          `}
        </Script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {/* Global Providers */}
        <SessionProvider session={session}>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem={false}
            disableTransitionOnChange
          >
            {/* Route-specific layouts handle their own structure */}
            {children}

            {/* Global Notifications */}
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
