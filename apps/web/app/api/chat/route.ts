/**
 * POST /api/chat
 *
 * Main chatbot API route — Vercel AI SDK + Zod.
 *
 * Uses generateText() with maxSteps to drive a multi-turn agentic loop:
 * the model can call up to 5 rounds of tools before producing its final answer.
 * No manual tool-dispatch loop needed — the AI SDK handles it automatically.
 *
 * Provider fallback: tries each configured provider in priority order
 * (Groq → Cerebras → OpenRouter → Gemini). On rate-limit (429) or
 * request-too-large (413) errors the next provider is tried automatically.
 *
 * Provider selection is done in lib/chatbot/provider.ts.
 * Tool definitions (with Zod schemas) are in lib/chatbot/tools.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateText, type CoreMessage, type LanguageModel } from 'ai';

import { getSession } from '@/lib/auth';
import { getAIModels, SYSTEM_PROMPT } from '@/lib/chatbot/provider';
import { createChatbotTools } from '@/lib/chatbot/tools';

export const maxDuration = 120; // Allow up to 120s for multi-tool calls

// ── Error helpers ─────────────────────────────────────────────────────────────

/** Extract the HTTP status from an AI SDK error (handles AI_RetryError wrapper). */
function extractStatus(error: unknown): number {
  if (!error || typeof error !== 'object') return 0;
  const e = error as Record<string, unknown>;
  // AI_RetryError wraps the last attempt inside `.lastError`
  const inner =
    e.name === 'AI_RetryError' && e.lastError && typeof e.lastError === 'object'
      ? (e.lastError as Record<string, unknown>)
      : e;
  return typeof inner.status === 'number'
    ? inner.status
    : typeof inner.statusCode === 'number'
      ? inner.statusCode
      : 0;
}

/** True if this error should trigger a fallback to the next provider. */
function isRateLimitOrTooLarge(error: unknown): boolean {
  const status = extractStatus(error);
  // 429 = rate limited, 413 = request too large, 404 = model deprecated/unavailable
  return status === 429 || status === 413 || status === 404;
}

/** Normalise provider errors to a plain { status, message } shape. */
function parseProviderError(error: unknown): { status: number; message: string } | null {
  const status = extractStatus(error);
  if (!status) return null;

  const e = error as Record<string, unknown>;
  const inner =
    e.name === 'AI_RetryError' && e.lastError && typeof e.lastError === 'object'
      ? (e.lastError as Record<string, unknown>)
      : e;
  const raw = (inner.message as string | undefined) ?? '';

  if (status === 429) {
    if (raw.includes('PerDay') || raw.includes('daily') || raw.includes('quota')) {
      return {
        status: 429,
        message:
          "Today's AI quota has been reached across all providers. The chatbot will be available again shortly.",
      };
    }
    return {
      status: 429,
      message:
        'All AI providers are currently rate-limited. Please try again in a moment.',
    };
  }

  if (status === 413) {
    return {
      status: 429,
      message:
        'Your request is too large for the available AI providers. Try a shorter message or clear the conversation history.',
    };
  }

  if (status === 503 || status === 529) {
    return {
      status: 503,
      message: 'The AI service is temporarily unavailable. Please try again in a moment.',
    };
  }

  return null;
}

function isMissingKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const msg = ((error as Record<string, unknown>).message as string | undefined) ?? '';
  return (
    msg.includes('GROQ_API_KEY') ||
    msg.includes('GEMINI_API_KEY') ||
    msg.includes('OPENROUTER_API_KEY') ||
    msg.includes('CEREBRAS_API_KEY') ||
    msg.includes('No AI provider configured') ||
    msg.includes('API key')
  );
}

// ── Core generate helper ──────────────────────────────────────────────────────

/**
 * Run generateText with automatic provider fallback.
 *
 * Tries each model in `models` in order. If a model responds with HTTP 429
 * (rate-limited) or 413 (request too large) the next provider is tried.
 * Any other error is re-thrown immediately.
 */
async function generateWithFallback(
  models: LanguageModel[],
  params: Omit<Parameters<typeof generateText>[0], 'model'>,
): Promise<string> {
  let lastError: unknown;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const { text } = await generateText({ model, ...params });
      return text;
    } catch (err) {
      if (isRateLimitOrTooLarge(err)) {
        const status = extractStatus(err);
        const modelId =
          typeof (model as unknown as Record<string, unknown>).modelId === 'string'
            ? (model as unknown as Record<string, unknown>).modelId
            : `provider ${i + 1}`;
        console.warn(
          `[Chat API] ${status} from ${modelId}${i + 1 < models.length ? ', trying next provider' : ', no more providers'}`,
        );
        lastError = err;
        continue; // try next provider
      }
      throw err; // non-rate-limit error — surface immediately
    }
  }

  throw lastError; // all providers exhausted
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const session = await getSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { message, history = [] } = body as {
      message: string;
      // Client sends role as 'user' | 'model' (Gemini legacy format)
      history: Array<{ role: 'user' | 'model'; content: string }>;
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Build base URL for internal API calls
    const requestUrl = new URL(request.url);
    const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
    const cookie = request.headers.get('cookie') ?? '';

    // Convert history: 'model' (Gemini) → 'assistant' (AI SDK standard)
    const messages: CoreMessage[] = [
      ...history.map((m) => ({
        role: (m.role === 'model' ? 'assistant' : m.role) as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: message },
    ];

    // Run the agentic loop with automatic provider fallback
    const rawText = await generateWithFallback(getAIModels(), {
      system: SYSTEM_PROMPT,
      messages,
      tools: createChatbotTools(baseUrl, cookie),
      maxSteps: 5, // Allow up to 5 rounds of tool calls before final answer
      maxTokens: 2000, // Cap output to reduce TPM footprint on free-tier models
    });

    // ── Parse structured render hints from the response (```json … ```) ──────
    let renderData: {
      renderAs?: 'table' | 'chart' | 'text' | 'strategy_proposal';
      title?: string;
      data?: unknown;
      chartConfig?: unknown;
    } | null = null;
    let cleanText = rawText;

    const jsonBlockMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      try {
        renderData = JSON.parse(jsonBlockMatch[1]);
        cleanText = rawText.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
      } catch {
        // Malformed JSON block — fall through and show raw text
      }
    }

    return NextResponse.json({ message: cleanText, renderData });
  } catch (error) {
    console.error('[Chat API] Error:', error);

    // Missing API key
    if (isMissingKeyError(error)) {
      return NextResponse.json(
        {
          error:
            'AI service not configured. Set GROQ_API_KEY for the best free-tier experience. ' +
            'Get a free key at https://console.groq.com/keys',
        },
        { status: 503 },
      );
    }

    // Provider HTTP errors (429, 503, etc.)
    const providerError = parseProviderError(error);
    if (providerError) {
      return NextResponse.json(
        { error: providerError.message },
        { status: providerError.status },
      );
    }

    return NextResponse.json(
      { error: 'Failed to process your message' },
      { status: 500 },
    );
  }
}
