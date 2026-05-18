'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  HelpCircle,
  MessageCircleQuestion,
  Minimize2,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

import { useHelpChat, type HelpMessage } from './use-help-chat';

const SUGGESTED_EN = [
  'What is iTrade?',
  'How do I install the Android app?',
  'How do I connect my Binance account?',
  'What trading strategies are supported?',
  'How do I reset my password?',
];

const SUGGESTED_ZH = [
  '什么是 iTrade？',
  '如何安装 Android 版？',
  '如何连接币安账户？',
  '支持哪些交易策略？',
  '如何重置密码？',
];

// ── Tiny markdown renderer ────────────────────────────────────────────────────

/**
 * The help bot returns short answers with bold/italic, lists, and inline
 * `[slug]` citations. A full markdown library is overkill for the landing
 * page — keep it lean.
 */
function renderInline(text: string): React.ReactNode[] {
  // Strip citation slugs `[some-slug]` — they're already shown as chips.
  const stripped = text.replace(/\[[a-z0-9-]+\]/g, '').replace(/\s{2,}/g, ' ');
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(stripped)) !== null) {
    if (m.index > last) nodes.push(stripped.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={m.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={m.index} className="rounded bg-muted px-1 py-0.5 text-[11px]">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(<em key={m.index}>{token.slice(1, -1)}</em>);
    }
    last = m.index + token.length;
  }
  if (last < stripped.length) nodes.push(stripped.slice(last));
  return nodes;
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let listBuf: string[] = [];

  const flushList = () => {
    if (listBuf.length === 0) return;
    blocks.push(
      <ul key={`l-${blocks.length}`} className="list-disc space-y-1 pl-5">
        {listBuf.map((item, i) => (
          <li key={i}>{renderInline(item.replace(/^[-*]\s+/, ''))}</li>
        ))}
      </ul>,
    );
    listBuf = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^[-*]\s+/.test(line)) {
      listBuf.push(line);
      continue;
    }
    flushList();
    if (!line.trim()) {
      blocks.push(<div key={`s-${blocks.length}`} className="h-2" />);
      continue;
    }
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const cls = level === 1 ? 'text-sm font-bold mt-1' : 'text-xs font-semibold mt-1';
      blocks.push(
        <p key={`h-${blocks.length}`} className={cls}>
          {renderInline(headingMatch[2])}
        </p>,
      );
      continue;
    }
    blocks.push(
      <p key={`p-${blocks.length}`} className="leading-relaxed">
        {renderInline(line)}
      </p>,
    );
  }
  flushList();
  return <div className="space-y-1">{blocks}</div>;
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: HelpMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex size-7 flex-shrink-0 items-center justify-center rounded-full ${
          isUser
            ? 'bg-muted text-muted-foreground'
            : 'bg-gradient-to-br from-violet-500 to-indigo-500 text-white'
        }`}
      >
        {isUser ? (
          <span className="text-xs font-medium">You</span>
        ) : (
          <Sparkles className="size-3.5" />
        )}
      </div>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
          isUser
            ? 'rounded-tr-sm bg-primary text-primary-foreground'
            : 'rounded-tl-sm bg-muted text-foreground'
        }`}
      >
        {message.isLoading ? (
          <div className="flex items-center gap-1.5 py-0.5">
            <span className="size-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-current opacity-60" />
          </div>
        ) : (
          <>
            {renderMarkdown(message.content)}
            {message.citations && message.citations.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1 border-t border-foreground/10 pt-2">
                {message.citations.map((c) => (
                  <span
                    key={c.slug}
                    className="rounded-full bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground"
                    title={c.slug}
                  >
                    📖 {c.title}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────────

export function HelpWidget() {
  const locale = useLocale();
  const t = useTranslations('helpBot');
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);

  const { messages, isLoading, sendMessage, clearMessages } = useHelpChat(locale);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const suggested = locale === 'zh' ? SUGGESTED_ZH : SUGGESTED_EN;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    setShowSuggestions(false);
    await sendMessage(text);
  }, [input, isLoading, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = (q: string) => {
    setShowSuggestions(false);
    sendMessage(q);
  };

  const handleClear = () => {
    clearMessages();
    setShowSuggestions(true);
  };

  const userMessageCount = messages.filter((m) => m.role === 'user').length;

  return (
    <>
      {/* Floating trigger */}
      <button
        id="help-widget-trigger"
        onClick={() => {
          setIsOpen((p) => !p);
          setIsMinimized(false);
        }}
        aria-label={t('open')}
        className={`fixed bottom-6 right-6 z-40 flex size-14 items-center justify-center rounded-full shadow-2xl transition-all duration-300 ${
          isOpen
            ? 'scale-95 bg-foreground text-background'
            : 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white hover:scale-110 hover:shadow-violet-500/30'
        }`}
      >
        {isOpen ? <X className="size-5" /> : <MessageCircleQuestion className="size-6" />}
        {!isOpen && (
          <span className="absolute inset-0 animate-ping rounded-full bg-violet-500 opacity-20" />
        )}
      </button>

      {/* Panel */}
      <div
        className={`fixed bottom-24 right-6 z-40 w-[360px] max-w-[calc(100vw-24px)] origin-bottom-right transition-all duration-300 ${
          isOpen
            ? 'pointer-events-auto scale-100 opacity-100'
            : 'pointer-events-none scale-90 opacity-0'
        }`}
      >
        <div
          className="flex flex-col overflow-hidden rounded-2xl border border-border/60 shadow-2xl shadow-black/20"
          style={{ background: 'hsl(var(--background))' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 bg-gradient-to-r from-violet-500 to-indigo-600 px-4 py-3 text-white">
            <div className="flex size-8 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
              <HelpCircle className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-none">{t('title')}</p>
              <p className="mt-0.5 text-[11px] text-white/70">{t('subtitle')}</p>
            </div>
            <div className="flex items-center gap-1">
              {userMessageCount > 0 && (
                <button
                  onClick={handleClear}
                  title={t('clear')}
                  className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
              <button
                onClick={() => setIsMinimized((p) => !p)}
                title={t('minimize')}
                className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
              >
                <Minimize2 className="size-3.5" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title={t('close')}
                className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Messages */}
              <div
                className="space-y-3 overflow-y-auto px-3 py-3"
                style={{ maxHeight: '420px', minHeight: '220px' }}
              >
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}

                {showSuggestions && userMessageCount === 0 && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <p className="px-1 text-[11px] text-muted-foreground">
                      {t('trySuggestions')}
                    </p>
                    {suggested.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleSuggestion(q)}
                        className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-left text-xs text-foreground transition-all duration-150 hover:border-violet-400/50 hover:bg-muted/80 hover:shadow-sm"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {/* Input */}
              <div className="border-t border-border/40 p-3">
                <div className="flex items-end gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 transition-all duration-200 focus-within:border-violet-500/60 focus-within:bg-background">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={t('placeholder')}
                    disabled={isLoading}
                    rows={1}
                    className="flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
                    style={{ maxHeight: '100px' }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className="flex size-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white transition-all duration-150 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isLoading ? (
                      <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                      <Send className="size-3.5" />
                    )}
                  </button>
                </div>
                <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                  {t('inputHint')}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
