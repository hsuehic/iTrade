#!/usr/bin/env node
/**
 * Standalone chatbot KB seeder.
 *
 * Seeds (or re-seeds) all chatbot tool descriptions and prompt sections into
 * the help_articles table with Gemini embeddings.
 *
 * Usage:
 *   DB_HOST=localhost DB_PORT=5432 tsx scripts/seed-chatbot-kb.ts
 *
 * Override defaults with env vars:
 *   DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME, GEMINI_API_KEY
 */
import pg from 'pg';
import crypto from 'crypto';
import {
  CHATBOT_TOOL_SEEDS,
  CHATBOT_PROMPT_SECTION_SEEDS,
} from '../apps/web/lib/chatbot/seed-data';

const DB_HOST = process.env.DB_HOST ?? 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT ?? '5432', 10);
const DB_USER = process.env.DB_USER ?? 'postgres';
const DB_PASS = process.env.DB_PASS ?? 'postgres';
const DB_NAME = process.env.DB_NAME ?? 'itrade';
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_KEY) {
  console.error('Error: GEMINI_API_KEY env var is required');
  process.exit(1);
}

const pool = new pg.Pool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
});

async function embedText(text: string): Promise<number[]> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_DOCUMENT',
      }),
    },
  );
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Gemini embed failed ${resp.status}: ${body}`);
  }
  const json = (await resp.json()) as { embedding: { values: number[] } };
  return json.embedding.values;
}

function toPgVector(v: number[]): string {
  return `[${v.join(',')}]`;
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

interface ArticleInput {
  slug: string;
  title: string;
  content: string;
  category?: string;
  locale?: string;
  priority?: number;
  published?: boolean;
}

async function upsertArticle(article: ArticleInput): Promise<void> {
  const embeddingInput = `${article.title}\n\n${article.content}`;
  const hash = hashContent(embeddingInput);

  // Check if already embedded with same hash
  const existing = await pool.query(
    `SELECT id, "embeddingHash" FROM help_articles WHERE slug = $1`,
    [article.slug],
  );

  if (existing.rows.length > 0 && existing.rows[0].embeddingHash === hash) {
    console.log(`  ⏭  ${article.slug} (up to date)`);
    return;
  }

  const vector = await embedText(embeddingInput);
  const literal = toPgVector(vector);

  if (existing.rows.length > 0) {
    // Update
    await pool.query(
      `UPDATE help_articles
       SET title = $1, content = $2, category = $3, locale = $4,
           priority = $5, published = $6, embedding = $7::vector,
           "embeddingHash" = $8, updated_at = NOW()
       WHERE slug = $9`,
      [
        article.title,
        article.content,
        article.category ?? 'general',
        article.locale ?? 'en',
        article.priority ?? 0,
        article.published ?? true,
        literal,
        hash,
        article.slug,
      ],
    );
    console.log(`  ✏️  ${article.slug} (updated)`);
  } else {
    // Insert
    await pool.query(
      `INSERT INTO help_articles
         (id, title, slug, content, category, locale, priority, published,
          embedding, "embeddingHash", created_at, updated_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::vector, $9, NOW(), NOW())`,
      [
        article.title,
        article.slug,
        article.content,
        article.category ?? 'general',
        article.locale ?? 'en',
        article.priority ?? 0,
        article.published ?? true,
        literal,
        hash,
      ],
    );
    console.log(`  ✅  ${article.slug} (inserted)`);
  }
}

async function main() {
  console.log(`Seeding chatbot KB → ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
  console.log('');

  let toolsOk = 0,
    toolsFail = 0;
  let sectionsOk = 0,
    sectionsFail = 0;

  console.log(`Tools (${CHATBOT_TOOL_SEEDS.length}):`);
  for (const article of CHATBOT_TOOL_SEEDS) {
    try {
      await upsertArticle(article);
      toolsOk++;
    } catch (err) {
      console.error(`  ❌  ${article.slug}: ${(err as Error).message}`);
      toolsFail++;
    }
  }

  console.log('');
  console.log(`Prompt sections (${CHATBOT_PROMPT_SECTION_SEEDS.length}):`);
  for (const article of CHATBOT_PROMPT_SECTION_SEEDS) {
    try {
      await upsertArticle(article);
      sectionsOk++;
    } catch (err) {
      console.error(`  ❌  ${article.slug}: ${(err as Error).message}`);
      sectionsFail++;
    }
  }

  console.log('');
  console.log(
    `Done. Tools: ${toolsOk} seeded, ${toolsFail} failed. ` +
      `Sections: ${sectionsOk} seeded, ${sectionsFail} failed.`,
  );

  await pool.end();
  if (toolsFail + sectionsFail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
