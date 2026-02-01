type PushInboxPayload = {
  notification?: { title?: string; body?: string };
  data?: Record<string, unknown>;
};

export type PushInboxMessage = {
  id: string;
  title?: string;
  body?: string;
  data: Record<string, string>;
  receivedAt: string;
  read: boolean;
};

export type PushInboxMessageInput = {
  id?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  receivedAt?: Date | string;
};

const STORAGE_KEY = 'itrade.push.inbox.v1';
const MAX_MESSAGES = 100;
const emitter = new EventTarget();

function isBrowser() {
  return typeof window !== 'undefined';
}

function safeParse(raw: string | null): PushInboxMessage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean) as PushInboxMessage[];
  } catch {
    return [];
  }
}

function normalizeData(data?: Record<string, unknown>): Record<string, string> {
  if (!data) return {};
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    ]),
  );
}

export function getPushInboxMessages(): PushInboxMessage[] {
  if (!isBrowser()) return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

function savePushInboxMessages(messages: PushInboxMessage[]) {
  if (!isBrowser()) return;
  const trimmed = messages
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .slice(0, MAX_MESSAGES);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  emitter.dispatchEvent(new Event('change'));
}

export function addPushInboxMessage(
  input: PushInboxMessageInput,
): PushInboxMessage | null {
  if (!isBrowser()) return null;
  const receivedAt =
    input.receivedAt instanceof Date
      ? input.receivedAt.toISOString()
      : (input.receivedAt ?? new Date().toISOString());
  const message: PushInboxMessage = {
    id: input.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title?.trim() || undefined,
    body: input.body?.trim() || undefined,
    data: normalizeData(input.data),
    receivedAt,
    read: false,
  };
  const existing = getPushInboxMessages();
  savePushInboxMessages([message, ...existing]);
  return message;
}

export function markPushInboxRead(id: string, read = true) {
  if (!isBrowser()) return;
  const messages = getPushInboxMessages().map((msg) =>
    msg.id === id ? { ...msg, read } : msg,
  );
  savePushInboxMessages(messages);
}

export function clearPushInbox() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  emitter.dispatchEvent(new Event('change'));
}

export function subscribePushInbox(callback: () => void) {
  emitter.addEventListener('change', callback);
  return () => emitter.removeEventListener('change', callback);
}

export function normalizePushPayload(payload: unknown): PushInboxMessageInput | null {
  if (!payload || typeof payload !== 'object') return null;
  const typed = payload as PushInboxPayload;
  const title =
    typed.notification?.title ||
    (typeof typed.data?.title === 'string' ? typed.data.title : undefined);
  const body =
    typed.notification?.body ||
    (typeof typed.data?.body === 'string' ? typed.data.body : undefined);
  const data = typed.data && typeof typed.data === 'object' ? typed.data : undefined;
  if (!title && !body && (!data || Object.keys(data).length === 0)) {
    return null;
  }
  return { title, body, data };
}
