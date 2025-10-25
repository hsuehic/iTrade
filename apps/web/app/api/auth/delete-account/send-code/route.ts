import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { cookies } from 'next/headers';
import {
  generateVerificationCode,
  DELETE_ACCOUNT_VERIFICATION_COOKIE,
  VERIFICATION_COOKIE_OPTIONS,
} from '@/lib/verification-codes';
import { sendDeleteAccountVerificationEmail } from '@/lib/mailer';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return Response.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Verify email and password first by signing in (creates session)
    let signInResponse: Response;
    try {
      signInResponse = await auth.api.signInEmail({
        body: {
          email,
          password,
        },
        headers: await headers(),
        asResponse: true, // Get full Response with session cookies
      });

      if (!signInResponse.ok) {
        return Response.json({ error: 'Invalid email or password' }, { status: 401 });
      }
    } catch (error) {
      console.error('[DELETE ACCOUNT] Authentication error:', error);
      return Response.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Generate verification code
    const code = generateVerificationCode();

    // Store verification data in HTTP-only cookie
    const cookieStore = await cookies();
    const verificationData = {
      code,
      email,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    };

    cookieStore.set(
      DELETE_ACCOUNT_VERIFICATION_COOKIE,
      JSON.stringify(verificationData),
      VERIFICATION_COOKIE_OPTIONS,
    );

    // Send email with verification code
    try {
      await sendDeleteAccountVerificationEmail(email, code);
      console.log(`[DELETE ACCOUNT] Verification code sent to ${email}`);
    } catch (emailError) {
      console.error('[DELETE ACCOUNT] Failed to send email:', emailError);
      return Response.json(
        {
          error: 'Failed to send verification email. Please try again later.',
          message: (emailError as Error).message,
        },
        { status: 500 },
      );
    }

    // Log for server-side debugging
    console.log(`[DELETE ACCOUNT] Verification code for ${email}: ${code}`);
    console.log(
      `[DELETE ACCOUNT] Code expires at: ${new Date(verificationData.expiresAt).toISOString()}`,
    );

    // Build response with session cookies from sign-in
    const responseBody = {
      success: true,
      message: 'Verification code sent to your email',
      ...(process.env.NODE_ENV === 'development' && { devCode: code }),
    };

    const response = Response.json(responseBody);

    // Copy session cookies from sign-in response to our response
    const sessionCookies = signInResponse.headers.getSetCookie();
    sessionCookies.forEach((cookie) => {
      response.headers.append('Set-Cookie', cookie);
    });

    return response;
  } catch (error) {
    console.error('[DELETE ACCOUNT] Send code error:', error);
    return Response.json(
      {
        error: 'Failed to send verification code',
        message: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
