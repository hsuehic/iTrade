/**
 * AI provider configuration for the iTrade chatbot.
 *
 * Currently iTrade uses **Google Gemini exclusively**. The API key and model
 * are stored in the DB-backed settings store (managed via Admin → AI Config)
 * with environment-variable fallbacks for fresh installs.
 *
 *   API key: DB `gemini_api_key` → env `GEMINI_API_KEY`
 *   Model:   DB `gemini_model`   → env `GEMINI_MODEL` → `gemini-2.5-flash`
 *
 * Thinking models (gemini-2.5-flash, gemini-2.5-pro, etc.) are fully supported.
 * `@ai-sdk/google` v2.x preserves `thoughtSignature` in `providerMetadata` when
 * replaying multi-turn tool-call history, so step 2+ tool calls work cleanly.
 *
 * Get a free Gemini API key: https://aistudio.google.com/apikey
 *
 * ── Prompt architecture ───────────────────────────────────────────────────────
 *
 * All prompt content lives in the vector KB (help_articles table), not in code:
 *
 *   prompt-base              — always loaded by slug; role + core rules
 *   prompt-rendering-rules   — always loaded by slug; chart/table/proposal rules
 *   prompt-strategy-creation — retrieved by similarity when relevant
 *   prompt-strategy-types    — retrieved by similarity when relevant
 *   prompt-market-data       — retrieved by similarity when relevant
 *
 * Seed / update prompt content via POST /api/admin/chatbot-kb.
 * See: apps/web/lib/chatbot/seed-data.ts for the source-of-truth text.
 */
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import { getAllSettings } from '@/lib/settings';

// ── Model selector ────────────────────────────────────────────────────────────

/**
 * Returns the configured Gemini model. The DB-backed settings store takes
 * priority over environment variables so admins can rotate the key or model
 * at runtime without a redeploy.
 *
 * Throws if neither the DB setting nor the env var is configured.
 */
export async function getAIModel(): Promise<LanguageModel> {
  let dbSettings: Partial<Record<'gemini_api_key' | 'gemini_model', string>> = {};
  try {
    const all = await getAllSettings();
    dbSettings = {
      gemini_api_key: all.gemini_api_key,
      gemini_model: all.gemini_model,
    };
  } catch {
    // DB unavailable — fall back to env vars silently
  }

  const apiKey = dbSettings.gemini_api_key || process.env.GEMINI_API_KEY;
  const model = dbSettings.gemini_model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (!apiKey) {
    throw new Error(
      'No Gemini API key configured. Set GEMINI_API_KEY env var or configure via Admin → AI Config. ' +
        'Get a free key at https://aistudio.google.com/apikey',
    );
  }

  const google = createGoogleGenerativeAI({ apiKey });
  return google(model);
}

// ── Emergency fallback prompt ─────────────────────────────────────────────────
//
// Used ONLY when the DB is completely unreachable and no prompt content can be
// loaded. Under normal operation the full prompt is always read from the DB.

export const EMERGENCY_FALLBACK_PROMPT =
  'You are iTrade AI, a smart trading assistant for the iTrade platform. ' +
  'Help users with their trading performance, portfolio, strategies, and orders. ' +
  'NEVER create a strategy without showing a strategy_proposal JSON block first.';
