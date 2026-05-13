import { Column, Entity, UpdateDateColumn } from 'typeorm';

/**
 * Runtime-configurable key-value settings managed via the admin UI.
 *
 * Known keys:
 *  - gemini_api_key  — Google Gemini API key (overrides GEMINI_API_KEY env var)
 *  - gemini_model    — Gemini model name (overrides GEMINI_MODEL env var)
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
