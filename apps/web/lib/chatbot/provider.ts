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

// ── Model instance cache ──────────────────────────────────────────────────────
//
// `getAIModel()` is called on every chat request. Without caching it recreates
// the Google provider + model object each time — cheap but needlessly wasteful.
// We cache the LanguageModel keyed by `apiKey|modelId` and bust the cache
// whenever the admin saves new AI Config settings (invalidateSettingsCache()
// already wipes __settingsCache; we piggyback on the same lifecycle here by
// co-locating the model cache on the global object so HMR reloads don't reset it).

interface ModelCache {
  model: LanguageModel;
  apiKey: string;
  modelId: string;
}

declare global {
  var __aiModelCache: ModelCache | undefined;
}

// ── Model selector ────────────────────────────────────────────────────────────

/**
 * Returns the configured Gemini model. The DB-backed settings store takes
 * priority over environment variables so admins can rotate the key or model
 * at runtime without a redeploy.
 *
 * The resolved LanguageModel instance is cached in-process (keyed by
 * apiKey + modelId) to avoid rebuilding the provider object on every request.
 * The cache is invalidated whenever AI Config settings are saved.
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
  const modelId =
    dbSettings.gemini_model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (!apiKey) {
    throw new Error(
      'No Gemini API key configured. Set GEMINI_API_KEY env var or configure via Admin → AI Config. ' +
        'Get a free key at https://aistudio.google.com/apikey',
    );
  }

  // Return the cached instance if the key + model haven't changed.
  const cached = globalThis.__aiModelCache;
  if (cached && cached.apiKey === apiKey && cached.modelId === modelId) {
    return cached.model;
  }

  const google = createGoogleGenerativeAI({ apiKey });
  const model = google(modelId);

  globalThis.__aiModelCache = { model, apiKey, modelId };
  return model;
}

// ── Emergency fallback prompt ─────────────────────────────────────────────────
//
// Used ONLY when the DB is completely unreachable and no prompt content can be
// loaded. Under normal operation the full prompt is always read from the DB.

export const EMERGENCY_FALLBACK_PROMPT =
  'You are iTrade AI, a smart trading assistant for the iTrade platform. ' +
  'Help users with their trading performance, portfolio, strategies, and orders. ' +
  'NEVER create a strategy without showing a strategy_proposal JSON block first.';
