/**
 * Standalone help-KB seeder.
 *
 * Lives inside packages/data-manager (next to sync-schema-to-db.ts) because
 * the entity decorators in this package require legacy TypeORM decorator
 * semantics — running tsx from apps/web triggers stage-3 decorators and
 * crashes inside @itrade/data-manager imports. To stay decorator-free this
 * file talks to Postgres directly via `pg` and to Gemini directly via
 * `fetch`. No TypeORM, no imports from apps/web.
 *
 * Usage:
 *   pnpm --filter @itrade/data-manager exec tsx seed-help-kb.ts
 *
 *   # Seed without embedding (faster, no Gemini key needed):
 *   pnpm --filter @itrade/data-manager exec tsx seed-help-kb.ts --no-embed
 *
 *   # Skip the upsert, only embed articles whose vector is NULL:
 *   pnpm --filter @itrade/data-manager exec tsx seed-help-kb.ts --embed-only
 *
 * Requires:
 *   - help_articles table exists (run `pnpm sync-schema` first)
 *   - GEMINI_API_KEY env var OR a `gemini_api_key` row in `app_settings`
 *     (only needed for the embedding step)
 */
import 'dotenv/config';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import { Client } from 'pg';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SeedArticle {
  slug: string;
  title: string;
  category: string;
  locale: 'en' | 'zh';
  content: string;
  tags?: string[];
}

// ── Gemini embedding helper ──────────────────────────────────────────────────

// `text-embedding-004` was retired from the Gemini public API; the current
// stable family is `gemini-embedding-001` (default 3072 dims, but supports
// outputDimensionality to truncate). We ask for 768 to match the existing
// pgvector column on help_articles.
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

async function getGeminiKey(client: Client): Promise<string | null> {
  try {
    const r = await client.query<{ value: string }>(
      `SELECT value FROM app_settings WHERE key='gemini_api_key' LIMIT 1`,
    );
    if (r.rows[0]?.value) return r.rows[0].value;
  } catch {
    // table may not exist on a brand-new install — fall through to env
  }
  return process.env.GEMINI_API_KEY ?? null;
}

async function embed(text: string, apiKey: string): Promise<number[]> {
  const url = `${GEMINI_API_BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: EMBEDDING_DIMENSIONS,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini embedding API returned ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { embedding?: { values?: number[] } };
  const values = json.embedding?.values;
  if (!values || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Unexpected embedding response (expected ${EMBEDDING_DIMENSIONS} dims, got ${values?.length ?? 0})`,
    );
  }
  return values;
}

const toPgVector = (v: number[]) => `[${v.join(',')}]`;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

// ── DB helpers ────────────────────────────────────────────────────────────────

async function upsertArticle(
  client: Client,
  a: SeedArticle,
  apiKey: string | null,
): Promise<{ upserted: true; embedded: boolean; embedError?: string }> {
  // Upsert by slug. Mirrors the columns defined on HelpArticleEntity in
  // packages/data-manager/src/entities/HelpArticle.ts.
  const insertSql = `
    INSERT INTO help_articles
      (title, slug, content, category, locale, tags, priority, published, "embeddingHash", created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, true, NULL, now(), now())
    ON CONFLICT (slug) DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      category = EXCLUDED.category,
      locale = EXCLUDED.locale,
      tags = EXCLUDED.tags,
      priority = EXCLUDED.priority,
      published = EXCLUDED.published,
      updated_at = now()
    RETURNING id, "embeddingHash"
  `;
  // tags is mapped by TypeORM as "simple-array" → comma-joined text column.
  // We pass the same string representation here so the columnshape matches.
  const tagsValue = a.tags && a.tags.length > 0 ? a.tags.join(',') : null;
  const r = await client.query<{ id: string; embeddingHash: string | null }>(insertSql, [
    a.title,
    a.slug,
    a.content,
    a.category,
    a.locale,
    tagsValue,
    0,
  ]);
  const row = r.rows[0];

  // The article is now upserted. From here on, an embedding failure must NOT
  // mask the fact that the row exists — callers should know the data is
  // safely written and only the embedding is missing.
  if (!apiKey) return { upserted: true, embedded: false };

  const embedInput = `${a.title}\n\n${a.content}`;
  const newHash = hash(embedInput);
  if (row.embeddingHash === newHash) return { upserted: true, embedded: true };

  try {
    const vec = await embed(embedInput, apiKey);
    await client.query(
      `UPDATE help_articles SET embedding = $1::vector, "embeddingHash" = $2 WHERE id = $3`,
      [toPgVector(vec), newHash, row.id],
    );
    return { upserted: true, embedded: true };
  } catch (err) {
    return {
      upserted: true,
      embedded: false,
      embedError: (err as Error)?.message ?? String(err),
    };
  }
}

