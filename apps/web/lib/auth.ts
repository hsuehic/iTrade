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

// Use dynamic base URL detection if:
// 1. BETTER_AUTH_DYNAMIC_BASE_URL is explicitly set to 'true'
// 2. BETTER_AUTH_URL is not set (auto-detect from request)
// 3. Running locally in production mode (localhost)
const shouldUseDynamicBaseURL =
  process.env.BETTER_AUTH_DYNAMIC_BASE_URL === 'true' || !process.env.BETTER_AUTH_URL;

const baseURL = shouldUseDynamicBaseURL ? undefined : process.env.BETTER_AUTH_URL;
const trustedOrigins = Array.from(
  new Set(
    [
      'http://localhost:3000',
      'http://localhost:3002',
      'https://itrade.ihsueh.com',
      'https://appleid.apple.com',
      ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ].filter(Boolean),
  ),
);
const stateCookieDomain = process.env.BETTER_AUTH_COOKIE_DOMAIN;

export const createAuth = (baseURLOverride?: string): ReturnType<typeof betterAuth> =>
  betterAuth({
    ...(baseURLOverride ? { baseURL: baseURLOverride } : baseURL ? { baseURL } : {}),
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
            ...(stateCookieDomain ? { domain: stateCookieDomain } : {}),
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
      // Only include GitHub provider when credentials are configured
      ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: process.env.GITHUB_CLIENT_ID,
              clientSecret: process.env.GITHUB_CLIENT_SECRET,
              disableImplicitSignUp: false,
            },
          }
        : {}),
    },
    trustedOrigins,
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

export const auth: ReturnType<typeof betterAuth> = createAuth();

// Cache auth instances by baseURL to avoid re-initialization on every request
const authCache = new Map<string, ReturnType<typeof betterAuth>>();

/**
 * Get or create a cached auth instance for the given baseURL.
 * This prevents Better Auth from being re-initialized on every request,
 * which would log warnings and create unnecessary overhead.
 */
const getCachedAuth = (baseURL?: string): ReturnType<typeof betterAuth> => {
  const cacheKey = baseURL || '__default__';

  if (authCache.has(cacheKey)) {
    return authCache.get(cacheKey)!;
  }

  const authInstance = baseURL ? createAuth(baseURL) : auth;
  authCache.set(cacheKey, authInstance);
  return authInstance;
};

/**
 * Get the base URL from headers (works with both Request.headers and Headers from next/headers).
 * This is needed for API routes and server components to properly validate sessions.
 */
export const getBaseURLFromHeaders = (
  headers: Headers | { get: (name: string) => string | null },
): string | undefined => {
  const forwardedProto = headers.get('x-forwarded-proto');
  const forwardedHost = headers.get('x-forwarded-host');
  const host = forwardedHost ?? headers.get('host');

  if (!host) {
    return undefined;
  }

  const protocol =
    forwardedProto?.split(',')[0] ?? (host.startsWith('localhost') ? 'http' : 'https');
  const hostname = host.split(',')[0];

  return `${protocol}://${hostname}`;
};

/**
 * Get the base URL from a request object.
 * This is needed for API routes to properly validate sessions.
 */
export const getRequestBaseURL = (request: Request): string | undefined => {
  return getBaseURLFromHeaders(request.headers);
};

/**
 * Create an auth instance with the proper base URL from headers.
 * Use this in server components and API routes for better production compatibility.
 * Uses caching to avoid re-initialization on every request.
 */
export const getAuthFromHeaders = (
  headers: Headers | { get: (name: string) => string | null },
): ReturnType<typeof betterAuth> => {
  return getCachedAuth(getBaseURLFromHeaders(headers));
};

/**
 * Create an auth instance with the proper base URL from the request.
 * Use this in API routes instead of the singleton `auth` for better production compatibility.
 * Uses caching to avoid re-initialization on every request.
 */
export const getAuthFromRequest = (request: Request): ReturnType<typeof betterAuth> => {
  return getCachedAuth(getRequestBaseURL(request));
};

/**
 * Get session from request - the simplest way to get authenticated session in API routes.
 * This automatically handles the base URL detection for production compatibility.
 *
 * Usage in API routes:
 * ```ts
 * import { getSession } from '@/lib/auth';
 *
 * export async function GET(request: NextRequest) {
 *   const session = await getSession(request);
 *   if (!session?.user) {
 *     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *   }
 *   // ... your logic
 * }
 * ```
 */
export const getSession = async (request: Request) => {
  const auth = createAuth(getRequestBaseURL(request));
  return auth.api.getSession({ headers: request.headers });
};
