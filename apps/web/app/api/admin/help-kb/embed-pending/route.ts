/**
 * POST /api/admin/help-kb/embed-pending
 *
 * Generates embeddings for every article whose pgvector column is currently
 * NULL (typically because they were seeded before the Gemini API key was
 * configured). Stops on the first key-missing error so the operator gets a
 * clean diagnostic instead of dozens of identical errors.
 */
import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { embedAllPending } from '@/lib/help-kb/repository';

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await embedAllPending();
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Admin Help-KB] embed-pending error:', err);
    return NextResponse.json(
      { error: (err as Error)?.message ?? 'Embed-pending failed' },
      { status: 500 },
    );
  }
}
