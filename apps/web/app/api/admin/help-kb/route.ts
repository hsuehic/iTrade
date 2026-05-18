/**
 * Admin endpoints for the help-KB.
 *   GET  /api/admin/help-kb        — list articles, with filters
 *   POST /api/admin/help-kb        — create a new article (auto-embeds)
 *
 * Admin role required.
 */
import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import {
  createArticle,
  listArticles,
  type HelpArticleListFilter,
} from '@/lib/help-kb/repository';

async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const session = await getSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard) return guard;

  try {
    const url = new URL(request.url);
    const filter: HelpArticleListFilter = {};
    const locale = url.searchParams.get('locale');
    const category = url.searchParams.get('category');
    const published = url.searchParams.get('published');
    const search = url.searchParams.get('search');
    if (locale) filter.locale = locale;
    if (category) filter.category = category;
    if (published !== null) filter.published = published === 'true';
    if (search) filter.search = search;

    const articles = await listArticles(filter);
    return NextResponse.json({
      articles: articles.map((a) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        content: a.content,
        category: a.category,
        locale: a.locale,
        tags: a.tags ?? [],
        priority: a.priority,
        published: a.published,
        hasEmbedding: !!a.embeddingHash,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
    });
  } catch (err) {
    console.error('[Admin Help-KB] GET error:', err);
    return NextResponse.json({ error: 'Failed to load articles' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard) return guard;

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

    if (!body.title?.trim() || !body.slug?.trim() || !body.content?.trim()) {
      return NextResponse.json(
        { error: 'title, slug, and content are required' },
        { status: 400 },
      );
    }

    if (!/^[a-z0-9-]+$/.test(body.slug)) {
      return NextResponse.json(
        { error: 'slug must contain only lowercase letters, digits, and hyphens' },
        { status: 400 },
      );
    }

    const article = await createArticle({
      title: body.title.trim(),
      slug: body.slug.trim(),
      content: body.content,
      category: body.category,
      locale: body.locale,
      tags: body.tags,
      priority: body.priority,
      published: body.published,
    });

    return NextResponse.json({ article }, { status: 201 });
  } catch (err) {
    const msg = (err as Error)?.message ?? '';
    if (msg.includes('duplicate key') || msg.includes('UNIQUE constraint')) {
      return NextResponse.json(
        { error: 'An article with that slug already exists' },
        { status: 409 },
      );
    }
    console.error('[Admin Help-KB] POST error:', err);
    return NextResponse.json({ error: 'Failed to create article' }, { status: 500 });
  }
}
