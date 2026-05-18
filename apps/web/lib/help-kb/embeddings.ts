/**
 * Embedding service for the help-KB chatbot.
 *
 * Uses Google `text-embedding-004` (768-dim) via the public REST API. The
 * model is on Gemini's free tier and the API key we already manage in
 * /admin/ai-config is reused — no extra configuration needed.
 *
 * Why REST and not @ai-sdk/google?
 *   The AI SDK's `embed()` helper requires importing the provider's embedding
 *   model in a way that adds another bundle dep; a single fetch keeps things
 *   tight and matches how the existing chat route configures Gemini.
 *
 * Output: a plain `number[]` of length 768 ready for pgvector storage.
 */
import { getAllSettings } from '@/lib/settings';

// `text-embedding-004` was retired from the Gemini public API. The current
// stable model is `gemini-embedding-001` — it defaults to 3072 dimensions
// but accepts `outputDimensionality` to truncate, which lets us stay on the
// existing pgvector(768) column without a schema change.
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Pull the Gemini key from DB settings first, then env. */
async function getApiKey(): Promise<string> {
  try {
    const settings = await getAllSettings();
    if (settings.gemini_api_key) return settings.gemini_api_key;
  } catch {
    // DB unavailable — fall through to env
  }
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey) return envKey;
  throw new Error(
    'Gemini API key not configured. Set it via /admin/ai-config or GEMINI_API_KEY env var.',
  );
}

/**
 * Embed an arbitrary piece of text. Throws on any non-200 response so callers
 * can decide whether to retry or surface the error.
 *
 * @param text       Raw text to embed (e.g. a KB article body or user question).
 * @param taskType   "RETRIEVAL_DOCUMENT" when embedding KB content, or
 *                   "RETRIEVAL_QUERY" when embedding the user's question.
 *                   Gemini optimises the same model differently per task type.
 */
export async function embed(
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT',
): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Cannot embed empty text');
  }

  const apiKey = await getApiKey();
  const url = `${API_BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text: trimmed }] },
      taskType,
      outputDimensionality: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini embedding API returned ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    embedding?: { values?: number[] };
  };

  const values = json.embedding?.values;
  if (!values || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Unexpected embedding response (expected ${EMBEDDING_DIMENSIONS} dims, got ${values?.length ?? 0})`,
    );
  }
  return values;
}

/** Postgres pgvector accepts vectors formatted as `[1,2,3]`. */
export function toPgVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

export const HELP_KB_EMBEDDING_DIMENSIONS = EMBEDDING_DIMENSIONS;
