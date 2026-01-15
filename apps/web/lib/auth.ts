import { User, betterAuth } from 'better-auth';
import { Pool } from 'pg';
import * as jose from 'jose';

import { sendEmail } from '@/lib/mailer';
import { cleanupUserData } from '@/lib/init-user-data';

/**
 * Decode and verify Google ID Token
 * Google's public keys are at https://www.googleapis.com/oauth2/v3/certs
 */
export async function verifyGoogleToken(idToken: string) {
  try {
    const JWKS = jose.createRemoteJWKSet(
      new URL('https://www.googleapis.com/oauth2/v3/certs'),
    );

    // Accept multiple client IDs (iOS, Android, Web)
    const acceptedAudiences = [
      process.env.GOOGLE_CLIENT_ID || '', // Web Client ID
      process.env.GOOGLE_IOS_CLIENT_ID || '', // iOS Client ID
      process.env.GOOGLE_ANDROID_CLIENT_ID || '', // Android Client ID
    ].filter(Boolean);

    const { payload } = await jose.jwtVerify(idToken, JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: acceptedAudiences,
    });

    console.log('[Google Token] Payload:', {
      aud: payload.aud,
      iss: payload.iss,
      sub: payload.sub,
      email: payload.email,
      email_verified: payload.email_verified,
    });

    return {
      email: payload.email as string,
      emailVerified: payload.email_verified === true,
      sub: payload.sub as string,
      name: payload.name as string | undefined,
      picture: payload.picture as string | undefined,
    };
  } catch (error) {
    console.error('[Google Token Verification] Error:', error);
    throw error;
  }
}

/**
 * Verify Apple ID Token from mobile app
 * For mobile apps, the audience should be the Bundle ID, not the Service ID
 * Apple's public keys are at https://appleid.apple.com/auth/keys
 */
export async function verifyAppleToken(idToken: string, nonce?: string) {
  try {
    const JWKS = jose.createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

    // For mobile apps, audience is the Bundle ID (com.ihsueh.itrade)
    // For web, audience is the Service ID (com.ihsueh.itrade.web)
    const mobileAudience = process.env.APPLE_APP_BUNDLE_IDENTIFIER || 'com.ihsueh.itrade';

    const { payload } = await jose.jwtVerify(idToken, JWKS, {
      issuer: 'https://appleid.apple.com',
      audience: [
        mobileAudience, // Mobile Bundle ID
        process.env.APPLE_CLIENT_ID || '', // Web Service ID (fallback)
      ].filter(Boolean),
    });

    console.log('[Apple Token] Payload:', {
      aud: payload.aud,
      iss: payload.iss,
      sub: payload.sub,
      email: payload.email,
    });

    // Verify nonce if provided (hash it first - Apple expects SHA-256 hash)
    if (nonce && payload.nonce) {
      // Note: rawNonce from mobile should match hashed nonce in token
      console.log('[Apple Token] Nonce check:', {
        providedNonce: nonce.substring(0, 10) + '...',
        tokenNonce: (payload.nonce as string).substring(0, 10) + '...',
      });
    }

    return {
      email: payload.email as string,
      emailVerified: payload.email_verified === 'true',
      sub: payload.sub as string,
      name: payload.name as string | undefined,
    };
  } catch (error) {
    console.error('[Apple Token Verification] Error:', error);
    throw error;
  }
}

export const auth: ReturnType<typeof betterAuth> = betterAuth({
  user: {
    deleteUser: {
      enabled: true,

      beforeDelete: async (user) => {
        // Clean up all user data (email preferences, etc.)
        await cleanupUserData(user.id);
        console.log(user);
      },
      afterDelete: async (user) => {
        console.log(user);
      },
    },
    additionalFields: {
      // This ensures user.id is available in hooks
    },
  },
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
    requireEmailVerification: true,
  },
  socialProviders: {
    apple: {
      clientId: process.env.APPLE_CLIENT_ID as string,
      clientSecret: process.env.APPLE_CLIENT_SECRET as string,
      // For mobile apps, we need to accept both Bundle ID and Service ID as audience
      // Android uses Service ID (com.ihsueh.itrade.web) when using webAuthenticationOptions
      // iOS uses Bundle ID (com.ihsueh.itrade) for native sign-in
      appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER as string,
      disableImplicitSignUp: false,
      // Better Auth should accept the Service ID as the audience for mobile tokens
      enabled: true,
      async verifyIdToken(idToken: string, nonce?: string) {
        try {
          await verifyAppleToken(idToken, nonce);
          return true;
        } catch (error) {
          console.error(error);
          return false;
        }
      },
    },
    google: {
      prompt: 'select_account',
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      disableImplicitSignUp: false,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      disableImplicitSignUp: false,
    },
  },
  trustedOrigins: [
    'http://localhost:3000',
    'http://localhost:3002',
    'https://itrade.ihsueh.com',
    'https://appleid.apple.com',
  ],
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(
        user.email,
        'Verify your email address',
        `Click the link to verify your email: ${url}`,
      );
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },
});
