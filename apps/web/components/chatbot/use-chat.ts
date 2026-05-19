'use client';

import { useState, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Base64 dataURLs attached by the user (only present on user messages). */
  images?: string[];
  renderData?: {
    renderAs?: 'table' | 'chart' | 'text' | 'strategy_proposal';
    title?: string;
    data?: unknown;
    chartConfig?: unknown;
  } | null;
  timestamp: Date;
  /** True while waiting for the first token (shows loading dots). */
  isLoading?: boolean;
  /** True while tokens are streaming in (shows blinking cursor, not dots). */
  isStreaming?: boolean;
}

// ── SSE parser ────────────────────────────────────────────────────────────────

/**
 * Parse a raw SSE chunk buffer into a list of { event, data } objects.
 * Events are separated by blank lines (\n\n). Any incomplete trailing event
 * is returned as the new buffer to be prepended to the next chunk.
 */
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

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hi! I'm **iTrade AI** 👋\n\nI can analyze your trading performance **and create new strategies** for you. Try:\n- *How much did I earn last month?*\n- *What's my most profitable strategy?*\n- *Create a SpreadGrid strategy for BTC/USDT on Binance*\n- *Set up a MovingAverage strategy for ETH on OKX*",
      renderData: null,
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(
    async (content: string, images?: string[]) => {
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        images,
        renderData: null,
        timestamp: new Date(),
      };

      // Placeholder shown while waiting for the first token
      const placeholderId = `assistant-${Date.now()}`;
      const placeholder: ChatMessage = {
        id: placeholderId,
        role: 'assistant',
        content: '',
        renderData: null,
        timestamp: new Date(),
        isLoading: true,
      };

      setMessages((prev) => [...prev, userMessage, placeholder]);
      setIsLoading(true);

      // Build history snapshot (exclude welcome + in-flight placeholders)
      const history = messages
        .filter((m) => !m.isLoading && !m.isStreaming && m.id !== 'welcome')
        .map((m) => ({
          role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
          content: m.content,
        }));

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: content, history, images }),
        });

        if (!res.body) throw new Error('No response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // Track accumulated renderData between events
        let pendingRenderData: ChatMessage['renderData'] = null;

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
            } else if (event === 'render_data') {
              pendingRenderData = parsed as ChatMessage['renderData'];
              // Attach renderData immediately so it renders as soon as it arrives
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === placeholderId ? { ...m, renderData: pendingRenderData } : m,
                ),
              );
            } else if (event === 'done') {
              const { cleanText } = parsed as { cleanText: string };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === placeholderId
                    ? {
                        ...m,
                        content: cleanText,
                        isLoading: false,
                        isStreaming: false,
                        renderData: pendingRenderData,
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
                        content: `Sorry, I encountered an error: ${errMsg}`,
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
                  content: 'Sorry, I had trouble connecting. Please try again.',
                  isLoading: false,
                  isStreaming: false,
                }
              : m,
          ),
        );
        setIsLoading(false);
      }
    },
    [messages],
  );

  const clearMessages = useCallback(() => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content:
          "Hi! I'm **iTrade AI** 👋\n\nI can analyze your trading performance **and create new strategies** for you. Try:\n- *How much did I earn last month?*\n- *What's my most profitable strategy?*\n- *Create a SpreadGrid strategy for BTC/USDT on Binance*\n- *Set up a MovingAverage strategy for ETH on OKX*",
        renderData: null,
        timestamp: new Date(),
      },
    ]);
  }, []);

  return { messages, isLoading, sendMessage, clearMessages };
}
