import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Knowledge-base article powering the public help chatbot on the landing page.
 *
 * Articles are authored via the admin UI at /admin/help-kb. The widget
 * embeds the user's question, performs a pgvector cosine-similarity search,
 * and stuffs the top-K matched articles into the LLM system prompt.
 *
 * The pgvector `embedding vector(768)` column lives on the same table but is
 * NOT defined here — TypeORM does not natively know the `vector` type. It is
 * added (and indexed) by the idempotent SQL bootstrap script:
 *
 *   apps/web/scripts/bootstrap-help-kb.sql
 *
 * The script runs after `pnpm sync-schema` so the rest of the table exists.
 * Embedding reads/writes go through raw `pg.Pool` queries in
 * apps/web/lib/help-kb/repository.ts.
 */
@Entity('help_articles')
@Index(['locale', 'published'])
@Index(['category'])
@Index(['slug'], { unique: true })
export class HelpArticleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Short human-readable title shown to admins and in citations. */
  @Column({ type: 'text' })
  title!: string;

  /**
   * URL-safe identifier used in citation links (and as a stable handle when
   * re-importing seed data). Must be unique across all locales.
   *
   * Example: `mobile-install-android`.
   */
  @Column({ type: 'text', unique: true })
  slug!: string;

  /** Markdown body. This is the text that gets embedded and retrieved. */
  @Column({ type: 'text' })
  content!: string;

  /**
   * High-level grouping for filtering in the admin UI and for surfacing
   * topic-aware suggested questions in the widget.
   *
   * Conventional values:
   *   general | getting_started | mobile | account | trading |
   *   strategies | troubleshooting | faq
   */
  @Column({ type: 'text', default: 'general' })
  category!: string;

  /** BCP-47 locale code, currently 'en' or 'zh'. */
  @Column({ type: 'text', default: 'en' })
  locale!: string;

  /** Free-form tags for fine-grained filtering ("ios", "binance", "kyc"). */
  @Column('simple-array', { nullable: true })
  tags?: string[];

  /**
   * Higher = surfaced first when multiple articles tie on similarity.
   * Use sparingly; the embedding score normally drives ordering.
   */
  @Column({ type: 'int', default: 0 })
  priority!: number;

  /** Unpublished articles are excluded from retrieval but still editable. */
  @Column({ type: 'boolean', default: true })
  published!: boolean;

  /**
   * Hash of the content that was last embedded. Used by the repository to
   * skip the embedding round-trip when the body has not changed.
   */
  @Column({ type: 'text', nullable: true })
  embeddingHash?: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
