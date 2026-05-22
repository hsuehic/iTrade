/**
 * Repository for the help-KB articles.
 *
 * Non-embedding operations go through the TypeORM repository.
 * Embedding writes and similarity search use raw SQL via `dataSource.query()`,
 * because TypeORM doesn't natively know the pgvector `vector(768)` type.
 *
 * All writes that touch `content` automatically refresh the embedding.
 */
import { createHash } from 'crypto';
import { HelpArticleEntity } from '@itrade/data-manager';

import { getDataManager } from '@/lib/data-manager';
import { embed, toPgVectorLiteral } from './embeddings';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HelpArticleInput {
  title: string;
  slug: string;
  content: string;
  category?: string;
  locale?: string;
  tags?: string[];
  priority?: number;
  published?: boolean;
}

export interface HelpArticleUpdate {
  title?: string;
  slug?: string;
  content?: string;
  category?: string;
  locale?: string;
  tags?: string[];
  priority?: number;
  published?: boolean;
}

export interface HelpArticleListFilter {
  locale?: string;
  category?: string;
  published?: boolean;
  search?: string;
}

export interface RetrievedHelpArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
  category: string;
  locale: string;
  /** Cosine distance (0 = identical, 2 = opposite). Lower is better. */
  distance: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// ── CRUD via TypeORM ──────────────────────────────────────────────────────────

export async function listArticles(
  filter: HelpArticleListFilter = {},
): Promise<HelpArticleEntity[]> {
  const dm = await getDataManager();
  const repo = dm.dataSource.getRepository(HelpArticleEntity);

  const qb = repo.createQueryBuilder('a');
  if (filter.locale) qb.andWhere('a.locale = :locale', { locale: filter.locale });
  if (filter.category)
    qb.andWhere('a.category = :category', { category: filter.category });
  if (filter.published !== undefined)
    qb.andWhere('a.published = :published', { published: filter.published });
  if (filter.search) {
    qb.andWhere('(a.title ILIKE :q OR a.content ILIKE :q OR a.slug ILIKE :q)', {
      q: `%${filter.search}%`,
    });
  }
  qb.orderBy('a.updatedAt', 'DESC');
  return qb.getMany();
}

export async function getArticleById(id: string): Promise<HelpArticleEntity | null> {
  const dm = await getDataManager();
  const repo = dm.dataSource.getRepository(HelpArticleEntity);
  return repo.findOne({ where: { id } });
}

export async function getArticleBySlug(slug: string): Promise<HelpArticleEntity | null> {
  const dm = await getDataManager();
  const repo = dm.dataSource.getRepository(HelpArticleEntity);
  return repo.findOne({ where: { slug } });
}

/**
 * Create or update (upsert by slug) a help article and refresh its embedding.
 * Returns the persisted entity. Pass `tolerateMissingKey: true` to allow the
 * save to succeed even if the embedding service is unconfigured (the article
 * is stored with a NULL embedding and can be embedded later).
 */
export async function upsertArticle(
  input: HelpArticleInput,
  options: { tolerateMissingKey?: boolean } = {},
): Promise<{ article: HelpArticleEntity; embedded: boolean }> {
  const dm = await getDataManager();
  const repo = dm.dataSource.getRepository(HelpArticleEntity);

  const existing = await repo.findOne({ where: { slug: input.slug } });
  const entity = existing ?? repo.create();

  entity.title = input.title;
  entity.slug = input.slug;
  entity.content = input.content;
  entity.category = input.category ?? 'general';
  entity.locale = input.locale ?? 'en';
  entity.tags = input.tags;
  entity.priority = input.priority ?? 0;
  entity.published = input.published ?? true;

  await repo.save(entity);
  const result = await refreshEmbedding(entity, options);
  return { article: entity, embedded: result.embedded };
}

export async function createArticle(input: HelpArticleInput): Promise<HelpArticleEntity> {
  const dm = await getDataManager();
  const repo = dm.dataSource.getRepository(HelpArticleEntity);

  const entity = repo.create({
    title: input.title,
    slug: input.slug,
    content: input.content,
    category: input.category ?? 'general',
    locale: input.locale ?? 'en',
    tags: input.tags,
    priority: input.priority ?? 0,
    published: input.published ?? true,
  });
  await repo.save(entity);
  await refreshEmbedding(entity);
  return entity;
}

