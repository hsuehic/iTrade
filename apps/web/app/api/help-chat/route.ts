/**
 * POST /api/help-chat
 *
 * PUBLIC endpoint — no auth required. Answers questions about the iTrade
 * product itself (features, mobile app, install, account, troubleshooting)
 * using retrieval-augmented generation over the help_articles knowledge base.
 *
 * Pipeline:
 *   1. Per-IP rate limit (10 req / minute) — this endpoint is anonymous.
 *   2. Embed the user's question with Gemini text-embedding-004.
 *   3. Cosine-similarity search the top-5 published KB articles.
 *   4. Build a strict on-topic system prompt with the retrieved passages.
 *   5. Stream response tokens to client via Server-Sent Events.
 *   6. After stream completes, send citations event then done event.
 *
 * SSE event protocol
 * ──────────────────
 *   event: token      data: { text: string }
 *     Incremental text delta (may include [slug] citation markers).
 *
 *   event: citations  data: Array<{ slug: string, title: string }>
 *     Citation list resolved from [slug] markers in the full response.
 *     Arrives immediately after all tokens have been sent.
 *
 *   event: done       data: { cleanText: string }
 *     Stream finished. cleanText equals the full response text (citation
 *     markers are rendered inline by the UI, not stripped server-side).
 *
 *   event: error      data: { message: string, status?: number }
 */
import { NextRequest } from 'next/server';
import {
  streamText,
  type CoreMessage,
  type ImagePart,
  type TextPart,
  type UserContent,
} from 'ai';

import { getAIModel } from '@/lib/chatbot/provider';
import { embed } from '@/lib/help-kb/embeddings';
import { searchSimilar } from '@/lib/help-kb/repository';
import { buildHelpSystemPrompt } from '@/lib/help-kb/prompt';
import { checkRateLimit, getClientIp } from '@/lib/help-kb/rate-limit';

export const maxDuration = 60;

// ── SSE helpers ───────────────────────────────────────────────────────────────

const enc = new TextEncoder();

const SSE_HEADERS: HeadersInit = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

function sseFrame(event: string, data: unknown): Uint8Array {
  return enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sseErrorResponse(
  message: string,
  httpStatus: number,
  extra?: Record<string, unknown>,
): Response {
  const body = new ReadableStream({
    start(c) {
      c.enqueue(sseFrame('error', { message, status: httpStatus, ...extra }));
      c.close();
    },
  });
  return new Response(body, { status: httpStatus, headers: SSE_HEADERS });
}

// ── Validation constants ──────────────────────────────────────────────────────

const MAX_MESSAGE_LEN = 1000;
const MAX_HISTORY_ENTRIES = 10;

interface HistoryEntry {
  role: 'user' | 'assistant' | 'model';
  content: string;
}

interface HelpChatRequest {
  message: string;
  history?: HistoryEntry[];
  locale?: string;
  images?: string[];
}

// ── Error helpers ─────────────────────────────────────────────────────────────

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

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Rate limit
  const ip = getClientIp(request);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return sseErrorResponse(
      'Too many questions. Please wait a moment and try again.',
      429,
      { retryAfterMs: rl.resetMs },
    );
  }

  // 2. Parse + validate
  let body: HelpChatRequest;
  try {
    body = (await request.json()) as HelpChatRequest;
  } catch {
    return sseErrorResponse('Invalid JSON body', 400);
  }

  const message = body.message?.trim() ?? '';
  const images = (body.images ?? []).slice(0, 3); // cap at 3 for the help bot
  if (!message && images.length === 0)
    return sseErrorResponse('Message is required', 400);
  if (message.length > MAX_MESSAGE_LEN) {
    return sseErrorResponse(`Message too long (max ${MAX_MESSAGE_LEN} characters)`, 400);
  }

  const locale = body.locale && /^[a-z]{2}$/i.test(body.locale) ? body.locale : 'en';
  const history = Array.isArray(body.history)
    ? body.history.slice(-MAX_HISTORY_ENTRIES)
    : [];

  // ── SSE stream ──────────────────────────────────────────────────────────────
  const responseStream = new ReadableStream({
    async start(controller) {
      let done = false;

      const send = (event: string, data: unknown) => {
        if (done) return;
        try {
          controller.enqueue(sseFrame(event, data));
        } catch {
          // Client disconnected
        }
      };

      try {
        // 3. Embed the question
        const queryVector = await embed(message, 'RETRIEVAL_QUERY');

        // 4. Retrieve top-5
        const passages = await searchSimilar(queryVector, { locale, topK: 5 });

        // 5. Build prompt + stream Gemini response
        const system = buildHelpSystemPrompt(passages);
        const imageParts: ImagePart[] = images.flatMap((dataUrl) => {
          const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
          if (!match) return [];
          return [
            { type: 'image' as const, image: match[2], mediaType: match[1] } as ImagePart,
          ];
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
          ...history.map(
            (m): CoreMessage => ({
              role: m.role === 'model' ? 'assistant' : (m.role as 'user' | 'assistant'),
              content: m.content,
            }),
          ),
          { role: 'user' as const, content: userContent },
        ];

        const model = await getAIModel();
        const result = streamText({
          model,
          system,
          messages,
          maxOutputTokens: 4000,
        } as Parameters<typeof streamText>[0]);

        // Stream text tokens
        let fullText = '';
        for await (const chunk of result.textStream) {
          fullText += chunk;
          send('token', { text: chunk });
        }

        // 6. Extract citation slugs from the completed response
        const citationSlugs = Array.from(
          new Set(fullText.match(/\[([a-z0-9-]+)\]/g) ?? []),
        )
          .map((s) => s.slice(1, -1))
          .filter((slug) => passages.some((p) => p.slug === slug));

        const citations = citationSlugs.map((slug) => {
          const p = passages.find((x) => x.slug === slug)!;
          return { slug: p.slug, title: p.title };
        });

        // Send citations before done so the client can attach them to the message
        if (citations.length > 0) send('citations', citations);
        send('done', { cleanText: fullText });
      } catch (error) {
        console.error('[Help Chat SSE] Error:', error);

        const errMsg = (error as Error)?.message ?? '';
        if (
          errMsg.includes('Gemini API key not configured') ||
          errMsg.includes('No Gemini API key configured')
        ) {
          send('error', {
            message:
              'The help bot is temporarily unavailable. An administrator needs to configure the Gemini API key.',
            status: 503,
          });
        } else {
          const status = extractStatus(error);
          if (status === 429 || status === 413) {
            send('error', {
              message:
                'The help bot is busy right now. Please try again in a few seconds.',
              status: 429,
            });
          } else {
            send('error', {
              message:
                'Something went wrong while answering your question. Please try again.',
              status: 500,
            });
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
