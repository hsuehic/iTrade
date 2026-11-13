/**
 * Machine-readable reason codes produced by account credential verification
 * (apps/web/lib/services/account-service.ts CredentialVerifyErrorCode).
 *
 * UI components use this whitelist to decide whether a server-returned
 * `reason` has a dedicated i18n key under `accounts.form.verifyErrors.*`.
 * next-intl's default getMessageFallback returns the full namespaced key,
 * so a "does t(key) equal key" check can NEVER detect a missing message —
 * hence this static list.
 *
 * Drift guard: CredentialVerifyErrorCode is the source of truth; the
 * exhaustive record below FAILS TO COMPILE whenever a reason is added to
 * the union without being listed here. verify-web-i18n.js guards the
 * LOCALES (a verifyErrors.* key added to one locale but not the other
 * fails the check) — but a reason with no key in EITHER locale is only
 * caught by the exhaustive record below, so keep it exhaustive.
 */
import type { CredentialVerifyErrorCode } from '@/lib/services/account-service';

// Compile-time exhaustiveness: adding a code to CredentialVerifyErrorCode
// without adding it here (and to both locales' verifyErrors) breaks the
// build — the record type demands a value for EVERY member of the union.
const ALL_VERIFY_ERROR_REASONS: Record<CredentialVerifyErrorCode, true> = {
  invalid_api_key: true,
  invalid_passphrase: true,
  invalid_signature: true,
  ip_restriction: true,
  rate_limited: true,
  timeout: true,
  unreachable: true,
  venue_error: true,
  stored_credentials_unreadable: true,
  credentials_required: true,
};

export const VERIFY_ERROR_REASONS = Object.keys(
  ALL_VERIFY_ERROR_REASONS,
) as CredentialVerifyErrorCode[];

export type VerifyErrorReason = CredentialVerifyErrorCode;

/** True when `reason` has a dedicated verifyErrors.* i18n key. */
export function isKnownVerifyErrorReason(reason: string): reason is VerifyErrorReason {
  return (VERIFY_ERROR_REASONS as string[]).includes(reason);
}
