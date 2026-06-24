import { Column, Entity, UpdateDateColumn } from 'typeorm';

/**
 * Runtime-configurable key-value settings managed via the admin UI.
 *
 * Known keys:
 *  - ai_provider     — Chat provider: `google` or `openai`
 *  - ai_api_key      — Provider API key (overrides env vars)
 *  - ai_base_url     — Provider base URL (OpenAI-compatible endpoints)
 *  - ai_model        — Chat model ID
 *  - gemini_api_key  — Legacy Gemini key fallback
 *  - gemini_model    — Legacy Gemini model fallback
 *  - chat_title      — Chat widget subtitle shown in the header
 */
@Entity('app_settings')
export class AppSettingEntity {
  @Column('text', { primary: true, name: 'key' })
  key!: string;

  @Column('text', { name: 'value' })
  value!: string;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
