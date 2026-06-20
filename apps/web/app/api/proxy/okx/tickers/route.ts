import { NextRequest, NextResponse } from 'next/server';

const OKX_TICKER_BASE_URL = 'https://www.okx.com/api/v5/market/ticker';
const INST_ID_PATTERN = /^[A-Z0-9-]{1,20}$/;

export async function GET(request: NextRequest) {
  const instId = request.nextUrl.searchParams.get('instId');

  if (!instId || !INST_ID_PATTERN.test(instId)) {
    return NextResponse.json({ error: 'Invalid instId' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${OKX_TICKER_BASE_URL}?instId=${encodeURIComponent(instId)}`,
      {
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'OKX request failed' },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[OKX Proxy] Ticker fetch failed:', error);
    return NextResponse.json({ error: 'OKX request failed' }, { status: 502 });
  }
}
