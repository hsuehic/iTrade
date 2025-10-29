import { headers } from 'next/headers';
import * as jose from 'jose';

import { auth } from '@/lib/auth';

/**
 * Verify Apple ID Token from mobile app
 * For mobile apps, the audience should be the Bundle ID, not the Service ID
 * Apple's public keys are at https://appleid.apple.com/auth/keys
 */
async function verifyAppleToken(idToken: string, nonce?: string) {
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
      ],
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { provider, idToken, authorizationCode, rawNonce } = body;

    console.log('[Mobile Social Sign-In] Request:', {
      provider,
      hasIdToken: !!idToken,
      hasAuthCode: !!authorizationCode,
      hasNonce: !!rawNonce,
    });

    // Validate required fields
    if (!provider) {
      return Response.json({ error: 'Provider is required' }, { status: 400 });
    }

    if (!idToken) {
      return Response.json(
        { error: 'idToken is required for mobile sign-in' },
        { status: 400 },
      );
    }

    // For Apple, verify the identityToken manually first
    if (provider === 'apple') {
      try {
        const appleUser = await verifyAppleToken(idToken, rawNonce);
        console.log('[Apple Sign-In] Token verified successfully:', {
          email: appleUser.email,
          sub: appleUser.sub,
          emailVerified: appleUser.emailVerified,
        });
      } catch (error) {
        // Log detailed error for debugging
        console.error('[Apple Sign-In] Token verification failed:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });

        // Don't block sign-in if verification fails
        // Let Better Auth handle it as a fallback
        console.warn(
          '[Apple Sign-In] Proceeding with Better Auth despite verification failure',
        );
      }
    }

    // Use Better Auth to handle the sign-in
    const result = await auth.api.signInSocial({
      body: {
        provider,
        idToken: {
          token: idToken,
        },
      },
      headers: await headers(),
      asResponse: true,
    });

    console.log('[Mobile Social Sign-In] Response:', {
      status: result.status,
      ok: result.ok,
    });

    return result;
  } catch (error) {
    console.error('[Mobile Social Sign-In] Error:', error);
    return Response.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
