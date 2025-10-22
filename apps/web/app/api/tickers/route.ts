import { NextResponse } from 'next/server';

// Popular trading pairs for each exchange
const BINANCE_COINS = [
  { symbol: 'BTCUSDT', display: 'BTC/USDT' },
  { symbol: 'ETHUSDT', display: 'ETH/USDT' },
  { symbol: 'BNBUSDT', display: 'BNB/USDT' },
  { symbol: 'SOLUSDT', display: 'SOL/USDT' },
  { symbol: 'XRPUSDT', display: 'XRP/USDT' },
  { symbol: 'ADAUSDT', display: 'ADA/USDT' },
];

const OKX_COINS = [
  { symbol: 'BTC-USDT', display: 'BTC/USDT' },
  { symbol: 'ETH-USDT', display: 'ETH/USDT' },
  { symbol: 'SOL-USDT', display: 'SOL/USDT' },
  { symbol: 'XRP-USDT', display: 'XRP/USDT' },
  { symbol: 'ADA-USDT', display: 'ADA/USDT' },
  { symbol: 'DOGE-USDT', display: 'DOGE/USDT' },
];

interface BinanceTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
  highPrice: string;
  lowPrice: string;
}

interface OKXTicker {
  instId: string;
  last: string;
  lastSz: string;
  askPx: string;
  bidPx: string;
  open24h: string;
  high24h: string;
  low24h: string;
  volCcy24h: string;
  vol24h: string;
}

async function fetchBinanceTickers() {
  try {
    const symbols = BINANCE_COINS.map((c) => c.symbol).join(',');
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=[${symbols
        .split(',')
        .map((s) => `"${s}"`)
        .join(',')}]`,
      { next: { revalidate: 2 } },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch Binance data');
    }

    const data: BinanceTicker[] = await response.json();
    return data.map((ticker) => ({
      symbol: ticker.symbol.replace('USDT', '/USDT'),
      price: parseFloat(ticker.lastPrice),
      change24h: parseFloat(ticker.priceChangePercent),
      volume24h: parseFloat(ticker.quoteVolume),
      high24h: parseFloat(ticker.highPrice),
      low24h: parseFloat(ticker.lowPrice),
      exchange: 'Binance',
    }));
  } catch (error) {
    console.error('Error fetching Binance tickers:', error);
    return [];
  }
}

async function fetchOKXTickers() {
  try {
    const promises = OKX_COINS.map(async (coin) => {
      const response = await fetch(
        `https://www.okx.com/api/v5/market/ticker?instId=${coin.symbol}`,
        { next: { revalidate: 2 } },
      );

      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      if (result.code !== '0' || !result.data?.[0]) {
        return null;
      }

      const ticker: OKXTicker = result.data[0];
      const price = parseFloat(ticker.last);
      const open = parseFloat(ticker.open24h);
      const change24h = open > 0 ? ((price - open) / open) * 100 : 0;

      return {
        symbol: ticker.instId.replace('-', '/'),
        price,
        change24h,
        volume24h: parseFloat(ticker.volCcy24h),
        high24h: parseFloat(ticker.high24h),
        low24h: parseFloat(ticker.low24h),
        exchange: 'OKX',
      };
    });

    const results = await Promise.all(promises);
    return results.filter((r) => r !== null);
  } catch (error) {
    console.error('Error fetching OKX tickers:', error);
    return [];
  }
}

export async function GET() {
  try {
    // Fetch from both exchanges in parallel
    const [binanceTickers, okxTickers] = await Promise.all([
      fetchBinanceTickers(),
      fetchOKXTickers(),
    ]);

    // Return both sets of tickers
    const allTickers = [...binanceTickers, ...okxTickers];

    return NextResponse.json(allTickers);
  } catch (error) {
    console.error('Error in tickers API:', error);
    return NextResponse.json({ error: 'Failed to fetch ticker data' }, { status: 500 });
  }
}
