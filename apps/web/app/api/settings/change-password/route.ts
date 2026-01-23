import { getSession, getAuthFromRequest } from '@/lib/auth';
import { headers } from 'next/headers';

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword) {
      return Response.json({ error: 'Current password is required' }, { status: 400 });
    }

    if (!newPassword) {
      return Response.json({ error: 'New password is required' }, { status: 400 });
    }

    // Validate password requirements
    if (newPassword.length < 8) {
      return Response.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 },
      );
    }

    if (!/[A-Z]/.test(newPassword)) {
      return Response.json(
        { error: 'Password must contain at least one uppercase letter' },
        { status: 400 },
      );
    }

    if (!/[a-z]/.test(newPassword)) {
      return Response.json(
        { error: 'Password must contain at least one lowercase letter' },
        { status: 400 },
      );
    }

    if (!/[0-9]/.test(newPassword)) {
      return Response.json(
        { error: 'Password must contain at least one number' },
        { status: 400 },
      );
    }

    // Change password using better-auth
    const auth = getAuthFromRequest(req);
    const data = await auth.api.changePassword({
      body: {
        newPassword,
        currentPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });

    return Response.json({ success: true, ...data });
  } catch (error) {
    console.error('Error changing password:', error);

    // Handle specific error messages
    const errorMessage =
      (error as { message?: string }).message || 'Failed to change password';

    // Check for common error cases
    if (
      errorMessage.toLowerCase().includes('incorrect') ||
      errorMessage.toLowerCase().includes('invalid')
    ) {
      return Response.json(
        { success: false, error: 'Current password is incorrect' },
        { status: 400 },
      );
    }

    return Response.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
