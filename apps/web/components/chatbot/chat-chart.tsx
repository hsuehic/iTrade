'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  Cell,
} from 'recharts';

interface ChatChartProps {
  data: unknown;
  chartConfig?: unknown;
  title?: string;
}

// Plain hex colors — CSS variables don't resolve in SVG stroke/fill attributes
// (Recharts sets these as SVG presentation attributes, not inline CSS styles)
const COLORS = [
  '#6366f1', // indigo
  '#22d3ee', // cyan
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ec4899', // pink
  '#ef4444', // red
  '#8b5cf6', // violet
  '#f97316', // orange
  '#14b8a6', // teal
  '#84cc16', // lime
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

const formatPnl = (value: number) => {
  const formatted = formatCurrency(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
};

interface TooltipPayload {
  name: string;
  value: number;
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-3 shadow-lg text-xs">
        <p className="font-semibold text-foreground mb-1">{label}</p>
        {payload.map((entry, i) => (
          <p key={i} style={{ color: COLORS[i % COLORS.length] }} className="font-mono">
            {entry.name}: {formatPnl(entry.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

/** Renders a chart from AI response data */
export function ChatChart({ data, title }: ChatChartProps) {
  if (!data || typeof data !== 'object') return null;

  const dataObj = data as Record<string, unknown>;

  // ── Token / strategy ranking bar chart ────────────────────────────────────
  const rankingItems =
    (dataObj.topTokens as unknown[]) ||
    (dataObj.topPerformers as unknown[]) ||
    (dataObj.bySymbol as unknown[]) ||
    (dataObj.byExchange as unknown[]) ||
    null;

  if (rankingItems && Array.isArray(rankingItems) && rankingItems.length > 0) {
    const items = rankingItems.slice(0, 10).map((item) => {
      const i = item as Record<string, unknown>;
      return {
        name: String(
          i.symbol || i.normalizedSymbol || i.exchange || i.name || 'Unknown',
        ).split('/')[0],
        pnl: Number(i.totalPnl || i.pnl || 0),
      };
    });

    return (
      <div className="mt-3 rounded-xl border bg-muted/30 p-4">
        {title && (
          <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            {title}
          </p>
        )}
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={items} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#888" strokeOpacity={0.15} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: '#888' }}
              interval={0}
              angle={-30}
              textAnchor="end"
              height={40}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
              tick={{ fontSize: 10, fill: '#888' }}
              width={50}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
              {items.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ── Balance / time series line chart ──────────────────────────────────────
  const chartDataArray = dataObj.chartData as unknown[];
  if (chartDataArray && Array.isArray(chartDataArray) && chartDataArray.length > 1) {
    const sample = chartDataArray[0] as Record<string, unknown>;
    const seriesKeys = Object.keys(sample).filter((k) => k !== 'date');
    const sliced = chartDataArray.slice(-30); // Show last 30 points max

    const formatted = sliced.map((point) => {
      const p = point as Record<string, unknown>;
      return {
        ...p,
        date: String(p.date || '').slice(0, 10),
      };
    });

    return (
      <div className="mt-3 rounded-xl border bg-muted/30 p-4">
        {title && (
          <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            {title}
          </p>
        )}
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={formatted} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#888" strokeOpacity={0.15} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#888' }}
              tickFormatter={(v) => String(v).slice(5)} // "MM-DD"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 10, fill: '#888' }}
              width={46}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(value: number) => [formatCurrency(value)]}
              contentStyle={{
                background: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '11px',
                padding: '6px 10px',
              }}
              labelStyle={{ fontWeight: 600, marginBottom: 2 }}
            />
            <Legend wrapperStyle={{ fontSize: '11px', color: '#888' }} />
            {seriesKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}
