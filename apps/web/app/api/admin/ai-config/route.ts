import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  defaultBaseUrlForProvider,
  defaultModelForProvider,
  PROVIDER_LABELS,
  type AIProvider,
} from '@/lib/chatbot/ai-config';
import { getAllSettings, setSetting, deleteSetting } from '@/lib/settings';

function maskApiKey(rawKey: string): string {
  if (rawKey.length > 4) {
    return `${'•'.repeat(rawKey.length - 4)}${rawKey.slice(-4)}`;
  }
  if (rawKey.length > 0) {
    return '•'.repeat(rawKey.length);
  }
  return '';
}

function normalizeProvider(value: string | undefined): AIProvider {
  return value === 'openai' ? 'openai' : 'google';
}

// ── GET /api/admin/ai-config ──────────────────────────────────────────────────

/**
 * Returns all AI-related settings.
 * The API key value is masked (shows last 4 chars only).
 */
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const settings = await getAllSettings();
    const provider = normalizeProvider(settings.ai_provider);
    const rawKey = settings.ai_api_key || settings.gemini_api_key || '';
    const model =
      settings.ai_model || settings.gemini_model || defaultModelForProvider(provider);
    const baseUrl = settings.ai_base_url?.trim() || defaultBaseUrlForProvider(provider);

    return NextResponse.json({
      ai_provider: provider,
      ai_api_key: maskApiKey(rawKey),
      ai_api_key_set: rawKey.length > 0,
      ai_base_url: baseUrl,
      ai_model: model,
      chat_title: settings.chat_title ?? '',
      // Legacy fields kept for older clients
      gemini_api_key: maskApiKey(settings.gemini_api_key ?? ''),
      gemini_api_key_set: (settings.gemini_api_key ?? '').length > 0,
      gemini_model: settings.gemini_model ?? '',
      provider_label: PROVIDER_LABELS[provider],
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
 *  - ai_provider   'google' | 'openai'
 *  - ai_api_key    string — pass empty string to clear
 *  - ai_base_url   string — pass empty string to clear (uses provider default)
 *  - ai_model      string — pass empty string to clear (uses provider default)
 *  - chat_title    string — pass empty string to clear
 */
export async function PUT(request: NextRequest) {
  const session = await getSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      ai_provider?: string;
      ai_api_key?: string;
      ai_base_url?: string;
      ai_model?: string;
      chat_title?: string;
      // Legacy
      gemini_api_key?: string;
      gemini_model?: string;
    };

    if ('ai_provider' in body) {
      const provider = normalizeProvider(body.ai_provider);
      await setSetting('ai_provider', provider);
    }

    if ('ai_api_key' in body) {
      const key = (body.ai_api_key ?? '').trim();
      if (key) {
        await setSetting('ai_api_key', key);
      } else {
        await deleteSetting('ai_api_key');
      }
    }

    if ('ai_base_url' in body) {
      const baseUrl = (body.ai_base_url ?? '').trim();
      if (baseUrl) {
        await setSetting('ai_base_url', baseUrl.replace(/\/+$/, ''));
      } else {
        await deleteSetting('ai_base_url');
      }
    }

    if ('ai_model' in body) {
      const model = (body.ai_model ?? '').trim();
      if (model) {
        await setSetting('ai_model', model);
      } else {
        await deleteSetting('ai_model');
      }
    }

    // Legacy gemini fields — still accepted for backward compatibility
    if ('gemini_api_key' in body) {
      const key = (body.gemini_api_key ?? '').trim();
      if (key) {
        await setSetting('gemini_api_key', key);
      } else {
        await deleteSetting('gemini_api_key');
      }
    }

    if ('gemini_model' in body) {
      const model = (body.gemini_model ?? '').trim();
      if (model) {
        await setSetting('gemini_model', model);
      } else {
        await deleteSetting('gemini_model');
      }
    }

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
