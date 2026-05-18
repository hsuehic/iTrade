/**
 * POST /api/admin/help-kb/seed-defaults
 *
 * Upserts the built-in starter articles from `lib/help-kb/seed-data.ts`.
 * Idempotent (upserts by slug), so re-running is safe but will overwrite any
 * manual edits an admin has made to a seed article. Tolerates a missing
 * Gemini API key — articles save without embedding and can be re-embedded
 * later via "Re-embed pending".
 */
import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { upsertArticle } from '@/lib/help-kb/repository';
import { SEED_ARTICLES } from '@/lib/help-kb/seed-data';

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let ok = 0;
  let embedded = 0;
  const failed: Array<{ slug: string; error: string }> = [];

  for (const a of SEED_ARTICLES) {
    try {
      const result = await upsertArticle(
        {
          slug: a.slug,
          title: a.title,
          content: a.content,
          category: a.category,
          locale: a.locale,
          tags: a.tags,
          published: true,
        },
        { tolerateMissingKey: true },
      );
      ok += 1;
      if (result.embedded) embedded += 1;
    } catch (err) {
      failed.push({ slug: a.slug, error: (err as Error)?.message ?? String(err) });
    }
  }

  return NextResponse.json({
    total: SEED_ARTICLES.length,
    upserted: ok,
    embedded,
    pending: ok - embedded,
    failed,
  });
}
