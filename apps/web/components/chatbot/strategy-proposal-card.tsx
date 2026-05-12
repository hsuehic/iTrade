'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  ExternalLink,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StrategyProposal {
  name: string;
  type: string;
  exchange: string;
  symbol: string;
  description?: string;
  parameters: Record<string, unknown>;
  subscription?: Record<string, unknown>;
  initialDataConfig?: Record<string, unknown>;
  rationale?: string;
}

interface StrategyProposalCardProps {
  proposal: StrategyProposal;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STRATEGY_LABELS: Record<string, string> = {
  SpreadGridStrategy: 'Spread Grid',
  SingleLadderLifoTPStrategy: 'Single Ladder LIFO',
  MovingAverageStrategy: 'Moving Average',
  MovingWindowGridsStrategy: 'Moving Window Grids',
  HammerChannelStrategy: 'Hammer Channel',
};

const EXCHANGE_COLORS: Record<string, string> = {
  binance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  okx: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  coinbase: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};

function formatParamValue(key: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (key.toLowerCase().includes('percent') || key.toLowerCase().includes('pct')) {
      return `${value}%`;
    }
    if (key.toLowerCase().includes('price') || key.toLowerCase().includes('amount')) {
      return value.toLocaleString();
    }
    return String(value);
  }
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value ?? '—');
}

const PARAM_LABELS: Record<string, string> = {
  basePrice: 'Base Price',
  stepPercent: 'Step %',
  orderAmount: 'Order Amount',
  minSize: 'Min Size',
  maxSize: 'Max Size',
  leverage: 'Leverage',
  checkMarketPrice: 'Check Market Price',
  period: 'MA Period',
  fastPeriod: 'Fast Period',
  slowPeriod: 'Slow Period',
  gridCount: 'Grid Count',
  upperPrice: 'Upper Price',
  lowerPrice: 'Lower Price',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function StrategyProposalCard({ proposal }: StrategyProposalCardProps) {
  const [name, setName] = useState(proposal.name);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const strategyLabel = STRATEGY_LABELS[proposal.type] ?? proposal.type;
  const exchangeColorClass =
    EXCHANGE_COLORS[proposal.exchange?.toLowerCase()] ?? 'bg-muted text-muted-foreground';

  const handleCreate = async () => {
    if (!name.trim()) return;
    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: proposal.description,
          type: proposal.type,
          exchange: proposal.exchange,
          symbol: proposal.symbol,
          parameters: proposal.parameters,
          subscription: proposal.subscription,
          initialDataConfig: proposal.initialDataConfig,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      setCreatedId(data.strategy?.id ?? null);
      setStatus('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create strategy');
      setStatus('error');
    }
  };

  // ── Success state ──────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div className="mt-2 rounded-xl border border-green-200 bg-green-50 dark:border-green-800/40 dark:bg-green-950/20 p-4 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-green-800 dark:text-green-300">
            Strategy created!
          </p>
          <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
            <strong>{name}</strong> ({strategyLabel} · {proposal.symbol})
          </p>
          {createdId && (
            <a
              href="/strategy"
              className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400 hover:underline mt-2"
            >
              View in Strategies <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    );
  }

  // ── Main card ──────────────────────────────────────────────────────────────
  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-muted/40 border-b border-border/40">
        <span className="text-sm font-semibold text-foreground">{strategyLabel}</span>
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${exchangeColorClass}`}
        >
          {proposal.exchange?.toUpperCase()}
        </span>
        <span className="text-xs text-muted-foreground font-mono">{proposal.symbol}</span>
      </div>

      {/* Rationale */}
      {proposal.rationale && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {proposal.rationale}
          </p>
        </div>
      )}

      {/* Parameters */}
      <div className="px-4 py-3">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Parameters
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {Object.entries(proposal.parameters).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-1">
              <span className="text-xs text-muted-foreground truncate">
                {PARAM_LABELS[key] ?? key}
              </span>
              <span className="text-xs font-medium text-foreground tabular-nums text-right">
                {formatParamValue(key, value)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Advanced: subscription & initialDataConfig */}
      {(proposal.subscription || proposal.initialDataConfig) && (
        <div className="border-t border-border/40">
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
            {showAdvanced ? 'Hide' : 'Show'} subscription & data config
          </button>
          {showAdvanced && (
            <div className="px-4 pb-3 space-y-2">
              {proposal.subscription && (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Subscription
                  </p>
                  <pre className="text-[10px] bg-muted/40 rounded-lg p-2 overflow-x-auto text-muted-foreground leading-relaxed">
                    {JSON.stringify(proposal.subscription, null, 2)}
                  </pre>
                </div>
              )}
              {proposal.initialDataConfig && (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Initial Data
                  </p>
                  <pre className="text-[10px] bg-muted/40 rounded-lg p-2 overflow-x-auto text-muted-foreground leading-relaxed">
                    {JSON.stringify(proposal.initialDataConfig, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Name + Create */}
      <div className="px-4 pb-4 pt-2 border-t border-border/40 space-y-2">
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">
            Strategy Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={status === 'loading'}
            className="w-full text-sm rounded-lg border border-border/60 bg-background px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 disabled:opacity-50 transition"
          />
        </div>

        {status === 'error' && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{errorMsg}</p>
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={!name.trim() || status === 'loading'}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium py-2 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
        >
          {status === 'loading' ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Creating…
            </>
          ) : (
            'Create Strategy'
          )}
        </button>
      </div>
    </div>
  );
}
