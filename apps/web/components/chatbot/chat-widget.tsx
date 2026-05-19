'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocale } from 'next-intl';
import {
  Bot,
  X,
  Send,
  Trash2,
  Minimize2,
  Sparkles,
  ChevronDown,
  Maximize2,
  Minimize,
  UserRound,
  PhoneOff,
  Paperclip,
} from 'lucide-react';

import { useChat } from './use-chat';
import { ChatMessageBubble } from './chat-message';

const SUGGESTED_QUESTIONS = [
  'How much did I earn last month?',
  "What's my most profitable strategy?",
  'Create a SpreadGrid for BTC/USDT on Binance',
  'Set up a MovingAverage strategy for ETH on OKX',
  'Which token made me the most money?',
  'Show my recent orders',
];

const DEFAULT_CHAT_TITLE = 'Powered by Gemini 2.5 Flash';

// ── Support types ─────────────────────────────────────────────────────────────

interface SupportMessage {
  id: string;
  role: 'user' | 'supporter';
  content: string;
  created_at: string;
}

// ── Support message bubble ────────────────────────────────────────────────────

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
        {message.content.startsWith('data:image/') ? (
          <img
            src={message.content}
            alt="attachment"
            className="max-h-48 max-w-full rounded-lg object-contain"
          />
        ) : (
          <p className="leading-relaxed">{message.content}</p>
        )}
      </div>
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────────

