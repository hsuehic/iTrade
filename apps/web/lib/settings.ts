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
  | 'chat_title'
  | 'server_ip_whitelist';

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

// ── Server IP whitelist ───────────────────────────────────────────────────────

/**
 * IPs that users should add to their exchange API key's IP whitelist.
 *
 * Stored in `app_settings` under `server_ip_whitelist` as a JSON array string
 * so admins can add / remove entries at runtime (admin Settings page) without
 * a redeploy. When the key is absent the DEFAULT list below is used, so a
 * fresh deployment shows the correct IPs before any admin edit.
 */
export const DEFAULT_SERVER_IP_WHITELIST: string[] = ['202.73.36.25', '34.143.244.107'];

/**
 * Strict IPv4 validator — dotted quad, each octet 0-255, no CIDR.
 * Kept local (duplicated in lib/itrade-server-ip.ts for client bundles) so
 * this server module has no client-side import graph concerns.
 */
const IPV4_PATTERN =
  /^(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}$/;

export function isValidIp(ip: string): boolean {
  return IPV4_PATTERN.test(ip);
}

/** Parse the stored JSON value; returns null when unset or malformed. */
function parseStoredIps(raw: string | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const ips = parsed.filter((v): v is string => typeof v === 'string');
    return ips.length > 0 ? ips : null;
  } catch {
    return null;
  }
}

/**
 * Read the configured server IP whitelist (admin-managed), falling back to
 * DEFAULT_SERVER_IP_WHITELIST when not configured. Never throws — display
 * surfaces (accounts page, onboarding wizard) must render even if the DB
 * read fails.
 */
export async function getServerIpWhitelist(): Promise<string[]> {
  try {
    const raw = await getSetting('server_ip_whitelist');
    return parseStoredIps(raw) ?? DEFAULT_SERVER_IP_WHITELIST;
  } catch {
    return DEFAULT_SERVER_IP_WHITELIST;
  }
}

/**
 * Persist the full whitelist (admin API only). Validates every entry and
 * rejects duplicates. Returns the normalized list on success; throws Error
 * with a human-readable message on invalid input.
 */
export async function setServerIpWhitelist(ips: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of ips) {
    const ip = raw.trim();
    if (!ip) continue;
    if (!isValidIp(ip)) {
      throw new Error(`Invalid IP address: ${ip}`);
    }
    if (seen.has(ip)) {
      throw new Error(`Duplicate IP address: ${ip}`);
    }
    seen.add(ip);
    normalized.push(ip);
  }
  if (normalized.length === 0) {
    throw new Error('IP whitelist cannot be empty');
  }
  await setSetting('server_ip_whitelist', JSON.stringify(normalized));
  return normalized;
}
