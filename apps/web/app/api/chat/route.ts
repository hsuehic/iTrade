/**
 * POST /api/chat
 *
 * Main chatbot API route. Handles multi-turn conversations with Gemini 2.5 Flash,
 * using function calling to fetch real trading data from iTrade APIs.
 */
import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { createChatModel } from '@/lib/chatbot/gemini';
import { CHATBOT_TOOLS, executeToolCall, type ToolName } from '@/lib/chatbot/tools';
import type { Content } from '@google/generative-ai';

export const maxDuration = 120; // Allow up to 120s for multi-tool calls + retry backoff

// ── Gemini retry helper ────────────────────────────────────────────────────
const RETRY_ATTEMPTS = 3; // Total attempts (1 original + 2 retries)
const MIN_RETRY_DELAY_MS = 8_000; // Always wait at least 8s between per-minute retries
const MAX_RETRY_DELAY_MS = 30_000; // Cap per-minute retry wait at 30s

type QuotaViolation = { quotaId?: string };
type ErrorDetail = {
  '@type': string;
  retryDelay?: string;
  violations?: QuotaViolation[];
};

function getErrorDetails(error: unknown): ErrorDetail[] {
  try {
    return (error as { errorDetails?: ErrorDetail[] }).errorDetails ?? [];
  } catch {
    return [];
  }
}

function extractRetryDelayMs(error: unknown): number | null {
  const details = getErrorDetails(error);
  const retryInfo = details.find((d) => d['@type']?.includes('RetryInfo'));
  if (retryInfo?.retryDelay) {
    return Math.ceil(parseFloat(retryInfo.retryDelay) * 1000);
  }
  return null;
}

function isDailyQuotaExhausted(error: unknown): boolean {
  const details = getErrorDetails(error);
  const quotaFailure = details.find((d) => d['@type']?.includes('QuotaFailure'));
  return quotaFailure?.violations?.some((v) => v.quotaId?.includes('PerDay')) ?? false;
}

function isGemini429(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status: number }).status === 429
  );
}

async function sendWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isGemini429(err)) throw err; // Non-rate-limit error — bail immediately

      // Daily quota is exhausted — retrying won't help until midnight; fail fast
      if (isDailyQuotaExhausted(err)) throw err;

      if (attempt < RETRY_ATTEMPTS - 1) {
        // Per-minute rate limit — honour the suggested delay, clamped to [MIN, MAX]
        const suggestedMs = extractRetryDelayMs(err) ?? 0;
        const delayMs = Math.min(
          Math.max(suggestedMs, MIN_RETRY_DELAY_MS),
          MAX_RETRY_DELAY_MS,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

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
      history: Array<{ role: 'user' | 'model'; content: string }>;
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Build the base URL for internal API calls
    const requestUrl = new URL(request.url);
    const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;

    // Pass session cookie for authenticated API calls
    const cookie = request.headers.get('cookie') || '';

    // Create Gemini model with tools
    const model = createChatModel(CHATBOT_TOOLS);

    // Convert chat history to Gemini Content format
    const geminiHistory: Content[] = history.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.content }],
    }));

    // Start chat session
    const chat = model.startChat({ history: geminiHistory });

    // Send user message (with automatic retry on 429)
    let response = await sendWithRetry(() => chat.sendMessage(message));
    let candidate = response.response;

    // Agentic loop: keep executing tool calls until Gemini stops asking for them
    const MAX_TOOL_ROUNDS = 5;
    let toolRound = 0;

    while (toolRound < MAX_TOOL_ROUNDS) {
      const functionCalls = candidate.functionCalls();
      if (!functionCalls || functionCalls.length === 0) break;

      toolRound++;

      // Execute all requested tool calls in parallel
      const toolResults = await Promise.allSettled(
        functionCalls.map(async (fc) => {
          try {
            const result = await executeToolCall(
              fc.name as ToolName,
              (fc.args as Record<string, unknown>) || {},
              baseUrl,
              cookie,
            );
            return {
              functionResponse: {
                name: fc.name,
                response: { result },
              },
            };
          } catch (err) {
            return {
              functionResponse: {
                name: fc.name,
                response: {
                  error: err instanceof Error ? err.message : 'Tool execution failed',
                },
              },
            };
          }
        }),
      );

      // Feed tool results back to Gemini
      const toolResponseParts = toolResults.map((r) =>
        r.status === 'fulfilled'
          ? r.value
          : {
              functionResponse: {
                name: 'unknown',
                response: { error: 'Tool call failed' },
              },
            },
      );

      response = await sendWithRetry(() => chat.sendMessage(toolResponseParts));
      candidate = response.response;
    }

    // Extract the final text response
    const rawText = candidate.text();

    // Parse structured render hints from the response (```json ... ```)
    let renderData: {
      renderAs?: 'table' | 'chart' | 'text';
      title?: string;
      data?: unknown;
      chartConfig?: unknown;
    } | null = null;
    let cleanText = rawText;

    const jsonBlockMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      try {
        renderData = JSON.parse(jsonBlockMatch[1]);
        // Remove the json block from the displayed text
        cleanText = rawText.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
      } catch {
        // If parsing fails, just use the raw text
      }
    }

    return NextResponse.json({
      message: cleanText,
      renderData,
    });
  } catch (error) {
    console.error('[Chat API] Error:', error);

    // ── Gemini API key not configured ─────────────────────────────────────
    if (error instanceof Error && error.message.includes('GEMINI_API_KEY')) {
      return NextResponse.json(
        {
          error:
            'AI service not configured. Please add GEMINI_API_KEY to your environment. Get a free key at https://aistudio.google.com/apikey',
        },
        { status: 503 },
      );
    }

    // ── GoogleGenerativeAI HTTP errors (status field on the thrown object) ─
    const geminiStatus =
      error !== null && typeof error === 'object' && 'status' in error
        ? (error as { status: number }).status
        : null;

    if (geminiStatus === 503) {
      return NextResponse.json(
        {
          error:
            'The AI service is temporarily unavailable due to high demand. Please try again in a moment.',
        },
        { status: 503 },
      );
    }

    if (geminiStatus === 429) {
      // Distinguish daily quota exhaustion from per-minute rate limiting
      if (isDailyQuotaExhausted(error)) {
        return NextResponse.json(
          {
            error:
              "Today's AI quota has been reached. The chatbot will be available again tomorrow. Consider upgrading to a paid Gemini API key for unlimited access.",
          },
          { status: 429 },
        );
      }

      // Per-minute rate limit — extract suggested retry delay
      const delayMs = extractRetryDelayMs(error);
      const retryMsg =
        delayMs != null && delayMs > 0
          ? `Please try again in ${Math.ceil(delayMs / 1000)} second(s).`
          : 'Please try again in a moment.';
      return NextResponse.json(
        { error: `AI is busy right now. ${retryMsg}` },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: 'Failed to process your message' },
      { status: 500 },
    );
  }
}
