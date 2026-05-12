'use client';

import { useState, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  renderData?: {
    renderAs?: 'table' | 'chart' | 'text';
    title?: string;
    data?: unknown;
    chartConfig?: unknown;
  } | null;
  timestamp: Date;
  isLoading?: boolean;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hi! I'm **iTrade AI** 👋\n\nI can help you analyze your trading performance. Try asking me:\n- *How much did I earn last month?*\n- *What's my most profitable strategy?*\n- *Which token made me the most money?*\n- *Show my recent orders*",
      renderData: null,
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(async (content: string) => {
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      renderData: null,
      timestamp: new Date(),
    };

    // Optimistically add user message + loading indicator
    const loadingMessage: ChatMessage = {
      id: `loading-${Date.now()}`,
      role: 'assistant',
      content: '',
      renderData: null,
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMessage, loadingMessage]);
    setIsLoading(true);

    try {
      // Build history from current messages (exclude welcome and loading)
      setMessages((prev) => {
        const history = prev
          .filter((m) => !m.isLoading && m.id !== 'welcome')
          .map((m) => ({
            role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
            content: m.content,
          }));

        // Fire the API call
        fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: content, history }),
        })
          .then((res) => res.json())
          .then((data) => {
            const assistantMessage: ChatMessage = {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: data.error
                ? `Sorry, I encountered an error: ${data.error}`
                : data.message || 'No response received.',
              renderData: data.renderData || null,
              timestamp: new Date(),
            };

            setMessages((prevMsgs) =>
              prevMsgs.map((m) => (m.isLoading ? assistantMessage : m)),
            );
          })
          .catch(() => {
            const errorMessage: ChatMessage = {
              id: `error-${Date.now()}`,
              role: 'assistant',
              content: 'Sorry, I had trouble connecting. Please try again.',
              renderData: null,
              timestamp: new Date(),
            };
            setMessages((prevMsgs) =>
              prevMsgs.map((m) => (m.isLoading ? errorMessage : m)),
            );
          })
          .finally(() => {
            setIsLoading(false);
          });

        return prev;
      });
    } catch {
      setIsLoading(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content:
          "Hi! I'm **iTrade AI** 👋\n\nI can help you analyze your trading performance. Try asking me:\n- *How much did I earn last month?*\n- *What's my most profitable strategy?*\n- *Which token made me the most money?*\n- *Show my recent orders*",
        renderData: null,
        timestamp: new Date(),
      },
    ]);
  }, []);

  return { messages, isLoading, sendMessage, clearMessages };
}
