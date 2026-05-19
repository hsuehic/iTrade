/**
 * In-process EventEmitter for live-support SSE delivery.
 *
 * Works in a single-process Docker deployment where the Slack webhook handler
 * and the SSE stream handler run in the same Node.js process.
 *
 * If you ever scale to multiple Next.js instances, replace the EventEmitter
 * here with a Redis pub/sub adapter (e.g. ioredis subscribe/publish) while
 * keeping the same public API surface.
 *
 * Usage:
 *   • After storing a supporter reply, call emitSupportMessage()
 *   • After closing a session, call emitSessionClosed()
 *   • The SSE stream route subscribes via subscribeToSession() / subscribeToClose()
 */
import { EventEmitter } from 'events';

import type { SupportMessage } from './repository';

// Module-level singleton — persists for the lifetime of the Node.js process.
const _emitter = new EventEmitter();
// Allow up to 2000 concurrent listeners (1 per active session × 2 event types).
_emitter.setMaxListeners(2000);

// ── Emit helpers (called by webhook / close routes) ───────────────────────────

/** Push a new supporter message to any open SSE stream for this session. */
export function emitSupportMessage(sessionId: string, message: SupportMessage): void {
  _emitter.emit(`msg:${sessionId}`, message);
}

/** Signal that a session has been closed to any open SSE stream. */
export function emitSessionClosed(sessionId: string): void {
  _emitter.emit(`close:${sessionId}`);
}

// ── Subscribe helpers (called by the SSE stream route) ────────────────────────

/**
 * Subscribe to new messages for a session.
 * Returns an unsubscribe function — always call it on cleanup.
 */
export function subscribeToSession(
  sessionId: string,
  callback: (msg: SupportMessage) => void,
): () => void {
  _emitter.on(`msg:${sessionId}`, callback);
  return () => _emitter.off(`msg:${sessionId}`, callback);
}

/**
 * Subscribe (once) to a session-closed event.
 * Returns an unsubscribe function in case cleanup is needed before it fires.
 */
export function subscribeToClose(sessionId: string, callback: () => void): () => void {
  _emitter.once(`close:${sessionId}`, callback);
  return () => _emitter.off(`close:${sessionId}`, callback);
}
