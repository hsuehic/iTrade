import { NextResponse } from 'next/server';
import {
  defaultModelForProvider,
  PROVIDER_LABELS,
  resolveAIConfig,
} from '@/lib/chatbot/ai-config';
import { getAllSettings } from '@/lib/settings';

/**
 * GET /api/config/chat
 *
 * Public endpoint — no auth required.
 * Returns the runtime-configurable chat widget settings.
 */
export async function GET() {
  try {
    const settings = await getAllSettings();
    const config = await resolveAIConfig();
    const providerLabel = PROVIDER_LABELS[config.provider];
    const model = config.model || defaultModelForProvider(config.provider);
    const defaultTitle = `Powered by ${providerLabel} · ${model}`;

    return NextResponse.json({
      chat_title: settings.chat_title || defaultTitle,
      ai_provider: config.provider,
      ai_model: model,
      // Legacy field for older clients
      gemini_model: model,
    });
  } catch (error) {
    console.error('[Chat Config API] GET error:', error);
    return NextResponse.json({
      chat_title: 'Powered by iTrade AI',
      ai_provider: 'google',
      ai_model: 'gemini-2.5-flash',
      gemini_model: 'gemini-2.5-flash',
    });
  }
}
