'use client';

import { useState, useEffect } from 'react';
import { TradingPair, type ExchangeId } from '@/lib/exchanges';

type TradingPairResponse = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  name?: string | null;
  type: 'spot' | 'perpetual';
  exchange: ExchangeId;
};

export function useTradingPairs(exchangeId?: string) {
  const [pairs, setPairs] = useState<TradingPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPairs() {
      setLoading(true);
      try {
        const response = await fetch('/api/trading-pairs');
        // Actually, users also need to fetch supported pairs.
        // Maybe I should have a public API for fetching active pairs.

        if (!response.ok) throw new Error('Failed to fetch trading pairs');
        const data: TradingPairResponse[] = await response.json();

        // Filter by exchange if provided
        let filtered = data;
        if (exchangeId) {
          filtered = data.filter((pair) => pair.exchange === exchangeId);
        }

        setPairs(
          filtered.map((pair) => ({
            symbol: pair.symbol,
            base: pair.baseAsset,
            quote: pair.quoteAsset,
            name: pair.name || pair.symbol,
            type: pair.type,
            exchange: pair.exchange,
          })),
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load trading pairs';
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    fetchPairs();
  }, [exchangeId]);

  return { pairs, loading, error };
}
