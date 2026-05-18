/**
 * POST /api/support/session
 * Creates a new live-support session and returns its ID.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

import { checkRateLimit, getClientIp } from '@/lib/help-kb/rate-limit';
import { createSession, setSlackThread } from '@/lib/support/repository';
import { notifyNewSession } from '@/lib/support/slack';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(ip);
  if (!rl.allowed)
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  let locale = 'en';
  try {
    const body = (await request.json()) as { locale?: string };
    if (body.locale && /^[a-z]{2}$/i.test(body.locale)) locale = body.locale;
  } catch {
    /* default */
  }

  const sessionId = randomUUID();
  await createSession(sessionId, locale);

  // Open the Slack thread immediately so the support team is notified
  // the moment a user connects — before they type anything.
  const thread = await notifyNewSession(sessionId);
  if (thread) {
    await setSlackThread(sessionId, thread.channelId, thread.threadTs);
  }

  return NextResponse.json({ sessionId });
}
