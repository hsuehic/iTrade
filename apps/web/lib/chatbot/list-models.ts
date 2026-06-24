/**
 * Fetch available chat models from the configured AI provider.
 */
import type { AIProvider } from './ai-config';
import { defaultBaseUrlForProvider } from './ai-config';

export interface ListedModel {
  id: string;
  label: string;
}

interface ListModelsInput {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;
}

function stripGoogleModelPrefix(id: string): string {
  return id.startsWith('models/') ? id.slice('models/'.length) : id;
}

async function listGoogleModels(apiKey: string, baseUrl: string): Promise<ListedModel[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { method: 'GET' });
  const body = await res.text();

  if (!res.ok) {
    throw new Error(`Google models API returned ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = JSON.parse(body) as {
    models?: Array<{
      name?: string;
      displayName?: string;
      supportedGenerationMethods?: string[];
    }>;
  };

  return (json.models ?? [])
    .filter((m) => {
      const methods = m.supportedGenerationMethods ?? [];
      return methods.includes('generateContent');
    })
    .map((m) => {
      const id = stripGoogleModelPrefix(m.name ?? '');
      return {
        id,
        label: m.displayName ? `${m.displayName} (${id})` : id,
      };
    })
    .filter((m) => m.id.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function listOpenAIModels(apiKey: string, baseUrl: string): Promise<ListedModel[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const body = await res.text();

  if (!res.ok) {
    throw new Error(`OpenAI models API returned ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = JSON.parse(body) as {
    data?: Array<{ id?: string }>;
  };

  return (json.data ?? [])
    .map((m) => m.id?.trim())
    .filter((id): id is string => !!id)
    .map((id) => ({ id, label: id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function listAvailableModels(
  input: ListModelsInput,
): Promise<ListedModel[]> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    throw new Error('API key is required to list models.');
  }

  const baseUrl = (
    input.baseUrl?.trim() || defaultBaseUrlForProvider(input.provider)
  ).replace(/\/+$/, '');

  if (input.provider === 'google') {
    return listGoogleModels(apiKey, baseUrl);
  }

  return listOpenAIModels(apiKey, baseUrl);
}
