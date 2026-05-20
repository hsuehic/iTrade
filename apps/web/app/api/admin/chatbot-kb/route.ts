/**
 * Admin endpoints for chatbot vector KB seeding.
 *
 *   GET  /api/admin/chatbot-kb  — status: how many tool/section articles are seeded
 *   POST /api/admin/chatbot-kb  — (re)seed all tool descriptions and prompt sections
 *
 * Seeding embeds each article's content with Gemini so the dynamic context builder
 * can retrieve relevant tools and prompt sections at chat request time.
 *
 * Idempotent: safe to POST multiple times — articles are upserted by slug.
 *
 * Admin role required.
 */
import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { seedChatbotKB, getChatbotKBStatus } from '@/lib/chatbot/dynamic';

async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const session = await getSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

/**
 * GET /api/admin/chatbot-kb
 *
 * Returns counts of seeded and embedded tool/section articles.
 * Useful for checking whether seeding is needed or complete.
 */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard) return guard;

  try {
    const status = await getChatbotKBStatus();
    return NextResponse.json({
      status,
      ready:
        status.tools.embedded === status.tools.total &&
        status.sections.embedded === status.sections.total &&
        status.tools.total > 0,
    });
  } catch (err) {
    console.error('[Admin Chatbot-KB] GET error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch chatbot KB status' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/chatbot-kb
 *
 * (Re)seeds all chatbot tool descriptions and prompt sections into the vector KB.
 * Each article is upserted (create or update by slug) and its content is embedded
 * via Gemini so it can be retrieved by cosine similarity at chat time.
 *
 * Returns per-category counts and any per-article errors.
 */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard) return guard;

  try {
    const result = await seedChatbotKB();

    const allFailed = result.tools.failed + result.sections.failed;
    const status =
      allFailed === 0
        ? 200
        : result.tools.seeded + result.sections.seeded === 0
          ? 500
          : 207;

    return NextResponse.json(
      {
        tools: result.tools,
        sections: result.sections,
        summary: `Seeded ${result.tools.seeded} tools and ${result.sections.seeded} prompt sections. ${allFailed > 0 ? `${allFailed} failed.` : 'All successful.'}`,
      },
      { status },
    );
  } catch (err) {
    console.error('[Admin Chatbot-KB] POST error:', err);
    return NextResponse.json({ error: 'Failed to seed chatbot KB' }, { status: 500 });
  }
}
