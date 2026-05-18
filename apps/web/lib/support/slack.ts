/**
 * Slack API helper for the live-support bridge.
 *
 * Required env vars:
 *   SLACK_BOT_TOKEN     – xoxb-... token from your Slack app
 *   SLACK_CHANNEL_ID    – ID of the channel where support threads appear
 *
 * Optional:
 *   SLACK_SIGNING_SECRET – used to verify incoming webhook events
 */
import { createHmac } from 'crypto';

export function isConfigured(): boolean {
  return !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID);
}

// ── Sending messages ──────────────────────────────────────────────────────────

interface SlackPostResult {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
}

/**
 * Open a Slack thread the moment a user connects to live support
 * (before they send any message).
 * Returns { channelId, threadTs } that should be stored on the session.
 */
export async function notifyNewSession(
  sessionId: string,
): Promise<{ channelId: string; threadTs: string } | null> {
  if (!isConfigured()) return null;

  const channelId = process.env.SLACK_CHANNEL_ID!;
  const text =
    `🆕 *New Support Request* | Session \`${sessionId.slice(0, 8)}\`\n\n` +
    `_A user has connected and is waiting to describe their issue._\n\n` +
    `_Reply in this thread to respond inside the chat widget._`;

  const result = await slackPost('chat.postMessage', {
    channel: channelId,
    text,
    mrkdwn: true,
  });
  if (!result.ok || !result.ts) {
    console.error('[Support/Slack] Failed to open thread:', result.error);
    return null;
  }
  return { channelId, threadTs: result.ts };
}

/**
 * Post the opening message for a new support session (fallback — used when the
 * thread was not pre-opened at session creation).
 * Returns { channelId, threadTs } that should be stored on the session.
 */
export async function openSupportThread(
  sessionId: string,
  firstMessage: string,
): Promise<{ channelId: string; threadTs: string } | null> {
  if (!isConfigured()) return null;

  const channelId = process.env.SLACK_CHANNEL_ID!;
  const text =
    `🆕 *New Support Request* | Session \`${sessionId.slice(0, 8)}\`\n\n` +
    `*User:* ${firstMessage}\n\n` +
    `_Reply in this thread to respond inside the chat widget._`;

  const result = await slackPost('chat.postMessage', {
    channel: channelId,
    text,
    mrkdwn: true,
  });
  if (!result.ok || !result.ts) {
    console.error('[Support/Slack] Failed to open thread:', result.error);
    return null;
  }
  return { channelId, threadTs: result.ts };
}

/**
 * Post a follow-up user message as a reply in the existing thread.
 */
export async function postUserMessage(
  channelId: string,
  threadTs: string,
  content: string,
): Promise<void> {
  if (!isConfigured()) return;
  const result = await slackPost('chat.postMessage', {
    channel: channelId,
    thread_ts: threadTs,
    text: `*User:* ${content}`,
    mrkdwn: true,
  });
  if (!result.ok)
    console.error('[Support/Slack] Failed to post user message:', result.error);
}

/**
 * Post a system notice in the thread (e.g. session closed).
 */
export async function postSystemMessage(
  channelId: string,
  threadTs: string,
  text: string,
): Promise<void> {
  if (!isConfigured()) return;
  await slackPost('chat.postMessage', {
    channel: channelId,
    thread_ts: threadTs,
    text: `_${text}_`,
    mrkdwn: true,
  });
}

// ── Webhook verification ──────────────────────────────────────────────────────

/**
 * Verify that an incoming Slack event came from Slack's servers.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  slackSignature: string,
): boolean {
  const base = `v0:${timestamp}:${rawBody}`;
  const hmac = createHmac('sha256', signingSecret).update(base).digest('hex');
  const expected = `v0=${hmac}`;
  // Constant-time comparison
  if (expected.length !== slackSignature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ slackSignature.charCodeAt(i);
  }
  return diff === 0;
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function slackPost(
  method: string,
  body: Record<string, unknown>,
): Promise<SlackPostResult> {
  const token = process.env.SLACK_BOT_TOKEN!;
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<SlackPostResult>;
}
