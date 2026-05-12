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

const COLORS = [
  'hsl(var(--chart-1, 220 70% 60%))',
  'hsl(var(--chart-2, 160 60% 45%))',
  'hsl(var(--chart-3, 30 80% 55%))',
  'hsl(var(--chart-4, 280 65% 60%))',
  'hsl(var(--chart-5, 0 65% 55%))',
  '#6366f1',
  '#22d3ee',
  '#f59e0b',
  '#ec4899',
  '#10b981',
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
          <BarChart data={items} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              interval={0}
              angle={-30}
              textAnchor="end"
              height={40}
            />
            <YAxis
              tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
              tick={{ fontSize: 10 }}
              className="fill-muted-foreground"
              width={50}
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
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={formatted} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              className="fill-muted-foreground"
              tickFormatter={(v) => String(v).slice(5)} // "MM-DD"
            />
            <YAxis
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 10 }}
              className="fill-muted-foreground"
              width={46}
            />
            <Tooltip
              formatter={(value: number) => [formatCurrency(value)]}
              labelClassName="text-xs font-semibold"
              contentStyle={{
                background: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '11px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
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
