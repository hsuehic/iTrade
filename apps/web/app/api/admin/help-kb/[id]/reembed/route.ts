/**
 * POST /api/admin/help-kb/[id]/reembed
 *
 * Force-regenerates the article embedding ignoring the cached hash.
 * Useful when the embedding model has changed or to recover from a
 * partial save where the embedding column was left null.
 */
import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { forceReembed } from '@/lib/help-kb/repository';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const updated = await forceReembed(id);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, article: updated });
  } catch (err) {
    console.error('[Admin Help-KB] reembed error:', err);
    return NextResponse.json(
      { error: (err as Error)?.message ?? 'Failed to re-embed' },
      { status: 500 },
    );
  }
}
