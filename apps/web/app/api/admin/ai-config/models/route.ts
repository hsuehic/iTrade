import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { defaultBaseUrlForProvider, type AIProvider } from '@/lib/chatbot/ai-config';
import { listAvailableModels } from '@/lib/chatbot/list-models';
import { getAllSettings } from '@/lib/settings';

function normalizeProvider(value: string | undefined): AIProvider {
  return value === 'openai' ? 'openai' : 'google';
}

/**
 * POST /api/admin/ai-config/models
 *
 * Lists chat models available from the configured provider.
 * Uses the request body when testing unsaved credentials; otherwise falls
 * back to stored settings.
 */
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      provider?: string;
      api_key?: string;
      base_url?: string;
    };

    const settings = await getAllSettings();
    const provider = normalizeProvider(body.provider ?? settings.ai_provider);
    const apiKey =
      (body.api_key ?? '').trim() || settings.ai_api_key || settings.gemini_api_key || '';
    const baseUrl =
      (body.base_url ?? '').trim() ||
      settings.ai_base_url?.trim() ||
      defaultBaseUrlForProvider(provider);

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key is required to fetch models.' },
        { status: 400 },
      );
    }

    const models = await listAvailableModels({ provider, apiKey, baseUrl });
    return NextResponse.json({ models, provider, base_url: baseUrl });
  } catch (error) {
    console.error('[AI Config Models API] POST error:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to fetch models from provider.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
