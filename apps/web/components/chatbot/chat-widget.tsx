'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
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

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [chatTitle, setChatTitle] = useState(DEFAULT_CHAT_TITLE);
  const { messages, isLoading, sendMessage, clearMessages } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Draggable trigger position — null means default bottom-right corner.
  // Lazy initializer reads localStorage once on mount (client-only; no-ops on SSR).
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

  // Fetch runtime-configurable chat title from the server
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

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;
    setInputValue('');
    setShowSuggestions(false);
    await sendMessage(text);
  }, [inputValue, isLoading, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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

  // ── Drag handlers ────────────────────────────────────────────────────────────

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
      const size = 56; // w-14 h-14 = 3.5rem = 56px
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
        setIsOpen((prev) => !prev);
        setIsMinimized(false);
        setIsFullscreen(false);
      } else {
        // Persist new position
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

  const userMessageCount = messages.filter((m) => m.role === 'user').length;

  // Wrapper sits at the dragged position, or default bottom-right
  const wrapperStyle: React.CSSProperties = btnPos
    ? { left: btnPos.x, top: btnPos.y, bottom: 'auto', right: 'auto' }
    : { bottom: '24px', right: '24px' };

  // Panel right-aligns to the button; prevent overflow on the right edge
  const panelRightOffset = btnPos ? Math.max(0, window.innerWidth - (btnPos.x + 56)) : 0;

  return (
    <>
      {/* Draggable wrapper — contains both trigger and panel */}
      <div className="fixed z-50" style={wrapperStyle}>
        {/* ── Floating button ───────────────────────────────────────────── */}
        <button
          id="chat-widget-trigger"
          onPointerDown={handleTriggerPointerDown}
          onPointerMove={handleTriggerPointerMove}
          onPointerUp={handleTriggerPointerUp}
          aria-label="Open AI Chat"
          className={`relative flex h-14 w-14 cursor-grab select-none items-center justify-center rounded-full shadow-2xl transition-colors duration-200 active:cursor-grabbing group ${
            isOpen
              ? 'bg-foreground text-background'
              : 'bg-primary text-primary-foreground hover:shadow-primary/30'
          }`}
        >
          <span
            className={`transition-all duration-300 ${isOpen ? 'rotate-90 scale-90' : 'rotate-0'}`}
          >
            {isOpen ? <X className="h-5 w-5" /> : <Bot className="h-6 w-6" />}
          </span>

          {/* Pulse ring when closed */}
          {!isOpen && (
            <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-20 group-hover:opacity-0" />
          )}

          {/* Unread indicator */}
          {!isOpen && userMessageCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
              {userMessageCount > 9 ? '9+' : userMessageCount}
            </span>
          )}
        </button>

        {/* ── Chat panel ────────────────────────────────────────────────── */}
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
            {/* ── Header ────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-foreground/20">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-none">iTrade AI</p>
                <p className="mt-0.5 text-[11px] text-primary-foreground/70">
                  {chatTitle}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {userMessageCount > 0 && (
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

            {/* ── Body ──────────────────────────────────────────────────── */}
            {!isMinimized && (
              <>
                {/* Messages area */}
                <div
                  id="chat-messages"
                  className="scroll-smooth flex-1 space-y-4 overflow-y-auto px-3 py-4"
                  style={
                    isFullscreen
                      ? { flex: '1 1 0', minHeight: 0 }
                      : { maxHeight: '420px', minHeight: '200px' }
                  }
                >
                  {messages.map((message) => (
                    <ChatMessageBubble key={message.id} message={message} />
                  ))}

                  {/* Suggested questions (only shown initially) */}
                  {showSuggestions && userMessageCount === 0 && (
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

                  <div ref={messagesEndRef} />
                </div>

                {/* Divider */}
                <div className="border-t border-border/40" />

                {/* ── Input area ────────────────────────────────────────── */}
                <div className="p-3">
                  <div className="flex items-end gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 transition-all duration-200 focus-within:border-primary/60 focus-within:bg-background">
                    <textarea
                      ref={inputRef}
                      id="chat-input"
                      value={inputValue}
                      onChange={(e) => {
                        setInputValue(e.target.value);
                        // Auto-resize
                        e.target.style.height = 'auto';
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask about your trading performance…"
                      disabled={isLoading}
                      rows={1}
                      className="flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
                      style={{ maxHeight: '100px' }}
                    />
                    <button
                      id="chat-send-btn"
                      onClick={handleSend}
                      disabled={!inputValue.trim() || isLoading}
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all duration-150 hover:scale-105 hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isLoading ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                    Press Enter to send · Shift+Enter for new line
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
        {/* end panel */}
      </div>
      {/* end draggable wrapper */}
    </>
  );
}