export async function updateArticle(
  id: string,
  patch: HelpArticleUpdate,
): Promise<HelpArticleEntity | null> {
  const dm = await getDataManager();
  const repo = dm.dataSource.getRepository(HelpArticleEntity);

  const entity = await repo.findOne({ where: { id } });
  if (!entity) return null;

  const contentChanged = patch.content !== undefined && patch.content !== entity.content;

  Object.assign(entity, patch);
  await repo.save(entity);

  if (contentChanged || patch.title !== undefined) {
    // Title contributes to the embedded text, so re-embed if it changed too.
    await refreshEmbedding(entity);
  }
  return entity;
}

export async function deleteArticle(id: string): Promise<boolean> {
  const dm = await getDataManager();
  const repo = dm.dataSource.getRepository(HelpArticleEntity);
  const result = await repo.delete({ id });
  return (result.affected ?? 0) > 0;
}

// ── Embedding maintenance ─────────────────────────────────────────────────────

/**
 * Compute the embedding for an article and write it to the pgvector column.
 * Skips the API call if the content hash already matches what was last embedded.
 *
 * When `tolerateMissingKey` is true, an "API key not configured" error is
 * swallowed silently — the article is persisted without an embedding and
 * can be re-embedded later via the admin "Re-embed pending" action. This is
 * used by the seed flow so a fresh deploy can seed default content before
 * the operator has configured the Gemini key.
 */
export async function refreshEmbedding(
  article: HelpArticleEntity,
  options: { tolerateMissingKey?: boolean } = {},
): Promise<{ embedded: boolean; reason?: string }> {
  const dm = await getDataManager();
  const repo = dm.dataSource.getRepository(HelpArticleEntity);

  const embeddingInput = `${article.title}\n\n${article.content}`;
  const hash = hashContent(embeddingInput);

  if (article.embeddingHash === hash) {
    // Already up to date; nothing to do.
    return { embedded: true };
  }

  let vector: number[];
  try {
    vector = await embed(embeddingInput, 'RETRIEVAL_DOCUMENT');
  } catch (err) {
    const msg = (err as Error)?.message ?? '';
    if (options.tolerateMissingKey && msg.includes('Gemini API key not configured')) {
      return { embedded: false, reason: 'no-api-key' };
    }
    throw err;
  }

  const literal = toPgVectorLiteral(vector);

  await dm.dataSource.query(
    `UPDATE help_articles SET embedding = $1::vector WHERE id = $2`,
    [literal, article.id],
  );

  article.embeddingHash = hash;
  await repo.save(article);
  return { embedded: true };
}

/**
 * Force a re-embed regardless of hash. Useful when the embedding model changes
 * or when an article was imported without a stored hash.
 */
export async function forceReembed(id: string): Promise<HelpArticleEntity | null> {
  const article = await getArticleById(id);
  if (!article) return null;
  article.embeddingHash = undefined;
  await refreshEmbedding(article);
  return article;
}

/**
 * List articles whose embedding is missing (e.g. they were seeded before the
 * Gemini API key was configured). Powers the admin "Re-embed pending" action.
 */
export async function listPendingEmbedding(): Promise<HelpArticleEntity[]> {
  const dm = await getDataManager();
  const rows = (await dm.dataSource.query(
    `SELECT id FROM help_articles WHERE embedding IS NULL ORDER BY updated_at DESC`,
  )) as Array<{ id: string }>;

  const repo = dm.dataSource.getRepository(HelpArticleEntity);
  if (rows.length === 0) return [];
  return repo.find({ where: rows.map((r) => ({ id: r.id })) });
}

/**
 * Embed every article that currently has a NULL embedding. Stops on the first
 * hard failure (missing key) so we don't burn the rate-limit quota.
 *
 * Returns counts so the admin UI can surface a toast like
 * "Embedded 9 of 12 (3 still pending)".
 */
