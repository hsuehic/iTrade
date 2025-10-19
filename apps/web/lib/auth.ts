import { User, betterAuth } from 'better-auth';
import { Pool } from 'pg';

import { sendEmail } from '@/lib/mailer';

export const auth = betterAuth({
  advanced: {
    cookies: {
      state: {
        attributes: {
          sameSite: 'none',
          secure: true,
        },
      },
    },
  },
  database: new Pool({
    connectionString: process.env.POSTGRES_URL as string,
  }),
  //...other options
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,

    resetPassword: {
      enabled: true,
      sendResetPassword: async ({
        user,
        url,
        token: _token,
      }: {
        user: User;
        url: string;
        token: string;
      }) => {
        await sendEmail(
          user.email,
          'Reset your password',
          `Click the link to reset your password: ${url}`,
        );
      },
    },
    sendResetPassword: async ({
      user,
      url,
      token: _token,
    }: {
      user: User;
      url: string;
      token: string;
    }) => {
      console.log('Reset Password:', user, url, _token);
      await sendEmail(
        user.email,
        'Reset your password',
        `Click the link to reset your password: ${url}`,
      );
    },
    resetPasswordTokenExpiresIn: 10 * 60 * 1000,

    onPasswordReset: async ({ user }, _request) => {
      // your logic here
      console.log(`Password for user ${user.email} has been reset.`);
    },
  },
  socialProviders: {
    apple: {
      clientId: process.env.APPLE_CLIENT_ID as string,
      clientSecret: process.env.APPLE_CLIENT_SECRET as string,
      // Optional
      appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER as string,
    },
    google: {
      prompt: 'select_account',
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      disableImplicitSignUp: true,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      disableImplicitSignUp: true,
    },
  },
  trustedOrigins: [
    'http://localhost:3000',
    'http://localhost:3002',
    'https://itrade.ihsueh.com',
    'https://appleid.apple.com',
  ],
});
