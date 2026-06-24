/**
 * DB-backed key-value settings store for runtime-configurable values.
 *
 * Settings are persisted in the `app_settings` table, managed as a proper
 * TypeORM entity (AppSettingEntity). The table is created automatically by
 * the CI/CD sync-schema step on deploy — no manual migration needed.
 *
 * An in-process cache with a 30-second TTL avoids a DB round-trip on every
 * request while still picking up changes within half a minute of saving —
 * no server restart required.
 */
import { AppSettingEntity } from '@itrade/data-manager';
import { getDataManager } from './data-manager';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SettingKey =
  | 'ai_provider'
  | 'ai_api_key'
  | 'ai_base_url'
  | 'ai_model'
  | 'gemini_api_key'
  | 'gemini_model'
  | 'chat_title';

interface SettingsCache {
  values: Partial<Record<SettingKey, string>>;
  lastFetched: number;
}

// ── Global cache (survives Next.js HMR reloads) ───────────────────────────────

declare global {
  var __settingsCache: SettingsCache | undefined;
}

const CACHE_TTL_MS = 30_000; // 30 seconds

// ── Cache helpers ─────────────────────────────────────────────────────────────

function isCacheValid(): boolean {
  const cache = globalThis.__settingsCache;
  return !!cache && Date.now() - cache.lastFetched < CACHE_TTL_MS;
}

async function refreshCache(): Promise<Partial<Record<SettingKey, string>>> {
  const dm = await getDataManager();
  const repo = dm.dataSource.getRepository(AppSettingEntity);

  const rows = await repo.find();

  const values: Partial<Record<SettingKey, string>> = {};
  for (const row of rows) {
    values[row.key as SettingKey] = row.value;
  }

  globalThis.__settingsCache = { values, lastFetched: Date.now() };
  return values;
}

async function getCachedValues(): Promise<Partial<Record<SettingKey, string>>> {
  if (isCacheValid()) {
    return globalThis.__settingsCache!.values;
  }
  return refreshCache();
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Read a single setting. Returns `undefined` if the key is not set. */
export async function getSetting(key: SettingKey): Promise<string | undefined> {
  const values = await getCachedValues();
  return values[key];
}

/** Read all settings at once (one DB round-trip, cached). */
export async function getAllSettings(): Promise<Partial<Record<SettingKey, string>>> {
  return getCachedValues();
}

/**
 * Persist a setting. Invalidates the in-process cache immediately so the next
 * read reflects the new value within the current process.
 */
export async function setSetting(key: SettingKey, value: string): Promise<void> {
  const dm = await getDataManager();
  const repo = dm.dataSource.getRepository(AppSettingEntity);

  await repo.save({ key, value });

  globalThis.__settingsCache = undefined;
  // Also bust the AI model instance cache so a new API key or model ID
  // takes effect without a server restart.
  globalThis.__aiModelCache = undefined;
}

/**
 * Remove a setting (reverts to env-var / built-in default).
 * Invalidates the in-process cache immediately.
 */
export async function deleteSetting(key: SettingKey): Promise<void> {
  const dm = await getDataManager();
  const repo = dm.dataSource.getRepository(AppSettingEntity);

  await repo.delete({ key });

  globalThis.__settingsCache = undefined;
  globalThis.__aiModelCache = undefined;
}

/** Force the in-process cache to expire on the next read. */
export function invalidateSettingsCache(): void {
  globalThis.__settingsCache = undefined;
  globalThis.__aiModelCache = undefined;
}