export function ChatWidget() {
  const locale = useLocale();

  // ── UI state ───────────────────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [chatTitle, setChatTitle] = useState(DEFAULT_CHAT_TITLE);

  // ── AI chat ────────────────────────────────────────────────────────────────
  const { messages, isLoading: aiLoading, sendMessage, clearMessages } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Pending image attachments ──────────────────────────────────────────────
  const [pendingImages, setPendingImages] = useState<string[]>([]);

  // ── Support state ──────────────────────────────────────────────────────────
  const [supportMode, setSupportMode] = useState(false);
  const [connectingSupport, setConnectingSupport] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  // Combined loading flag
  const isLoading = supportMode ? isSending : aiLoading;

  // ── Draggable trigger position ─────────────────────────────────────────────
  const [btnPos, setBtnPos] = useState<{ x: number; y: number } | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = localStorage.getItem('chat-widget-pos');
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

  // ── Fetch configurable title ───────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/config/chat')
      .then((res) => res.json())
      .then((data: { chat_title?: string }) => {
        if (data.chat_title) setChatTitle(data.chat_title);
      })
      .catch(() => {
        // Silently keep the default on error
      });
  }, []);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, supportMessages]);

  // ── Focus input when opened ────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  // ── SSE subscription (live support) ───────────────────────────────────────
  useEffect(() => {
    if (!supportMode || !sessionId || sessionClosed) return;

    const sse = new EventSource(`/api/support/${sessionId}/stream`);
    sseRef.current = sse;

    sse.addEventListener('message', (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as SupportMessage;
        setSupportMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          const withoutOptimistic = prev.filter(
            (m) =>
              !(
                m.id.startsWith('opt-') &&
                m.role === msg.role &&
                m.content === msg.content
              ),
          );
          return [...withoutOptimistic, msg];
        });
      } catch {
        /* malformed event — ignore */
      }
    });

    sse.addEventListener('session_closed', () => {
      setSessionClosed(true);
      sse.close();
      sseRef.current = null;
    });

    sse.onerror = () => {
      // EventSource auto-reconnects on network errors; nothing to do here.
    };

    return () => {
      sse.close();
      sseRef.current = null;
    };
  }, [supportMode, sessionId, sessionClosed]);

  // ── Handlers ───────────────────────────────────────────────────────────────

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
    sseRef.current?.close();
    sseRef.current = null;
    try {
      await fetch(`/api/support/${sessionId}/close`, { method: 'POST' });
    } catch {
      /* ignore */
    }
    setSupportMode(false);
    setSessionId(null);
    setSessionClosed(false);
    // Keep supportMessages so the user can see the conversation history
  }, [sessionId]);

  /** Convert a File/Blob to a base64 dataURL and add to pending list. */
  const addImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) return; // 5 MB cap
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setPendingImages((prev) => (prev.length < 5 ? [...prev, dataUrl] : prev));
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      Array.from(e.target.files ?? []).forEach(addImageFile);
      e.target.value = '';
    },
    [addImageFile],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      Array.from(e.clipboardData.items)
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .forEach((item) => {
          const file = item.getAsFile();
          if (file) addImageFile(file);
        });
    },
    [addImageFile],
  );

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text && pendingImages.length === 0) return;
    if (isLoading) return;
    setInputValue('');
    const imagesToSend = pendingImages;
    setPendingImages([]);

    if (supportMode && sessionId) {
      setIsSending(true);
      // Add optimistic bubbles for text and each image separately
      const optimisticMsgs: SupportMessage[] = [];
      if (text) {
        optimisticMsgs.push({
          id: `opt-${Date.now()}`,
          role: 'user',
          content: text,
          created_at: new Date().toISOString(),
        });
      }
      imagesToSend.forEach((img, i) => {
        optimisticMsgs.push({
          id: `opt-img-${Date.now()}-${i}`,
          role: 'user',
          content: img,
          created_at: new Date().toISOString(),
        });
      });
      setSupportMessages((prev) => [...prev, ...optimisticMsgs]);
      try {
        await fetch(`/api/support/${sessionId}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text, images: imagesToSend }),
        });
      } catch {
        /* optimistic messages stay */
      }
      setIsSending(false);
    } else {
      setShowSuggestions(false);
      await sendMessage(text, imagesToSend.length > 0 ? imagesToSend : undefined);
    }
  }, [inputValue, pendingImages, isLoading, supportMode, sessionId, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleSuggestion = (question: string) => {
    setShowSuggestions(false);
    sendMessage(question);
  };

  const handleClear = () => {
    clearMessages();
    setShowSuggestions(true);
  };

  // ── Drag handlers ──────────────────────────────────────────────────────────

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
      if (!dragState.current.moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      dragState.current.moved = true;
      const size = 56;
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
        setIsOpen((prev) => !prev);
        setIsMinimized(false);
        setIsFullscreen(false);
      } else {
        setBtnPos((prev) => {
          if (prev) {
            try {
              localStorage.setItem('chat-widget-pos', JSON.stringify(prev));
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

  // ── Derived values ─────────────────────────────────────────────────────────

  const userMessageCount = messages.filter((m) => m.role === 'user').length;
  const placeholder = supportMode
    ? locale === 'zh'
      ? '发送消息给客服…'
      : 'Message support agent…'
    : 'Ask about your trading performance…';

  const wrapperStyle: React.CSSProperties = btnPos
    ? { left: btnPos.x, top: btnPos.y, bottom: 'auto', right: 'auto' }
    : { bottom: '24px', right: '24px' };

  const panelRightOffset = btnPos ? Math.max(0, window.innerWidth - (btnPos.x + 56)) : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Draggable wrapper */}
      <div className="fixed z-50" style={wrapperStyle}>
        {/* Floating button */}
        <button
          id="chat-widget-trigger"
          onPointerDown={handleTriggerPointerDown}
          onPointerMove={handleTriggerPointerMove}
          onPointerUp={handleTriggerPointerUp}
          aria-label="Open AI Chat"
          className={`relative flex h-14 w-14 cursor-grab select-none items-center justify-center rounded-full shadow-2xl transition-colors duration-200 active:cursor-grabbing group ${
            isOpen
              ? 'bg-foreground text-background'
              : supportMode
                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white hover:shadow-emerald-500/30'
                : 'bg-primary text-primary-foreground hover:shadow-primary/30'
          }`}
        >
          <span
            className={`transition-all duration-300 ${isOpen ? 'rotate-90 scale-90' : 'rotate-0'}`}
          >
            {isOpen ? (
              <X className="h-5 w-5" />
            ) : supportMode ? (
              <UserRound className="h-6 w-6" />
            ) : (
              <Bot className="h-6 w-6" />
            )}
          </span>

          {/* Pulse ring when closed */}
          {!isOpen && (
            <span
              className={`absolute inset-0 animate-ping rounded-full opacity-20 group-hover:opacity-0 ${supportMode ? 'bg-emerald-500' : 'bg-primary'}`}
            />
          )}

          {/* Unread indicator */}
          {!isOpen && userMessageCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
              {userMessageCount > 9 ? '9+' : userMessageCount}
            </span>
          )}
        </button>

        {/* Chat panel */}
        <div
          className={`transition-all duration-300 ${
            isFullscreen
              ? 'fixed inset-0'
              : 'absolute bottom-[70px] w-[380px] max-w-[calc(100vw-24px)] origin-bottom-right'
          } ${
            isOpen && !isMinimized
              ? 'pointer-events-auto scale-100 opacity-100'
              : isOpen && isMinimized
                ? 'pointer-events-auto scale-100 opacity-100'
                : 'pointer-events-none scale-90 opacity-0'
          }`}
          style={!isFullscreen ? { right: `-${panelRightOffset}px` } : undefined}
        >
          <div
            className={`flex flex-col overflow-hidden border border-border/60 bg-white shadow-2xl shadow-black/20 dark:bg-neutral-900 ${
              isFullscreen ? 'h-full rounded-none' : 'rounded-2xl'
            }`}
          >
            {/* Header */}
            <div
              className={`flex items-center gap-3 px-4 py-3 text-white transition-all duration-300 ${
                supportMode
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600'
                  : 'bg-primary'
              }`}
            >
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                  supportMode ? 'bg-white/20' : 'bg-primary-foreground/20'
                }`}
              >
                {supportMode ? (
                  <UserRound className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold leading-none">
                    {supportMode
                      ? locale === 'zh'
                        ? '人工客服'
                        : 'Live Support'
                      : 'iTrade AI'}
                  </p>
                  {supportMode && (
                    <span className="flex items-center gap-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                      <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" />
                      {locale === 'zh' ? '在线' : 'Online'}
                    </span>
                  )}
                </div>
                <p
                  className={`mt-0.5 text-[11px] ${supportMode ? 'text-white/70' : 'text-primary-foreground/70'}`}
                >
                  {supportMode
                    ? locale === 'zh'
                      ? '通过 Slack 与客服实时聊天'
                      : 'Connected via Slack'
                    : chatTitle}
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
                    <PhoneOff className="h-3.5 w-3.5" />
                  </button>
                )}
                {/* Clear AI chat */}
                {!supportMode && userMessageCount > 0 && (
                  <button
                    onClick={handleClear}
                    title="Clear conversation"
                    className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => {
                    setIsFullscreen((prev) => !prev);
                    setIsMinimized(false);
                  }}
                  title={isFullscreen ? 'Exit full screen' : 'Full screen'}
                  className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
                >
                  {isFullscreen ? (
                    <Minimize className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  onClick={() => setIsMinimized((prev) => !prev)}
                  title={isMinimized ? 'Expand' : 'Minimize'}
                  className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
                >
                  {isMinimized ? (
                    <ChevronDown className="h-3.5 w-3.5 rotate-180" />
                  ) : (
                    <Minimize2 className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setIsFullscreen(false);
                  }}
                  title="Close"
                  className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Body */}
            {!isMinimized && (
              <>
                {/* Messages area */}
                <div
                  id="chat-messages"
                  className="scroll-smooth space-y-4 overflow-y-auto px-3 py-4"
                  style={
                    isFullscreen
                      ? { flex: '1 1 0', minHeight: 0 }
                      : { maxHeight: '420px', minHeight: '200px' }
                  }
                >
                  {/* AI messages — always shown so history is preserved when switching modes */}
                  {messages.map((message) => (
                    <ChatMessageBubble key={message.id} message={message} />
                  ))}

                  {/* Suggested questions (AI mode only, initial state) */}
                  {!supportMode && showSuggestions && userMessageCount === 0 && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      <p className="px-1 text-[11px] text-muted-foreground">
                        Try asking:
                      </p>
                      {SUGGESTED_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          onClick={() => handleSuggestion(q)}
                          className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-left text-xs text-foreground transition-all duration-150 hover:border-primary/50 hover:bg-muted/80 hover:shadow-sm"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Divider when support mode is active */}
                  {(supportMode || supportMessages.length > 0) && (
                    <div className="flex items-center gap-2 py-1">
                      <div className="h-px flex-1 bg-border/50" />
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                        {locale === 'zh' ? '已连接人工客服' : 'Connected to agent'}
                      </span>
                      <div className="h-px flex-1 bg-border/50" />
                    </div>
                  )}

                  {/* Support messages — always rendered once the session starts so history persists */}
                  {supportMessages.map((m) => (
                    <SupportBubble key={m.id} message={m} />
                  ))}

                  {/* Waiting indicator when agent hasn't replied yet */}
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

                  <div ref={messagesEndRef} />
                </div>

                {/* "Talk to a human agent" strip — only in AI mode */}
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
                            ? '正在连接人工客服…'
                            : 'Connecting to agent…'
                          : locale === 'zh'
                            ? '与人工客服交谈'
                            : 'Talk to a human agent'}
                      </span>
                    </button>
                  </div>
                )}

                {/* Divider above input */}
                <div className="border-t border-border/40" />

                {/* Input area */}
                <div className="p-3">
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />

                  {/* Pending image previews */}
                  {pendingImages.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {pendingImages.map((src, i) => (
                        <div key={i} className="relative">
                          <img
                            src={src}
                            alt={`preview-${i}`}
                            className="h-16 w-16 rounded-lg object-cover"
                          />
                          <button
                            onClick={() =>
                              setPendingImages((prev) => prev.filter((_, j) => j !== i))
                            }
                            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground/80 text-background hover:bg-foreground"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    className={`flex items-end gap-2 rounded-xl border bg-muted/30 px-3 py-2 transition-all duration-200 ${
                      supportMode
                        ? 'border-border/60 focus-within:border-emerald-500/60 focus-within:bg-background'
                        : 'border-border/60 focus-within:border-primary/60 focus-within:bg-background'
                    }`}
                  >
                    {/* Paperclip / image upload button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isLoading || sessionClosed || pendingImages.length >= 5}
                      title={locale === 'zh' ? '上传图片' : 'Attach image'}
                      className="flex-shrink-0 text-muted-foreground/60 transition-colors hover:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>

                    <textarea
                      ref={inputRef}
                      id="chat-input"
                      value={inputValue}
                      onChange={(e) => {
                        setInputValue(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
                      }}
                      onKeyDown={handleKeyDown}
                      onPaste={handlePaste}
                      placeholder={placeholder}
                      disabled={isLoading || sessionClosed}
                      rows={1}
                      className="flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
                      style={{ maxHeight: '100px' }}
                    />
                    <button
                      id="chat-send-btn"
                      onClick={() => void handleSend()}
                      disabled={
                        (!inputValue.trim() && pendingImages.length === 0) ||
                        isLoading ||
                        sessionClosed
                      }
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white transition-all duration-150 hover:scale-105 hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
                        supportMode
                          ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                          : 'bg-primary'
                      }`}
                    >
                      {isLoading ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                    {locale === 'zh'
                      ? '按 Enter 发送 · 支持粘贴图片'
                      : 'Enter to send · paste or attach images'}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
