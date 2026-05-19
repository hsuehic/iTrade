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
 *   5. Generate with Gemini (model configured via Admin → AI Config).
 *   6. Return { message, citations: [{ slug, title }] }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateText, type CoreMessage } from 'ai';

import { getAIModel } from '@/lib/chatbot/provider';
import { embed } from '@/lib/help-kb/embeddings';
import { searchSimilar } from '@/lib/help-kb/repository';
import { buildHelpSystemPrompt } from '@/lib/help-kb/prompt';
import { checkRateLimit, getClientIp } from '@/lib/help-kb/rate-limit';

export const maxDuration = 60;

// ── Validation ────────────────────────────────────────────────────────────────

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
    return NextResponse.json(
      {
        error: 'Too many questions. Please wait a moment and try again.',
        retryAfterMs: rl.resetMs,
      },
      {
        status: 429,
        headers: { 'Retry-After': Math.ceil(rl.resetMs / 1000).toString() },
      },
    );
  }

  // 2. Parse + validate
  let body: HelpChatRequest;
  try {
    body = (await request.json()) as HelpChatRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json(
      { error: `Message too long (max ${MAX_MESSAGE_LEN} characters)` },
      { status: 400 },
    );
  }

  const locale = body.locale && /^[a-z]{2}$/i.test(body.locale) ? body.locale : 'en';
  const history = Array.isArray(body.history)
    ? body.history.slice(-MAX_HISTORY_ENTRIES)
    : [];

  try {
    // 3. Embed the question
    const queryVector = await embed(message, 'RETRIEVAL_QUERY');

    // 4. Retrieve top-5
    const passages = await searchSimilar(queryVector, { locale, topK: 5 });

    // 5. Build prompt + call Gemini
    const system = buildHelpSystemPrompt(passages);
    const messages: CoreMessage[] = [
      ...history.map(
        (m): CoreMessage => ({
          role: m.role === 'model' ? 'assistant' : (m.role as 'user' | 'assistant'),
          content: m.content,
        }),
      ),
      { role: 'user', content: message },
    ];

    const model = await getAIModel();
    const { text } = await generateText({
      model,
      system,
      messages,
      maxOutputTokens: 4000,
    } as Parameters<typeof generateText>[0]);

    // 6. Extract citation slugs and return alongside the message
    const citationSlugs = Array.from(new Set(text.match(/\[([a-z0-9-]+)\]/g) ?? []))
      .map((s) => s.slice(1, -1))
      .filter((slug) => passages.some((p) => p.slug === slug));

    const citations = citationSlugs.map((slug) => {
      const p = passages.find((x) => x.slug === slug)!;
      return { slug: p.slug, title: p.title };
    });

    return NextResponse.json({ message: text, citations });
  } catch (error) {
    console.error('[Help Chat] Error:', error);

    const errMsg = (error as Error)?.message ?? '';
    if (
      errMsg.includes('Gemini API key not configured') ||
      errMsg.includes('No Gemini API key configured')
    ) {
      return NextResponse.json(
        {
          error:
            'The help bot is temporarily unavailable. An administrator needs to configure the Gemini API key.',
        },
        { status: 503 },
      );
    }

    const status = extractStatus(error);
    if (status === 429 || status === 413) {
      return NextResponse.json(
        {
          error: 'The help bot is busy right now. Please try again in a few seconds.',
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: 'Something went wrong while answering your question. Please try again.' },
      { status: 500 },
    );
  }
}