async function embedPending(
  client: Client,
  apiKey: string,
): Promise<{
  total: number;
  embedded: number;
  failed: number;
}> {
  const rows = (
    await client.query<{ id: string; title: string; content: string }>(
      `SELECT id, title, content FROM help_articles WHERE embedding IS NULL`,
    )
  ).rows;

  let ok = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      const text = `${r.title}\n\n${r.content}`;
      const vec = await embed(text, apiKey);
      await client.query(
        `UPDATE help_articles SET embedding = $1::vector, "embeddingHash" = $2 WHERE id = $3`,
        [toPgVector(vec), hash(text), r.id],
      );
      ok += 1;
    } catch (err) {
      failed += 1;
      console.error(`  ✗ embed ${r.id}: ${(err as Error).message}`);
    }
  }
  return { total: rows.length, embedded: ok, failed };
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const flagEmbedOnly = argv.includes('--embed-only');
  const flagNoEmbed = argv.includes('--no-embed');

  const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_DB'];
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error('❌ Missing env vars:', missing);
    process.exit(1);
  }

  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT!, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DB,
  });

  await client.connect();

  try {
    const apiKey = await getGeminiKey(client);
    const wantEmbed = !flagNoEmbed && apiKey !== null;
    if (!flagNoEmbed && apiKey === null) {
      console.warn(
        '⚠️  No Gemini API key found (DB app_settings.gemini_api_key or env GEMINI_API_KEY).',
      );
      console.warn('    Articles will be stored without embeddings.');
      console.warn(
        '    After configuring the key, re-run: pnpm --filter @itrade/data-manager exec tsx seed-help-kb.ts --embed-only',
      );
    }

    if (!flagEmbedOnly) {
      const seedPath = join(__dirname, 'help-kb-seed-data.json');
      const articles = JSON.parse(readFileSync(seedPath, 'utf-8')) as SeedArticle[];

      console.log(`🌱 Seeding ${articles.length} help articles…`);
      let upserted = 0;
      let embedded = 0;
      let upsertFailed = 0;
      let firstEmbedError: string | undefined;

      for (const a of articles) {
        try {
          const result = await upsertArticle(client, a, wantEmbed ? apiKey : null);
          upserted += 1;
          if (result.embedded) {
            embedded += 1;
            console.log(`  ✓ ${a.slug}`);
          } else {
            console.log(`  ○ ${a.slug}${result.embedError ? '  (no embedding)' : ''}`);
            if (result.embedError && !firstEmbedError)
              firstEmbedError = result.embedError;
          }
        } catch (err) {
          upsertFailed += 1;
          console.error(`  ✗ ${a.slug}: ${(err as Error).message}`);
        }
      }
      console.log(
        `\nSeed: ${upserted}/${articles.length} upserted · ${embedded} embedded · ${upsertFailed} upsert-failed`,
      );
      if (firstEmbedError) {
        console.warn(
          `\n⚠️  First embedding error encountered:\n   ${firstEmbedError.split('\n')[0]}`,
        );
        console.warn(
          '   Articles are saved without vectors; fix the issue and run with --embed-only.',
        );
      }
    }

    if (flagEmbedOnly || (wantEmbed && !flagNoEmbed)) {
      if (!apiKey) {
        console.error(
          'Cannot embed without GEMINI_API_KEY / app_settings.gemini_api_key.',
        );
        process.exit(2);
      }
      console.log('\n🔁 Embedding any articles whose vector is still NULL…');
      const r = await embedPending(client, apiKey);
      console.log(
        `Embed-pending: ${r.embedded}/${r.total} succeeded · ${r.failed} failed`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Seeder crashed:', err);
  process.exit(1);
});
