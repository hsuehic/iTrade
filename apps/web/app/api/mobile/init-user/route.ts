import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { initializeUserData } from '@/lib/init-user-data';

export const dynamic = 'force-dynamic';

/**
 * Initialize user data after sign-up
 * This endpoint should be called once after a user successfully signs up
 */
export async function POST(req: NextRequest) {
  try {
    // Verify the user is authenticated
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Initialize email preferences and other user data
    await initializeUserData(session.user.id);

    return NextResponse.json({
      success: true,
      message: 'User data initialized successfully'
    });
  } catch (error) {
    console.error('Error initializing user data:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to initialize user data',
        message: (error as Error).message
      },
      { status: 500 }
    );
  }
}

