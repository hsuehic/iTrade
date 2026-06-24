/**
 * Runtime AI provider configuration for the iTrade chatbot.
 *
 * Supports Google Gemini and OpenAI-compatible APIs (OpenAI, Azure OpenAI
 * proxies, Ollama with OpenAI shim, etc.). Values are stored in the DB-backed
 * settings store with legacy `gemini_*` key fallbacks.
 */
import { getAllSettings } from '@/lib/settings';

export type AIProvider = 'google' | 'openai';

export interface ResolvedAIConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export const DEFAULT_GOOGLE_MODEL = 'gemini-2.5-flash';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  google: 'Google Gemini',
  openai: 'OpenAI / Compatible',
};

export function defaultModelForProvider(provider: AIProvider): string {
  return provider === 'google' ? DEFAULT_GOOGLE_MODEL : DEFAULT_OPENAI_MODEL;
}

export function defaultBaseUrlForProvider(provider: AIProvider): string {
  return provider === 'google'
    ? 'https://generativelanguage.googleapis.com/v1beta'
    : DEFAULT_OPENAI_BASE_URL;
}

function normalizeProvider(value: string | undefined): AIProvider {
  return value === 'openai' ? 'openai' : 'google';
}

function normalizeBaseUrl(provider: AIProvider, baseUrl: string | undefined): string {
  const trimmed = (baseUrl ?? '').trim();
  if (trimmed) return trimmed.replace(/\/+$/, '');
  return defaultBaseUrlForProvider(provider);
}

/**
 * Resolve the effective AI config from DB settings and environment variables.
 * Legacy `gemini_api_key` / `gemini_model` keys remain supported.
 */
export async function resolveAIConfig(): Promise<ResolvedAIConfig> {
  let settings: Partial<
    Record<
      | 'ai_provider'
      | 'ai_api_key'
      | 'ai_base_url'
      | 'ai_model'
      | 'gemini_api_key'
      | 'gemini_model',
      string
    >
  > = {};

  try {
    settings = await getAllSettings();
  } catch {
    // DB unavailable — fall back to env vars
  }

  const provider = normalizeProvider(settings.ai_provider);
  const apiKey =
    settings.ai_api_key ||
    settings.gemini_api_key ||
    (provider === 'openai'
      ? process.env.OPENAI_API_KEY || process.env.AI_API_KEY
      : process.env.GEMINI_API_KEY || process.env.AI_API_KEY) ||
    '';
  const model =
    settings.ai_model ||
    settings.gemini_model ||
    (provider === 'openai'
      ? process.env.OPENAI_MODEL || process.env.AI_MODEL
      : process.env.GEMINI_MODEL || process.env.AI_MODEL) ||
    defaultModelForProvider(provider);
  const baseUrl = normalizeBaseUrl(
    provider,
    settings.ai_base_url ||
      (provider === 'openai' ? process.env.OPENAI_BASE_URL : undefined),
  );

  return { provider, apiKey, baseUrl, model };
}

export function assertAIConfigConfigured(config: ResolvedAIConfig): void {
  if (config.apiKey) return;

  throw new Error(
    'No AI API key configured. Set it via Admin → AI Config or the AI_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY environment variable.',
  );
}
