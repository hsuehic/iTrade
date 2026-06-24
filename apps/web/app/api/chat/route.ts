/**
 * POST /api/chat
 *
 * Main chatbot API route — Vercel AI SDK + Zod.
 *
 * Uses streamText() with stopWhen to drive a multi-turn agentic loop:
 * the model can call up to 5 rounds of tools before producing its final answer.
 * Tokens are streamed to the client as Server-Sent Events.
 *
 * iTrade supports Google Gemini and OpenAI-compatible providers. Credentials
 * are configured via Admin → AI Config (DB-backed, runtime-editable).
 *
 * SSE event protocol
 * ──────────────────
 *   event: token       data: { text: string }
 *     Incremental text delta — append to the in-progress bubble.
 *
 *   event: render_data data: RenderData
 *     Structured chart / table / strategy_proposal payload.
 *     Arrives after all tokens if the model produced a renderData block.
 *
 *   event: done        data: { cleanText: string }
 *     Stream is finished. Replace the accumulated bubble content with cleanText
 *     (the full response with any embedded JSON block stripped).
 *
 *   event: error       data: { message: string, status?: number }
 *     A fatal error occurred. Display message to the user.
 */
import { NextRequest } from 'next/server';
import {
  streamText,
  stepCountIs,
  type CoreMessage,
  type ImagePart,
  type TextPart,
  type UserContent,
} from 'ai';

import { getSession } from '@/lib/auth';
import { getAIModel, getAIConfig } from '@/lib/chatbot/provider';
import { buildDynamicContext } from '@/lib/chatbot/dynamic';

export const maxDuration = 120; // Allow up to 120 s for multi-tool agentic loops

// ── SSE helpers ───────────────────────────────────────────────────────────────

const enc = new TextEncoder();

const SSE_HEADERS: HeadersInit = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no', // prevent nginx from buffering SSE frames
};

function sseFrame(event: string, data: unknown): Uint8Array {
  return enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Return an immediate single-event SSE stream (used for early error exits). */
function sseErrorResponse(message: string, httpStatus: number): Response {
  const body = new ReadableStream({
    start(c) {
      c.enqueue(sseFrame('error', { message, status: httpStatus }));
      c.close();
    },
  });
  return new Response(body, { status: httpStatus, headers: SSE_HEADERS });
}

// ── renderData extraction ─────────────────────────────────────────────────────

type RenderData = {
  renderAs?: 'table' | 'chart' | 'text' | 'strategy_proposal';
  title?: string;
  data?: unknown;
  chartConfig?: unknown;
};

/**
 * Parse an optional renderData JSON block out of the raw model output.
 * Supports both fenced ```json … ``` blocks and bare embedded JSON objects.
 * Returns cleanText (with the JSON block stripped) + the parsed renderData.
 */
function parseRenderData(rawText: string): {
  cleanText: string;
  renderData: RenderData | null;
} {
  let renderData: RenderData | null = null;
  let cleanText = rawText;

  // Strategy 1: fenced ```json … ``` block (preferred model output format)
  const jsonBlockMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    try {
      renderData = JSON.parse(jsonBlockMatch[1]) as RenderData;
      cleanText = rawText.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
    } catch {
      // Malformed JSON — fall through to Strategy 2
    }
  }

  // Strategy 2: bare JSON object containing "renderAs" anywhere in the response.
  // Walk backwards from the last "renderAs": to find the enclosing { then parse.
  if (!renderData) {
    const renderAsIdx = rawText.lastIndexOf('"renderAs":');
    if (renderAsIdx !== -1) {
      const openBraceIdx = rawText.lastIndexOf('{', renderAsIdx);
      if (openBraceIdx !== -1) {
        try {
          renderData = JSON.parse(rawText.slice(openBraceIdx)) as RenderData;
          cleanText = rawText.slice(0, openBraceIdx).trim();
        } catch {
          // Truncated / malformed — show raw text
        }
      }
    }
  }

  return { cleanText, renderData };
}

// ── Provider error normalisation ──────────────────────────────────────────────

function extractStatus(error: unknown): number {
  if (!error || typeof error !== 'object') return 0;
  const e = error as Record<string, unknown>;
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
          "Today's AI provider quota has been reached. The chatbot will be available again shortly.",
      };
    }
    return {
      status: 429,
      message: 'The AI provider is currently rate-limited. Please try again in a moment.',
    };
  }
  if (status === 413) {
    return {
      status: 429,
      message:
        'Your request is too large for the selected model. Try a shorter message or clear the conversation history.',
    };
  }
  if (status === 503 || status === 529) {
    return {
      status: 503,
      message:
        'The AI provider is temporarily unavailable. Please try again in a moment.',
    };
  }
  return null;
}

function isMissingKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const msg = ((error as Record<string, unknown>).message as string | undefined) ?? '';
  return (
    msg.includes('No AI API key configured') ||
    msg.includes('API key is required') ||
    msg.includes('API key')
  );
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getSession(request);
  if (!session?.user) return sseErrorResponse('Unauthorized', 401);

  // ── Parse body ────────────────────────────────────────────────────────────
  let message: string;
  let history: Array<{ role: 'user' | 'model'; content: string }>;
  let images: string[];
  try {
    const body = (await request.json()) as {
      message: string;
      history?: Array<{ role: 'user' | 'model'; content: string }>;
      images?: string[];
    };
    message = body.message?.trim() ?? '';
    history = body.history ?? [];
    images = (body.images ?? []).slice(0, 5); // cap at 5 images
  } catch {
    return sseErrorResponse('Invalid JSON body', 400);
  }

  if (!message && images.length === 0)
    return sseErrorResponse('Message is required', 400);

  // ── Build tool context (same as original) ─────────────────────────────────
  const baseUrl = `http://localhost:${process.env.PORT ?? 3002}`;
  const cookie = request.headers.get('cookie') ?? '';

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

  // Convert history: 'model' (Gemini legacy) → 'assistant' (AI SDK standard)
  // Build a multimodal user message if images were attached.
  // flatMap drops unmatched data-URLs without a filter type-predicate.
  const imageParts: ImagePart[] = images.flatMap((dataUrl) => {
    const m = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return [];
    return [{ type: 'image' as const, image: m[2], mediaType: m[1] } as ImagePart];
  });

  const userContent: UserContent =
    imageParts.length === 0
      ? message // text-only → plain string
      : [
          ...imageParts,
          ...(message
            ? [{ type: 'text' as const, text: message } satisfies TextPart]
            : []),
        ];

  const messages: CoreMessage[] = [
    // Strip history entries with empty content — Gemini rejects them with a
    // 400 and they can accumulate when a previous turn failed mid-stream.
    ...history
      .filter((m) => m.content.trim() !== '')
      .map(
        (m): CoreMessage => ({
          role: m.role === 'model' ? 'assistant' : (m.role as 'user' | 'assistant'),
          content: m.content,
        }),
      ),
    { role: 'user' as const, content: userContent },
  ];

  // ── SSE stream ────────────────────────────────────────────────────────────
  const responseStream = new ReadableStream({
    async start(controller) {
      let done = false;

      const send = (event: string, data: unknown) => {
        if (done) return;
        try {
          controller.enqueue(sseFrame(event, data));
        } catch {
          // Client disconnected — subsequent sends will silently no-op
        }
      };

      try {
        const [model, aiConfig, ctx] = await Promise.all([
          getAIModel(),
          getAIConfig(),
          // Embed the user's message and retrieve the most relevant tools +
          // prompt sections from the vector KB. Falls back to the full static
          // context when the KB is unavailable or not yet seeded.
          buildDynamicContext(message, baseUrl, cookie, forwardedHeaders),
        ]);

        const streamOptions: Parameters<typeof streamText>[0] = {
          model,
          system: ctx.systemPrompt,
          messages,
          tools: {}, // ctx.tools,
          stopWhen: stepCountIs(5),
          maxOutputTokens: 4000,
        };

        // Gemini thinking models need a capped thinking budget for tool use.
        if (aiConfig.provider === 'google') {
          streamOptions.providerOptions = {
            google: { thinkingConfig: { thinkingBudget: 1024 } },
          };
        }

        const result = streamText(streamOptions);

        // Stream each text delta to the client immediately
        let fullText = '';
        for await (const chunk of result.textStream) {
          fullText += chunk;
          send('token', { text: chunk });
        }

        // After the agentic loop completes, parse out any renderData block
        const { cleanText, renderData } = parseRenderData(fullText);
        if (renderData) send('render_data', renderData);
        send('done', { cleanText });
      } catch (error) {
        console.error('[Chat SSE] Error:', error);

        if (isMissingKeyError(error)) {
          send('error', {
            message:
              'AI provider is not configured. Add an API key via Admin → AI Config or set AI_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY.',
            status: 503,
          });
        } else {
          const providerErr = parseProviderError(error);
          if (providerErr) {
            send('error', { message: providerErr.message, status: providerErr.status });
          } else {
            send('error', { message: 'Failed to process your message', status: 500 });
          }
        }
      } finally {
        done = true;
        controller.close();
      }
    },
  });

  return new Response(responseStream, { headers: SSE_HEADERS });
}
