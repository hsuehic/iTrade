'use client';

import React from 'react';
import { Bot, User } from 'lucide-react';

import { ChatChart } from './chat-chart';
import { ChatTable } from './chat-table';
import type { ChatMessage } from './use-chat';

// ── Minimal markdown renderer (bold, italic, list) ────────────────────────────
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('- ') || line.startsWith('* ')) {
      // list item
      nodes.push(
        <li key={i} className="ml-4 list-disc">
          {renderInline(line.slice(2))}
        </li>,
      );
    } else if (line.trim() === '') {
      nodes.push(<br key={i} />);
    } else {
      nodes.push(
        <p key={i} className="leading-relaxed">
          {renderInline(line)}
        </p>,
      );
    }
  }

  return <>{nodes}</>;
}

function renderInline(text: string): React.ReactNode {
  // Bold **text**
  const boldRegex = /\*\*(.*?)\*\*/g;
  // Italic *text*
  const italicRegex = /\*(.*?)\*/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Process bold first
  const combined = /\*\*(.*?)\*\*|\*(.*?)\*/g;
  combined.lastIndex = 0;
  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      parts.push(<strong key={match.index}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      parts.push(
        <em key={match.index} className="text-muted-foreground">
          {match[2]}
        </em>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // Suppress unused variable warnings
  void boldRegex;
  void italicRegex;

  return parts.length ? <>{parts}</> : text;
}

// ── Loading dots animation ─────────────────────────────────────────────────────
function LoadingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

// ── Individual message bubble ──────────────────────────────────────────────────
interface ChatMessageProps {
  message: ChatMessage;
}

export function ChatMessageBubble({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start`}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white'
        }`}
      >
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>

      {/* Bubble */}
      <div
        className={`flex flex-col gap-1 max-w-[88%] ${isUser ? 'items-end' : 'items-start'}`}
      >
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted/60 text-foreground rounded-tl-sm border border-border/40'
          }`}
        >
          {message.isLoading ? (
            <LoadingDots />
          ) : (
            <div className="space-y-0.5">{renderMarkdown(message.content)}</div>
          )}
        </div>

        {/* Visualization (chart or table) — only for assistant messages */}
        {!isUser && !message.isLoading && message.renderData && (
          <div className="w-full max-w-full">
            {(message.renderData.renderAs === 'chart' ||
              message.renderData.renderAs === 'table') && (
              <>
                {message.renderData.renderAs === 'chart' && (
                  <ChatChart
                    data={message.renderData.data}
                    chartConfig={message.renderData.chartConfig}
                    title={message.renderData.title}
                  />
                )}
                {message.renderData.renderAs === 'table' && (
                  <ChatTable
                    data={message.renderData.data}
                    title={message.renderData.title}
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* Timestamp */}
        <span className="text-[10px] text-muted-foreground px-1">
          {message.timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  );
}
