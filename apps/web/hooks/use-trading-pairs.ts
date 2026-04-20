'use client';

import { useState, useEffect } from 'react';
import { TradingPair } from '@/lib/exchanges';

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
        const data = await response.json();

        // Filter by exchange if provided
        let filtered = data;
        if (exchangeId) {
          filtered = data.filter((p: any) => p.exchange === exchangeId);
        }

        setPairs(
          filtered.map((p: any) => ({
            symbol: p.symbol,
            base: p.baseAsset,
            quote: p.quoteAsset,
            name: p.name || p.symbol,
            type: p.type,
            exchange: p.exchange,
          })),
        );
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchPairs();
  }, [exchangeId]);

  return { pairs, loading, error };
}
