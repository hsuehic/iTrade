import { auth } from '@/lib/auth';
import { cookies } from 'next/headers';
import { DELETE_ACCOUNT_VERIFICATION_COOKIE } from '@/lib/verification-codes';

export async function DELETE(req: Request) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return Response.json(
        { error: 'Email and verification code are required' },
        { status: 400 },
      );
    }

    // Get verification data from HTTP-only cookie
    const cookieStore = await cookies();
    const verificationCookie = cookieStore.get(DELETE_ACCOUNT_VERIFICATION_COOKIE);

    if (!verificationCookie) {
      return Response.json(
        { error: 'Verification code not found or expired. Please request a new code.' },
        { status: 400 },
      );
    }

    let verificationData: {
      code: string;
      email: string;
      expiresAt: number;
    };

    try {
      verificationData = JSON.parse(verificationCookie.value);
    } catch (error) {
      console.error('[DELETE ACCOUNT] Cookie parse error:', error);
      return Response.json(
        { error: 'Invalid verification data. Please request a new code.' },
        { status: 400 },
      );
    }

    // Verify expiration
    if (verificationData.expiresAt < Date.now()) {
      // Clear expired cookie
      cookieStore.delete(DELETE_ACCOUNT_VERIFICATION_COOKIE);
      return Response.json(
        { error: 'Verification code has expired. Please request a new code.' },
        { status: 400 },
      );
    }

    // Verify email matches
    if (verificationData.email !== email) {
      return Response.json(
        { error: 'Email does not match the verification request' },
        { status: 400 },
      );
    }

    // Verify code matches
    if (verificationData.code !== code) {
      return Response.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    // Verify user still has valid session (from send-code endpoint)
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) {
      return Response.json(
        { error: 'Session expired, please try again' },
        { status: 401 },
      );
    }

    // Verify session user matches the email
    if (session.user.email !== email) {
      return Response.json({ error: 'Session user does not match' }, { status: 401 });
    }

    // All verifications passed - delete the account using better-auth
    try {
      // Use existing session from req.headers (same pattern as mobile/delete-account)
      await auth.api.deleteUser({
        headers: req.headers,
        body: {},
      });

      // Clear verification cookie
      cookieStore.delete(DELETE_ACCOUNT_VERIFICATION_COOKIE);

      console.log(`[DELETE ACCOUNT] Account deleted successfully for ${email}`);

      return Response.json({
        success: true,
        message: 'Account deleted successfully',
      });
    } catch (error) {
      console.error('[DELETE ACCOUNT] Delete user error:', error);
      return Response.json(
        {
          error: 'Failed to delete account',
          message: (error as Error).message,
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('[DELETE ACCOUNT] Verify error:', error);
    return Response.json(
      {
        error: 'Failed to verify and delete account',
        message: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
