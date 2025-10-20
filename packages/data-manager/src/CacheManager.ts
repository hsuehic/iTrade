import { Kline, Ticker, OrderBook, Trade } from '@itrade/core';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface CacheOptions {
  defaultTTL?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of entries
}

export class CacheManager {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL: number;
  private maxSize: number;

  constructor(options: CacheOptions = {}) {
    this.defaultTTL = options.defaultTTL || 60000; // 1 minute default
    this.maxSize = options.maxSize || 1000;
  }

  private generateKey(type: string, symbol: string, ...params: string[]): string {
    return [type, symbol, ...params].join(':');
  }

  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private evictExpired(): void {
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
      }
    }
  }

  private evictLRU(): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  set<T>(key: string, data: T, ttl?: number): void {
    this.evictExpired();
    this.evictLRU();

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data as T;
  }

  // Specific cache methods for trading data
  setTicker(symbol: string, ticker: Ticker, ttl?: number): void {
    const key = this.generateKey('ticker', symbol);
    this.set(key, ticker, ttl || 5000); // 5 second default for tickers
  }

  getTicker(symbol: string): Ticker | null {
    const key = this.generateKey('ticker', symbol);
    return this.get<Ticker>(key);
  }

  setOrderBook(symbol: string, orderBook: OrderBook, ttl?: number): void {
    const key = this.generateKey('orderbook', symbol);
    this.set(key, orderBook, ttl || 1000); // 1 second default for order books
  }

  getOrderBook(symbol: string): OrderBook | null {
    const key = this.generateKey('orderbook', symbol);
    return this.get<OrderBook>(key);
  }

  setTrades(symbol: string, trades: Trade[], ttl?: number): void {
    const key = this.generateKey('trades', symbol);
    this.set(key, trades, ttl || 10000); // 10 seconds for trades
  }

  getTrades(symbol: string): Trade[] | null {
    const key = this.generateKey('trades', symbol);
    return this.get<Trade[]>(key);
  }

  setKlines(symbol: string, interval: string, klines: Kline[], ttl?: number): void {
    const key = this.generateKey('klines', symbol, interval);
    this.set(key, klines, ttl || 60000); // 1 minute for klines
  }

  getKlines(symbol: string, interval: string): Kline[] | null {
    const key = this.generateKey('klines', symbol, interval);
    return this.get<Kline[]>(key);
  }

  invalidate(pattern: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  invalidateSymbol(symbol: string): number {
    return this.invalidate(symbol);
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): {
    size: number;
    maxSize: number;
    hitRate?: number;
    memoryUsage?: number;
  } {
    this.evictExpired();

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      // Additional stats could be tracked with counters
    };
  }
}