export async function embedAllPending(): Promise<{
  total: number;
  embedded: number;
  failed: number;
  errors: Array<{ slug: string; error: string }>;
}> {
  const pending = await listPendingEmbedding();
  const errors: Array<{ slug: string; error: string }> = [];
  let embedded = 0;

  for (const article of pending) {
    try {
      article.embeddingHash = undefined; // force
      await refreshEmbedding(article);
      embedded += 1;
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      errors.push({ slug: article.slug, error: msg });
      // Stop on missing-key — every subsequent call will fail the same way.
      if (msg.includes('Gemini API key not configured')) break;
    }
  }

  return {
    total: pending.length,
    embedded,
    failed: pending.length - embedded,
    errors,
  };
}

// ── Retrieval ─────────────────────────────────────────────────────────────────

/**
 * Top-K cosine-similarity search filtered by a specific category.
 * Used for dynamic chatbot tool selection and prompt-section retrieval.
 * No locale filtering — chatbot KB articles are always locale-neutral.
 *
 * Distances are pgvector's cosine distance: lower = better.
 */
export async function searchSimilarByCategory(
  queryVector: number[],
  category: string,
  options: { topK?: number } = {},
): Promise<RetrievedHelpArticle[]> {
  const dm = await getDataManager();
  const literal = toPgVectorLiteral(queryVector);
  const topK = Math.min(Math.max(options.topK ?? 5, 1), 20);

  // Raise ef_search so HNSW explores a wider beam and returns better results.
  // The default (40) is fine for large tables; bumping to 100 costs ~1 ms on a
  // small KB table and noticeably improves recall.
  await dm.dataSource.query(`SET LOCAL hnsw.ef_search = 100`);

  const rows = (await dm.dataSource.query(
    `
    SELECT id, title, slug, content, category, locale,
           (embedding <=> $1::vector) AS distance
    FROM help_articles
    WHERE published = true
      AND embedding IS NOT NULL
      AND category = $2
    ORDER BY embedding <=> $1::vector ASC
    LIMIT $3
    `,
    [literal, category, topK],
  )) as RetrievedHelpArticle[];

  return rows.map((r) => ({ ...r, distance: Number(r.distance) }));
}

/**
 * Top-K cosine-similarity search over the published articles in `locale`.
 * Falls back to 'en' articles when the requested locale yields fewer hits.
 *
 * Distances are pgvector's cosine distance: lower = better.
 */
export async function searchSimilar(
  queryVector: number[],
  options: { locale?: string; topK?: number } = {},
): Promise<RetrievedHelpArticle[]> {
  const dm = await getDataManager();
  const literal = toPgVectorLiteral(queryVector);
  const locale = options.locale ?? 'en';
  const topK = Math.min(Math.max(options.topK ?? 5, 1), 10);

  await dm.dataSource.query(`SET LOCAL hnsw.ef_search = 100`);

  // Primary search: requested locale only.
  const primary = (await dm.dataSource.query(
    `
    SELECT id, title, slug, content, category, locale,
           (embedding <=> $1::vector) AS distance
    FROM help_articles
    WHERE published = true
      AND embedding IS NOT NULL
      AND locale = $2
    ORDER BY embedding <=> $1::vector ASC
    LIMIT $3
    `,
    [literal, locale, topK],
  )) as RetrievedHelpArticle[];

  // If we got fewer than half the requested results, supplement with English
  // fallbacks so freshly-deployed instances with sparse zh content still answer.
  if (primary.length < Math.ceil(topK / 2) && locale !== 'en') {
    const seenIds = new Set(primary.map((p) => p.id));
    const fallback = (await dm.dataSource.query(
      `
      SELECT id, title, slug, content, category, locale,
             (embedding <=> $1::vector) AS distance
      FROM help_articles
      WHERE published = true
        AND embedding IS NOT NULL
        AND locale = 'en'
      ORDER BY embedding <=> $1::vector ASC
      LIMIT $2
      `,
      [literal, topK],
    )) as RetrievedHelpArticle[];

    for (const row of fallback) {
      if (primary.length >= topK) break;
      if (!seenIds.has(row.id)) primary.push(row);
    }
  }

  // Coerce distance from string (pg numeric) to number.
  return primary.map((p) => ({ ...p, distance: Number(p.distance) }));
}
