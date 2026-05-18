/**
 * POST /api/support/[sessionId]/send
 * Stores a user message and forwards it to the Slack support thread.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

import { checkRateLimit, getClientIp } from '@/lib/help-kb/rate-limit';
import { getSession, addMessage, setSlackThread } from '@/lib/support/repository';
import { openSupportThread, postUserMessage } from '@/lib/support/slack';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(ip);
  if (!rl.allowed)
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  const { sessionId } = await params;
  const session = await getSession(sessionId);
  if (!session)
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  if (session.status === 'closed')
    return NextResponse.json({ error: 'Session closed.' }, { status: 410 });

  let content = '';
  try {
    const body = (await request.json()) as { content?: string };
    content = body.content?.trim() ?? '';
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  if (!content) return NextResponse.json({ error: 'Content required.' }, { status: 400 });
  if (content.length > 2000)
    return NextResponse.json({ error: 'Message too long.' }, { status: 400 });

  const messageId = randomUUID();
  await addMessage(messageId, sessionId, 'user', content);

  if (!session.slack_thread_ts) {
    // Fallback: thread should have been opened at session creation, but open
    // it now if that failed for any reason.
    const thread = await openSupportThread(sessionId, content);
    if (thread) {
      await setSlackThread(sessionId, thread.channelId, thread.threadTs);
    }
  } else {
    // Forward every user message as a reply in the existing thread.
    await postUserMessage(session.slack_channel_id!, session.slack_thread_ts, content);
  }

  return NextResponse.json({ messageId });
}
