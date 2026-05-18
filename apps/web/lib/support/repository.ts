/**
 * Thin raw-SQL repository for the live-support chat tables.
 *
 * Tables are created on first use (CREATE TABLE IF NOT EXISTS) — no migration step needed.
 */
import { getDataManager } from '@/lib/data-manager';

// ── Schema bootstrap ──────────────────────────────────────────────────────────

let schemaReady = false;

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const dm = await getDataManager();
  await dm.dataSource.query(`
    CREATE TABLE IF NOT EXISTS support_chat_sessions (
      id                TEXT PRIMARY KEY,
      status            TEXT NOT NULL DEFAULT 'active',
      locale            TEXT NOT NULL DEFAULT 'en',
      slack_channel_id  TEXT,
      slack_thread_ts   TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_support_sessions_slack_thread
      ON support_chat_sessions(slack_thread_ts)
      WHERE slack_thread_ts IS NOT NULL;

    CREATE TABLE IF NOT EXISTS support_chat_messages (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES support_chat_sessions(id) ON DELETE CASCADE,
      role        TEXT NOT NULL,
      content     TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_support_msgs_session
      ON support_chat_messages(session_id, created_at);
  `);
  schemaReady = true;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SupportSession {
  id: string;
  status: 'active' | 'closed';
  locale: string;
  slack_channel_id: string | null;
  slack_thread_ts: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SupportMessage {
  id: string;
  session_id: string;
  role: 'user' | 'supporter';
  content: string;
  created_at: Date;
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function createSession(id: string, locale = 'en'): Promise<SupportSession> {
  await ensureSchema();
  const dm = await getDataManager();
  const rows = await dm.dataSource.query<SupportSession[]>(
    `INSERT INTO support_chat_sessions (id, locale) VALUES ($1, $2) RETURNING *`,
    [id, locale],
  );
  return rows[0];
}

export async function setSlackThread(
  sessionId: string,
  channelId: string,
  threadTs: string,
): Promise<void> {
  await ensureSchema();
  const dm = await getDataManager();
  await dm.dataSource.query(
    `UPDATE support_chat_sessions
     SET slack_channel_id = $1, slack_thread_ts = $2, updated_at = NOW()
     WHERE id = $3`,
    [channelId, threadTs, sessionId],
  );
}

export async function getSession(id: string): Promise<SupportSession | null> {
  await ensureSchema();
  const dm = await getDataManager();
  const rows = await dm.dataSource.query<SupportSession[]>(
    `SELECT * FROM support_chat_sessions WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getSessionBySlackThread(
  threadTs: string,
): Promise<SupportSession | null> {
  await ensureSchema();
  const dm = await getDataManager();
  const rows = await dm.dataSource.query<SupportSession[]>(
    `SELECT * FROM support_chat_sessions WHERE slack_thread_ts = $1 LIMIT 1`,
    [threadTs],
  );
  return rows[0] ?? null;
}

export async function closeSession(id: string): Promise<void> {
  await ensureSchema();
  const dm = await getDataManager();
  await dm.dataSource.query(
    `UPDATE support_chat_sessions SET status = 'closed', updated_at = NOW() WHERE id = $1`,
    [id],
  );
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function addMessage(
  id: string,
  sessionId: string,
  role: 'user' | 'supporter',
  content: string,
): Promise<SupportMessage> {
  await ensureSchema();
  const dm = await getDataManager();
  const rows = await dm.dataSource.query<SupportMessage[]>(
    `INSERT INTO support_chat_messages (id, session_id, role, content)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, sessionId, role, content],
  );
  await dm.dataSource.query(
    `UPDATE support_chat_sessions SET updated_at = NOW() WHERE id = $1`,
    [sessionId],
  );
  return rows[0];
}

export async function getMessagesSince(
  sessionId: string,
  since: Date,
): Promise<SupportMessage[]> {
  await ensureSchema();
  const dm = await getDataManager();
  return dm.dataSource.query<SupportMessage[]>(
    `SELECT * FROM support_chat_messages
     WHERE session_id = $1 AND created_at > $2
     ORDER BY created_at ASC`,
    [sessionId, since],
  );
}

export async function getAllMessages(sessionId: string): Promise<SupportMessage[]> {
  await ensureSchema();
  const dm = await getDataManager();
  return dm.dataSource.query<SupportMessage[]>(
    `SELECT * FROM support_chat_messages WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId],
  );
}
