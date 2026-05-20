/**
 * Dynamic chatbot context builder.
 *
 * Architecture:
 *
 *   Tools         — ALL tools are always included. No dynamic tool selection.
 *                   Tool articles in the KB exist for documentation only.
 *
 *   System prompt — assembled from three layers:
 *     1. prompt-base            (always) — loaded from DB, cached in memory
 *     2. prompt-rendering-rules (always) — loaded from DB, cached in memory
 *     3. other prompt-section slugs      — retrieved by cosine similarity per query
 *
 * The in-memory prompt cache is populated on first request and invalidated
 * whenever seedChatbotKB() is called (i.e. after an admin re-seeds the KB).
 *
 * Fallback: if the KB is unavailable or un-seeded, EMERGENCY_FALLBACK_PROMPT +
 * all tools are returned so the chatbot keeps working at all times.
 *
 * Seeding: POST /api/admin/chatbot-kb — upserts all articles and clears the cache.
 */
import { embed } from '@/lib/help-kb/embeddings';
import {
  searchSimilarByCategory,
  getArticleBySlug,
  upsertArticle,
} from '@/lib/help-kb/repository';
import { createAllTools } from '@/lib/chatbot/tools';
import { EMERGENCY_FALLBACK_PROMPT } from '@/lib/chatbot/provider';
import {
  CHATBOT_TOOL_SEEDS,
  CHATBOT_PROMPT_SECTION_SEEDS,
} from '@/lib/chatbot/seed-data';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Prompt section slugs that are always appended, regardless of query content.
 * These are loaded from the DB and cached in memory — no per-request DB hit.
 */
const ALWAYS_INCLUDED_SECTION_SLUGS: readonly string[] = ['prompt-rendering-rules'];

/** How many prompt section articles to retrieve per query via similarity. */
const SECTION_TOP_K = 3;

// ── In-memory prompt cache ────────────────────────────────────────────────────

interface PromptCache {
  /** Content of the prompt-base article. */
  base: string;
  /** Always-included section content, keyed by slug. */
  sections: Map<string, string>;
}

let _cache: PromptCache | null = null;

/**
 * Invalidate the in-memory prompt cache.
 * Called automatically after re-seeding so the next request picks up fresh content.
 */
export function invalidatePromptCache(): void {
  _cache = null;
}

/**
 * Load (and memoize) the always-included prompt content from the DB.
 * Returns null if the KB has not been seeded yet.
 */
