import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import { nextCookies } from 'better-auth/next-js';

import { allowedOrigins } from '../constant';
// social providers configured via options

// Server-side Better Auth instance
// NOTE: swap memoryAdapter with a persistent adapter (e.g., Prisma) in production
export const auth = betterAuth({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  trustedOrigins: [...allowedOrigins],
  database: new Pool({
    connectionString: process.env.POSTGRES_URL,
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID_WEB as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET_WEB,
      scope: ['openid', 'email', 'profile'],
    },
  },
  plugins: [nextCookies()],
  user: {
    additionalFields: {
      role: {
        type: 'string',
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
  },
});

export type AppAuth = typeof auth;
