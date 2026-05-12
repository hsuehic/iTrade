'use client';

import React from 'react';

interface ChatTableProps {
  data: unknown;
  title?: string;
}

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    // Detect if it looks like a currency value
    if (
      Math.abs(value) > 0.001 &&
      (String(value).includes('.') || Math.abs(value) > 10)
    ) {
      const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        currencyDisplay: 'narrowSymbol',
      }).format(value);
      return value >= 0 ? formatted : formatted;
    }
    return value.toLocaleString();
  }
  if (typeof value === 'string') {
    // Format ISO dates
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return new Date(value).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return value;
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

const isPnlColumn = (key: string) =>
  key.toLowerCase().includes('pnl') || key.toLowerCase().includes('profit');

const formatHeader = (key: string) =>
  key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/_/g, ' ')
    .trim();

/** Renders structured data as a clean table */
export function ChatTable({ data, title }: ChatTableProps) {
  if (!data || typeof data !== 'object') return null;

  const dataObj = data as Record<string, unknown>;

  // Detect the primary array to display
  const arrayData: unknown[] =
    (dataObj.topTokens as unknown[]) ||
    (dataObj.topPerformers as unknown[]) ||
    (dataObj.bySymbol as unknown[]) ||
    (dataObj.byExchange as unknown[]) ||
    (dataObj.orders as unknown[]) ||
    (dataObj.allStrategies as unknown[]) ||
    (Array.isArray(data) ? (data as unknown[]) : null) ||
    [];

  if (!arrayData || arrayData.length === 0) return null;

  const rows = arrayData.slice(0, 15); // cap at 15 rows
  const firstRow = rows[0] as Record<string, unknown>;

  // Select which columns to show (exclude noisy internal fields)
  const EXCLUDED_KEYS = new Set([
    'id',
    'userId',
    'normalizedSymbol',
    'marketType',
    'strategyId',
    'createdAt',
    'updatedAt',
    'timestamp',
    'activeCount',
    'fillRate',
    'totalOrders',
    'filledOrders',
    'type',
    'status',
    'count',
  ]);

  const allKeys = Object.keys(firstRow).filter((k) => !EXCLUDED_KEYS.has(k));

  // Prioritize important columns
  const PRIORITY = [
    'name',
    'symbol',
    'exchange',
    'totalPnl',
    'realizedPnl',
    'unrealizedPnl',
    'balance',
    'pnl',
  ];
  const priorityKeys = PRIORITY.filter((k) => allKeys.includes(k));
  const otherKeys = allKeys.filter((k) => !PRIORITY.includes(k));
  const columns = [...priorityKeys, ...otherKeys].slice(0, 6);

  return (
    <div className="mt-3 rounded-xl border bg-muted/20 overflow-hidden">
      {title && (
        <div className="px-4 py-2 border-b bg-muted/40">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {title}
          </p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-3 py-2 text-left text-muted-foreground font-semibold w-8">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-2 text-left text-muted-foreground font-semibold whitespace-nowrap"
                >
                  {formatHeader(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => {
              const r = row as Record<string, unknown>;
              return (
                <tr
                  key={rowIdx}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-3 py-2 text-muted-foreground font-mono">
                    {rowIdx + 1}
                  </td>
                  {columns.map((col) => {
                    const raw = r[col];
                    const formatted = formatValue(raw);
                    const isPnl = isPnlColumn(col);
                    const numVal = typeof raw === 'number' ? raw : null;

                    return (
                      <td key={col} className="px-3 py-2 whitespace-nowrap">
                        {isPnl && numVal !== null ? (
                          <span
                            className={`font-mono font-medium ${
                              numVal >= 0 ? 'text-emerald-500' : 'text-red-500'
                            }`}
                          >
                            {numVal >= 0 ? '+' : ''}
                            {formatted}
                          </span>
                        ) : (
                          <span className="text-foreground">{formatted}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {arrayData.length > 15 && (
          <p className="px-4 py-2 text-xs text-muted-foreground italic border-t">
            Showing top 15 of {arrayData.length} results
          </p>
        )}
      </div>
    </div>
  );
}
