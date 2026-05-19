'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  HelpCircle,
  Maximize2,
  MessageCircleQuestion,
  Minimize2,
  PhoneOff,
  Send,
  Sparkles,
  Trash2,
  UserRound,
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface SupportMessage {
  id: string;
  role: 'user' | 'supporter';
  content: string;
  created_at: string;
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
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
    const hm = line.match(/^(#{1,3})\s+(.+)/);
    if (hm) {
      const cls =
        hm[1].length === 1 ? 'text-sm font-bold mt-1' : 'text-xs font-semibold mt-1';
      blocks.push(
        <p key={`h-${blocks.length}`} className={cls}>
          {renderInline(hm[2])}
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

// ── Message bubbles ───────────────────────────────────────────────────────────

function AiBubble({ message }: { message: HelpMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className="flex flex-col items-center gap-0.5">
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
        <span
          className={`text-[9px] font-medium leading-none ${isUser ? 'text-muted-foreground' : 'text-violet-500'}`}
        >
          {isUser ? 'You' : 'AI'}
        </span>
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

function SupportBubble({ message }: { message: SupportMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className="flex flex-col items-center gap-0.5">
        <div
          className={`flex size-7 flex-shrink-0 items-center justify-center rounded-full ${
            isUser
              ? 'bg-muted text-muted-foreground'
              : 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white'
          }`}
        >
          {isUser ? (
            <span className="text-xs font-medium">You</span>
          ) : (
            <UserRound className="size-3.5" />
          )}
        </div>
        <span
          className={`text-[9px] font-medium leading-none ${isUser ? 'text-muted-foreground' : 'text-emerald-600'}`}
        >
          {isUser ? 'You' : 'Agent'}
        </span>
      </div>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
          isUser
            ? 'rounded-tr-sm bg-primary text-primary-foreground'
            : 'rounded-tl-sm bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
        }`}
      >
        <p className="leading-relaxed">{message.content}</p>
      </div>
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────────

export function HelpWidget() {
  const locale = useLocale();
  const t = useTranslations('helpBot');

  // UI state
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [isSending, setIsSending] = useState(false);

  // Draggable trigger position — null means default bottom-right corner.
  // Lazy initializer reads localStorage once on mount (client-only; no-ops on SSR).
  const [btnPos, setBtnPos] = useState<{ x: number; y: number } | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = localStorage.getItem('help-widget-pos');
      return saved ? (JSON.parse(saved) as { x: number; y: number }) : null;
    } catch {
      return null;
    }
  });
  const dragState = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  // AI chat
  const {
    messages: aiMessages,
    isLoading: aiLoading,
    sendMessage,
    clearMessages,
  } = useHelpChat(locale);

  // Live support state
  const [supportMode, setSupportMode] = useState(false);
  const [connectingSupport, setConnectingSupport] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const lastPolledAtRef = useRef<Date>(new Date(0));
  const [sessionClosed, setSessionClosed] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const suggested = locale === 'zh' ? SUGGESTED_ZH : SUGGESTED_EN;
  const isLoading = supportMode ? isSending : aiLoading;

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, supportMessages]);

  // Focus input on open
  useEffect(() => {
    if (isOpen && !isMinimized) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen, isMinimized]);

  // ── Polling (when in support mode) ─────────────────────────────────────────

  const pollMessages = useCallback(async () => {
    if (!sessionId) return;
    try {
      const url = `/api/support/${sessionId}/messages?since=${lastPolledAtRef.current.toISOString()}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: SupportMessage[];
        sessionStatus: string;
      };
      if (data.messages.length > 0) {
        lastPolledAtRef.current = new Date();
        setSupportMessages((prev) => {
          // IDs already present from previous polls (exclude optimistic)
          const existingIds = new Set(
            prev.filter((m) => !m.id.startsWith('opt-')).map((m) => m.id),
          );
          const newMsgs = data.messages.filter((m) => !existingIds.has(m.id));
          if (newMsgs.length === 0) return prev;
          // Drop optimistic user messages whose content was confirmed by the server
          const confirmedContents = new Set(
            newMsgs.filter((m) => m.role === 'user').map((m) => m.content),
          );
          const dedupedPrev = prev.filter(
            (m) => !m.id.startsWith('opt-') || !confirmedContents.has(m.content),
          );
          return [...dedupedPrev, ...newMsgs];
        });
      }
      if (data.sessionStatus === 'closed') {
        setSessionClosed(true);
        if (pollingRef.current) clearInterval(pollingRef.current);
      }
    } catch {
      /* ignore */
    }
  }, [sessionId]); // lastPolledAtRef is a ref — no need to list as dependency

  useEffect(() => {
    if (supportMode && sessionId && !sessionClosed) {
      pollingRef.current = setInterval(pollMessages, 2000);
      return () => {
        if (pollingRef.current) clearInterval(pollingRef.current);
      };
    }
  }, [supportMode, sessionId, sessionClosed, pollMessages]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStartSupport = useCallback(async () => {
    setConnectingSupport(true);
    try {
      const res = await fetch('/api/support/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      const data = (await res.json()) as { sessionId?: string };
      if (data.sessionId) {
        setSessionId(data.sessionId);
        setSupportMode(true);
        lastPolledAtRef.current = new Date();
        setSupportMessages([
          {
            id: 'system-greeting',
            role: 'supporter',
            content:
              locale === 'zh'
                ? '您好！感谢您联系我们。请问有什么可以帮助您？'
                : 'Hi there! Thanks for reaching out. A support agent will be with you shortly — go ahead and describe your issue.',
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      /* keep in AI mode */
    }
    setConnectingSupport(false);
  }, [locale]);

  const handleEndSupport = useCallback(async () => {
    if (!sessionId) return;
    try {
      await fetch(`/api/support/${sessionId}/close`, { method: 'POST' });
    } catch {
      /* ignore */
    }
    if (pollingRef.current) clearInterval(pollingRef.current);
    setSupportMode(false);
    setSessionId(null);
    setSupportMessages([]);
    setSessionClosed(false);
    lastPolledAtRef.current = new Date(0);
  }, [sessionId]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');

    if (supportMode && sessionId) {
      setIsSending(true);
      // Optimistically add the user message
      const optimistic: SupportMessage = {
        id: `opt-${Date.now()}`,
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
      };
      setSupportMessages((prev) => [...prev, optimistic]);
      try {
        await fetch(`/api/support/${sessionId}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text }),
        });
        lastPolledAtRef.current = new Date();
      } catch {
        /* optimistic message stays */
      }
      setIsSending(false);
    } else {
      setShowSuggestions(false);
      await sendMessage(text);
    }
  }, [input, isLoading, supportMode, sessionId, sendMessage]);

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

  // ── Drag handlers ────────────────────────────────────────────────────────
  const handleTriggerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = e.currentTarget.getBoundingClientRect();
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: rect.left,
        origY: rect.top,
        moved: false,
      };
    },
    [],
  );

  const handleTriggerPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragState.current) return;
      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;
      // Ignore tiny jitter so accidental drags don't prevent clicks
      if (!dragState.current.moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      dragState.current.moved = true;
      const size = 56; // size-14 = 3.5rem = 56px
      const x = Math.max(
        0,
        Math.min(window.innerWidth - size, dragState.current.origX + dx),
      );
      const y = Math.max(
        0,
        Math.min(window.innerHeight - size, dragState.current.origY + dy),
      );
      setBtnPos({ x, y });
    },
    [],
  );

  const handleTriggerPointerUp = useCallback(
    (_e: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragState.current) return;
      const wasDrag = dragState.current.moved;
      dragState.current = null;
      if (!wasDrag) {
        // Short tap — toggle the panel
        setIsOpen((p) => !p);
        setIsMinimized(false);
      } else {
        // Persist new position
        setBtnPos((prev) => {
          if (prev) {
            try {
              localStorage.setItem('help-widget-pos', JSON.stringify(prev));
            } catch {
              /* ignore */
            }
          }
          return prev;
        });
      }
    },
    [],
  );

  const aiUserCount = aiMessages.filter((m) => m.role === 'user').length;
  const placeholder = supportMode
    ? locale === 'zh'
      ? '发送消息给客服…'
      : 'Message support agent…'
    : t('placeholder');

  // Wrapper position: default bottom-right, or dragged pixel coords
  const wrapperStyle: React.CSSProperties = btnPos
    ? { left: btnPos.x, top: btnPos.y, bottom: 'auto', right: 'auto' }
    : { bottom: '24px', right: '24px' };

  // Panel sits above the trigger; clamp left edge so it doesn't overflow viewport
  const panelRightOffset = btnPos
    ? Math.max(0, window.innerWidth - (btnPos.x + 56)) // align right edge to button right
    : 0; // handled by Tailwind right-0

  return (
    <>
      {/* Draggable wrapper — contains both trigger and panel */}
      <div className="fixed z-40" style={wrapperStyle}>
        {/* Trigger button */}
        <button
          id="help-widget-trigger"
          onPointerDown={handleTriggerPointerDown}
          onPointerMove={handleTriggerPointerMove}
          onPointerUp={handleTriggerPointerUp}
          aria-label={t('open')}
          className={`relative flex size-14 items-center justify-center rounded-full shadow-2xl transition-colors duration-200 select-none cursor-grab active:cursor-grabbing ${
            isOpen
              ? 'bg-foreground text-background'
              : 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white hover:shadow-violet-500/30'
          }`}
        >
          {isOpen ? (
            <X className="size-5" />
          ) : (
            <MessageCircleQuestion className="size-6" />
          )}
          {!isOpen && (
            <span className="absolute inset-0 animate-ping rounded-full bg-violet-500 opacity-20" />
          )}
        </button>

        {/* Panel — fullscreen breaks out to fixed inset-0; otherwise absolute above trigger */}
        <div
          className={`transition-all duration-300 ${
            isFullscreen
              ? 'fixed inset-0'
              : 'absolute bottom-[70px] w-[360px] max-w-[calc(100vw-24px)] origin-bottom-right'
          } ${isOpen ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-90 opacity-0'}`}
          style={!isFullscreen ? { right: `-${panelRightOffset}px` } : undefined}
        >
          <div
            className={`flex flex-col overflow-hidden border border-border/60 shadow-2xl shadow-black/20 bg-white dark:bg-neutral-900 ${isFullscreen ? 'h-full rounded-none' : 'rounded-2xl'}`}
          >
            {/* Header */}
            <div
              className={`flex items-center gap-3 px-4 py-3 text-white transition-all duration-300 ${supportMode ? 'bg-gradient-to-r from-emerald-500 to-teal-600' : 'bg-gradient-to-r from-violet-500 to-indigo-600'}`}
            >
              <div className="flex size-8 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
                {supportMode ? (
                  <UserRound className="size-4" />
                ) : (
                  <HelpCircle className="size-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold leading-none">
                    {supportMode
                      ? locale === 'zh'
                        ? '人工客服'
                        : 'Live Support'
                      : t('title')}
                  </p>
                  {supportMode && (
                    <span className="flex items-center gap-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                      <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" />
                      {locale === 'zh' ? '在线' : 'Online'}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-white/70">
                  {supportMode
                    ? locale === 'zh'
                      ? '通过 Slack 与客服实时聊天'
                      : 'Connected via Slack'
                    : t('subtitle')}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {/* End live chat */}
                {supportMode && (
                  <button
                    onClick={handleEndSupport}
                    title={locale === 'zh' ? '结束对话' : 'End chat'}
                    className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
                  >
                    <PhoneOff className="size-3.5" />
                  </button>
                )}
                {/* Clear AI chat */}
                {!supportMode && aiUserCount > 0 && (
                  <button
                    onClick={handleClear}
                    title={t('clear')}
                    className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
                {/* Fullscreen */}
                <button
                  onClick={() => {
                    setIsFullscreen((p) => !p);
                    setIsMinimized(false);
                  }}
                  title={isFullscreen ? t('minimize') : 'Full screen'}
                  className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
                >
                  {isFullscreen ? (
                    <Minimize2 className="size-3.5" />
                  ) : (
                    <Maximize2 className="size-3.5" />
                  )}
                </button>
                {/* Minimize to bar (normal mode only) */}
                {!isFullscreen && (
                  <button
                    onClick={() => setIsMinimized((p) => !p)}
                    title={t('minimize')}
                    className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
                  >
                    <Minimize2 className="size-3.5" />
                  </button>
                )}
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
              <div
                className={
                  isFullscreen ? 'flex flex-1 flex-col overflow-hidden' : 'contents'
                }
              >
                {/* Messages */}
                <div
                  className={`space-y-3 overflow-y-auto px-3 py-3 ${isFullscreen ? 'flex-1' : ''}`}
                  style={isFullscreen ? {} : { maxHeight: '420px', minHeight: '220px' }}
                >
                  {/* AI messages — always visible so the full conversation is preserved */}
                  {aiMessages.map((m) => (
                    <AiBubble key={m.id} message={m} />
                  ))}

                  {/* Suggestion chips (AI mode, no messages yet) */}
                  {!supportMode && showSuggestions && aiUserCount === 0 && (
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

                  {/* Divider when switching to live support */}
                  {supportMode && (
                    <div className="flex items-center gap-2 py-1">
                      <div className="h-px flex-1 bg-border/50" />
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                        {locale === 'zh' ? '已连接人工客服' : 'Connected to support'}
                      </span>
                      <div className="h-px flex-1 bg-border/50" />
                    </div>
                  )}

                  {/* Support messages */}
                  {supportMode &&
                    supportMessages.map((m) => <SupportBubble key={m.id} message={m} />)}

                  {/* Waiting indicator — shown when last message is from user (awaiting reply) */}
                  {supportMode &&
                    !sessionClosed &&
                    supportMessages.at(-1)?.role === 'user' && (
                      <div className="flex gap-2">
                        <div className="flex size-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                          <UserRound className="size-3.5" />
                        </div>
                        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-emerald-50 px-3 py-2 text-xs dark:bg-emerald-950/40">
                          <div className="flex items-center gap-1.5 py-0.5">
                            <span className="size-1.5 animate-bounce rounded-full bg-emerald-500 opacity-60 [animation-delay:-0.3s]" />
                            <span className="size-1.5 animate-bounce rounded-full bg-emerald-500 opacity-60 [animation-delay:-0.15s]" />
                            <span className="size-1.5 animate-bounce rounded-full bg-emerald-500 opacity-60" />
                          </div>
                        </div>
                      </div>
                    )}

                  {/* Session closed notice */}
                  {sessionClosed && (
                    <div className="rounded-xl border border-border/50 bg-muted/40 px-3 py-2 text-center text-[11px] text-muted-foreground">
                      {locale === 'zh' ? '对话已结束。' : 'This chat session has ended.'}
                    </div>
                  )}

                  <div ref={endRef} />
                </div>

                {/* "Talk to human" strip — only in AI mode, not yet connected */}
                {!supportMode && (
                  <div className="border-t border-border/30 px-3 py-2">
                    <button
                      onClick={handleStartSupport}
                      disabled={connectingSupport}
                      className="flex w-full items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-left text-xs text-muted-foreground transition-all duration-150 hover:border-emerald-400/50 hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {connectingSupport ? (
                        <span className="size-3.5 animate-spin rounded-full border-2 border-emerald-400/40 border-t-emerald-500 flex-shrink-0" />
                      ) : (
                        <UserRound className="size-3.5 flex-shrink-0 text-emerald-600" />
                      )}
                      <span>
                        {connectingSupport
                          ? locale === 'zh'
                            ? '正在连接客服…'
                            : 'Connecting to support…'
                          : locale === 'zh'
                            ? '转接人工客服'
                            : 'Talk to a human'}
                      </span>
                    </button>
                  </div>
                )}

                {/* Input */}
                <div className="border-t border-border/40 p-3">
                  <div
                    className={`flex items-end gap-2 rounded-xl border px-3 py-2 transition-all duration-200 ${
                      supportMode
                        ? 'border-border/60 bg-muted/30 focus-within:border-emerald-500/60 focus-within:bg-background'
                        : 'border-border/60 bg-muted/30 focus-within:border-violet-500/60 focus-within:bg-background'
                    }`}
                  >
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder={placeholder}
                      disabled={isLoading || sessionClosed}
                      rows={1}
                      className="flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
                      style={{ maxHeight: '100px' }}
                    />
                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || isLoading || sessionClosed}
                      className={`flex size-8 flex-shrink-0 items-center justify-center rounded-lg text-white transition-all duration-150 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
                        supportMode
                          ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                          : 'bg-gradient-to-br from-violet-500 to-indigo-600'
                      }`}
                    >
                      {isLoading ? (
                        <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      ) : (
                        <Send className="size-3.5" />
                      )}
                    </button>
                  </div>
                  <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                    {supportMode
                      ? locale === 'zh'
                        ? '按 Enter 发送 · Shift+Enter 换行'
                        : 'Enter to send · Shift+Enter for new line'
                      : t('inputHint')}
                  </p>
                </div>
              </div>
            )}
          </div>
          {/* end panel inner */}
        </div>
        {/* end panel */}
      </div>
      {/* end draggable wrapper */}
    </>
  );
}
