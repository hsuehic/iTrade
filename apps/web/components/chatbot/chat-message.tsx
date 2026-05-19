'use client';

import React from 'react';
import { Bot, User } from 'lucide-react';

import { ChatChart } from './chat-chart';
import { ChatTable } from './chat-table';
import { StrategyProposalCard, type StrategyProposal } from './strategy-proposal-card';
import type { ChatMessage } from './use-chat';

// ── Minimal markdown renderer (bold, italic, list, table, heading) ────────────

/** True if a line looks like a markdown table separator: |---|---| */
function isTableSeparator(line: string): boolean {
  return /^\|[\s\-:|]+\|/.test(line);
}

/** True if a line is a table row: starts and ends with | */
function isTableRow(line: string): boolean {
  return line.trim().startsWith('|') && line.trim().endsWith('|');
}

/** Parse a table row into cell strings */
function parseTableCells(line: string): string[] {
  return line
    .trim()
    .slice(1, -1) // strip leading/trailing |
    .split('|')
    .map((c) => c.trim());
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Heading (##, ###)
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const cls =
        level === 1
          ? 'text-base font-bold mt-2 mb-1'
          : level === 2
            ? 'text-sm font-bold mt-2 mb-0.5'
            : 'text-sm font-semibold mt-1';
      nodes.push(
        <p key={i} className={cls}>
          {renderInline(headingMatch[2])}
        </p>,
      );
      i++;
      continue;
    }

    // ── Table: collect all consecutive table rows
    if (isTableRow(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && (isTableRow(lines[i]) || isTableSeparator(lines[i]))) {
        tableLines.push(lines[i]);
        i++;
      }

      // First row = header, skip separator, rest = body
      const [headerRow, , ...bodyRows] = tableLines;
      if (!headerRow) continue;
      const headers = parseTableCells(headerRow);
      const rows = bodyRows.filter((r) => !isTableSeparator(r)).map(parseTableCells);

      nodes.push(
        <div
          key={`table-${i}`}
          className="overflow-x-auto my-2 rounded-lg border border-border/40"
        >
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                {headers.map((h, hi) => (
                  <th
                    key={hi}
                    className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap"
                  >
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-1.5 text-foreground">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // ── List item
    if (line.startsWith('- ') || line.startsWith('* ')) {
      nodes.push(
        <li key={i} className="ml-4 list-disc">
          {renderInline(line.slice(2))}
        </li>,
      );
      i++;
      continue;
    }

    // ── Blank line
    if (line.trim() === '') {
      nodes.push(<br key={i} />);
      i++;
      continue;
    }

    // ── Regular paragraph
    nodes.push(
      <p key={i} className="leading-relaxed">
        {renderInline(line)}
      </p>,
    );
    i++;
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

// ── Thinking skeleton ──────────────────────────────────────────────────────────
/** Pulsing skeleton bars shown while the AI is actively streaming a response. */
function ThinkingSkeleton() {
  return (
    <div className="space-y-2 py-1 min-w-[140px]">
      {[75, 55, 35].map((w, i) => (
        <div
          key={i}
          className="h-2 rounded-full bg-primary/20 animate-pulse"
          style={{ width: `${w}%`, animationDelay: `${i * 0.12}s` }}
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
        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 ${isUser ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary'}`}
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
          ) : message.isStreaming ? (
            <ThinkingSkeleton />
          ) : (
            <div className="space-y-0.5">{renderMarkdown(message.content)}</div>
          )}
        </div>

        {/* Visualization — only for assistant messages once fully received */}
        {!isUser && !message.isLoading && !message.isStreaming && message.renderData && (
          <div className="w-full max-w-full">
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
            {message.renderData.renderAs === 'strategy_proposal' && (
              <StrategyProposalCard
                proposal={message.renderData.data as StrategyProposal}
              />
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
