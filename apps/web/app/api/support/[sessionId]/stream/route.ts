/**
 * GET /api/support/[sessionId]/stream
 *
 * Server-Sent Events stream for live-support conversations.
 *
 * On connection:
 *   1. Validates the session exists.
 *   2. Replays all existing messages as catch-up events.
 *   3. Holds the connection open and pushes new events as they arrive
 *      via the in-process emitter (see lib/support/emitter.ts).
 *   4. Sends a keepalive comment every 15 s to prevent proxy / mobile
 *      network timeouts.
 *   5. Cleans up all listeners when the client disconnects.
 *
 * SSE event protocol
 * ──────────────────
 *   event: message        data: SupportMessage
 *     A chat message (role: "user" or "supporter").
 *     Sent for every historical message on connect, then for each new one.
 *
 *   event: session_closed data: {}
 *     The session was closed (by the user or the support team via Slack).
 *     The client should stop accepting input and display an ended notice.
 *
 *   : keepalive
 *     SSE comment (no event name, no data). Keeps the TCP connection alive.
 *
 * Authentication
 * ──────────────
 * Sessions are identified by a secret UUID created at session-creation time
 * and stored only in the client. No cookie auth is required — possession of
 * the UUID is sufficient proof of ownership for this anonymous widget.
 */
import { NextRequest } from 'next/server';

import { getSession, getAllMessages } from '@/lib/support/repository';
import { subscribeToSession, subscribeToClose } from '@/lib/support/emitter';

// Allow this route to stream for up to 5 minutes before Next.js force-closes it.
// The client will automatically reconnect if the server closes the stream.
export const maxDuration = 300;

const enc = new TextEncoder();

const SSE_HEADERS: HeadersInit = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no', // disable nginx response buffering
};

function sseFrame(event: string, data: unknown): Uint8Array {
  return enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sseComment(text: string): Uint8Array {
  return enc.encode(`: ${text}\n\n`);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  const session = await getSession(sessionId);
  if (!session) return new Response('Session not found', { status: 404 });

  // If the session is already closed, return a minimal stream with one event.
  if (session.status === 'closed') {
    const body = new ReadableStream({
      start(c) {
        c.enqueue(sseFrame('session_closed', {}));
        c.close();
      },
    });
    return new Response(body, { headers: SSE_HEADERS });
  }

  const responseStream = new ReadableStream({
    async start(controller) {
      let closed = false;

      /** Write a frame to the stream, ignoring errors from a closed controller. */
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(sseFrame(event, data));
        } catch {
          // Controller already closed — silently swallow
        }
      };

      /** Tear down all listeners, clear timers, and close the controller. */
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepaliveTimer);
        unsubMsg();
        unsubClose();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // ── 1. Catch-up: replay all existing messages ─────────────────────────
      try {
        const existing = await getAllMessages(sessionId);
        for (const msg of existing) {
          send('message', msg);
        }
      } catch {
        // Non-fatal — client will just not see historical messages
      }

      // ── 2. Subscribe to live events ───────────────────────────────────────
      const unsubMsg = subscribeToSession(sessionId, (msg) => {
        send('message', msg);
      });

      const unsubClose = subscribeToClose(sessionId, () => {
        send('session_closed', {});
        cleanup();
      });

      // ── 3. Keepalive every 15 s ───────────────────────────────────────────
      const keepaliveTimer = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(sseComment('keepalive'));
        } catch {
          cleanup();
        }
      }, 15_000);

      // ── 4. Clean up on client disconnect ──────────────────────────────────
      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(responseStream, { headers: SSE_HEADERS });
}
