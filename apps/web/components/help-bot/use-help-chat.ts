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
  isLoading?: boolean;
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
      const loadingMessage: HelpMessage = {
        id: `loading-${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isLoading: true,
      };

      setMessages((prev) => [...prev, userMessage, loadingMessage]);
      setIsLoading(true);

      // Build the history snapshot from the current messages, omitting the
      // welcome banner and the in-flight loading placeholder.
      setMessages((prev) => {
        const history = prev
          .filter((m) => !m.isLoading && m.id !== 'welcome')
          .map((m) => ({ role: m.role, content: m.content }));

        fetch('/api/help-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed, history, locale }),
        })
          .then(async (res) => {
            const data = (await res.json()) as {
              message?: string;
              citations?: HelpCitation[];
              error?: string;
            };
            const assistantMessage: HelpMessage = {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: data.error
                ? `Sorry, I ran into a problem: ${data.error}`
                : data.message || 'No response received.',
              citations: data.citations ?? [],
              timestamp: new Date(),
            };
            setMessages((curr) => curr.map((m) => (m.isLoading ? assistantMessage : m)));
          })
          .catch(() => {
            const errorMessage: HelpMessage = {
              id: `error-${Date.now()}`,
              role: 'assistant',
              content:
                "Sorry, I couldn't connect. Please check your network and try again.",
              timestamp: new Date(),
            };
            setMessages((curr) => curr.map((m) => (m.isLoading ? errorMessage : m)));
          })
          .finally(() => setIsLoading(false));

        return prev;
      });
    },
    [locale],
  );

  const clearMessages = useCallback(() => {
    setMessages([WELCOME_MESSAGE(locale)]);
  }, [locale]);

  return { messages, isLoading, sendMessage, clearMessages };
}
