import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import * as accountService from '@/lib/services/account-service';
import { notifyConfigChange } from '@/lib/console-notify';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Validate ID
    const accId = parseInt(id);
    if (isNaN(accId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const success = await accountService.removeAccount(accId, session.user.id);
    if (success) {
      // Wake console immediately so it tears down this exchange connection/bot
      void notifyConfigChange({ kind: 'account', userId: session.user.id });
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: 'Account not found or not owned by user' },
        { status: 404 },
      );
    }
  } catch (error) {
    console.error('Failed to delete account:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