async function loadPromptCache(): Promise<PromptCache | null> {
  if (_cache) return _cache;

  try {
    const slugsToLoad = ['prompt-base', ...ALWAYS_INCLUDED_SECTION_SLUGS];
    const articles = await Promise.all(slugsToLoad.map((s) => getArticleBySlug(s)));

    const baseArticle = articles[0];
    if (!baseArticle) return null; // KB not seeded yet

    const sections = new Map<string, string>();
    ALWAYS_INCLUDED_SECTION_SLUGS.forEach((slug, i) => {
      const article = articles[i + 1];
      if (article) sections.set(slug, article.content);
    });

    _cache = { base: baseArticle.content, sections };
    return _cache;
  } catch {
    return null; // DB unavailable — caller falls back to emergency prompt
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DynamicContext {
  systemPrompt: string;
  tools: ReturnType<typeof createAllTools>;
  /** "dynamic" when prompt loaded from KB, "static-fallback" when KB unavailable. */
  source: 'dynamic' | 'static-fallback';
}

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build the system prompt from the vector KB and return all tools.
 *
 * ALL tools are always included — no dynamic selection.
 *
 * The system prompt is:
 *   prompt-base (cached)
 *   + always-included sections (cached)
 *   + sections retrieved by cosine similarity to the user's query
 *
 * @param userQuery   The user's latest message — embedded for section retrieval.
 * @param baseUrl     Internal base URL for API calls within tool execute functions.
 * @param cookie      Forwarded session cookie for authenticated tool calls.
 * @param extraHeaders Optional forwarded headers (x-forwarded-host etc.).
 */
export async function buildDynamicContext(
  userQuery: string,
  baseUrl: string,
  cookie: string,
  extraHeaders?: Record<string, string>,
): Promise<DynamicContext> {
  // All tools are always included
  const tools = createAllTools(baseUrl, cookie, extraHeaders);

  try {
    // Load cached prompt base + embed query in parallel
    const [cache, queryVector] = await Promise.all([
      loadPromptCache(),
      embed(userQuery, 'RETRIEVAL_QUERY'),
    ]);

    if (!cache) {
      // KB not seeded — use emergency prompt but still provide all tools
      return {
        systemPrompt: EMERGENCY_FALLBACK_PROMPT,
        tools,
        source: 'static-fallback',
      };
    }

    // Retrieve dynamically relevant prompt sections (excludes always-included and base)
    const alwaysSlugs = new Set(['prompt-base', ...ALWAYS_INCLUDED_SECTION_SLUGS]);
    const sectionHits = await searchSimilarByCategory(queryVector, 'prompt_section', {
      topK: SECTION_TOP_K,
    });

    const dynamicSectionTexts = sectionHits
      .filter((hit) => !alwaysSlugs.has(hit.slug))
      .map((hit) => hit.content);

    // Assemble: base + always-included + dynamic
    const alwaysSectionTexts = Array.from(cache.sections.values());
    const allSections = [...alwaysSectionTexts, ...dynamicSectionTexts].filter(Boolean);

    const systemPrompt =
      allSections.length > 0
        ? `${cache.base}\n\n${allSections.join('\n\n')}`
        : cache.base;

    return { systemPrompt, tools, source: 'dynamic' };
  } catch (err) {
    console.warn('[ChatbotKB] Dynamic context build failed, using static fallback:', err);
    return { systemPrompt: EMERGENCY_FALLBACK_PROMPT, tools, source: 'static-fallback' };
  }
}

// ── KB seeding ────────────────────────────────────────────────────────────────

export interface SeedResult {
  tools: { seeded: number; failed: number; errors: string[] };
  sections: { seeded: number; failed: number; errors: string[] };
}

/**
 * Seed (or re-seed) all chatbot tool descriptions and prompt sections into the
 * vector KB. Idempotent — safe to call multiple times (upserts by slug).
 *
 * Clears the in-memory prompt cache so the next request picks up fresh content.
 */
export async function seedChatbotKB(): Promise<SeedResult> {
  const result: SeedResult = {
    tools: { seeded: 0, failed: 0, errors: [] },
    sections: { seeded: 0, failed: 0, errors: [] },
  };

  for (const article of CHATBOT_TOOL_SEEDS) {
    try {
      await upsertArticle(article);
      result.tools.seeded++;
    } catch (err) {
      result.tools.failed++;
      result.tools.errors.push(
        `${article.slug}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }

  for (const article of CHATBOT_PROMPT_SECTION_SEEDS) {
    try {
      await upsertArticle(article);
      result.sections.seeded++;
    } catch (err) {
      result.sections.failed++;
      result.sections.errors.push(
        `${article.slug}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }

  // Invalidate cache so next request loads fresh prompt content from DB
  invalidatePromptCache();

  return result;
}

/**
 * Count how many chatbot KB articles are currently embedded (non-NULL embedding)
 * per category. Used by the admin status endpoint.
 */
export async function getChatbotKBStatus(): Promise<{
  tools: { total: number; embedded: number };
  sections: { total: number; embedded: number };
}> {
  const { getDataManager } = await import('@/lib/data-manager');
  const dm = await getDataManager();

  const rows = (await dm.dataSource.query(
    `SELECT category,
            COUNT(*)                                         AS total,
            COUNT(*) FILTER (WHERE embedding IS NOT NULL)    AS embedded
     FROM help_articles
     WHERE category IN ('chatbot_tool', 'prompt_section')
     GROUP BY category`,
  )) as Array<{ category: string; total: string; embedded: string }>;

  const byCategory = Object.fromEntries(
    rows.map((r) => [
      r.category,
      { total: Number(r.total), embedded: Number(r.embedded) },
    ]),
  );

  return {
    tools: byCategory['chatbot_tool'] ?? { total: 0, embedded: 0 },
    sections: byCategory['prompt_section'] ?? { total: 0, embedded: 0 },
  };
}
