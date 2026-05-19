/**
 * POST /api/support/[sessionId]/send
 * Stores a user message and forwards it to the Slack support thread.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

import { checkRateLimit, getClientIp } from '@/lib/help-kb/rate-limit';
import { getSession, addMessage, setSlackThread } from '@/lib/support/repository';
import { emitSupportMessage } from '@/lib/support/emitter';
import { openSupportThread, postUserMessage, postUserImage } from '@/lib/support/slack';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(ip);
  if (!rl.allowed)
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  const { sessionId } = await params;
  let session = await getSession(sessionId);
  if (!session)
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  if (session.status === 'closed')
    return NextResponse.json({ error: 'Session closed.' }, { status: 410 });

  let content = '';
  let images: string[] = [];
  try {
    const body = (await request.json()) as { content?: string; images?: string[] };
    content = body.content?.trim() ?? '';
    images = (body.images ?? []).slice(0, 5); // cap at 5 images
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  if (!content && images.length === 0)
    return NextResponse.json({ error: 'Content or images required.' }, { status: 400 });
  if (content.length > 2000)
    return NextResponse.json({ error: 'Message too long.' }, { status: 400 });

  const savedIds: string[] = [];

  // Store and forward text message
  if (content) {
    const messageId = randomUUID();
    const msg = await addMessage(messageId, sessionId, 'user', content);
    savedIds.push(messageId);

    if (!session.slack_thread_ts) {
      const thread = await openSupportThread(sessionId, content);
      if (thread) {
        await setSlackThread(sessionId, thread.channelId, thread.threadTs);
        // Reload session so later image uploads see the thread_ts
        session = (await getSession(sessionId))!;
      }
    } else {
      await postUserMessage(session.slack_channel_id!, session.slack_thread_ts, content);
    }

    emitSupportMessage(sessionId, msg);
  }

  // Store, emit, and forward each image as a separate message.
  // We collect Slack upload promises and await them all before responding so
  // the upload is not killed when the serverless execution context is frozen.
  const slackImageUploads: Promise<void>[] = [];

  for (const dataUrl of images) {
    if (!dataUrl.startsWith('data:image/')) continue;
    const imgId = randomUUID();
    const imgMsg = await addMessage(imgId, sessionId, 'user', dataUrl);
    savedIds.push(imgId);

    if (session.slack_thread_ts) {
      slackImageUploads.push(
        postUserImage(session.slack_channel_id!, session.slack_thread_ts, dataUrl).catch(
          (err) => console.error('[Support/Send] Slack image upload error:', err),
        ),
      );
    }

    emitSupportMessage(sessionId, imgMsg);
  }

  // Await all Slack uploads before returning — prevents the serverless runtime
  // from freezing the execution context mid-upload.
  if (slackImageUploads.length > 0) {
    await Promise.all(slackImageUploads);
  }

  return NextResponse.json({ messageIds: savedIds });
}
