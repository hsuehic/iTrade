import type { StrategyParameters } from '@itrade/core';

import { SUPPORTED_EXCHANGES } from './exchanges';

/**
 * Shared validation for the admin Strategy Management API routes
 * (`/api/admin/strategies/**`).
 *
 * Kept in one place so the list / detail / status / clone routes agree on how a
 * path segment and an edit payload are parsed — the admin routes are the only
 * ones that accept an arbitrary user's strategy id from the URL.
 */

/**
 * Strict numeric path-segment parser. `Number.parseInt` is too lenient here:
 * "10abc" → 10 and "0x1a" → 26 would both silently resolve to a different
 * strategy id than the caller asked for. Only digits are accepted.
 */
export function parseStrategyId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The editable subset of a strategy. `status` is deliberately NOT here. */
export interface StrategyUpdates {
  name?: string;
  description?: string;
  type?: string;
  exchange?: string;
  symbol?: string;
  parameters?: StrategyParameters;
  initialDataConfig?: Record<string, unknown>;
  subscription?: Record<string, unknown>;
}

/** Strategy.name is a varchar(255) — a longer value would 22001 at the DB. */
export const MAX_STRATEGY_NAME_LENGTH = 255;

/**
 * Shared name rule for edits and clones. Rejecting over-long names here keeps
 * them from reaching Postgres as `22001 (string_data_right_truncation)`, which
 * would surface as an opaque 500.
 */
export function validateStrategyName(
  raw: unknown,
): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: 'name must be a non-empty string' };
  }
  const name = raw.trim();
  if (name.length > MAX_STRATEGY_NAME_LENGTH) {
    return {
      ok: false,
      error: `name must be at most ${MAX_STRATEGY_NAME_LENGTH} characters`,
    };
  }
  return { ok: true, name };
}

/**
 * Candidate name for a clone, where `attempt` 0 is the source name unchanged
 * and 1, 2, 3… add a `_copy` / `_copy2` / `_copy3` suffix. The base is truncated
 * so the suffixed result always fits MAX_STRATEGY_NAME_LENGTH — a source name
 * may sit exactly at the column limit, and a derived name never passes through
 * validateStrategyName.
 *
 * Cross-user cloning deliberately keeps the original name; the suffix is only a
 * collision fallback, resolved server-side by the clone route.
 */
export function cloneNameCandidate(base: string, attempt: number): string {
  const suffix = attempt === 0 ? '' : attempt === 1 ? '_copy' : `_copy${attempt}`;
  const room = MAX_STRATEGY_NAME_LENGTH - suffix.length;
  return `${base.length > room ? base.slice(0, room) : base}${suffix}`;
}

export type StrategyUpdatesResult =
  | { ok: true; updates: StrategyUpdates }
  | { ok: false; error: string };

const JSON_OBJECT_FIELDS = ['parameters', 'initialDataConfig', 'subscription'] as const;

/**
 * Validates a PATCH body for an admin strategy edit.
 *
 * Mirrors the user-facing route's update semantics, but with the type checks
 * that route is missing: a scalar (or `null`) where an object is expected used
 * to reach the JSONB column, and `name: ''` used to reach a NOT NULL column and
 * surface as a 500. Everything invalid is rejected with 400 instead.
 *
 * `status` must not appear — status changes go through POST /status so the enum
 * check, the audit shape and the console notify all stay in one code path.
 */
export function validateStrategyUpdates(body: unknown): StrategyUpdatesResult {
  if (!isPlainObject(body)) {
    return { ok: false, error: 'Invalid request body' };
  }

  if (body.status !== undefined) {
    return {
      ok: false,
      error: 'Use POST /api/admin/strategies/{id}/status to change status',
    };
  }

  const updates: StrategyUpdates = {};

  if (body.name !== undefined) {
    const named = validateStrategyName(body.name);
    if (!named.ok) return named;
    updates.name = named.name;
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      return { ok: false, error: 'description must be a string' };
    }
    // `null` means "clear it". It must become '' rather than undefined: an
    // `undefined` value is kept as a key by Object.keys yet skipped by
    // TypeORM's update(), which would report "Nothing to update" wrongly and
    // make the text impossible to erase.
    updates.description = body.description ?? '';
  }

  if (body.type !== undefined) {
    if (typeof body.type !== 'string' || body.type.trim() === '') {
      return { ok: false, error: 'type must be a non-empty string' };
    }
    updates.type = body.type.trim();
  }

  if (body.exchange !== undefined) {
    const exchange = typeof body.exchange === 'string' ? body.exchange.trim() : '';
    if (!SUPPORTED_EXCHANGES.some((ex) => ex.id === exchange)) {
      return {
        ok: false,
        error: `exchange must be one of: ${SUPPORTED_EXCHANGES.map((ex) => ex.id).join(', ')}`,
      };
    }
    updates.exchange = exchange;
  }

  if (body.symbol !== undefined) {
    // Clearing the symbol is not supported: the engine needs an exchange+symbol
    // pair, and `StrategyRepository.update` only re-derives normalizedSymbol /
    // marketType when a non-empty symbol is supplied.
    if (typeof body.symbol !== 'string' || body.symbol.trim() === '') {
      return { ok: false, error: 'symbol must be a non-empty string' };
    }
    updates.symbol = body.symbol.trim();
  }

  for (const field of JSON_OBJECT_FIELDS) {
    if (body[field] !== undefined) {
      if (!isPlainObject(body[field])) {
        return { ok: false, error: `${field} must be an object` };
      }
      updates[field] = body[field] as Record<string, unknown>;
    }
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: 'Nothing to update' };
  }

  return { ok: true, updates };
}

/**
 * PostgreSQL error code from a TypeORM error. TypeORM wraps driver errors in
 * `QueryFailedError`, which exposes the code as `driverError.code` — reading
 * `error.code` alone silently misses every constraint violation.
 */
export function pgErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const driver = (error as { driverError?: { code?: unknown } }).driverError;
  return typeof driver?.code === 'string' ? driver.code : undefined;
}
