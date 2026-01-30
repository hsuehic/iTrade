
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import * as accountService from '@/lib/services/account-service';
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
    
    // Validate body
    if (!body.exchange || !body.apiKey || !body.secretKey) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!isValidExchange(body.exchange)) {
        return NextResponse.json({ error: 'Invalid exchange' }, { status: 400 });
    }

    const account = await accountService.upsertAccount({
        ...body,
        userId: session.user.id
    });

    return NextResponse.json({ success: true, account });
  } catch (error) {
    console.error('Failed to save account:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
