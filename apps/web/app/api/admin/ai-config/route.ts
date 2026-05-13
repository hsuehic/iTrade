import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAllSettings, setSetting, deleteSetting } from '@/lib/settings';

// ── GET /api/admin/ai-config ──────────────────────────────────────────────────

/**
 * Returns all AI-related settings.
 * The gemini_api_key value is masked (shows last 4 chars only) so it is never
 * exposed in full to the browser — the client only needs to know whether a key
 * is set and display a hint.
 */
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const settings = await getAllSettings();

    // Mask the API key — never send the full key to the browser
    const rawKey = settings.gemini_api_key ?? '';
    const maskedKey =
      rawKey.length > 4
        ? `${'•'.repeat(rawKey.length - 4)}${rawKey.slice(-4)}`
        : rawKey.length > 0
          ? '•'.repeat(rawKey.length)
          : '';

    return NextResponse.json({
      gemini_api_key: maskedKey,
      gemini_api_key_set: rawKey.length > 0,
      gemini_model: settings.gemini_model ?? '',
      chat_title: settings.chat_title ?? '',
    });
  } catch (error) {
    console.error('[AI Config API] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ── PUT /api/admin/ai-config ──────────────────────────────────────────────────

/**
 * Updates AI config settings.
 *
 * Body fields (all optional):
 *  - gemini_api_key  string  — pass empty string to clear (reverts to env var)
 *  - gemini_model    string  — pass empty string to clear (reverts to default)
 *  - chat_title      string  — pass empty string to clear (reverts to default)
 *
 * A field that is absent from the body is left unchanged.
 * A field that is an empty string clears the DB value (env-var / built-in
 * default takes over on the next request).
 */
export async function PUT(request: NextRequest) {
  const session = await getSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      gemini_api_key?: string;
      gemini_model?: string;
      chat_title?: string;
    };

    // gemini_api_key
    if ('gemini_api_key' in body) {
      const key = (body.gemini_api_key ?? '').trim();
      if (key) {
        await setSetting('gemini_api_key', key);
      } else {
        await deleteSetting('gemini_api_key');
      }
    }

    // gemini_model
    if ('gemini_model' in body) {
      const model = (body.gemini_model ?? '').trim();
      if (model) {
        await setSetting('gemini_model', model);
      } else {
        await deleteSetting('gemini_model');
      }
    }

    // chat_title
    if ('chat_title' in body) {
      const title = (body.chat_title ?? '').trim();
      if (title) {
        await setSetting('chat_title', title);
      } else {
        await deleteSetting('chat_title');
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[AI Config API] PUT error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
