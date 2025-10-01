import { promises as fs } from 'fs';
import { join, dirname } from 'path';

import { Decimal } from 'decimal.js';
import { IDataManager, Kline } from '@crypto-trading/core';

export class FileDataManager implements IDataManager {
  private dataPath: string;

  constructor(dataPath: string = './data') {
    this.dataPath = dataPath;
  }

  async getKlines(
    symbol: string,
    interval: string,
    startTime: Date,
    endTime: Date,
    limit?: number
  ): Promise<Kline[]> {
    const filename = `${symbol}_${interval}.json`;
    const filepath = join(this.dataPath, filename);

    try {
      const data = await fs.readFile(filepath, 'utf-8');
      const rawKlines = JSON.parse(data);

      let filteredKlines = rawKlines.filter((kline: any) => {
        const klineTime = new Date(kline.openTime);
        return klineTime >= startTime && klineTime <= endTime;
      });

      if (limit) {
        filteredKlines = filteredKlines.slice(0, limit);
      }

      return filteredKlines.map((kline: any) => ({
        symbol,
        interval,
        openTime: new Date(kline.openTime),
        closeTime: new Date(kline.closeTime),
        open: new Decimal(kline.open),
        high: new Decimal(kline.high),
        low: new Decimal(kline.low),
        close: new Decimal(kline.close),
        volume: new Decimal(kline.volume),
        quoteVolume: new Decimal(kline.quoteVolume),
        trades: kline.trades,
      }));
    } catch (error) {
      console.error(`Error reading data for ${symbol}:`, error);
      return [];
    }
  }

  async saveKlines(
    symbol: string,
    interval: string,
    klines: Kline[]
  ): Promise<void> {
    const filename = `${symbol}_${interval}.json`;
    const filepath = join(this.dataPath, filename);

    // Ensure directory exists
    await fs.mkdir(dirname(filepath), { recursive: true });

    const serializedKlines = klines.map((kline) => ({
      openTime: kline.openTime.toISOString(),
      closeTime: kline.closeTime.toISOString(),
      open: kline.open.toString(),
      high: kline.high.toString(),
      low: kline.low.toString(),
      close: kline.close.toString(),
      volume: kline.volume.toString(),
      quoteVolume: kline.quoteVolume.toString(),
      trades: kline.trades,
    }));

    await fs.writeFile(filepath, JSON.stringify(serializedKlines, null, 2));
  }

  async validateData(symbol: string, interval: string): Promise<boolean> {
    const filename = `${symbol}_${interval}.json`;
    const filepath = join(this.dataPath, filename);

    try {
      await fs.access(filepath);
      const data = await fs.readFile(filepath, 'utf-8');
      const klines = JSON.parse(data);

      // Basic validation - check if it's an array and has expected structure
      return (
        Array.isArray(klines) &&
        klines.length > 0 &&
        klines[0].hasOwnProperty('open') &&
        klines[0].hasOwnProperty('close')
      );
    } catch {
      return false;
    }
  }

  async cleanData(symbol: string, interval: string): Promise<number> {
    const klines = await this.getKlines(
      symbol,
      interval,
      new Date(0),
      new Date()
    );

    // Remove duplicates and sort by time
    const uniqueKlines = klines.reduce((acc: Kline[], current: Kline) => {
      const exists = acc.some(
        (k) => k.openTime.getTime() === current.openTime.getTime()
      );
      if (!exists) {
        acc.push(current);
      }
      return acc;
    }, []);

    const sortedKlines = uniqueKlines.sort(
      (a, b) => a.openTime.getTime() - b.openTime.getTime()
    );

    await this.saveKlines(symbol, interval, sortedKlines);

    return klines.length - sortedKlines.length; // Return number of removed duplicates
  }

  async getAvailableSymbols(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.dataPath);
      const symbols = new Set<string>();

      for (const file of files) {
        if (file.endsWith('.json')) {
          const parts = file.replace('.json', '').split('_');
          if (parts.length >= 2) {
            symbols.add(parts[0]);
          }
        }
      }

      return Array.from(symbols);
    } catch {
      return [];
    }
  }

  async getAvailableIntervals(symbol: string): Promise<string[]> {
    try {
      const files = await fs.readdir(this.dataPath);
      const intervals: string[] = [];

      for (const file of files) {
        if (file.startsWith(symbol + '_') && file.endsWith('.json')) {
          const interval = file.replace(`${symbol}_`, '').replace('.json', '');
          intervals.push(interval);
        }
      }

      return intervals;
    } catch {
      return [];
    }
  }

  async saveTrades(symbol: string, trades: any[]): Promise<void> {
    // TODO: Implement trades storage for file-based data manager
    console.warn(
      `saveTrades not yet implemented for FileDataManager. Symbol: ${symbol}, trades: ${trades.length}`
    );
  }

  async getTrades(
    symbol: string,
    startTime: Date,
    endTime: Date,
    limit?: number
  ): Promise<any[]> {
    // TODO: Implement trades retrieval for file-based data manager
    console.warn(
      `getTrades not yet implemented for FileDataManager. Symbol: ${symbol}, range: ${startTime} - ${endTime}, limit: ${limit}`
    );
    return [];
  }
}
