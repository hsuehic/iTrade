/**
 * POST /api/webhooks/slack
 * GET  /api/webhooks/slack  (URL verification challenge)
 *
 * Receives Slack Events API payloads. When a message is posted in the support
 * thread by anyone OTHER than the bot, it is stored as a 'supporter' reply and
 * becomes available to the polling widget.
 *
 * Slack app setup required:
 *   - Event Subscriptions → Request URL: https://<your-domain>/api/webhooks/slack
 *   - Subscribe to bot events: message.channels
 *   - Bot Token Scopes: chat:write, channels:history, channels:read
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

import { verifySlackSignature } from '@/lib/support/slack';
import { getSessionBySlackThread, addMessage } from '@/lib/support/repository';
import { emitSupportMessage } from '@/lib/support/emitter';

// Slack expects a response within 3 seconds — keep this fast.
export const maxDuration = 10;

// ── GET: URL verification (Slack sends this once when you configure the endpoint) ──

export async function GET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get('challenge');
  if (challenge) return NextResponse.json({ challenge });
  return NextResponse.json({ ok: true });
}

// ── POST: Events ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signingSecret = process.env.SLACK_SIGNING_SECRET ?? '';

  // Verify signature when secret is configured.
  if (signingSecret) {
    const timestamp = request.headers.get('x-slack-request-timestamp') ?? '';
    const signature = request.headers.get('x-slack-signature') ?? '';

    // Reject requests older than 5 minutes (replay attack prevention).
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      return NextResponse.json({ error: 'Request too old.' }, { status: 400 });
    }

    if (!verifySlackSignature(signingSecret, timestamp, rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
    }
  }

  let payload: SlackEventPayload;
  try {
    payload = JSON.parse(rawBody) as SlackEventPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  // Slack URL verification challenge (POST variant).
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type === 'event_callback') {
    const event = payload.event;

    // We only care about thread replies (messages with a thread_ts that differs
    // from the message ts, meaning it's a reply not the root post).
    if (
      event.type === 'message' &&
      event.thread_ts &&
      event.ts !== event.thread_ts && // it's a reply, not the root
      !event.bot_id && // not from our own bot
      !event.subtype // not a system message (e.g. "joined channel")
    ) {
      try {
        const session = await getSessionBySlackThread(event.thread_ts);
        if (session && session.status === 'active') {
          const msg = await addMessage(
            randomUUID(),
            session.id,
            'supporter',
            event.text ?? '',
          );
          // Push the new message to any open SSE stream for this session
          emitSupportMessage(session.id, msg);
        }
      } catch (err) {
        console.error('[Slack Webhook] Error storing reply:', err);
      }
    }
  }

  // Always respond 200 quickly to avoid Slack retries.
  return NextResponse.json({ ok: true });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SlackEvent {
  type: string;
  ts?: string;
  thread_ts?: string;
  text?: string;
  bot_id?: string;
  subtype?: string;
}

interface SlackEventPayload {
  type: string;
  challenge?: string;
  event: SlackEvent;
}
