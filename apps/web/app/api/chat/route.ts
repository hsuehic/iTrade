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
import { generateText, stepCountIs, type CoreMessage, type LanguageModel } from 'ai';

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
      // Type assertion needed because ai@5 uses complex generics on generateText

      const { text } = await generateText({ model, ...params } as Parameters<
        typeof generateText
      >[0]);
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

    // Build base URL for internal API calls.
    // Always use localhost + PORT so server-side tool fetches stay on the internal
    // Docker network and avoid the SSL termination layer (nginx strips TLS before
    // forwarding to this container, so https:// from request.url would cause
    // ERR_SSL_WRONG_VERSION_NUMBER inside Docker).
    const baseUrl = `http://localhost:${process.env.PORT ?? 3002}`;
    const cookie = request.headers.get('cookie') ?? '';

    // Forward the original host/proto headers so that auth middleware inside the
    // tool API calls sees the production origin (itrade.ihsueh.com / https) rather
    // than localhost:3002.  Without these, getRequestBaseURL() returns
    // http://localhost:3002 and better-auth rejects the session as unauthorised.
    const forwardedHeaders: Record<string, string> = {};
    const fwdHost = request.headers.get('x-forwarded-host');
    const fwdProto = request.headers.get('x-forwarded-proto');
    const origHost = request.headers.get('host');
    if (fwdHost) forwardedHeaders['x-forwarded-host'] = fwdHost;
    if (fwdProto) forwardedHeaders['x-forwarded-proto'] = fwdProto;
    else if (origHost && !origHost.startsWith('localhost'))
      forwardedHeaders['x-forwarded-proto'] = 'https';
    if (origHost)
      forwardedHeaders['x-forwarded-host'] =
        forwardedHeaders['x-forwarded-host'] ?? origHost;

    // Convert history: 'model' (Gemini) → 'assistant' (AI SDK standard)
    const messages: CoreMessage[] = [
      ...history.map((m) => ({
        role: (m.role === 'model' ? 'assistant' : m.role) as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: message },
    ];

    // Run the agentic loop with automatic provider fallback.
    // @ai-sdk/google v2.x properly preserves thoughtSignature in providerMetadata,
    // so thinking models (gemini-2.5-flash etc.) work correctly across tool-call steps.
    const rawText = await generateWithFallback(await getAIModels(), {
      system: SYSTEM_PROMPT,
      messages,
      tools: createChatbotTools(baseUrl, cookie, forwardedHeaders),
      stopWhen: stepCountIs(5), // Allow up to 5 rounds of tool calls before final answer
      maxOutputTokens: 4000, // Generous cap for thinking models that need more tokens
    });

    // ── Parse structured render hints from the response ──────────────────────
    // The model should wrap renderData in ```json ... ``` fences, but thinking
    // models sometimes emit bare JSON objects. We try both patterns so charts
    // and tables render regardless of which format the model chose.
    let renderData: {
      renderAs?: 'table' | 'chart' | 'text' | 'strategy_proposal';
      title?: string;
      data?: unknown;
      chartConfig?: unknown;
    } | null = null;
    let cleanText = rawText;

    // Strategy 1: fenced ```json … ``` block (preferred format)
    const jsonBlockMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      try {
        renderData = JSON.parse(jsonBlockMatch[1]);
        cleanText = rawText.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
      } catch {
        // Malformed JSON — fall through to next strategy
      }
    }

    // Strategy 2: bare JSON containing "renderAs" anywhere in the response.
    // The model sometimes emits pretty-printed JSON so { and "renderAs": land on
    // different lines, making a literal '{"renderAs":' search miss. Instead find
    // the last occurrence of the key, backtrack to its enclosing {, then parse
    // from there to the end of the string.
    if (!renderData) {
      const renderAsIdx = rawText.lastIndexOf('"renderAs":');
      if (renderAsIdx !== -1) {
        // Walk backwards to find the opening brace of the JSON object
        const openBraceIdx = rawText.lastIndexOf('{', renderAsIdx);
        if (openBraceIdx !== -1) {
          const candidate = rawText.slice(openBraceIdx);
          try {
            renderData = JSON.parse(candidate);
            cleanText = rawText.slice(0, openBraceIdx).trim();
          } catch {
            // JSON is truncated or malformed — fall through and show raw text
          }
        }
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
