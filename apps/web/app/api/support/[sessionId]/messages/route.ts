/**
 * GET /api/support/[sessionId]/messages?since=<ISO timestamp>
 * Polling endpoint — returns all new messages after the given timestamp.
 * The widget calls this every 2 seconds.
 */
import { NextRequest, NextResponse } from 'next/server';

import { getSession, getMessagesSince, getAllMessages } from '@/lib/support/repository';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const session = await getSession(sessionId);
  if (!session)
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });

  const sinceParam = request.nextUrl.searchParams.get('since');
  const since = sinceParam ? new Date(sinceParam) : new Date(0);

  const messages = sinceParam
    ? await getMessagesSince(sessionId, since)
    : await getAllMessages(sessionId);

  return NextResponse.json({
    messages,
    sessionStatus: session.status,
  });
}
