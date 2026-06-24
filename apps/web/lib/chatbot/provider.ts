/**
 * AI provider configuration for the iTrade chatbot.
 *
 * Supports Google Gemini and OpenAI-compatible APIs. The provider, API key,
 * base URL, and model are stored in the DB-backed settings store (Admin →
 * AI Config) with environment-variable fallbacks.
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
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

import {
  assertAIConfigConfigured,
  resolveAIConfig,
  type ResolvedAIConfig,
} from './ai-config';

// ── Model instance cache ──────────────────────────────────────────────────────

interface ModelCache {
  model: LanguageModel;
  cacheKey: string;
}

declare global {
  var __aiModelCache: ModelCache | undefined;
}

function buildCacheKey(config: ResolvedAIConfig): string {
  return [config.provider, config.baseUrl, config.apiKey, config.model].join('|');
}

/**
 * Returns the configured chat model. DB-backed settings take priority over
 * environment variables so admins can rotate credentials at runtime.
 */
export async function getAIModel(): Promise<LanguageModel> {
  const config = await resolveAIConfig();
  assertAIConfigConfigured(config);

  const cacheKey = buildCacheKey(config);
  const cached = globalThis.__aiModelCache;
  if (cached && cached.cacheKey === cacheKey) {
    return cached.model;
  }

  const model =
    config.provider === 'openai'
      ? createOpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseUrl,
        }).chat(config.model)
      : createGoogleGenerativeAI({ apiKey: config.apiKey })(config.model);

  globalThis.__aiModelCache = { model, cacheKey };
  return model;
}

/** Resolved config for routes that need provider-specific stream options. */
export async function getAIConfig(): Promise<ResolvedAIConfig> {
  const config = await resolveAIConfig();
  assertAIConfigConfigured(config);
  return config;
}

// ── Emergency fallback prompt ─────────────────────────────────────────────────

export const EMERGENCY_FALLBACK_PROMPT =
  'You are iTrade AI, a smart trading assistant for the iTrade platform. ' +
  'Help users with their trading performance, portfolio, strategies, and orders. ' +
  'NEVER create a strategy without showing a strategy_proposal JSON block first.';
