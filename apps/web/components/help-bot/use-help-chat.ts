'use client';

import { useCallback, useState } from 'react';

export interface HelpCitation {
  slug: string;
  title: string;
}

export interface HelpMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: HelpCitation[];
  timestamp: Date;
  /** True while waiting for the first token (shows loading dots). */
  isLoading?: boolean;
  /** True while tokens are streaming in (shows blinking cursor). */
  isStreaming?: boolean;
}

const WELCOME_MESSAGE = (locale: string): HelpMessage => ({
  id: 'welcome',
  role: 'assistant',
  content:
    locale === 'zh'
      ? '你好！我是 **iTrade 帮助助手** 👋\n\n我可以回答关于 iTrade 的功能、移动应用、安装、账户和故障排除的问题。试试看：\n- *什么是 iTrade？*\n- *如何下载 Android 版？*\n- *如何连接币安账户？*'
      : "Hi! I'm the **iTrade Help Assistant** 👋\n\nI can answer questions about iTrade features, the mobile app, installation, accounts, and troubleshooting. Try:\n- *What is iTrade?*\n- *How do I install the Android app?*\n- *How do I connect my Binance account?*",
  timestamp: new Date(),
});

// ── SSE parser ────────────────────────────────────────────────────────────────

function parseSSEChunk(buffer: string): {
  events: Array<{ event: string; data: string }>;
  remaining: string;
} {
  const parts = buffer.split('\n\n');
  const remaining = parts.pop() ?? '';
  const events: Array<{ event: string; data: string }> = [];

  for (const part of parts) {
    let event = 'message';
    let data = '';
    for (const line of part.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) data = line.slice(6);
    }
    if (data) events.push({ event, data });
  }

  return { events, remaining };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useHelpChat(locale: string = 'en') {
  const [messages, setMessages] = useState<HelpMessage[]>([WELCOME_MESSAGE(locale)]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      const userMessage: HelpMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      };

      const placeholderId = `assistant-${Date.now()}`;
      const placeholder: HelpMessage = {
        id: placeholderId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isLoading: true,
      };

      // Build history snapshot before updating state
      const history = messages
        .filter((m) => !m.isLoading && !m.isStreaming && m.id !== 'welcome')
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, userMessage, placeholder]);
      setIsLoading(true);

      try {
        const res = await fetch('/api/help-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed, history, locale }),
        });

        if (!res.body) throw new Error('No response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let pendingCitations: HelpCitation[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const { events, remaining } = parseSSEChunk(buffer);
          buffer = remaining;

          for (const { event, data } of events) {
            let parsed: unknown;
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }

            if (event === 'token') {
              const text = (parsed as { text: string }).text ?? '';
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === placeholderId
                    ? {
                        ...m,
                        content: m.content + text,
                        isLoading: false,
                        isStreaming: true,
                      }
                    : m,
                ),
              );
            } else if (event === 'citations') {
              pendingCitations = parsed as HelpCitation[];
            } else if (event === 'done') {
              const { cleanText } = parsed as { cleanText: string };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === placeholderId
                    ? {
                        ...m,
                        content: cleanText,
                        citations: pendingCitations,
                        isLoading: false,
                        isStreaming: false,
                      }
                    : m,
                ),
              );
              setIsLoading(false);
            } else if (event === 'error') {
              const { message: errMsg } = parsed as { message: string };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === placeholderId
                    ? {
                        ...m,
                        content: `Sorry, I ran into a problem: ${errMsg}`,
                        isLoading: false,
                        isStreaming: false,
                      }
                    : m,
                ),
              );
              setIsLoading(false);
            }
          }
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId
              ? {
                  ...m,
                  content:
                    "Sorry, I couldn't connect. Please check your network and try again.",
                  isLoading: false,
                  isStreaming: false,
                }
              : m,
          ),
        );
        setIsLoading(false);
      }
    },
    [locale, messages],
  );

  const clearMessages = useCallback(() => {
    setMessages([WELCOME_MESSAGE(locale)]);
  }, [locale]);

  return { messages, isLoading, sendMessage, clearMessages };
}
