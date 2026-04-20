import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import { SymbolEntity } from '@itrade/data-manager';
import { COMMON_TRADING_PAIRS } from '@/lib/exchanges';

/**
 * Handle POST /api/admin/trading-pairs/seed
 * Seed the database with initial trading pairs from hardcoded constants
 */
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dataManager = await getDataManager();
    const symbolRepo = dataManager.dataSource.getRepository(SymbolEntity);

    const results = {
      added: 0,
      skipped: 0,
      errors: 0,
    };

    for (const pair of COMMON_TRADING_PAIRS) {
      // COMMON_TRADING_PAIRS has exchange as a comma-separated string sometimes e.g. 'binance,okx'
      const exchanges = pair.exchange.split(',');

      for (const exchange of exchanges) {
        try {
          // Check if already exists
          const existing = await symbolRepo.findOne({
            where: {
              symbol: pair.symbol,
              exchange: exchange.trim(),
            },
          });

          if (!existing) {
            const newSymbol = symbolRepo.create({
              symbol: pair.symbol,
              baseAsset: pair.base,
              quoteAsset: pair.quote,
              exchange: exchange.trim(),
              type: pair.type,
              name: pair.name,
              isActive: true,
            });
            await symbolRepo.save(newSymbol);
            results.added++;
          } else {
            results.skipped++;
          }
        } catch (err) {
          console.error(`Error seeding pair ${pair.symbol} for ${exchange}:`, err);
          results.errors++;
        }
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('[Trading Pairs API] SEED error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
