'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, X, Send, Trash2, Minimize2, Sparkles, ChevronDown } from 'lucide-react';

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

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const { messages, isLoading, sendMessage, clearMessages } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  const userMessageCount = messages.filter((m) => m.role === 'user').length;

  return (
    <>
      {/* ── Floating button ─────────────────────────────────────────────── */}
      <button
        id="chat-widget-trigger"
        onClick={() => {
          setIsOpen((prev) => !prev);
          setIsMinimized(false);
        }}
        aria-label="Open AI Chat"
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 group ${
          isOpen
            ? 'bg-foreground text-background scale-95'
            : 'bg-primary text-primary-foreground hover:scale-110 hover:shadow-primary/30'
        }`}
      >
        <span
          className={`transition-all duration-300 ${isOpen ? 'rotate-90 scale-90' : 'rotate-0'}`}
        >
          {isOpen ? <X className="w-5 h-5" /> : <Bot className="w-6 h-6" />}
        </span>

        {/* Pulse ring when closed */}
        {!isOpen && (
          <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-20 group-hover:opacity-0" />
        )}

        {/* Unread indicator */}
        {!isOpen && userMessageCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {userMessageCount > 9 ? '9+' : userMessageCount}
          </span>
        )}
      </button>

      {/* ── Chat panel ──────────────────────────────────────────────────── */}
      <div
        className={`fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-24px)] transition-all duration-300 origin-bottom-right ${
          isOpen && !isMinimized
            ? 'opacity-100 scale-100 pointer-events-auto'
            : isOpen && isMinimized
              ? 'opacity-100 scale-100 pointer-events-auto'
              : 'opacity-0 scale-90 pointer-events-none'
        }`}
      >
        <div
          className="rounded-2xl border border-border/60 shadow-2xl shadow-black/20 overflow-hidden flex flex-col"
          style={{
            background: 'hsl(var(--background))',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-4 py-3 bg-primary text-primary-foreground">
            <div className="w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-none">iTrade AI</p>
              <p className="text-[11px] text-primary-foreground/70 mt-0.5">
                Powered by Gemini 2.5 Flash
              </p>
            </div>
            <div className="flex items-center gap-1">
              {userMessageCount > 0 && (
                <button
                  onClick={handleClear}
                  title="Clear conversation"
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setIsMinimized((prev) => !prev)}
                title={isMinimized ? 'Expand' : 'Minimize'}
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              >
                {isMinimized ? (
                  <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                ) : (
                  <Minimize2 className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Close"
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ── Body ────────────────────────────────────────────────────── */}
          {!isMinimized && (
            <>
              {/* Messages area */}
              <div
                id="chat-messages"
                className="flex-1 overflow-y-auto px-3 py-4 space-y-4 scroll-smooth"
                style={{ maxHeight: '420px', minHeight: '200px' }}
              >
                {messages.map((message) => (
                  <ChatMessageBubble key={message.id} message={message} />
                ))}

                {/* Suggested questions (only shown initially) */}
                {showSuggestions && userMessageCount === 0 && (
                  <div className="flex flex-col gap-1.5 mt-2">
                    <p className="text-[11px] text-muted-foreground px-1">Try asking:</p>
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleSuggestion(q)}
                        className="text-left text-xs px-3 py-2 rounded-xl border border-border/60 bg-muted/40 hover:bg-muted/80 hover:border-primary/50 text-foreground transition-all duration-150 hover:shadow-sm"
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

              {/* ── Input area ──────────────────────────────────────────── */}
              <div className="p-3">
                <div className="flex items-end gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 focus-within:border-primary/60 focus-within:bg-background transition-all duration-200">
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
                    className="flex-1 bg-transparent text-sm resize-none outline-none text-foreground placeholder:text-muted-foreground/60 leading-relaxed disabled:opacity-50"
                    style={{ maxHeight: '100px' }}
                  />
                  <button
                    id="chat-send-btn"
                    onClick={handleSend}
                    disabled={!inputValue.trim() || isLoading}
                    className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 hover:scale-105 active:scale-95"
                  >
                    {isLoading ? (
                      <span className="w-3.5 h-3.5 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                  Press Enter to send · Shift+Enter for new line
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
