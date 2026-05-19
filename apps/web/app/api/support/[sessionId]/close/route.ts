/**
 * POST /api/support/[sessionId]/close
 * Closes a session and posts a goodbye notice in the Slack thread.
 */
import { NextRequest, NextResponse } from 'next/server';

import { getSession, closeSession } from '@/lib/support/repository';
import { postSystemMessage } from '@/lib/support/slack';
import { emitSessionClosed } from '@/lib/support/emitter';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const session = await getSession(sessionId);
  if (!session)
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });

  await closeSession(sessionId);

  // Push session_closed to any open SSE stream before notifying Slack
  emitSessionClosed(sessionId);

  if (session.slack_channel_id && session.slack_thread_ts) {
    await postSystemMessage(
      session.slack_channel_id,
      session.slack_thread_ts,
      'User ended the chat session.',
    );
  }

  return NextResponse.json({ ok: true });
}
