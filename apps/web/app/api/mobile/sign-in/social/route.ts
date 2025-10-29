import { headers } from 'next/headers';

import { auth, verifyAppleToken, verifyGoogleToken } from '@/lib/auth';

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

    // For Google, verify the idToken and log details
    if (provider === 'google') {
      try {
        const googleUser = await verifyGoogleToken(idToken);
        console.log('[Google Sign-In] Token verified successfully:', {
          email: googleUser.email,
          sub: googleUser.sub,
          emailVerified: googleUser.emailVerified,
          aud: 'See [Google Token] Payload log above',
        });
      } catch (error) {
        console.error('[Google Sign-In] Token verification failed:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
        console.warn(
          '[Google Sign-In] Proceeding with Better Auth despite verification failure',
        );
      }
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
    // For mobile apps, we pass the idToken directly
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

    console.log('[Mobile Social Sign-In] Better Auth Response:', {
      status: result.status,
      ok: result.ok,
      headers: Object.fromEntries(result.headers.entries()),
    });

    // Check if the response contains an error message
    if (!result.ok) {
      const responseData = await result
        .clone()
        .json()
        .catch(() => ({}));
      console.error('[Mobile Social Sign-In] Failed:', responseData);
    }

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
