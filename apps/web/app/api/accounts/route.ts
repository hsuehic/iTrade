import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import * as accountService from '@/lib/services/account-service';
import { notifyConfigChange } from '@/lib/console-notify';
import { isValidExchange } from '@itrade/data-manager';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accounts = await accountService.getUserAccounts(session.user.id);
    return NextResponse.json(accounts);
  } catch (error) {
    console.error('Failed to fetch accounts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate body.
    // On CREATE, credentials are mandatory. On EDIT (id present), credential
    // fields may be empty/omitted — the service keeps the stored values
    // (blank = "keep existing", masked apiKey = "keep existing").
    if (!body.exchange) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!body.id && (!body.apiKey || !body.secretKey)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!isValidExchange(body.exchange)) {
      return NextResponse.json({ error: 'Invalid exchange' }, { status: 400 });
    }

    const account = await accountService.upsertAccount({
      ...body,
      userId: session.user.id,
    });

    // Wake console immediately instead of waiting for the next polling tick
    void notifyConfigChange({ kind: 'account', userId: session.user.id });

    return NextResponse.json({ success: true, account });
  } catch (error) {
    // Credential failures are user input errors, not server faults: return a
    // structured 400 so the client can render the venue's own message.
    if (error instanceof accountService.CredentialVerificationError) {
      return NextResponse.json(
        {
          error: 'Invalid credentials',
          reason: error.reason,
          venueCode: error.venueCode,
          venueMessage: error.venueMessage,
        },
        { status: 400 },
      );
    }
    console.error('Failed to save account:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
