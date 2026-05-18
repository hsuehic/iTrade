/**
 * Per-article admin endpoints.
 *   PATCH  /api/admin/help-kb/[id] — partial update (auto re-embeds if content changed)
 *   DELETE /api/admin/help-kb/[id]
 */
import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { deleteArticle, getArticleById, updateArticle } from '@/lib/help-kb/repository';

async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const session = await getSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request);
  if (guard) return guard;
  const { id } = await context.params;
  const article = await getArticleById(id);
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ article });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request);
  if (guard) return guard;
  const { id } = await context.params;

  try {
    const body = (await request.json()) as {
      title?: string;
      slug?: string;
      content?: string;
      category?: string;
      locale?: string;
      tags?: string[];
      priority?: number;
      published?: boolean;
    };

    if (body.slug !== undefined && !/^[a-z0-9-]+$/.test(body.slug)) {
      return NextResponse.json(
        { error: 'slug must contain only lowercase letters, digits, and hyphens' },
        { status: 400 },
      );
    }

    const updated = await updateArticle(id, body);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ article: updated });
  } catch (err) {
    const msg = (err as Error)?.message ?? '';
    if (msg.includes('duplicate key') || msg.includes('UNIQUE constraint')) {
      return NextResponse.json(
        { error: 'Another article already uses that slug' },
        { status: 409 },
      );
    }
    console.error('[Admin Help-KB] PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update article' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request);
  if (guard) return guard;
  const { id } = await context.params;

  const ok = await deleteArticle(id);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
